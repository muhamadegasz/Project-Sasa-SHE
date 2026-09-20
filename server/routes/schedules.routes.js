/* schedules.routes.js — memakai src/services/schedule-service.js APA ADANYA. */

import { Router } from 'express';
import * as scheduleRepository from '../repositories/schedule-repository.js';
import * as scheduleService from '../../src/services/schedule-service.js';
import { requireRole } from '../middleware/session-auth.js';
import { sendResult } from '../middleware/to-http.js';
import { asyncHandler } from '../middleware/async-handler.js';

export const schedulesRouter = Router();

schedulesRouter.get('/', asyncHandler(async (req, res) => {
    res.json(await scheduleRepository.getAll());
}));

schedulesRouter.post('/', requireRole('safety_officer', 'admin'), asyncHandler(async (req, res) => {
    const result = await scheduleService.save({ ...req.body, officerUserId: req.user.id });
    sendResult(res, result, 201);
}));

schedulesRouter.put('/:id', requireRole('safety_officer', 'admin'), asyncHandler(async (req, res) => {
    const result = await scheduleService.save({ ...req.body, id: req.params.id });
    if (result.ok && result.data.schedule === null) {
        return res.status(404).json({ error: 'NOT_FOUND' });
    }
    sendResult(res, result);
}));

schedulesRouter.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
    const result = await scheduleService.remove(req.params.id);
    if (!result.data.removed) return res.status(404).json({ error: 'NOT_FOUND' });
    sendResult(res, result);
}));
