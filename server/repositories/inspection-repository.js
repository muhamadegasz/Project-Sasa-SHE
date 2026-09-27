/* inspection-repository.js — versi MySQL, dipakai backend (server/).
 *
 * Signature fungsi yang dipakai services (findById, add, count,
 * recordDecision, addCorrectiveAction) SAMA dengan
 * src/repositories/inspection-repository.js (versi browser) — itulah seam
 * yang membuat src/services/inspection-service.js, approval-service.js, dan
 * corrective-action-service.js bisa dipakai APA ADANYA oleh backend ini
 * (lihat docs/ROADMAP-PHASE12.md).
 *
 * Phase 17.3A: bacaan yang DISAJIKAN ke pengguna (daftar, detail, file foto)
 * selalu lewat fungsi yang menerapkan cakupan visibilitas pengguna
 * (getAllVisibleTo, findByIdVisibleTo, findPhotoFile) — tidak ada lagi
 * daftar tanpa cakupan di berkas ini.
 *
 * Bedanya dengan versi in-memory: findById() di sana mengembalikan REFERENSI
 * HIDUP ke array (memutasinya = memutasi "database"). Query SQL tidak bisa
 * begitu — findById() di sini mengembalikan salinan baru setiap kali, jadi
 * approval-service.js dkk memanggil recordDecision()/addCorrectiveAction()
 * secara eksplisit untuk BENAR-BENAR menyimpan perubahan (di sini query
 * UPDATE/INSERT sungguhan).
 *
 * id yang dipakai di seluruh permukaan publik SELALU string tampilan
 * "INS-nnn" (bukan angka mentah) — sama seperti yang sudah dipakai
 * domain/services/presentation hari ini. Angka AUTO_INCREMENT hanya urusan
 * internal berkas ini.
 */

