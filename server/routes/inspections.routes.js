/* inspections.routes.js — memakai src/services/*.js APA ADANYA (lihat
 * docs/ROADMAP-PHASE12.md). Route handler ini yang bertanggung jawab atas
 * dua hal yang secara sengaja BUKAN urusan service: pemetaan Result -> HTTP,
 * dan pemaksaan identitas dari req.user (bukan dari body request).
 */

import { Router } from 'express';
import * as inspectionRepository from '../repositories/inspection-repository.js';
import * as inspectionService from '../../src/services/inspection-service.js';
import * as approvalService from '../../src/services/approval-service.js';
import * as correctiveActionService from '../../src/services/corrective-action-service.js';
import { requireRole } from '../middleware/session-auth.js';
import { sendResult } from '../middleware/to-http.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { upload, UPLOAD_DIR, verifyImageContent, cleanupUploadedFiles } from '../config/upload.js';
import { detectSignatureMimeType, parseSignatureUpload } from '../config/signature-storage.js';

export const inspectionsRouter = Router();

/** multer hanya mengisi req.files bila body sungguhan multipart/form-data — permintaan
 * JSON biasa (mis. fixture E2E lewat page.request) lewat sini tanpa terpengaruh, req.files
 * akan undefined dan fallback ke [] di bawah. Metadata (bukan byte) yang diteruskan ke
 * service/repository: byte-nya sudah ditulis multer ke disk sebelum handler ini berjalan. */
function filesToPhotoMeta(files) {
    return (files || []).map((file) => ({
        path: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
    }));
}

/**
 * `temuan` datang sebagai string JSON lewat multipart (FormData), atau array
 * lewat JSON biasa. JSON rusak / bukan array -> [] (service menolaknya
 * FINDINGS_REQUIRED, 400), bukan exception yang berakhir 500.
 */
