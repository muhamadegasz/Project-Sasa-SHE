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
import { buildDecisionRecord, findStage } from '../domain/approval-rules.js';
import { approvedState, rejectedState } from '../domain/workflow-rules.js';
import { canApprove, canReject } from '../domain/inspection-policy.js';
import { APPROVAL_DECISION, INSPECTION_STATUS } from '../domain/statuses.js';
import { fail, ok } from './result.js';

export const APPROVAL_ERROR = {
    INSPECTION_NOT_FOUND: 'INSPECTION_NOT_FOUND',
    STAGE_NOT_FOUND: 'STAGE_NOT_FOUND',
    NOT_IN_REVIEW: 'NOT_IN_REVIEW',
    STAGE_NOT_CURRENT: 'STAGE_NOT_CURRENT',
    REJECTION_REASON_REQUIRED: 'REJECTION_REASON_REQUIRED',
    // Dipetakan ke HTTP 403 oleh server/middleware/to-http.js.
    FORBIDDEN: 'FORBIDDEN',
};

/**
 * Pemeriksaan bersama approve/reject: inspeksi ada, tahap dikenal, inspeksi
 * sedang direview di tahap itu, dan pengguna berwenang memutuskannya.
 * Mengembalikan { inspection, stage } atau sebuah fail().
 */
async function loadDecidable(inspectionId, stageId, reviewer, isAllowed) {
    const inspection = await inspectionRepository.findById(inspectionId);
    if (!inspection) return { failure: fail(APPROVAL_ERROR.INSPECTION_NOT_FOUND) };

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
 * Menyimpan satu keputusan + status barunya sebagai satu operasi. Repository
 * menolak (false) bila tahap sudah berubah sejak inspeksi dibaca — mis. dua
 * permintaan approve yang datang hampir bersamaan.
 */
async function commit(inspection, decision, nextState) {
    const saved = await inspectionRepository.recordDecision(inspection.id, decision, nextState);
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
 * @returns ok({ inspection, stage, fullyApproved }) atau fail(APPROVAL_ERROR.*)
 */
export async function approve(inspectionId, stageId, reviewer) {
    const { inspection, stage, failure } = await loadDecidable(inspectionId, stageId, reviewer, canApprove);
    if (failure) return failure;

    const nextState = approvedState(inspection);
    const decision = buildDecisionRecord(inspection, stage, APPROVAL_DECISION.APPROVED, reviewer);
    const updated = await commit(inspection, decision, nextState);
    if (!updated) return fail(APPROVAL_ERROR.STAGE_NOT_CURRENT, { stage });

    return ok({ inspection: updated, stage, fullyApproved: updated.status === INSPECTION_STATUS.COMPLETED });
}

/**
 * Menolak tahap yang sedang berjalan. Alasan wajib. Inspeksi menjadi
 * REVISION_REQUIRED dan tahapnya TETAP — setelah direvisi dan diajukan ulang,
 * inspeksi kembali ke tahap ini. Keputusan tahap sebelumnya tidak disentuh.
 *
 * @returns ok({ inspection, stage }) atau fail(APPROVAL_ERROR.*)
 */
export async function reject(inspectionId, stageId, reviewer, reason) {
    const { inspection, stage, failure } = await loadDecidable(inspectionId, stageId, reviewer, canReject);
    if (failure) return failure;

    const trimmedReason = String(reason ?? '').trim();
    if (!trimmedReason) return fail(APPROVAL_ERROR.REJECTION_REASON_REQUIRED, { stage });

    const nextState = rejectedState(inspection);
    const decision = buildDecisionRecord(inspection, stage, APPROVAL_DECISION.REJECTED, reviewer, trimmedReason);
    const updated = await commit(inspection, decision, nextState);
    if (!updated) return fail(APPROVAL_ERROR.STAGE_NOT_CURRENT, { stage });

    return ok({ inspection: updated, stage });
}
