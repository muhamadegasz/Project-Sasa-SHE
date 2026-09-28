/* approval-service.js — operasi pengesahan inspeksi.
 *
 * Menyusun aturan dari domain/ (workflow-rules, approval-rules,
 * inspection-policy) dengan data dari repository. Tidak menyentuh DOM, tidak
 * menampilkan toast, tidak me-render apa pun.
 *
 * Phase 17.2: tiga tahap (Koordinator K3L -> Manajer -> Ketua P2K3), riwayat
 * append-only, tahap yang berjalan disimpan di inspection.currentApprovalStage.
 * Service ini dipakai di browser (umpan balik cepat) DAN di server (otoritatif)
 * — server selalu memeriksa ulang, apa pun hasil pemeriksaan di browser.
 *
 * `stageId` dari pemanggil adalah tahap yang DIKIRA sedang berjalan oleh
 * layar pengguna. Bila tidak sama dengan tahap sebenarnya (layar basi, klik
 * ganda), keputusan ditolak STAGE_NOT_CURRENT — tidak pernah diteruskan
 * diam-diam ke tahap lain.
 */

import * as inspectionRepository from '#repositories/inspection-repository.js';
import { buildDecisionRecord, checkRejectionReason, findStage } from '../domain/approval-rules.js';
import { approvedState, rejectedState } from '../domain/workflow-rules.js';
import { canApprove, canReject, canView } from '../domain/inspection-policy.js';
import { checkSignature, checkWatermark } from '../domain/signature-rules.js';
import { APPROVAL_DECISION, INSPECTION_STATUS } from '../domain/statuses.js';
import { ACCESS_ERROR, fail, ok } from './result.js';

export const APPROVAL_ERROR = {
    // NOT_FOUND (404) / FORBIDDEN (403): lihat ACCESS_ERROR di result.js.
    ...ACCESS_ERROR,
    STAGE_NOT_FOUND: 'STAGE_NOT_FOUND',
    NOT_IN_REVIEW: 'NOT_IN_REVIEW',
    STAGE_NOT_CURRENT: 'STAGE_NOT_CURRENT',
    REJECTION_REASON_REQUIRED: 'REJECTION_REASON_REQUIRED',
    REJECTION_REASON_INVALID: 'REJECTION_REASON_INVALID',
    REJECTION_REASON_TOO_LONG: 'REJECTION_REASON_TOO_LONG',
    // Phase 17.4A: tanda tangan (domain/signature-rules.js).
    SIGNATURE_REQUIRED: 'SIGNATURE_REQUIRED',
    SIGNATURE_METHOD_INVALID: 'SIGNATURE_METHOD_INVALID',
    SIGNATURE_CONTENT_INVALID: 'SIGNATURE_CONTENT_INVALID',
    SIGNATURE_TOO_LARGE: 'SIGNATURE_TOO_LARGE',
    SIGNATURE_NOT_ALLOWED: 'SIGNATURE_NOT_ALLOWED',
    // Phase 17.4D: watermark opsional (domain/signature-rules.js checkWatermark).
    WATERMARK_INVALID: 'WATERMARK_INVALID',
    WATERMARK_POSITION_REQUIRED: 'WATERMARK_POSITION_REQUIRED',
    WATERMARK_POSITION_INVALID: 'WATERMARK_POSITION_INVALID',
};

const REASON_ERROR = {
    REQUIRED: APPROVAL_ERROR.REJECTION_REASON_REQUIRED,
    INVALID: APPROVAL_ERROR.REJECTION_REASON_INVALID,
    TOO_LONG: APPROVAL_ERROR.REJECTION_REASON_TOO_LONG,
};

const SIGNATURE_ERROR = {
    REQUIRED: APPROVAL_ERROR.SIGNATURE_REQUIRED,
    METHOD_INVALID: APPROVAL_ERROR.SIGNATURE_METHOD_INVALID,
    CONTENT_INVALID: APPROVAL_ERROR.SIGNATURE_CONTENT_INVALID,
    TOO_LARGE: APPROVAL_ERROR.SIGNATURE_TOO_LARGE,
};

const WATERMARK_ERROR = {
    INVALID: APPROVAL_ERROR.WATERMARK_INVALID,
    POSITION_REQUIRED: APPROVAL_ERROR.WATERMARK_POSITION_REQUIRED,
    POSITION_INVALID: APPROVAL_ERROR.WATERMARK_POSITION_INVALID,
};

/**
 * Pemeriksaan bersama approve/reject: inspeksi ada DAN terlihat oleh
 * pengguna, tahap dikenal, inspeksi sedang direview di tahap itu, dan
 * pengguna berwenang memutuskannya. Mengembalikan { inspection, stage } atau
 * sebuah fail().
 *
 * Phase 17.3B: inspeksi yang tidak boleh DILIHAT dijawab NOT_FOUND SEBELUM
 * pemeriksaan lain — sama persis dengan id yang tidak ada, sehingga status,
 * tahap, pemilik, dan plant-nya tidak bocor lewat NOT_IN_REVIEW/STAGE_NOT_CURRENT/
 * FORBIDDEN. Pengguna yang BISA melihat tapi tidak berwenang tetap mendapat
 * FORBIDDEN.
 */