function parseTemuan(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/** Isian konten inspeksi dari body — HANYA field konten; status/tahap/pemilik tidak pernah diambil dari sini. */
function contentFromRequest(req) {
    return {
        plantId: req.body.plantId,
        keteranganLokasi: req.body.keteranganLokasi,
        tanggal: req.body.tanggal,
        dueDate: req.body.dueDate,
        temuan: parseTemuan(req.body.temuan),
        fotoDekat: filesToPhotoMeta(req.files?.fotoDekat),
        fotoJauh: filesToPhotoMeta(req.files?.fotoJauh),
    };
}

// Phase 17.3A: daftar dan detail hanya berisi inspeksi yang boleh dilihat
// pengguna login (domain/inspection-policy.js visibilityScope, diterapkan di
// query). Inspeksi di luar cakupan dijawab 404 yang SAMA PERSIS dengan id yang
// tidak ada — tidak membocorkan apakah id itu ada, milik plant mana, dst.
inspectionsRouter.get('/', asyncHandler(async (req, res) => {
    res.json(await inspectionRepository.getAllVisibleTo(req.user));
}));

inspectionsRouter.get('/:id', asyncHandler(async (req, res) => {
    const inspection = await inspectionRepository.findByIdVisibleTo(req.params.id, req.user);
    if (!inspection) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(inspection);
}));

inspectionsRouter.post(
    '/',
    requireRole('safety_officer'),
    upload.fields([{ name: 'fotoDekat' }, { name: 'fotoJauh' }]),
    asyncHandler(verifyImageContent),
    asyncHandler(async (req, res) => {
        try {
            // Phase 17.3B: menghasilkan DRAFT milik pengguna login.
            const result = await inspectionService.create({
                ...contentFromRequest(req),
                petugas: req.user.displayName,
                petugasUserId: req.user.id,
            });
            // F-04: validasi bisnis gagal (mis. PLANT_NOT_FOUND) SETELAH multer
            // sudah menulis file ke disk -> file itu tidak akan pernah tersimpan
            // ke tabel photos (repository.add() tidak pernah dipanggil untuk
            // path fail()), jadi harus dihapus di sini atau jadi yatim permanen.
            if (!result.ok) await cleanupUploadedFiles(req);
            sendResult(res, result, 201);
        } catch (error) {
            await cleanupUploadedFiles(req);
            throw error;
        }
    }),
);

// Phase 17.3B: siklus hidup milik Safety Officer. Kepemilikan, status yang
// diizinkan, dan transisinya diputuskan inspection-service + domain; route
// hanya meneruskan identitas sesi. Tidak ada endpoint "ubah status" generik.

// Mengubah isi draft (DRAFT) atau revisi (REVISION_REQUIRED) milik sendiri.
// Status/tahap/pemilik di body diabaikan.
inspectionsRouter.put(
    '/:id',
    requireRole('safety_officer'),
    upload.fields([{ name: 'fotoDekat' }, { name: 'fotoJauh' }]),
    asyncHandler(verifyImageContent),
    asyncHandler(async (req, res) => {
        try {
            const result = await inspectionService.update(req.params.id, contentFromRequest(req), req.user);
            if (!result.ok) await cleanupUploadedFiles(req);
            sendResult(res, result);
        } catch (error) {
            await cleanupUploadedFiles(req);
            throw error;
        }
    }),
);

// Mengajukan draft, atau mengajukan ulang revisi ke tahap yang menolaknya.
inspectionsRouter.post('/:id/submit', requireRole('safety_officer'), asyncHandler(async (req, res) => {
    sendResult(res, await inspectionService.submit(req.params.id, req.user));
}));

// Menghapus draft milik sendiri — BUKAN penghapusan inspeksi oleh Admin.
inspectionsRouter.delete('/:id', requireRole('safety_officer'), asyncHandler(async (req, res) => {
    sendResult(res, await inspectionService.removeDraft(req.params.id, req.user));
}));

/**
 * Tanda tangan dari permintaan approve (Phase 17.4A), atau null bila tidak
 * ada data tanda tangan sama sekali. mimeType adalah hasil deteksi ISI berkas
 * (PNG/JPEG saja), bukan nama berkas atau Content-Type klien. Tidak ada jalur
 * base64/data URL: kanvas mengirim PNG sebagai berkas biasa, jadi string di
 * field `signature` tidak pernah didekode (-> SIGNATURE_REQUIRED).
 */
function signatureFromRequest(req) {
    if (!req.file && req.body.signatureMethod === undefined && req.body.signature === undefined) return null;
    return {
        method: req.body.signatureMethod,
        mimeType: req.file ? detectSignatureMimeType(req.file.buffer) : null,
        size: req.file ? req.file.size : 0,
        file: req.file ? req.file.buffer : null,
    };
}

// Phase 17.2: wewenang (role + status + tahap berjalan + cakupan plant
// Koordinator) diputuskan domain/inspection-policy.js lewat approval-service,
// bukan pemetaan role-per-tahap di route ini. Identitas selalu dari sesi.
// Phase 17.4A: multipart/form-data — stageId, signatureMethod ('upload' |
// 'canvas'), signature (berkas PNG/JPEG). Berkas hanya ditahan di memori;
// ditulis ke disk oleh repository setelah seluruh pemeriksaan lolos.
inspectionsRouter.post('/:id/approve', parseSignatureUpload, asyncHandler(async (req, res) => {
    const result = await approvalService.approve(req.params.id, req.body.stageId, req.user, signatureFromRequest(req));
    sendResult(res, result);
}));

inspectionsRouter.post('/:id/reject', asyncHandler(async (req, res) => {
    // Phase 17.4A: penolakan tidak bertanda tangan. Multipart tidak di-parse
    // sama sekali (tidak ada berkas yang bisa tersimpan); field tanda tangan
    // di body JSON ditolak service (SIGNATURE_NOT_ALLOWED), bukan diabaikan.
    if (req.is('multipart/form-data')) return res.status(400).json({ error: 'SIGNATURE_NOT_ALLOWED', data: null });
    const hasSignatureInput = req.body.signatureMethod !== undefined || req.body.signature !== undefined;
    const result = await approvalService.reject(req.params.id, req.body.stageId, req.user, req.body.reason, hasSignatureInput ? req.body : null);
    sendResult(res, result);
}));

// Phase 17.4A: berkas tanda tangan satu keputusan. Sama seperti file foto:
// butuh sesi, dan hanya bila inspeksinya boleh dilihat pengguna ini DAN
// keputusan itu milik inspeksi tersebut — selain itu 404 identik dengan yang
// tidak ada. Content-Type hanya dari daftar PNG/JPEG hasil verifikasi.
const SIGNATURE_CONTENT_TYPES = new Set(['image/png', 'image/jpeg']);

inspectionsRouter.get('/:id/approvals/:approvalId/signature', asyncHandler(async (req, res) => {
    const signature = await inspectionRepository.findSignatureFile(req.params.id, req.params.approvalId, req.user);
    if (!signature || !SIGNATURE_CONTENT_TYPES.has(signature.mimeType)) return res.status(404).json({ error: 'NOT_FOUND' });
    res.set('X-Content-Type-Options', 'nosniff');
    res.type(signature.mimeType).sendFile(signature.filePath, { root: UPLOAD_DIR }, (error) => {
        if (error && !res.headersSent) res.status(404).json({ error: 'NOT_FOUND' });
    });
}));

inspectionsRouter.post(
    '/:id/corrective-actions',
    requireRole('safety_officer'),
    upload.array('photos'),
    asyncHandler(verifyImageContent),
    asyncHandler(async (req, res) => {
        try {
            // Phase 17.3B: hanya Safety Officer PEMILIK inspeksi (domain/
            // inspection-policy.js canEditCorrectiveAction, lewat service).
            // Tidak terlihat -> 404 identik dengan id yang tidak ada; terlihat
            // tapi bukan pemilik -> 403. Foto yang sudah ditulis multer dibersihkan.
            const result = await correctiveActionService.addAction(req.params.id, {
                action: req.body.action,
                status: req.body.status,
                pic: req.body.pic,
                photos: filesToPhotoMeta(req.files),
            }, req.user);
            if (!result.ok) await cleanupUploadedFiles(req);
            sendResult(res, result, 201);
        } catch (error) {
            await cleanupUploadedFiles(req);
            throw error;
        }
    }),
);

// GET, jadi tidak butuh CSRF (requireCsrf mengecualikan method aman, lihat
// server/middleware/csrf.js) — tapi tetap butuh sesi login seperti seluruh
// route /api lain (sessionAuth dipasang blanket di server/app.js), bukan
// express.static() publik: foto SHE bukan data yang boleh diakses tanpa login.
// Phase 17.3A: login saja tidak cukup — foto hanya disajikan bila inspeksi
// pemiliknya boleh dilihat pengguna ini; di luar cakupan -> 404 yang sama
// dengan foto yang tidak ada.
inspectionsRouter.get('/photos/:photoId/file', asyncHandler(async (req, res) => {
    const photo = await inspectionRepository.findPhotoFile(req.params.photoId, req.user);
    if (!photo) return res.status(404).json({ error: 'NOT_FOUND' });
    // F-02: photo.mimeType sekarang hasil deteksi signature byte server saat
    // upload (verifyImageContent() di server/config/upload.js), bukan lagi
    // klaim klien mentah — nosniff mencegah browser menafsirkan ulang isi
    // respons ini seandainya pun ada baris lama (pra-F-01) yang mime_type-nya
    // belum terverifikasi.
    res.set('X-Content-Type-Options', 'nosniff');
    res.type(photo.mimeType).sendFile(photo.filePath, { root: UPLOAD_DIR }, (error) => {
        // Baris `photos` seed (server/db/seed.js) sengaja punya file_path palsu
        // (tidak ada byte sungguhan di disk, cuma demo data) — ENOENT di sini
        // adalah itu, bukan kerusakan. 404 lebih benar daripada 500 tak tertangani.
        if (error && !res.headersSent) res.status(404).json({ error: 'NOT_FOUND' });
    });
}));
