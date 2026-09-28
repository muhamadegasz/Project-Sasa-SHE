/* users.routes.js — pengelolaan akun oleh Admin (Phase 18).
 *
 * Seluruh route di sini khusus Admin: requireRole('admin') di tingkat router,
 * DAN user-service.js memeriksa ulang (canManageUsers) — server otoritatif,
 * menu yang disembunyikan di UI bukan otorisasi. sessionAuth + requireCsrf
 * sudah dipasang untuk seluruh /api di server/app.js.
 *
 * Identitas Admin yang bertindak selalu dari sesi (req.user), dipakai
 * service untuk menolak menonaktifkan/menghapus/mengganti role akun sendiri.
 */

import { Router } from 'express';
import * as userService from '../../src/services/user-service.js';
import { requireRole } from '../middleware/session-auth.js';
import { sendResult } from '../middleware/to-http.js';
import { asyncHandler } from '../middleware/async-handler.js';

export const usersRouter = Router();

usersRouter.use(requireRole('admin'));

// Bentuk respons tetap array (sejak Phase 12), bukan { users }.
usersRouter.get('/', asyncHandler(async (req, res) => {
    const result = await userService.list(req.user);
    if (!result.ok) return sendResult(res, result);
    res.json(result.data.users);
}));

// { username, displayName, role, plantId, password } — plantId hanya untuk koordinator_k3l.
usersRouter.post('/', asyncHandler(async (req, res) => {
    sendResult(res, await userService.create(req.user, req.body), 201);
}));

// { displayName, role, plantId, password? } — password kosong = tidak diganti; username tetap.
usersRouter.put('/:id', asyncHandler(async (req, res) => {
    sendResult(res, await userService.update(req.user, req.params.id, req.body));
}));

// { isActive: true | false }
usersRouter.put('/:id/active', asyncHandler(async (req, res) => {
    sendResult(res, await userService.setActive(req.user, req.params.id, req.body.isActive));
}));

// Hapus permanen: hanya akun nonaktif tanpa inspeksi yang belum selesai (lihat user-service.js remove()).
usersRouter.delete('/:id', asyncHandler(async (req, res) => {
    sendResult(res, await userService.remove(req.user, req.params.id));
}));
