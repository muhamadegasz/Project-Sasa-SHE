/* session-auth.js — authentication sungguhan (Phase 13): bcrypt + express-session.
 *
 * Menggantikan server/middleware/dev-auth.js (dihapus fase ini). req.user
 * sekarang berasal dari sesi (cookie HttpOnly, disimpan di server lewat
 * server/db/session-store.js), bukan lagi header X-Dev-User yang bisa
 * dipalsukan siapa saja — menutup S-01. Lihat docs/DECISIONS.md.
 */

import * as userRepository from '../repositories/user-repository.js';

/** Mengisi req.user dari sesi. 401 bila belum login atau akun sudah dinonaktifkan/dihapus sejak login. */
export async function sessionAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'UNAUTHENTICATED' });
    }

    const user = await userRepository.findById(req.session.userId);
    if (!user || !user.isActive) {
        return req.session.destroy(() => res.status(401).json({ error: 'UNAUTHENTICATED' }));
    }

    req.user = { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
    next();
}

/** 403 bila req.user.role bukan salah satu dari `roles`. Panggil setelah sessionAuth. */
export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'FORBIDDEN', message: `Role "${req.user?.role}" tidak diizinkan untuk aksi ini` });
        }
        next();
    };
}
