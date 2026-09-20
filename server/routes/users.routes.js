/* users.routes.js — Phase 12: hanya baca (admin). CRUD user sungguhan
 * (buat akun, reset password) ditunda sampai Phase 13 (butuh bcrypt untuk
 * hash password saat membuat akun) — lihat docs/ROADMAP-PHASE12.md.
 */

import { Router } from 'express';
import * as userRepository from '../repositories/user-repository.js';
import { requireRole } from '../middleware/dev-auth.js';
import { asyncHandler } from '../middleware/async-handler.js';

export const usersRouter = Router();

usersRouter.get('/', requireRole('admin'), asyncHandler(async (req, res) => {
    res.json(await userRepository.getAll());
}));
