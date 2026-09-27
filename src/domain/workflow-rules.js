/* workflow-rules.js — transisi status alur kerja inspeksi (Phase 17.2).
 *
 *   DRAFT --submit--> IN_REVIEW --reject--> REVISION_REQUIRED --resubmit--> IN_REVIEW
 *                     IN_REVIEW --approve tahap terakhir--> COMPLETED
 *
 * Tahap pengesahan berjalan KOORDINATOR_K3L -> MANAJER -> KETUA_P2K3 -> selesai.
 * Penolakan TIDAK mengubah tahap: setelah direvisi dan diajukan ulang,
 * inspeksi kembali ke tahap yang menolaknya, bukan mulai dari awal.
 *
 * Seluruh fungsi murni. Fungsi *State() mengembalikan status+tahap berikutnya,
 * atau null bila transisinya tidak sah — pemanggil (service) yang memutuskan
 * bagaimana menolaknya. Siapa yang BOLEH memicu transisi ada di
 * inspection-policy.js, bukan di sini.
 */

import { APPROVAL_STAGES } from '../config/constants.js';
import { INSPECTION_STATUS } from './statuses.js';

const { DRAFT, IN_REVIEW, REVISION_REQUIRED, COMPLETED } = INSPECTION_STATUS;

/** Satu-satunya transisi yang sah. Tidak ada jalur lain, termasuk dari isian form. */
const ALLOWED_TRANSITIONS = {
    [DRAFT]: [IN_REVIEW],
    [IN_REVIEW]: [REVISION_REQUIRED, COMPLETED],
    [REVISION_REQUIRED]: [IN_REVIEW],
    [COMPLETED]: [],
};

/** Apakah perpindahan status `from` -> `to` sah. */
export function canTransition(from, to) {
    return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

/** Tahap pertama yang harus dilalui setelah pengajuan. */
export function firstStageId() {
    return APPROVAL_STAGES[0].id;
}

/** Tahap setelah `stageId`, atau null bila `stageId` adalah tahap terakhir. */
export function nextStageId(stageId) {
    const index = APPROVAL_STAGES.findIndex((stage) => stage.id === stageId);
    if (index === -1) return null;
    return APPROVAL_STAGES[index + 1]?.id ?? null;
}

/** Apakah inspeksi sedang menunggu keputusan tahap ini. */
export function isAwaitingStage(inspection, stageId) {
    return Boolean(inspection)
        && inspection.status === IN_REVIEW
        && inspection.currentApprovalStage === stageId;
}

/**
 * Status setelah diajukan. Draft mulai di tahap pertama; revisi kembali ke
 * tahap yang menolaknya (currentApprovalStage tidak berubah selama revisi).
 */
export function submittedState(inspection) {
    if (!canTransition(inspection.status, IN_REVIEW)) return null;
    const stage = inspection.status === DRAFT ? firstStageId() : inspection.currentApprovalStage;
    if (!stage) return null;
    return { status: IN_REVIEW, currentApprovalStage: stage };
}

/** Status setelah tahap saat ini menyetujui: tahap berikutnya, atau COMPLETED setelah tahap terakhir. */
export function approvedState(inspection) {
    if (inspection.status !== IN_REVIEW || !inspection.currentApprovalStage) return null;
    const next = nextStageId(inspection.currentApprovalStage);
    return next
        ? { status: IN_REVIEW, currentApprovalStage: next }
        : { status: COMPLETED, currentApprovalStage: null };
}

/** Status setelah tahap saat ini menolak: REVISION_REQUIRED, tahap TETAP sama. */
export function rejectedState(inspection) {
    if (!canTransition(inspection.status, REVISION_REQUIRED) || !inspection.currentApprovalStage) return null;
    return { status: REVISION_REQUIRED, currentApprovalStage: inspection.currentApprovalStage };
}
