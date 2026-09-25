/* inspection-repository.js — versi MySQL, dipakai backend (server/).
 *
 * Signature fungsi (getAll, findById, add, count) SAMA dengan
 * src/repositories/inspection-repository.js (versi in-memory, dipakai
 * browser) — itulah seam yang membuat src/services/inspection-service.js,
 * approval-service.js, dan corrective-action-service.js bisa dipakai APA
 * ADANYA oleh backend ini (lihat docs/ROADMAP-PHASE12.md).
 *
 * Bedanya dengan versi in-memory: findById() di sana mengembalikan REFERENSI
 * HIDUP ke array (memutasinya = memutasi "database"). Query SQL tidak bisa
 * begitu — findById() di sini mengembalikan salinan baru setiap kali, jadi
 * approval-service.js dkk memanggil saveApproval()/setStatus()/
 * addCorrectiveAction() secara eksplisit untuk BENAR-BENAR menyimpan
 * perubahan. Fungsi-fungsi itu no-op di versi in-memory (lihat komentar di
 * sana), di sini isinya query UPDATE/INSERT sungguhan.
 *
 * id yang dipakai di seluruh permukaan publik SELALU string tampilan
 * "INS-nnn" (bukan angka mentah) — sama seperti yang sudah dipakai
 * domain/services/presentation hari ini. Angka AUTO_INCREMENT hanya urusan
 * internal berkas ini.
 */

import { pool } from '../db/pool.js';
import { formatDate } from '../../src/shared/date.js';

function toDisplayId(numericId) {
    return `INS-${String(numericId).padStart(3, '0')}`;
}

/**
 * "D/M/YYYY" (format lokal dipakai inspection-service.js lewat formatDate())
 * -> "YYYY-MM-DD" untuk kolom DATE MySQL. '-' atau kosong -> null.
 *
 * Arah sebaliknya (ISO -> lokal) TIDAK butuh fungsi baru: formatDate() dari
 * src/shared/date.js sudah menerima string ISO dan mengeluarkan format lokal
 * yang sama persis dengan yang dipakai domain/services/presentation hari
 * ini — dipakai langsung di loadFull() di bawah.
 */
