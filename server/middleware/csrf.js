/* csrf.js — proteksi CSRF (synchronizer token pattern), Phase 13.
 *
 * Header X-Dev-User (Phase 12) kebal CSRF secara tidak sengaja: browser tidak
 * pernah mengirim header custom itu sendiri lewat form/permintaan lintas situs.
 * Cookie session (Phase 13) TIDAK kebal — browser mengirim cookie otomatis ke
 * domain manapun yang memintanya, sehingga situs lain bisa memicu permintaan
 * mengubah-state atas nama pengguna yang sedang login. Karena itu proteksi ini
 * wajib begitu Phase 13 beralih ke cookie session.
 *
 * Token diterbitkan sekali saat login (server/routes/auth.routes.js),
 * disimpan di req.session.csrfToken DAN dikembalikan di body respons login.
 * Klien wajib mengirimkannya balik lewat header X-CSRF-Token pada setiap
 * permintaan yang mengubah state (POST/PUT/DELETE/PATCH).
 */

import { randomBytes } from 'node:crypto';

export function generateCsrfToken() {
    return randomBytes(32).toString('hex');
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function requireCsrf(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();

    const token = req.header('X-CSRF-Token');
    if (!token || token !== req.session.csrfToken) {
        return res.status(403).json({ error: 'CSRF_INVALID' });
    }
    next();
}
