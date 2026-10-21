/* schedules.routes.js — memakai src/services/schedule-service.js APA ADANYA.
 *
 * Migrasi 008: officerUserId di body adalah PETUGAS yang ditugaskan (dulu
 * diisi req.user.id = pembuat jadwal); service memvalidasinya sebagai akun
 * Safety Officer aktif dan menyalin namanya. tanggalRealisasi/status di body
 * diabaikan — hanya pengajuan laporan yang tertaut yang mengisinya.
 */

import { Router } from 'express';
import * as scheduleRepository from '../repositories/schedule-repository.js';
import * as scheduleService from '../../src/services/schedule-service.js';
import { SCHEDULE_EDITOR_ROLES } from '../../src/domain/schedule-rules.js';
import { requireRole } from '../middleware/session-auth.js';
import { sendResult } from '../middleware/to-http.js';
import { asyncHandler } from '../middleware/async-handler.js';

export const schedulesRouter = Router();

schedulesRouter.get('/', asyncHandler(async (req, res) => {
    res.json(await scheduleRepository.getAll());
}));

// Pilihan petugas di form jadwal — hanya role pengelola jadwal; { id, displayName } saja.
schedulesRouter.get('/officers', requireRole(...SCHEDULE_EDITOR_ROLES), asyncHandler(async (req, res) => {
    res.json((await scheduleService.assignableOfficers()).data.officers);
}));

// Safety Officer & Admin saja (domain/schedule-rules.js — aturan yang sama dipakai UI).
schedulesRouter.post('/', requireRole(...SCHEDULE_EDITOR_ROLES), asyncHandler(async (req, res) => {
    const result = await scheduleService.save({ ...req.body, id: undefined });
    sendResult(res, result, 201);
}));

schedulesRouter.put('/:id', requireRole(...SCHEDULE_EDITOR_ROLES), asyncHandler(async (req, res) => {
    const result = await scheduleService.save({ ...req.body, id: req.params.id });
    if (result.ok && result.data.schedule === null) {
        return res.status(404).json({ error: 'NOT_FOUND' });
    }
    sendResult(res, result);
}));

schedulesRouter.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
    const result = await scheduleService.remove(req.params.id);
    if (result.ok && !result.data.removed) return res.status(404).json({ error: 'NOT_FOUND' });
    sendResult(res, result);
}));
