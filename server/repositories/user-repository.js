/* user-repository.js — versi MySQL, dipakai backend (server/).
 *
 * Dipakai auth (session-auth.js, auth.routes.js — impor langsung) dan,
 * sejak Phase 18, src/services/user-service.js lewat #repositories/
 * (padanan browser: src/repositories/user-repository.js, fetch ke API).
 *
 * Password di-hash DI SINI (bcryptjs, cost 10 — sama dengan seed.js), bukan
 * di service: service ikut berjalan di browser. password_hash tidak pernah
 * keluar dari berkas ini kecuali lewat findByUsernameWithPasswordHash()
 * untuk verifikasi login.
 */

import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';

const BCRYPT_COST = 10;

function toPublicShape(row) {
    if (!row) return undefined;
    return {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        role: row.role,
        // Phase 17.2: plant yang ditugaskan (hanya bermakna untuk koordinator_k3l).
        plantId: row.plant_id,
        isActive: Boolean(row.is_active),
    };
}

/** Satu user berdasarkan id, TANPA password_hash (bentuk publik). */
export async function findById(id) {
    const [rows] = await pool.query(
        'SELECT id, username, display_name, role, plant_id, is_active FROM users WHERE id = ?',
        [Number(id)],
    );
    return toPublicShape(rows[0]);
}

/** Satu user berdasarkan username, TERMASUK password_hash — dipakai khusus untuk verifikasi login. */
export async function findByUsernameWithPasswordHash(username) {
    const [rows] = await pool.query(
        'SELECT id, username, password_hash, display_name, role, plant_id, is_active FROM users WHERE username = ?',
        [username],
    );
    if (!rows[0]) return undefined;
    return {
        id: rows[0].id,
        username: rows[0].username,
        passwordHash: rows[0].password_hash,
        displayName: rows[0].display_name,
        role: rows[0].role,
        plantId: rows[0].plant_id,
        isActive: Boolean(rows[0].is_active),
    };
}

/** Seluruh user (bentuk publik), untuk halaman admin. */
export async function getAll() {
    const [rows] = await pool.query('SELECT id, username, display_name, role, plant_id, is_active FROM users ORDER BY id');
    return rows.map(toPublicShape);
}

/**
 * Membuat akun (aktif). Isian sudah divalidasi user-service.js.
 * @returns user baru (bentuk publik), atau null bila username sudah dipakai.
 */
export async function create({ username, displayName, role, plantId, password }) {
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    try {
        const [result] = await pool.query(
            'INSERT INTO users (username, password_hash, display_name, role, plant_id) VALUES (?, ?, ?, ?, ?)',
            [username, passwordHash, displayName, role, plantId],
        );
        return findById(result.insertId);
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return null;
        throw error;
    }
}

/**
 * Mengubah nama tampilan, role, plant — dan password bila `password` bukan
 * null. @returns user terbaru (bentuk publik), atau undefined bila tidak ada.
 */
export async function update(id, { displayName, role, plantId, password }) {
    const numericId = Number(id);
    // Dibaca ulang, bukan affectedRows: UPDATE dengan nilai yang sama persis
    // tidak dihitung sebagai baris yang berubah (lihat lockOwnedInState di
    // inspection-repository.js).
    if (password === null) {
        await pool.query(
            'UPDATE users SET display_name = ?, role = ?, plant_id = ? WHERE id = ?',
            [displayName, role, plantId, numericId],
        );
    } else {
        await pool.query(
            'UPDATE users SET display_name = ?, role = ?, plant_id = ?, password_hash = ? WHERE id = ?',
            [displayName, role, plantId, await bcrypt.hash(password, BCRYPT_COST), numericId],
        );
    }
    return findById(numericId);
}

/** Mengaktifkan/menonaktifkan akun. @returns user terbaru (bentuk publik), atau undefined bila tidak ada. */
export async function setActive(id, isActive) {
    const numericId = Number(id);
    await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, numericId]);
    return findById(numericId);
}

/**
 * Jumlah inspeksi milik akun ini yang BELUM SELESAI (draft, sedang direview,
 * perlu revisi) — pengaman hapus permanen di user-service.js.
 */
export async function countOpenOwnedInspections(id) {
    const [[{ total }]] = await pool.query(
        "SELECT COUNT(*) AS total FROM inspections WHERE petugas_user_id = ? AND status <> 'completed'",
        [Number(id)],
    );
    return Number(total);
}

/**
 * Menghapus akun secara permanen — hanya bila masih nonaktif (penjaga di
 * WHERE, bukan hanya pemeriksaan service). Data bisnis yang menunjuk akun
 * ini tetap ada; tautannya menjadi NULL (migrasi 005, ON DELETE SET NULL).
 * @returns {boolean} true bila terhapus
 */
export async function remove(id) {
    const [result] = await pool.query('DELETE FROM users WHERE id = ? AND is_active = 0', [Number(id)]);
    return result.affectedRows > 0;
}
