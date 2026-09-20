/* auth.routes.js — Phase 12: hanya GET /me (memverifikasi dev-auth).
 * Login/logout sungguhan (bcrypt + session) adalah Phase 13 — lihat
 * docs/ROADMAP-PHASE12.md dan server/middleware/dev-auth.js.
 */

import { Router } from 'express';

export const authRouter = Router();

authRouter.get('/me', (req, res) => {
    res.json({ user: req.user });
});