function toSqlDate(localDate) {
    if (!localDate || localDate === '-') return null;
    const [day, month, year] = String(localDate).split('/');
    if (!day || !month || !year) return null;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** Menerima "INS-003", "003", atau 3 — semuanya jadi angka 3. */
function toNumericId(id) {
    const match = String(id).match(/(\d+)\s*$/);
    return match ? Number(match[1]) : NaN;
}

async function loadFull(row) {
    const numericId = row.id;
    const [findings] = await pool.query(
        'SELECT id, deskripsi, kategori FROM findings WHERE inspection_id = ? ORDER BY id',
        [numericId],
    );
    const [actions] = await pool.query(
        'SELECT id, finding_id, tgl, action, status, pic FROM corrective_actions WHERE inspection_id = ? ORDER BY id',
        [numericId],
    );
    const [approvalRows] = await pool.query(
        'SELECT stage_id, approved, rejected, approved_by_name, jabatan, decided_at FROM approvals WHERE inspection_id = ?',
        [numericId],
    );
    const [dekatPhotos] = await pool.query(
        "SELECT id, original_name FROM photos WHERE inspection_id = ? AND slot = 'dekat' ORDER BY id",
        [numericId],
    );
    const [jauhPhotos] = await pool.query(
        "SELECT id, original_name FROM photos WHERE inspection_id = ? AND slot = 'jauh' ORDER BY id",
        [numericId],
    );

    const actionPhotosById = {};
    if (actions.length > 0) {
        const [actionPhotoRows] = await pool.query(
            `SELECT id, corrective_action_id, original_name FROM photos
             WHERE corrective_action_id IN (${actions.map(() => '?').join(',')})
             ORDER BY id`,
            actions.map((a) => a.id),
        );
        for (const photo of actionPhotoRows) {
            (actionPhotosById[photo.corrective_action_id] ||= []).push({ id: photo.id, originalName: photo.original_name });
        }
    }

    const approvals = {};
    for (const approval of approvalRows) {
        approvals[approval.stage_id] = {
            approved: Boolean(approval.approved),
            by: approval.approved_by_name,
            jabatan: approval.jabatan,
            tanggal: approval.decided_at,
            ...(approval.rejected ? { rejected: true } : {}),
        };
    }

    return {
        id: toDisplayId(numericId),
        lokasi: row.plant_name,
        plantId: row.plant_id,
        keteranganLokasi: row.keterangan_lokasi,
        tanggal: formatDate(row.tanggal),
        petugas: row.petugas,
        petugasUserId: row.petugas_user_id,
        status: row.status,
        dueDate: formatDate(row.due_date),
        fotoDekat: dekatPhotos.map((p) => ({ id: p.id, originalName: p.original_name })),
        fotoJauh: jauhPhotos.map((p) => ({ id: p.id, originalName: p.original_name })),
        approvals,
        temuan: findings.map((f) => ({ id: f.id, deskripsi: f.deskripsi, kategori: f.kategori })),
        perbaikan: actions.map((a) => ({
            id: a.id,
            tgl: formatDate(a.tgl),
            action: a.action,
            status: a.status,
            pic: a.pic,
            foto: actionPhotosById[a.id] || [],
        })),
    };
}

const BASE_SELECT = `
    SELECT i.id, i.plant_id, i.keterangan_lokasi, i.tanggal, i.petugas, i.petugas_user_id,
           i.status, i.due_date, p.name AS plant_name
    FROM inspections i
    JOIN plants p ON p.id = i.plant_id
`;

/** Seluruh inspeksi, urutan terbaru (id terbesar) di depan — sama seperti unshift() di versi in-memory. */
export async function getAll() {
    const [rows] = await pool.query(`${BASE_SELECT} ORDER BY i.id DESC`);
    return Promise.all(rows.map(loadFull));
}

/** Satu inspeksi berdasarkan id ("INS-nnn"), atau undefined bila tidak ada. */
export async function findById(id) {
    const numericId = toNumericId(id);
    if (Number.isNaN(numericId)) return undefined;
    const [rows] = await pool.query(`${BASE_SELECT} WHERE i.id = ?`, [numericId]);
    if (rows.length === 0) return undefined;
    return loadFull(rows[0]);
}

/** Jumlah inspeksi. */
export async function count() {
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM inspections');
    return total;
}

/**
 * Menyimpan inspeksi baru. `inspection.petugasUserId` WAJIB diisi di sini
 * (lihat catatan di src/services/inspection-service.js) — route handler yang
 * memaksanya dari req.user, tidak pernah dari body permintaan pengguna.
 */
export async function add(inspection) {
    if (!inspection.petugasUserId) {
        throw new Error('inspection.petugasUserId wajib diisi (route handler yang seharusnya mengisinya dari req.user)');
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [result] = await connection.query(
            `INSERT INTO inspections (plant_id, keterangan_lokasi, tanggal, petugas, petugas_user_id, status, due_date)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                inspection.plantId,
                inspection.keteranganLokasi,
                toSqlDate(inspection.tanggal),
                inspection.petugas,
                inspection.petugasUserId,
                inspection.status,
                toSqlDate(inspection.dueDate),
            ],
        );
        const numericId = result.insertId;

        for (const photo of inspection.fotoDekat || []) {
            await connection.query(
                `INSERT INTO photos (inspection_id, slot, file_path, original_name, mime_type, size_bytes, uploaded_by)
                 VALUES (?, 'dekat', ?, ?, ?, ?, ?)`,
                [numericId, photo.path, photo.originalName, photo.mimeType, photo.size, inspection.petugasUserId],
            );
        }
        for (const photo of inspection.fotoJauh || []) {
            await connection.query(
                `INSERT INTO photos (inspection_id, slot, file_path, original_name, mime_type, size_bytes, uploaded_by)
                 VALUES (?, 'jauh', ?, ?, ?, ?, ?)`,
                [numericId, photo.path, photo.originalName, photo.mimeType, photo.size, inspection.petugasUserId],
            );
        }

        const findingIds = [];
        for (const finding of inspection.temuan || []) {
            const [findingResult] = await connection.query(
                'INSERT INTO findings (inspection_id, deskripsi, kategori) VALUES (?, ?, ?)',
                [numericId, finding.deskripsi, finding.kategori],
            );
            findingIds.push(findingResult.insertId);
        }

        for (let i = 0; i < (inspection.perbaikan || []).length; i++) {
            const action = inspection.perbaikan[i];
            await connection.query(
                `INSERT INTO corrective_actions (inspection_id, finding_id, tgl, action, status, pic)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [numericId, findingIds[i] ?? null, toSqlDate(action.tgl), action.action, action.status, action.pic],
            );
        }

        for (const [stageIdStr, approval] of Object.entries(inspection.approvals || {})) {
            await connection.query(
                `INSERT INTO approvals (inspection_id, stage_id, approved, rejected, approved_by_user_id, approved_by_name, jabatan, decided_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    numericId,
                    Number(stageIdStr),
                    approval.approved ? 1 : 0,
                    approval.rejected ? 1 : 0,
                    approval.approved ? inspection.petugasUserId : null,
                    approval.by,
                    approval.jabatan,
                    approval.approved ? new Date() : null,
                ],
            );
        }

        await connection.commit();
        return findById(toDisplayId(numericId));
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

/** Menyimpan satu tahap pengesahan — jalur yang benar-benar menyimpan ke MySQL (lihat header berkas ini). */
export async function saveApproval(inspectionId, stageId, record, approverId) {
    const numericId = toNumericId(inspectionId);
    await pool.query(
        `UPDATE approvals
         SET approved = ?, rejected = ?, approved_by_user_id = ?, approved_by_name = ?, jabatan = ?, decided_at = ?
         WHERE inspection_id = ? AND stage_id = ?`,
        [
            record.approved ? 1 : 0,
            record.rejected ? 1 : 0,
            record.approved ? approverId || null : null,
            record.by,
            record.jabatan,
            record.approved || record.rejected ? new Date() : null,
            numericId,
            stageId,
        ],
    );
}

/** Menyimpan status inspeksi — jalur yang benar-benar menyimpan ke MySQL. */
export async function setStatus(inspectionId, status) {
    const numericId = toNumericId(inspectionId);
    await pool.query('UPDATE inspections SET status = ? WHERE id = ?', [status, numericId]);
}

/** Menyimpan satu tindakan perbaikan baru (+ fotonya) — jalur yang benar-benar menyimpan ke MySQL. */
export async function addCorrectiveAction(inspectionId, action) {
    const numericId = toNumericId(inspectionId);
    const [result] = await pool.query(
        `INSERT INTO corrective_actions (inspection_id, finding_id, tgl, action, status, pic)
         VALUES (?, NULL, ?, ?, ?, ?)`,
        [numericId, toSqlDate(action.tgl), action.action, action.status, action.pic],
    );
    const actionId = result.insertId;

    for (const photo of action.foto || []) {
        await pool.query(
            `INSERT INTO photos (corrective_action_id, slot, file_path, original_name, mime_type, size_bytes, uploaded_by)
             VALUES (?, 'perbaikan', ?, ?, ?, ?, ?)`,
            [actionId, photo.path, photo.originalName, photo.mimeType, photo.size, action.uploadedBy],
        );
    }

    return { id: actionId, ...action };
}

/** Metadata satu foto (untuk endpoint penyajian file, lihat inspections.routes.js). undefined bila tidak ada. */
export async function findPhotoFile(photoId) {
    const [rows] = await pool.query(
        'SELECT file_path, mime_type, original_name FROM photos WHERE id = ?',
        [photoId],
    );
    if (rows.length === 0) return undefined;
    return { filePath: rows[0].file_path, mimeType: rows[0].mime_type, originalName: rows[0].original_name };
}
