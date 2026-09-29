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

import path from 'node:path';
import { unlink } from 'node:fs/promises';
import { pool } from '../db/pool.js';
import { UPLOAD_DIR } from '../config/upload.js';
import { isStoredSignaturePath, removeSignatureFile, storeSignatureFile } from '../config/signature-storage.js';
import { formatDate } from '../../src/shared/date.js';
import { visibilityScope } from '../../src/domain/inspection-policy.js';
import { APPROVAL_DECISION, INSPECTION_STATUS } from '../../src/domain/statuses.js';
import { formatInspectionStatus } from '../../src/shared/labels.js';
import { buildInitialAction } from '../../src/domain/inspection-rules.js';

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
        `SELECT id, stage, attempt, decision, reviewer_user_id, reviewer_name, rejection_reason,
                signature_method, signature_file_path IS NOT NULL AS has_signature,
                watermark_enabled, watermark_x, watermark_y, decided_at
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
    // sendiri (Phase 17.4A: GET .../approvals/:approvalId/signature, lewat `id`
    // dan `hasSignature` di bawah), bukan dibocorkan lewat JSON detail inspeksi.
    const approvalHistory = approvalRows.map((row) => ({
        id: row.id,
        stage: row.stage,
        attempt: row.attempt,
        decision: row.decision,
        reviewerUserId: row.reviewer_user_id,
        reviewerName: row.reviewer_name,
        rejectionReason: row.rejection_reason,
        signatureMethod: row.signature_method,
        hasSignature: Boolean(row.has_signature),
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
 *
 * Field kriteria yang tidak dikenal -> error, bukan diabaikan: kriteria yang
 * kehilangan syarat justru MEMPERLUAS cakupan.
 */
const VISIBILITY_FIELDS = new Set(['petugasUserId', 'plantId', 'statuses', 'currentApprovalStage', 'approvedBy']);

function visibilityWhere(user) {
    const params = [];
    const clauses = visibilityScope(user).map((criterion) => {
        const unknown = Object.keys(criterion).filter((field) => !VISIBILITY_FIELDS.has(field));
        if (unknown.length > 0) throw new Error(`Kriteria visibilitas tidak dikenal: ${unknown.join(', ')}`);
        const conditions = [];
        if (criterion.petugasUserId != null) { conditions.push('i.petugas_user_id = ?'); params.push(criterion.petugasUserId); }
        if (criterion.plantId != null) { conditions.push('i.plant_id = ?'); params.push(criterion.plantId); }
        if (criterion.statuses) { conditions.push('i.status IN (?)'); params.push(criterion.statuses); }
        if (criterion.currentApprovalStage) { conditions.push('i.current_approval_stage = ?'); params.push(criterion.currentApprovalStage); }
        if (criterion.approvedBy) {
            // Riwayat pengesahan (append-only) sebagai dasar hak baca peninjau.
            conditions.push(`EXISTS (SELECT 1 FROM approvals ah WHERE ah.inspection_id = i.id
                AND ah.decision = ? AND ah.stage = ? AND ah.reviewer_user_id = ?)`);
            params.push(APPROVAL_DECISION.APPROVED, criterion.approvedBy.stage, criterion.approvedBy.userId);
        }
        if (conditions.length === 0) throw new Error('Kriteria visibilitas kosong');
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
 * Pencarian daftar berhalaman — field yang sama dengan pencarian tabel
 * sebelumnya (di browser): id tampilan, plant, petugas, status (nilai &
 * labelnya), due date dalam format tampilan D/M/YYYY. Tidak peka huruf
 * besar/kecil; % dan _ dari isian dicari apa adanya, bukan wildcard.
 */
function searchWhere(search) {
    if (!search) return { sql: '', params: [] };
    const pattern = `%${search.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;
    const statuses = Object.values(INSPECTION_STATUS);
    const statusLabel = `CASE i.status ${statuses.map(() => 'WHEN ? THEN ?').join(' ')} END`;
    return {
        sql: ` AND (LOWER(CONCAT('INS-', IF(i.id < 1000, LPAD(i.id, 3, '0'), i.id))) LIKE ?
                OR LOWER(p.name) LIKE ?
                OR LOWER(i.petugas) LIKE ?
                OR LOWER(i.status) LIKE ?
                OR LOWER(${statusLabel}) LIKE ?
                OR DATE_FORMAT(i.due_date, '%e/%c/%Y') LIKE ?)`,
        params: [
            pattern, pattern, pattern, pattern,
            ...statuses.flatMap((status) => [status, formatInspectionStatus(status)]), pattern,
            pattern,
        ],
    };
}

