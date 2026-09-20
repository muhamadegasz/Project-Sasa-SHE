/* plant-repository.js — versi MySQL, dipakai backend (server/).
 *
 * Signature sama dengan src/repositories/plant-repository.js (in-memory,
 * dipakai browser). Plant hanya dibaca lewat services (add/update/delete
 * plant adalah operasi admin — lihat docs/ROADMAP-PHASE12.md, di luar
 * cakupan services yang dipakai ulang; ditangani langsung di routes/plants).
 */

import { pool } from '../db/pool.js';

/** Seluruh plant aktif. */
export async function getAll() {
    const [rows] = await pool.query('SELECT id, name, code FROM plants WHERE is_active = 1 ORDER BY id');
    return rows;
}

/** Satu plant berdasarkan id. */
export async function findById(id) {
    const [rows] = await pool.query('SELECT id, name, code FROM plants WHERE id = ? AND is_active = 1', [Number(id)]);
    return rows[0];
}

/** Mencari plant berdasarkan nama atau kode, tidak peka huruf besar/kecil. */
export async function search(query) {
    const needle = String(query || '').trim();
    if (needle === '') return getAll();
    const [rows] = await pool.query(
        'SELECT id, name, code FROM plants WHERE is_active = 1 AND (name LIKE ? OR code LIKE ?) ORDER BY id',
        [`%${needle}%`, `%${needle}%`],
    );
    return rows;
}

/** Jumlah plant terdaftar. */
export async function count() {
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM plants WHERE is_active = 1');
    return total;
}