import { pool } from '../db/pool.js';
import { formatDate } from '../../src/shared/date.js';
import { visibilityScope } from '../../src/domain/inspection-policy.js';

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
        `SELECT stage, attempt, decision, reviewer_user_id, reviewer_name, rejection_reason,
                signature_method, watermark_enabled, watermark_x, watermark_y, decided_at
         FROM approvals WHERE inspection_id = ? ORDER BY id`,
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

    // Riwayat append-only (Phase 17.2) — satu entri per keputusan, urut waktu.
    // Path file tanda tangan sengaja tidak ikut: penyajiannya butuh otorisasi
    // sendiri (Phase 17.3), bukan dibocorkan lewat JSON detail inspeksi.
    const approvalHistory = approvalRows.map((row) => ({
        stage: row.stage,
        attempt: row.attempt,
        decision: row.decision,
        reviewerUserId: row.reviewer_user_id,
        reviewerName: row.reviewer_name,
        rejectionReason: row.rejection_reason,
        signatureMethod: row.signature_method,
        watermark: row.watermark_enabled
            ? { x: Number(row.watermark_x), y: Number(row.watermark_y) }
            : null,
        decidedAt: row.decided_at,
    }));

    return {
        id: toDisplayId(numericId),
        lokasi: row.plant_name,
        plantId: row.plant_id,
        keteranganLokasi: row.keterangan_lokasi,
        tanggal: formatDate(row.tanggal),
        petugas: row.petugas,
        petugasUserId: row.petugas_user_id,
        status: row.status,
        currentApprovalStage: row.current_approval_stage,
        submittedAt: row.submitted_at,
        dueDate: formatDate(row.due_date),
        fotoDekat: dekatPhotos.map((p) => ({ id: p.id, originalName: p.original_name })),
        fotoJauh: jauhPhotos.map((p) => ({ id: p.id, originalName: p.original_name })),
        approvalHistory,
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
           i.status, i.current_approval_stage, i.submitted_at, i.due_date, p.name AS plant_name
    FROM inspections i
    JOIN plants p ON p.id = i.plant_id
`;

/**
 * Menerjemahkan visibilityScope(user) (domain/inspection-policy.js — sumber
 * aturannya) menjadi klausa WHERE atas alias `i` (tabel inspections), supaya
 * inspeksi di luar cakupan tidak pernah dibaca dari database (Phase 17.3A).
 * Aturan siapa-melihat-apa TIDAK ditulis di sini, hanya dipetakan ke kolom.
 * Cakupan kosong -> '1 = 0' (tidak ada baris).
 */
function visibilityWhere(user) {
    const params = [];
    const clauses = visibilityScope(user).map((criterion) => {
        const conditions = [];
        if (criterion.petugasUserId != null) { conditions.push('i.petugas_user_id = ?'); params.push(criterion.petugasUserId); }
        if (criterion.plantId != null) { conditions.push('i.plant_id = ?'); params.push(criterion.plantId); }
        if (criterion.statuses) { conditions.push('i.status IN (?)'); params.push(criterion.statuses); }
        if (criterion.currentApprovalStage) { conditions.push('i.current_approval_stage = ?'); params.push(criterion.currentApprovalStage); }
        return `(${conditions.join(' AND ')})`;
    });
    return { sql: clauses.length ? `(${clauses.join(' OR ')})` : '1 = 0', params };
}

/** Inspeksi yang boleh dilihat `user` (pengguna login), terbaru di depan. Dipakai GET /api/inspections. */
export async function getAllVisibleTo(user) {
    const scope = visibilityWhere(user);
    const [rows] = await pool.query(`${BASE_SELECT} WHERE ${scope.sql} ORDER BY i.id DESC`, scope.params);
    return Promise.all(rows.map(loadFull));
}

/**
 * Satu inspeksi bila ada DAN boleh dilihat `user`, selain itu undefined —
 * sengaja tidak membedakan "tidak ada" dari "di luar cakupan". Dipakai
 * GET /api/inspections/:id.
 */
export async function findByIdVisibleTo(id, user) {
    const numericId = toNumericId(id);
    if (Number.isNaN(numericId)) return undefined;
    const scope = visibilityWhere(user);
    const [rows] = await pool.query(`${BASE_SELECT} WHERE i.id = ? AND ${scope.sql}`, [numericId, ...scope.params]);
    if (rows.length === 0) return undefined;
    return loadFull(rows[0]);
}

/**
 * Satu inspeksi berdasarkan id ("INS-nnn"), atau undefined bila tidak ada —
 * TANPA pemeriksaan visibilitas. Hanya untuk service yang menegakkan
 * wewenangnya sendiri (approval-service, corrective-action-service); jangan
 * dipakai untuk menyajikan data ke pengguna (lihat findByIdVisibleTo()).
 */
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
            `INSERT INTO inspections (plant_id, keterangan_lokasi, tanggal, petugas, petugas_user_id,
                                      status, current_approval_stage, submitted_at, due_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                inspection.plantId,
                inspection.keteranganLokasi,
                toSqlDate(inspection.tanggal),
                inspection.petugas,
                inspection.petugasUserId,
                inspection.status,
                inspection.currentApprovalStage ?? null,
                inspection.submittedAt ? new Date(inspection.submittedAt) : null,
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

        await connection.commit();
        return findById(toDisplayId(numericId));
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * Menyimpan satu keputusan pengesahan (Phase 17.2) — riwayat baru di-INSERT,
 * tidak pernah menimpa baris lama — bersama status/tahap barunya, dalam SATU
 * transaksi (sebelumnya saveApproval() dan setStatus() adalah dua query lepas).
 *
 * UPDATE dijaga dengan status/tahap yang diharapkan: bila inspeksi sudah tidak
 * menunggu tahap `decision.stage` (keputusan lain masuk lebih dulu), tidak ada
 * baris yang berubah, transaksi dibatalkan, dan fungsi mengembalikan false.
 *
 * @returns {Promise<boolean>} true bila tersimpan
 */
export async function recordDecision(inspectionId, decision, nextState) {
    const numericId = toNumericId(inspectionId);
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [update] = await connection.query(
            `UPDATE inspections SET status = ?, current_approval_stage = ?
             WHERE id = ? AND status = 'in_review' AND current_approval_stage = ?`,
            [nextState.status, nextState.currentApprovalStage, numericId, decision.stage],
        );
        if (update.affectedRows === 0) {
            await connection.rollback();
            return false;
        }

        await connection.query(
            `INSERT INTO approvals (inspection_id, stage, attempt, decision, reviewer_user_id, reviewer_name, rejection_reason, decided_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                numericId,
                decision.stage,
                decision.attempt,
                decision.decision,
                decision.reviewerUserId,
                decision.reviewerName,
                decision.rejectionReason,
                new Date(decision.decidedAt),
            ],
        );

        await connection.commit();
        return true;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
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

/**
 * Metadata satu foto untuk endpoint penyajian file — HANYA bila inspeksi
 * pemilik foto itu boleh dilihat `user` (Phase 17.3A). Foto terikat ke
 * inspeksi langsung (dekat/jauh) atau lewat tindakan perbaikan; keduanya
 * diselesaikan ke inspeksinya dulu, lalu cakupan visibilitas diterapkan pada
 * inspeksi itu. undefined bila foto tidak ada ATAU inspeksinya di luar
 * cakupan — mengetahui id foto tidak cukup.
 */
export async function findPhotoFile(photoId, user) {
    const scope = visibilityWhere(user);
    const [rows] = await pool.query(
        `SELECT ph.file_path, ph.mime_type, ph.original_name
         FROM photos ph
         LEFT JOIN corrective_actions ca ON ca.id = ph.corrective_action_id
         JOIN inspections i ON i.id = COALESCE(ph.inspection_id, ca.inspection_id)
         WHERE ph.id = ? AND ${scope.sql}`,
        [photoId, ...scope.params],
    );
    if (rows.length === 0) return undefined;
    return { filePath: rows[0].file_path, mimeType: rows[0].mime_type, originalName: rows[0].original_name };
}