async function loadDecidable(inspectionId, stageId, reviewer, isAllowed) {
    const inspection = await inspectionRepository.findById(inspectionId);
    if (!inspection || !canView(reviewer, inspection)) return { failure: fail(APPROVAL_ERROR.NOT_FOUND) };

    const stage = findStage(stageId);
    if (!stage) return { failure: fail(APPROVAL_ERROR.STAGE_NOT_FOUND) };

    if (inspection.status !== INSPECTION_STATUS.IN_REVIEW) {
        return { failure: fail(APPROVAL_ERROR.NOT_IN_REVIEW, { stage }) };
    }
    if (inspection.currentApprovalStage !== stage.id) {
        return { failure: fail(APPROVAL_ERROR.STAGE_NOT_CURRENT, { stage }) };
    }
    if (!isAllowed(reviewer, inspection)) {
        return { failure: fail(APPROVAL_ERROR.FORBIDDEN, { stage }) };
    }
    return { inspection, stage };
}

/**
 * Menyimpan satu keputusan + status barunya (+ berkas tanda tangan pada
 * persetujuan) sebagai satu operasi. Repository menolak (false) bila tahap
 * sudah berubah sejak inspeksi dibaca — mis. dua permintaan approve yang
 * datang hampir bersamaan — dan dalam hal itu tidak menyimpan berkas apa pun.
 */
async function commit(inspection, decision, nextState, signature = null) {
    const saved = await inspectionRepository.recordDecision(inspection.id, decision, nextState, signature);
    if (!saved) return null;
    return {
        ...inspection,
        ...nextState,
        approvalHistory: [...(inspection.approvalHistory || []), decision],
    };
}

/**
 * Menyetujui tahap yang sedang berjalan. Setelah tahap terakhir, inspeksi
 * menjadi COMPLETED.
 *
 * Phase 17.4A: tanda tangan WAJIB — `signature` ({ method, mimeType, size,
 * file }, lihat domain/signature-rules.js checkSignature). Diperiksa SETELAH
 * visibilitas & wewenang, supaya pengguna yang tidak berhak tidak mendapat
 * petunjuk apa pun tentang inspeksinya. Tanda tangan milik keputusan ini;
 * identitas penyetuju tetap dari `reviewer` (sesi), tidak pernah dari isian.
 *
 * Phase 17.4D: `watermark` ({ enabled, x, y } atau null) opsional dan tidak
 * memengaruhi sah/tidaknya tanda tangan; diperiksa setelah tanda tangan.
 *
 * @returns ok({ inspection, stage, fullyApproved }) atau fail(APPROVAL_ERROR.*)
 */
export async function approve(inspectionId, stageId, reviewer, signature, watermark = null) {
    const { inspection, stage, failure } = await loadDecidable(inspectionId, stageId, reviewer, canApprove);
    if (failure) return failure;

    const checked = checkSignature(signature);
    if (checked.error) return fail(SIGNATURE_ERROR[checked.error], { stage });

    const position = checkWatermark(watermark);
    if (position.error) return fail(WATERMARK_ERROR[position.error], { stage });

    const nextState = approvedState(inspection);
    const decision = buildDecisionRecord(inspection, stage, APPROVAL_DECISION.APPROVED, reviewer, null, checked.value.method, position.value);
    const updated = await commit(inspection, decision, nextState, checked.value);
    if (!updated) return fail(APPROVAL_ERROR.STAGE_NOT_CURRENT, { stage });

    return ok({ inspection: updated, stage, fullyApproved: updated.status === INSPECTION_STATUS.COMPLETED });
}

/**
 * Menolak tahap yang sedang berjalan. Alasan wajib. Inspeksi menjadi
 * REVISION_REQUIRED dan tahapnya TETAP — setelah direvisi dan diajukan ulang,
 * inspeksi kembali ke tahap ini. Keputusan tahap sebelumnya tidak disentuh.
 *
 * Phase 17.4A: penolakan tidak bertanda tangan. `signature` yang terisi
 * (pemanggil mengirim data tanda tangan) ditolak SIGNATURE_NOT_ALLOWED —
 * tidak diabaikan diam-diam, dan tidak pernah disimpan.
 *
 * @returns ok({ inspection, stage }) atau fail(APPROVAL_ERROR.*)
 */
export async function reject(inspectionId, stageId, reviewer, reason, signature = null) {
    const { inspection, stage, failure } = await loadDecidable(inspectionId, stageId, reviewer, canReject);
    if (failure) return failure;

    if (signature != null) return fail(APPROVAL_ERROR.SIGNATURE_NOT_ALLOWED, { stage });

    const checked = checkRejectionReason(reason);
    if (checked.error) return fail(REASON_ERROR[checked.error], { stage });

    const nextState = rejectedState(inspection);
    const decision = buildDecisionRecord(inspection, stage, APPROVAL_DECISION.REJECTED, reviewer, checked.value);
    const updated = await commit(inspection, decision, nextState);
    if (!updated) return fail(APPROVAL_ERROR.STAGE_NOT_CURRENT, { stage });

    return ok({ inspection: updated, stage });
}
