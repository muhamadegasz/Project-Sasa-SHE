/* dev-auth.js — TEMPORARY, dev-only. BUKAN authentication.
 *
 * ============================ PERINGATAN =============================
 * Middleware ini mengambil identitas user LANGSUNG dari header
 * `X-Dev-User` (berisi username), tanpa verifikasi password atau sesi
 * apa pun. Siapa pun yang bisa mengirim HTTP request dapat menyamar
 * sebagai user mana pun hanya dengan mengganti header itu.
 *
 * Ini ADA supaya route (Phase 12) bisa diuji end-to-end dan menyimpan
 * identitas approver yang sungguhan (menutup S-07 di lapisan data),
 * SEBELUM auth sungguhan (Phase 13: bcrypt + express-session) selesai
 * dibangun. Dihapus total begitu Phase 13 selesai — lihat
 * docs/ROADMAP-PHASE12.md dan docs/DECISIONS.md.
 *
 * JANGAN PERNAH mengaktifkan middleware ini di deployment yang menyimpan
 * data K3 sungguhan.
 * =====================================================================
 */

import * as userRepository from '../repositories/user-repository.js';

/** Mengisi req.user dari header X-Dev-User (username). 401 bila header kosong/tidak dikenal. */
export async function devAuth(req, res, next) {
    const username = req.header('X-Dev-User');
    if (!username) {
        return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Header X-Dev-User wajib diisi (dev-only, lihat server/middleware/dev-auth.js)' });
    }

    const user = await userRepository.findByUsernameWithPasswordHash(username);
    if (!user || !user.isActive) {
        return res.status(401).json({ error: 'UNAUTHENTICATED', message: `User "${username}" tidak dikenal atau nonaktif` });
    }

    req.user = { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
    next();
}

/** 403 bila req.user.role bukan salah satu dari `roles`. Panggil setelah devAuth. */
export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'FORBIDDEN', message: `Role "${req.user?.role}" tidak diizinkan untuk aksi ini` });
        }
        next();
    };
}
