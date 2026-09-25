/* auth.routes.js — Phase 13: login/logout sungguhan (bcrypt + session).
 *
 * Dipasang di server/app.js SEBELUM middleware sessionAuth/requireCsrf yang
 * berlaku untuk router lain (login harus bisa diakses tanpa sesi, dan tidak
 * butuh CSRF token karena belum ada sesi untuk menyimpannya). GET /me dan
 * POST /logout memanggil sessionAuth sendiri karena keduanya memang butuh
 * identitas yang sedang login.
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import * as userRepository from '../repositories/user-repository.js';
import { sessionAuth } from '../middleware/session-auth.js';
import { generateCsrfToken, requireCsrf } from '../middleware/csrf.js';
import { asyncHandler } from '../middleware/async-handler.js';

export const authRouter = Router();

function publicUser(user) {
    return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
}

authRouter.post('/login', asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'CREDENTIALS_REQUIRED' });
    }

    const user = await userRepository.findByUsernameWithPasswordHash(username);
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }

    await new Promise((resolve, reject) => {
        req.session.regenerate((error) => (error ? reject(error) : resolve()));
    });
    req.session.userId = user.id;
    req.session.csrfToken = generateCsrfToken();

    res.json({ user: publicUser(user), csrfToken: req.session.csrfToken });
}));

// Phase 14.1-J: requireCsrf ditambahkan eksplisit di sini (router /api/auth
// dipasang SEBELUM gate CSRF blanket di app.js, sengaja — /login belum punya
// sesi untuk menyimpan token). Sebelumnya logout TIDAK memerlukan token sama
// sekali; tidak tereksploitasi hari ini (cookie SameSite=Lax sudah memblokir
// pengirimannya pada POST cross-site), tapi tetap endpoint pengubah-state
// yang seharusnya konsisten dengan endpoint lain — lihat audit Phase 14.
authRouter.post('/logout', sessionAuth, requireCsrf, (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('she_sasa.sid');
        res.json({ ok: true });
    });
});

authRouter.get('/me', sessionAuth, (req, res) => {
    // csrfToken ikut dikembalikan (bukan hanya saat login): Phase 14 memakai
    // ini untuk memulihkan sesi setelah reload halaman browser — state JS
    // (termasuk token yang disimpan di src/infrastructure/session.js) hilang
    // saat reload walau cookie sesinya sendiri masih berlaku.
    res.json({ user: req.user, csrfToken: req.session.csrfToken });
});
