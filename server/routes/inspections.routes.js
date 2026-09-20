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

export const inspectionsRouter = Router();

/** Tahap 2-4 masing-masing hanya boleh disetujui/ditolak oleh satu role. Tahap 1 otomatis saat pembuatan, tidak ada aksi manual. */
const ROLE_BY_STAGE = { 2: 'koordinator_k3l', 3: 'manajer_bagian', 4: 'ketua_p2k3' };

inspectionsRouter.get('/', asyncHandler(async (req, res) => {
    res.json(await inspectionRepository.getAll());
}));

inspectionsRouter.get('/:id', asyncHandler(async (req, res) => {
    const inspection = await inspectionRepository.findById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(inspection);
}));

inspectionsRouter.post('/', requireRole('safety_officer'), asyncHandler(async (req, res) => {
    const result = await inspectionService.create({
        ...req.body,
        petugas: req.user.displayName,
        petugasUserId: req.user.id,
    });
    sendResult(res, result, 201);
}));

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

inspectionsRouter.post('/:id/corrective-actions', requireRole('safety_officer'), asyncHandler(async (req, res) => {
    const result = await correctiveActionService.addAction(req.params.id, req.body);
    sendResult(res, result, 201);
}));
