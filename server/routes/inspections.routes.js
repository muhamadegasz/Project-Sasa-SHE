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
            const temuan = typeof req.body.temuan === 'string' ? JSON.parse(req.body.temuan) : req.body.temuan;
            const result = await inspectionService.create({
                ...req.body,
                temuan,
                petugas: req.user.displayName,
                petugasUserId: req.user.id,
                fotoDekat: filesToPhotoMeta(req.files?.fotoDekat),
                fotoJauh: filesToPhotoMeta(req.files?.fotoJauh),
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

// Phase 17.2: wewenang (role + status + tahap berjalan + cakupan plant
// Koordinator) diputuskan domain/inspection-policy.js lewat approval-service,
// bukan pemetaan role-per-tahap di route ini. Identitas selalu dari sesi.
inspectionsRouter.post('/:id/approve', asyncHandler(async (req, res) => {
    const result = await approvalService.approve(req.params.id, req.body.stageId, req.user);
    sendResult(res, result);
}));

inspectionsRouter.post('/:id/reject', asyncHandler(async (req, res) => {
    const result = await approvalService.reject(req.params.id, req.body.stageId, req.user, req.body.reason);
    sendResult(res, result);
}));

inspectionsRouter.post(
    '/:id/corrective-actions',
    requireRole('safety_officer'),
    upload.array('photos'),
    asyncHandler(verifyImageContent),
    asyncHandler(async (req, res) => {
        try {
            // Phase 17.3A: inspeksi yang tidak boleh DILIHAT juga tidak boleh
            // ditindaklanjuti — tanpa ini, Safety Officer lain bisa membaca
            // (respons berisi inspeksi lengkap) dan menulis ke draft/revisi
            // privat hanya dengan menebak id. 404 identik dengan id yang tidak
            // ada; foto yang sudah ditulis multer dibersihkan.
            if (!(await inspectionRepository.findByIdVisibleTo(req.params.id, req.user))) {
                await cleanupUploadedFiles(req);
                return res.status(404).json({ error: 'NOT_FOUND' });
            }
            const result = await correctiveActionService.addAction(req.params.id, {
                ...req.body,
                photos: filesToPhotoMeta(req.files),
                uploadedBy: req.user.id,
            });
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
