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
    };
}

/** Seluruh jadwal. */
export async function getAll() {
    const [rows] = await pool.query('SELECT * FROM schedules ORDER BY id');
    return rows.map(toDomainShape);
}

/** Satu jadwal berdasarkan id ("SCH-nnn"), atau undefined bila tidak ada. */
export async function findById(id) {
    const numericId = toNumericId(id);
    if (Number.isNaN(numericId)) return undefined;
    const [rows] = await pool.query('SELECT * FROM schedules WHERE id = ?', [numericId]);
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

/** Menyimpan perubahan field jadwal — jalur yang benar-benar menyimpan ke MySQL. */
export async function update(id, patch) {
    const numericId = toNumericId(id);
    await pool.query(
        `UPDATE schedules
         SET plant_id = ?, plant_name = ?, periode = ?, tahun = ?, minggu = ?,
             tanggal_jadwal = ?, tanggal_realisasi = ?, officer = ?
         WHERE id = ?`,
        [
            patch.plantId,
            patch.plantName,
            patch.periode,
            patch.tahun,
            patch.minggu,
            patch.tanggalJadwal,
            patch.tanggalRealisasi || null,
            patch.officer,
            numericId,
        ],
    );
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