/**
 * Satu halaman inspeksi yang boleh dilihat `user` — dipakai
 * GET /api/inspections?page=. Cakupan visibilitas + pencarian menjadi SATU
 * klausa WHERE yang dipakai COUNT dan SELECT sekaligus, sehingga total dan isi
 * halaman tidak pernah memuat inspeksi di luar cakupan, halaman berapa pun
 * yang diminta. Urutan sama dengan daftar penuh (id terbaru dulu — unik,
 * jadi deterministik); LIMIT/OFFSET di database.
 *
 * @returns {Promise<{ items: object[], total: number }>}
 */
export async function getPageVisibleTo(user, { page, limit, search }) {
    const scope = visibilityWhere(user);
    const filter = searchWhere(search);
    const where = `${scope.sql}${filter.sql}`;
    const params = [...scope.params, ...filter.params];
    const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM inspections i JOIN plants p ON p.id = i.plant_id WHERE ${where}`,
        params,
    );
    const [rows] = await pool.query(
        `${BASE_SELECT} WHERE ${where} ORDER BY i.id DESC LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
    );
    return { items: await Promise.all(rows.map(loadFull)), total: Number(total) };
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
 * Phase 17.4A: `signature` (persetujuan saja; sudah lolos checkSignature())
 * ditulis ke disk SETELAH penjaga itu lolos — keputusan basi/bersamaan tidak
 * pernah menulis berkas. Transaksi DB tidak membatalkan tulisan disk, jadi
 * bila apa pun sesudahnya gagal (INSERT, commit), berkas yang BARU ditulis
 * operasi ini dihapus; berkas keputusan lain tidak pernah disentuh.
 *
 * @returns {Promise<boolean>} true bila tersimpan
 */
export async function recordDecision(inspectionId, decision, nextState, signature = null) {
    const numericId = toNumericId(inspectionId);
    const connection = await pool.getConnection();
    let storedSignature = null;
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

        if (signature) storedSignature = await storeSignatureFile(signature.file, signature.mimeType);

        await connection.query(
            `INSERT INTO approvals (inspection_id, stage, attempt, decision, reviewer_user_id, reviewer_name, rejection_reason,
                                    signature_method, signature_file_path, signature_mime_type,
                                    watermark_enabled, watermark_x, watermark_y, decided_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                numericId,
                decision.stage,
                decision.attempt,
                decision.decision,
                decision.reviewerUserId,
                decision.reviewerName,
                decision.rejectionReason,
                signature ? signature.method : null,
                storedSignature,
                signature ? signature.mimeType : null,
                // Phase 17.4D: posisi watermark sudah diperiksa checkWatermark(); CHECK
                // chk_approvals_watermark_position tetap jadi penjaga terakhir.
                decision.watermark ? 1 : 0,
                decision.watermark ? decision.watermark.x : null,
                decision.watermark ? decision.watermark.y : null,
                new Date(decision.decidedAt),
            ],
        );

        await connection.commit();
        return true;
    } catch (error) {
        await connection.rollback();
        if (storedSignature) await removeSignatureFile(storedSignature);
        throw error;
    } finally {
        connection.release();
    }
}

async function insertInspectionPhotos(connection, numericId, slot, photos, uploadedBy) {
    for (const photo of photos || []) {
        await connection.query(
            `INSERT INTO photos (inspection_id, slot, file_path, original_name, mime_type, size_bytes, uploaded_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [numericId, slot, photo.path, photo.originalName, photo.mimeType, photo.size, uploadedBy],
        );
    }
}

/**
 * Mengunci baris inspeksi bila masih dalam status yang diharapkan dan milik
 * `ownerId` — penjaga untuk update/removeDraft (Phase 17.3B). FOR UPDATE,
 * bukan affectedRows dari UPDATE, karena UPDATE dengan nilai yang sama
 * persis tidak dihitung sebagai baris yang berubah.
 */
async function lockOwnedInState(connection, numericId, expectedStatus, ownerId) {
    const [rows] = await connection.query(
        'SELECT id FROM inspections WHERE id = ? AND status = ? AND petugas_user_id = ? FOR UPDATE',
        [numericId, expectedStatus, ownerId],
    );
    return rows.length > 0;
}

/**
 * Menyimpan isi inspeksi milik sendiri (draft atau revisi) — Phase 17.3B.
 * Status/tahap/pemilik tidak disentuh. Satu transaksi; false bila status
 * atau pemiliknya sudah tidak sesuai `options` (mis. terlanjur diajukan).
 *
 * Temuan: `id` milik inspeksi ini -> diperbarui; tanpa/asing -> ditambahkan
 * (id asing tidak pernah bisa menyentuh temuan inspeksi lain); tidak
 * disebut -> dihapus (tindakan perbaikannya tetap, finding_id jadi NULL
 * lewat FK). `options.initialActionsForNewFindings`: temuan baru ikut
 * mendapat tindakan awal (revisi — inspeksi yang sudah pernah diajukan).
 * Foto baru ditambahkan; foto lama tidak dihapus.
 *
 * @returns {Promise<boolean>}
 */
