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
import { upload, UPLOAD_DIR } from '../config/upload.js';

export const inspectionsRouter = Router();

/** Tahap 2-4 masing-masing hanya boleh disetujui/ditolak oleh satu role. Tahap 1 otomatis saat pembuatan, tidak ada aksi manual. */
const ROLE_BY_STAGE = { 2: 'koordinator_k3l', 3: 'manajer_bagian', 4: 'ketua_p2k3' };

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

inspectionsRouter.get('/', asyncHandler(async (req, res) => {
    res.json(await inspectionRepository.getAll());
}));

inspectionsRouter.get('/:id', asyncHandler(async (req, res) => {
    const inspection = await inspectionRepository.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(inspection);
}));

inspectionsRouter.post(
    '/',
    requireRole('safety_officer'),
    upload.fields([{ name: 'fotoDekat' }, { name: 'fotoJauh' }]),
    asyncHandler(async (req, res) => {
        const temuan = typeof req.body.temuan === 'string' ? JSON.parse(req.body.temuan) : req.body.temuan;
        const result = await inspectionService.create({
            ...req.body,
            temuan,
            petugas: req.user.displayName,
            petugasUserId: req.user.id,
            fotoDekat: filesToPhotoMeta(req.files?.fotoDekat),
            fotoJauh: filesToPhotoMeta(req.files?.fotoJauh),
        });
        sendResult(res, result, 201);
    }),
);

inspectionsRouter.post('/:id/approve', asyncHandler(async (req, res) => {
    const stageId = Number(req.body.stageId);
    const requiredRole = ROLE_BY_STAGE[stageId];
    if (!requiredRole || req.user.role !== requiredRole) {
        return res.status(403).json({ error: 'FORBIDDEN', message: `Tahap ${stageId} bukan wewenang role "${req.user.role}"` });
    }

    const result = await approvalService.approve(req.params.id, stageId, req.user);
    sendResult(res, result);
}));

inspectionsRouter.post('/:id/reject', asyncHandler(async (req, res) => {
    const stageId = Number(req.body.stageId);
    const requiredRole = ROLE_BY_STAGE[stageId];
    if (!requiredRole || req.user.role !== requiredRole) {
        return res.status(403).json({ error: 'FORBIDDEN', message: `Tahap ${stageId} bukan wewenang role "${req.user.role}"` });
    }

    const result = await approvalService.reject(req.params.id, stageId, req.user);
    sendResult(res, result);
}));

inspectionsRouter.post(
    '/:id/corrective-actions',
    requireRole('safety_officer'),
    upload.array('photos'),
    asyncHandler(async (req, res) => {
        const result = await correctiveActionService.addAction(req.params.id, {
            ...req.body,
            photos: filesToPhotoMeta(req.files),
            uploadedBy: req.user.id,
        });
        sendResult(res, result, 201);
    }),
);

// GET, jadi tidak butuh CSRF (requireCsrf mengecualikan method aman, lihat
// server/middleware/csrf.js) — tapi tetap butuh sesi login seperti seluruh
// route /api lain (sessionAuth dipasang blanket di server/app.js), bukan
// express.static() publik: foto SHE bukan data yang boleh diakses tanpa login.
inspectionsRouter.get('/photos/:photoId/file', asyncHandler(async (req, res) => {
    const photo = await inspectionRepository.findPhotoFile(req.params.photoId);
    if (!photo) return res.status(404).json({ error: 'NOT_FOUND' });
    res.type(photo.mimeType).sendFile(photo.filePath, { root: UPLOAD_DIR }, (error) => {
        // Baris `photos` seed (server/db/seed.js) sengaja punya file_path palsu
        // (tidak ada byte sungguhan di disk, cuma demo data) — ENOENT di sini
        // adalah itu, bukan kerusakan. 404 lebih benar daripada 500 tak tertangani.
        if (error && !res.headersSent) res.status(404).json({ error: 'NOT_FOUND' });
    });
}));
