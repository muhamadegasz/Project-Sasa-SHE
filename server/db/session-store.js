/* session-store.js — session store MySQL, ditulis sendiri (BUKAN paket
 * express-mysql-session).
 *
 * express-mysql-session membawa salinan mysql2 sendiri yang versinya rentan
 * (GHSA-3f6p-5ww8-9rcr: downgrade auth plugin bisa membocorkan kredensial
 * plaintext; GHSA-rgwj-5xj2-c3m3: decompression-bomb DoS) — terpisah dari
 * mysql2 proyek ini yang sudah ter-patch. `npm audit` mengonfirmasi ini
 * (lihat docs/DECISIONS.md). Skema sesi cuma tiga kolom, jadi lebih aman
 * ditulis manual di sini memakai `pool` yang sama dipakai seluruh backend
 * daripada menambah satu lagi salinan mysql2 ke dependency tree.
 *
 * Baris kedaluwarsa dihapus malas (lazy) — saat get() menemukan baris yang
 * sudah lewat `expires`, baris itu dihapus dan dianggap tidak ada. Tidak ada
 * job sapuan terjadwal (setInterval) — disengaja, supaya proses Node (dan
 * proses test) bisa keluar bersih tanpa timer menggantung untuk aplikasi
 * sekecil ini.
 *
 * Tabel: server/db/migrations/002_sessions.sql.
 */

import session from 'express-session';
import { pool } from './pool.js';

const { Store } = session;

const DEFAULT_MAX_AGE_MS = 1000 * 60 * 60 * 8; // 8 jam, dipakai bila cookie.maxAge tidak diset

function expiresAtSeconds(sessionData) {
    const maxAge = sessionData.cookie?.maxAge ?? DEFAULT_MAX_AGE_MS;
    return Math.floor((Date.now() + maxAge) / 1000);
}

export class MySqlSessionStore extends Store {
    async get(sid, callback) {
        try {
            const [rows] = await pool.query('SELECT data, expires FROM sessions WHERE session_id = ?', [sid]);
            const row = rows[0];
            if (!row) return callback(null, null);

            if (row.expires < Math.floor(Date.now() / 1000)) {
                await pool.query('DELETE FROM sessions WHERE session_id = ?', [sid]);
                return callback(null, null);
            }

            callback(null, JSON.parse(row.data));
        } catch (error) {
            callback(error);
        }
    }

    async set(sid, sessionData, callback) {
        try {
            await pool.query(
                `INSERT INTO sessions (session_id, expires, data) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE expires = VALUES(expires), data = VALUES(data)`,
                [sid, expiresAtSeconds(sessionData), JSON.stringify(sessionData)],
            );
            callback(null);
        } catch (error) {
            callback(error);
        }
    }

    async destroy(sid, callback) {
        try {
            await pool.query('DELETE FROM sessions WHERE session_id = ?', [sid]);
            callback(null);
        } catch (error) {
            callback(error);
        }
    }

    async touch(sid, sessionData, callback) {
        try {
            await pool.query('UPDATE sessions SET expires = ? WHERE session_id = ?', [expiresAtSeconds(sessionData), sid]);
            callback(null);
        } catch (error) {
            callback(error);
        }
    }
}

export const sessionStore = new MySqlSessionStore();