export async function update(inspectionId, fields, options) {
    const numericId = toNumericId(inspectionId);
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        if (!(await lockOwnedInState(connection, numericId, options.expectedStatus, options.ownerId))) {
            await connection.rollback();
            return false;
        }

        await connection.query(
            'UPDATE inspections SET plant_id = ?, keterangan_lokasi = ?, tanggal = ?, due_date = ? WHERE id = ?',
            [fields.plantId, fields.keteranganLokasi, toSqlDate(fields.tanggal), toSqlDate(fields.dueDate), numericId],
        );

        const [existingRows] = await connection.query('SELECT id FROM findings WHERE inspection_id = ?', [numericId]);
        const existingIds = new Set(existingRows.map((row) => row.id));
        const keptIds = new Set();
        for (let index = 0; index < fields.temuan.length; index++) {
            const finding = fields.temuan[index];
            const findingId = Number(finding.id);
            if (existingIds.has(findingId) && !keptIds.has(findingId)) {
                await connection.query(
                    'UPDATE findings SET deskripsi = ?, kategori = ? WHERE id = ? AND inspection_id = ?',
                    [finding.deskripsi, finding.kategori, findingId, numericId],
                );
                keptIds.add(findingId);
                continue;
            }
            const [inserted] = await connection.query(
                'INSERT INTO findings (inspection_id, deskripsi, kategori) VALUES (?, ?, ?)',
                [numericId, finding.deskripsi, finding.kategori],
            );
            keptIds.add(inserted.insertId);
            if (options.initialActionsForNewFindings) {
                const initial = buildInitialAction(finding, index + 1, options.pic);
                await connection.query(
                    `INSERT INTO corrective_actions (inspection_id, finding_id, tgl, action, status, pic)
                     VALUES (?, ?, CURDATE(), ?, ?, ?)`,
                    [numericId, inserted.insertId, initial.action, initial.status, initial.pic],
                );
            }
        }
        const removedIds = [...existingIds].filter((id) => !keptIds.has(id));
        if (removedIds.length > 0) {
            await connection.query('DELETE FROM findings WHERE inspection_id = ? AND id IN (?)', [numericId, removedIds]);
        }

        await insertInspectionPhotos(connection, numericId, 'dekat', fields.fotoDekat, options.ownerId);
        await insertInspectionPhotos(connection, numericId, 'jauh', fields.fotoJauh, options.ownerId);

        await connection.commit();
        return true;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * Mengajukan (pertama/ulang) — Phase 17.3B. Satu transaksi: status & tahap
 * berikutnya disimpan HANYA bila status masih `expectedStatus` (dua
 * pengajuan bersamaan -> tepat satu berhasil), submitted_at diisi hanya pada
 * pengajuan pertama, lalu tindakan awal per temuan (pengajuan pertama saja,
 * disiapkan service). Tidak ada baris pengesahan yang dibuat.
 *
 * @returns {Promise<boolean>}
 */
export async function submit(inspectionId, expectedStatus, nextState, initialActions) {
    const numericId = toNumericId(inspectionId);
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [update] = await connection.query(
            `UPDATE inspections
             SET status = ?, current_approval_stage = ?, submitted_at = COALESCE(submitted_at, NOW())
             WHERE id = ? AND status = ?`,
            [nextState.status, nextState.currentApprovalStage, numericId, expectedStatus],
        );
        if (update.affectedRows === 0) {
            await connection.rollback();
            return false;
        }
        for (const action of initialActions) {
            await connection.query(
                `INSERT INTO corrective_actions (inspection_id, finding_id, tgl, action, status, pic)
                 VALUES (?, ?, CURDATE(), ?, ?, ?)`,
                [numericId, action.findingId ?? null, action.action, action.status, action.pic],
            );
        }
        await connection.commit();
        return true;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * Menghapus draft (Phase 17.3B) — hanya bila masih DRAFT. Temuan, tindakan,
 * dan baris foto ikut terhapus lewat FK CASCADE; file fotonya di disk
 * dihapus SETELAH commit (best-effort, dibatasi di dalam UPLOAD_DIR) supaya
 * tidak menjadi file yatim.
 *
 * @returns {Promise<boolean>}
 */
export async function removeDraft(inspectionId) {
    return deleteInspectionWhere(inspectionId, "status = 'draft'");
}

/**
 * Phase 18: Admin menghapus inspeksi NON-draft (aturan: domain/inspection-policy.js
 * canDelete, diperiksa inspection-service.js removeAsAdmin). Sama seperti
 * removeDraft: hanya inspeksi ini dan data turunannya (CASCADE) — inspeksi
 * lain, akun, jadwal, dan plant tidak tersentuh.
 *
 * @returns {Promise<boolean>} false bila sudah tidak ada / sudah menjadi draft
 */
export async function removeAsAdmin(inspectionId) {
    return deleteInspectionWhere(inspectionId, "status <> 'draft'");
}

/**
 * Menghapus satu inspeksi yang (terkunci FOR UPDATE) masih memenuhi
 * `statusCondition` — literal SQL tetap dari kedua pemanggil di atas, tidak
 * pernah dari isian. Berkas foto dan tanda tangan (Phase 18: inspeksi non-draft
 * bisa punya tanda tangan pengesahan) dihapus dari disk SETELAH commit.
 */
async function deleteInspectionWhere(inspectionId, statusCondition) {
    const numericId = toNumericId(inspectionId);
    const connection = await pool.getConnection();
    let filePaths = [];
    let signaturePaths = [];
    try {
        await connection.beginTransaction();
        const [locked] = await connection.query(
            `SELECT id FROM inspections WHERE id = ? AND ${statusCondition} FOR UPDATE`,
            [numericId],
        );
        if (locked.length === 0) {
            await connection.rollback();
            return false;
        }
        const [photoRows] = await connection.query(
            `SELECT ph.file_path FROM photos ph
             LEFT JOIN corrective_actions ca ON ca.id = ph.corrective_action_id
             WHERE ph.inspection_id = ? OR ca.inspection_id = ?`,
            [numericId, numericId],
        );
        filePaths = photoRows.map((row) => row.file_path);
        const [signatureRows] = await connection.query(
            'SELECT signature_file_path FROM approvals WHERE inspection_id = ? AND signature_file_path IS NOT NULL',
            [numericId],
        );
        signaturePaths = signatureRows.map((row) => row.signature_file_path);
        await connection.query('DELETE FROM inspections WHERE id = ?', [numericId]);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    const root = path.resolve(UPLOAD_DIR);
    for (const filePath of filePaths) {
        const target = path.resolve(root, filePath);
        if (target.startsWith(root + path.sep)) await unlink(target).catch(() => {});
    }
    // removeSignatureFile hanya menyentuh path berpola signatures/<uuid>.png|jpg.
    for (const signaturePath of signaturePaths) await removeSignatureFile(signaturePath);
    return true;
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
 * Release: mengubah status satu tindakan perbaikan (maju saja — divalidasi
 * corrective-action-service.js). Satu UPDATE terjaga: tindakan milik
 * inspeksi ini, statusnya masih `fromStatus`, inspeksinya masih milik
 * `ownerId` dan belum COMPLETED. Status inspeksi tidak disentuh.
 * @returns {Promise<boolean>} false bila salah satu syarat sudah berubah
 */
export async function updateCorrectiveActionStatus(inspectionId, actionId, fromStatus, toStatus, ownerId) {
    const [result] = await pool.query(
        `UPDATE corrective_actions ca
         JOIN inspections i ON i.id = ca.inspection_id
         SET ca.status = ?
         WHERE ca.id = ? AND ca.inspection_id = ? AND ca.status = ?
           AND i.petugas_user_id = ? AND i.status <> 'completed'`,
        [toStatus, Number(actionId), toNumericId(inspectionId), fromStatus, ownerId],
    );
    return result.affectedRows > 0;
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

/**
 * Berkas tanda tangan satu keputusan (Phase 17.4A) — HANYA bila keputusan itu
 * milik inspeksi `inspectionId` DAN inspeksinya boleh dilihat `user`.
 * Mengetahui/menebak id keputusan tidak cukup, dan id keputusan inspeksi lain
 * tidak bisa dipasangkan dengan id inspeksi yang terlihat. undefined untuk
 * semua kasus "tidak ada" (termasuk keputusan tanpa tanda tangan dan path
 * yang tidak sesuai pola penyimpanan).
 */
export async function findSignatureFile(inspectionId, approvalId, user) {
    const numericId = toNumericId(inspectionId);
    const numericApprovalId = Number(approvalId);
    if (Number.isNaN(numericId) || !Number.isInteger(numericApprovalId)) return undefined;
    const scope = visibilityWhere(user);
    const [rows] = await pool.query(
        `SELECT a.signature_file_path, a.signature_mime_type
         FROM approvals a
         JOIN inspections i ON i.id = a.inspection_id
         WHERE a.id = ? AND a.inspection_id = ? AND a.signature_file_path IS NOT NULL AND ${scope.sql}`,
        [numericApprovalId, numericId, ...scope.params],
    );
    if (rows.length === 0 || !isStoredSignaturePath(rows[0].signature_file_path)) return undefined;
    return { filePath: rows[0].signature_file_path, mimeType: rows[0].signature_mime_type };
}
