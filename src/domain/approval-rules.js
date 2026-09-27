/* approval-rules.js — riwayat pengesahan tiga tahap (Phase 17.2).
 *
 * Riwayat bersifat APPEND-ONLY: `inspection.approvalHistory` berisi satu
 * entri per keputusan, dan satu tahap boleh punya beberapa attempt
 * (mis. Koordinator attempt 1 ditolak, attempt 2 disetujui). Entri lama
 * tidak pernah ditimpa — sebelum Phase 17.2, satu baris per tahap di-UPDATE
 * setiap kali, sehingga penolakan menghapus jejak persetujuan dan sebaliknya.
 *
 * Tahap mana yang sedang berjalan TIDAK diturunkan dari riwayat ini, tapi dari
 * inspection.currentApprovalStage (lihat workflow-rules.js). Siapa yang boleh
 * memutuskan ada di inspection-policy.js.
 *
 * Seluruh fungsi murni kecuali yang namanya jelas membangun record baru.
 */

import { APPROVAL_STAGES } from '../config/constants.js';
import { APPROVAL_DECISION, INSPECTION_STATUS } from './statuses.js';

/** Satu tahap berdasarkan kode, atau undefined. */
export function findStage(stageId) {
    return APPROVAL_STAGES.find((stage) => stage.id === stageId);
}

/** Seluruh keputusan untuk satu tahap, urut attempt. */
export function stageDecisions(inspection, stageId) {
    return ((inspection && inspection.approvalHistory) || [])
        .filter((entry) => entry.stage === stageId)
        .sort((a, b) => a.attempt - b.attempt);
}

/** Keputusan terakhir untuk satu tahap, atau undefined bila belum pernah diputuskan. */
export function latestDecision(inspection, stageId) {
    const decisions = stageDecisions(inspection, stageId);
    return decisions[decisions.length - 1];
}

/** Nomor attempt untuk keputusan berikutnya pada tahap ini (dimulai dari 1). */
export function nextAttempt(inspection, stageId) {
    const decisions = stageDecisions(inspection, stageId);
    return decisions.length === 0 ? 1 : decisions[decisions.length - 1].attempt + 1;
}

/** Apakah keputusan terakhir tahap ini adalah persetujuan. */
export function isStageApproved(inspection, stageId) {
    const latest = latestDecision(inspection, stageId);
    return Boolean(latest && latest.decision === APPROVAL_DECISION.APPROVED);
}

/** Jumlah tahap yang keputusan terakhirnya disetujui. */
export function countApproved(inspection) {
    return APPROVAL_STAGES.filter((stage) => isStageApproved(inspection, stage.id)).length;
}

/** Total tahap pengesahan yang harus dilalui. */
export function totalStages() {
    return APPROVAL_STAGES.length;
}

/**
 * Apakah inspeksi sudah selesai disahkan. Sumber kebenarannya status alur
 * kerja (COMPLETED hanya bisa dicapai lewat persetujuan tahap terakhir, lihat
 * workflow-rules.js), bukan hitungan ulang dari riwayat.
 */
export function isFullyApproved(inspection) {
    return Boolean(inspection) && inspection.status === INSPECTION_STATUS.COMPLETED;
}

/**
 * Entri riwayat baru untuk satu keputusan. `reviewer` adalah pengguna login
 * ({id, displayName}). `reason` hanya untuk penolakan — kewajibannya diperiksa
 * approval-service.js, bukan di sini.
 */
export function buildDecisionRecord(inspection, stage, decision, reviewer, reason = null) {
    return {
        stage: stage.id,
        attempt: nextAttempt(inspection, stage.id),
        decision,
        reviewerUserId: reviewer ? reviewer.id : null,
        reviewerName: reviewer ? reviewer.displayName : null,
        rejectionReason: decision === APPROVAL_DECISION.REJECTED ? reason : null,
        decidedAt: new Date().toISOString(),
    };
}
