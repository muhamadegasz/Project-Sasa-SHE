/* user-repository.js — versi MySQL, dipakai backend (server/).
 *
 * Tidak ada padanan di src/repositories/ — users adalah entitas baru Phase 12,
 * belum ada di frontend sampai ada UI admin (di luar cakupan fase ini).
 * Dipakai oleh server/middleware/dev-auth.js sekarang, dan oleh auth
 * sungguhan di Phase 13.
 */

import { pool } from '../db/pool.js';

function toPublicShape(row) {
    if (!row) return undefined;
    return {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        role: row.role,
        isActive: Boolean(row.is_active),
    };
}

/** Satu user berdasarkan id, TANPA password_hash (bentuk publik). */
export async function findById(id) {
    const [rows] = await pool.query(
        'SELECT id, username, display_name, role, is_active FROM users WHERE id = ?',
        [Number(id)],
    );
    return toPublicShape(rows[0]);
}

/** Satu user berdasarkan username, TERMASUK password_hash — dipakai khusus untuk verifikasi login. */
export async function findByUsernameWithPasswordHash(username) {
    const [rows] = await pool.query(
        'SELECT id, username, password_hash, display_name, role, is_active FROM users WHERE username = ?',
        [username],
    );
    if (!rows[0]) return undefined;
    return {
        id: rows[0].id,
        username: rows[0].username,
        passwordHash: rows[0].password_hash,
        displayName: rows[0].display_name,
        role: rows[0].role,
        isActive: Boolean(rows[0].is_active),
    };
}

/** Seluruh user (bentuk publik), untuk halaman admin. */
export async function getAll() {
    const [rows] = await pool.query('SELECT id, username, display_name, role, is_active FROM users ORDER BY id');
    return rows.map(toPublicShape);
}
