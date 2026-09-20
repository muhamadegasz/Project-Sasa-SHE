/* seed.js — mengisi database dengan data awal, porting dari src/data/*.seed.js
 * dan src/data/plants.js (lihat docs/ROADMAP-PHASE12.md, Phase 12).
 *
 * Bisa dijalankan berulang: membersihkan seluruh tabel domain dulu (FK checks
 * dimatikan sementara), baru mengisi ulang dari awal. Ini seed data, bukan
 * data produksi, jadi wipe-and-reseed aman.
 *
 * Password akun seed di-hash dengan bcryptjs supaya kolom password_hash tidak
 * pernah kosong/placeholder-palsu — walau route login sungguhan baru ada di
 * Phase 13, akun ini sudah siap dipakai begitu Phase 13 selesai.
 */

import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
import { PLANT_LIST } from '../../src/data/plants.js';
import { createInspectionSeed } from '../../src/data/inspections.seed.js';
import { generateWeeklySchedule } from '../../src/data/schedules.seed.js';

/** "D/M/YYYY" (getDateOffset) atau "D/M/YYYY HH:MM" -> "YYYY-MM-DD"/"YYYY-MM-DD HH:MM:SS" untuk MySQL DATE/DATETIME. */
function toSqlDate(localDate) {
    const [datePart] = String(localDate).split(' ');
    const [day, month, year] = datePart.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function toSqlDateTime(localDateTime) {
    const [datePart, timePart] = String(localDateTime).split(' ');
    return `${toSqlDate(datePart)} ${timePart}:00`;
}

function guessMimeType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    return 'application/octet-stream';
}

/** Nama akun seed per role. Password sama dengan username — data pengembangan, bukan produksi. */
const SEED_USERS = [
    { username: 'arif', displayName: 'Arif', role: 'safety_officer' },
    { username: 'tulus', displayName: 'Tulus', role: 'safety_officer' },
    { username: 'mustofa', displayName: 'Mustofa', role: 'safety_officer' },
    { username: 'melka', displayName: 'Melka', role: 'safety_officer' },
    { username: 'dewi', displayName: 'Dewi', role: 'koordinator_k3l' },
    { username: 'andi', displayName: 'Andi', role: 'manajer_bagian' },
    { username: 'hadi', displayName: 'Hadi', role: 'ketua_p2k3' },
    { username: 'admin', displayName: 'Administrator', role: 'admin' },
];

