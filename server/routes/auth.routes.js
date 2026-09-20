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
import { generateCsrfToken } from '../middleware/csrf.js';
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

authRouter.post('/logout', sessionAuth, (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('she_sasa.sid');
        res.json({ ok: true });
    });
});

authRouter.get('/me', sessionAuth, (req, res) => {
    res.json({ user: req.user });
});
