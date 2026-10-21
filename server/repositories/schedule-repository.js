/* schedule-repository.js — versi MySQL, dipakai backend (server/).
 *
 * Signature sama dengan src/repositories/schedule-repository.js (in-memory,
 * dipakai browser) — lihat catatan di server/repositories/inspection-repository.js
 * untuk penjelasan lengkap kenapa desainnya begini.
 */

import { pool } from '../db/pool.js';

function toDisplayId(numericId) {
    return `SCH-${String(numericId).padStart(3, '0')}`;
}

function toNumericId(id) {
    const match = String(id).match(/(\d+)\s*$/);
    return match ? Number(match[1]) : NaN;
}

/**
 * Laporan inspeksi yang tertaut ke jadwal (migrasi 008) — hanya yang sudah
 * diajukan (bukan draft): draft bersifat privat milik pembuatnya, jadi id-nya
 * tidak ikut daftar jadwal yang terlihat semua role. Tautan draft tetap
 * dijaga kunci UNIQUE inspections.schedule_id.
 */
const SELECT_SCHEDULES = `
    SELECT s.*, i.id AS linked_inspection_id
    FROM schedules s
    LEFT JOIN inspections i ON i.schedule_id = s.id AND i.status <> 'draft'`;

const toInspectionDisplayId = (numericId) => `INS-${String(numericId).padStart(3, '0')}`;

function toDomainShape(row) {
    return {
        id: toDisplayId(row.id),
        plantId: row.plant_id,
        plantName: row.plant_name,
        periode: row.periode,
        tahun: row.tahun,
        minggu: row.minggu,
        tanggalJadwal: row.tanggal_jadwal,
        tanggalRealisasi: row.tanggal_realisasi,
        officer: row.officer,
        officerUserId: row.officer_user_id,
        status: row.status,
        inspectionId: row.linked_inspection_id ? toInspectionDisplayId(row.linked_inspection_id) : null,
    };
}

/** Seluruh jadwal. */
export async function getAll() {
    const [rows] = await pool.query(`${SELECT_SCHEDULES} ORDER BY s.id`);
    return rows.map(toDomainShape);
}

/** Satu jadwal berdasarkan id ("SCH-nnn"), atau undefined bila tidak ada. */
export async function findById(id) {
    const numericId = toNumericId(id);
    if (Number.isNaN(numericId)) return undefined;
    const [rows] = await pool.query(`${SELECT_SCHEDULES} WHERE s.id = ?`, [numericId]);
    return rows.length ? toDomainShape(rows[0]) : undefined;
}

/** Menambahkan jadwal baru. Id ditentukan MySQL (AUTO_INCREMENT). */
export async function add(schedule) {
    const [result] = await pool.query(
        `INSERT INTO schedules (plant_id, plant_name, periode, tahun, minggu, tanggal_jadwal, tanggal_realisasi, officer, officer_user_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            schedule.plantId,
            schedule.plantName,
            schedule.periode,
            schedule.tahun,
            schedule.minggu,
            schedule.tanggalJadwal,
            schedule.tanggalRealisasi || null,
            schedule.officer,
            schedule.officerUserId || null,
            schedule.status,
        ],
    );
    return findById(toDisplayId(result.insertId));
}

/**
 * Menyimpan perubahan field jadwal — jalur yang benar-benar menyimpan ke MySQL.
 * Migrasi 008: tanggal_realisasi/status TIDAK diubah di sini (hanya oleh
 * pengajuan laporan yang tertaut); jadwal yang sudah Terlaksana tidak diubah
 * sama sekali (penjaga di WHERE, selain pemeriksaan service).
 */
export async function update(id, patch) {
    const numericId = toNumericId(id);
    await pool.query(
        `UPDATE schedules
         SET plant_id = ?, plant_name = ?, periode = ?, tahun = ?, minggu = ?,
             tanggal_jadwal = ?, officer = ?, officer_user_id = ?
         WHERE id = ? AND tanggal_realisasi IS NULL`,
        [
            patch.plantId,
            patch.plantName,
            patch.periode,
            patch.tahun,
            patch.minggu,
            patch.tanggalJadwal,
            patch.officer,
            patch.officerUserId,
            numericId,
        ],
    );
}

/** Akun Safety Officer aktif yang bisa ditugaskan sebagai petugas jadwal: [{ id, displayName }]. */
export async function listAssignableOfficers() {
    const [rows] = await pool.query(
        "SELECT id, display_name FROM users WHERE role = 'safety_officer' AND is_active = 1 ORDER BY display_name, id",
    );
    return rows.map((row) => ({ id: row.id, displayName: row.display_name }));
}

/** Satu akun Safety Officer aktif berdasarkan id, atau undefined. */
export async function findAssignableOfficer(id) {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) return undefined;
    const [rows] = await pool.query(
        "SELECT id, display_name FROM users WHERE id = ? AND role = 'safety_officer' AND is_active = 1",
        [numericId],
    );
    return rows.length ? { id: rows[0].id, displayName: rows[0].display_name } : undefined;
}

/** Menghapus jadwal berdasarkan id. @returns {boolean} true bila ada yang terhapus. */
export async function remove(id) {
    const numericId = toNumericId(id);
    const [result] = await pool.query('DELETE FROM schedules WHERE id = ?', [numericId]);
    return result.affectedRows > 0;
}

/** Jumlah jadwal. */
export async function count() {
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM schedules');
    return total;
}