async function wipe(connection) {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of ['photos', 'approvals', 'corrective_actions', 'findings', 'inspections', 'schedules', 'plants', 'users']) {
        await connection.query(`TRUNCATE TABLE ${table}`);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function seedUsers(connection) {
    const userIdByDisplayName = new Map();
    for (const user of SEED_USERS) {
        const passwordHash = await bcrypt.hash(user.username, 10);
        const [result] = await connection.query(
            'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
            [user.username, passwordHash, user.displayName, user.role],
        );
        userIdByDisplayName.set(user.displayName, result.insertId);
    }
    return userIdByDisplayName;
}

async function seedPlants(connection) {
    for (const plant of PLANT_LIST) {
        await connection.query('INSERT INTO plants (id, name, code) VALUES (?, ?, ?)', [plant.id, plant.name, plant.code]);
    }
}

async function insertPhotos(connection, filenames, slot, { inspectionId = null, correctiveActionId = null }) {
    for (const filename of filenames) {
        if (!filename || filename === '-') continue;
        await connection.query(
            `INSERT INTO photos (inspection_id, corrective_action_id, slot, file_path, original_name, mime_type, size_bytes)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [inspectionId, correctiveActionId, slot, `seed/${filename}`, filename, guessMimeType(filename), 0],
        );
    }
}

async function seedInspections(connection, userIdByDisplayName) {
    const inspections = createInspectionSeed();

    for (const inspection of inspections) {
        const petugasUserId = userIdByDisplayName.get(inspection.petugas);
        if (!petugasUserId) {
            throw new Error(`Seed inspeksi ${inspection.id}: petugas "${inspection.petugas}" tidak ada di SEED_USERS`);
        }

        const [inspectionResult] = await connection.query(
            `INSERT INTO inspections (plant_id, keterangan_lokasi, tanggal, petugas, petugas_user_id, status, due_date)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                inspection.plantId,
                inspection.keteranganLokasi,
                toSqlDate(inspection.tanggal),
                inspection.petugas,
                petugasUserId,
                inspection.status,
                inspection.dueDate ? toSqlDate(inspection.dueDate) : null,
            ],
        );
        const inspectionId = inspectionResult.insertId;

        await insertPhotos(connection, inspection.fotoDekat, 'dekat', { inspectionId });
        await insertPhotos(connection, inspection.fotoJauh, 'jauh', { inspectionId });

        // approvals: tahap 1 selalu oleh petugas (identitas sungguhan tersedia).
        // Tahap 2-4 di data demo lama memakai nama fiktif tanpa akun sungguhan
        // (di luar SEED_USERS) — approved_by_user_id dibiarkan NULL, nama
        // historisnya tetap disimpan di approved_by_name.
        for (const [stageIdStr, approval] of Object.entries(inspection.approvals)) {
            const stageId = Number(stageIdStr);
            const approvedByUserId = stageId === 1 ? petugasUserId : (userIdByDisplayName.get(approval.by) || null);
            await connection.query(
                `INSERT INTO approvals (inspection_id, stage_id, approved, rejected, approved_by_user_id, approved_by_name, jabatan, decided_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    inspectionId,
                    stageId,
                    approval.approved ? 1 : 0,
                    approval.rejected ? 1 : 0,
                    approval.approved ? approvedByUserId : null,
                    approval.by,
                    approval.jabatan,
                    approval.tanggal ? toSqlDateTime(approval.tanggal) : null,
                ],
            );
        }

        const findingIds = [];
        for (const finding of inspection.temuan || []) {
            const [findingResult] = await connection.query(
                'INSERT INTO findings (inspection_id, deskripsi, kategori) VALUES (?, ?, ?)',
                [inspectionId, finding.deskripsi, finding.kategori],
            );
            findingIds.push(findingResult.insertId);
        }

        for (let i = 0; i < (inspection.perbaikan || []).length; i++) {
            const action = inspection.perbaikan[i];
            const [actionResult] = await connection.query(
                `INSERT INTO corrective_actions (inspection_id, finding_id, tgl, action, status, pic)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [inspectionId, findingIds[i] ?? null, toSqlDate(action.tgl), action.action, action.status, action.pic],
            );
            await insertPhotos(connection, action.foto || [], 'perbaikan', { correctiveActionId: actionResult.insertId });
        }
    }
}

async function seedSchedules(connection, userIdByDisplayName) {
    const schedules = generateWeeklySchedule();
    for (const schedule of schedules) {
        await connection.query(
            `INSERT INTO schedules (plant_id, plant_name, periode, tahun, minggu, tanggal_jadwal, tanggal_realisasi, officer, officer_user_id, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                schedule.plantId,
                schedule.plantName,
                schedule.periode,
                schedule.tahun,
                schedule.minggu,
                schedule.tanggalJadwal,
                schedule.tanggalRealisasi,
                schedule.officer,
                userIdByDisplayName.get(schedule.officer) || null,
                schedule.status,
            ],
        );
    }
}

async function main() {
    const connection = await pool.getConnection();
    try {
        await wipe(connection);
        const userIdByDisplayName = await seedUsers(connection);
        await seedPlants(connection);
        await seedInspections(connection, userIdByDisplayName);
        await seedSchedules(connection, userIdByDisplayName);
        console.log(`seed selesai: ${SEED_USERS.length} user, ${PLANT_LIST.length} plant.`);
    } finally {
        connection.release();
        await pool.end();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
