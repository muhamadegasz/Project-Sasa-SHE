/* approval-rules.js — riwayat pengesahan berjenjang (Phase 17.2; empat tahap sejak migrasi 007).
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

/** Panjang maksimum alasan penolakan (Phase 17.3B) — jauh di bawah batas kolom TEXT. */
export const REJECTION_REASON_MAX_LENGTH = 1000;

/**
 * Memeriksa alasan penolakan dari isian pengguna. Mengembalikan
 * `{ value }` (sudah di-trim) atau `{ error: 'REQUIRED' | 'INVALID' | 'TOO_LONG' }`.
 * Bukan string (objek, array, angka) ditolak INVALID — tidak pernah diubah
 * paksa jadi teks seperti "[object Object]".
 */
export function checkRejectionReason(reason) {
    if (reason === undefined || reason === null) return { error: 'REQUIRED' };
    if (typeof reason !== 'string') return { error: 'INVALID' };
    const value = reason.trim();
    if (!value) return { error: 'REQUIRED' };
    if (value.length > REJECTION_REASON_MAX_LENGTH) return { error: 'TOO_LONG' };
    return { value };
}

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

/** Apakah inspeksi sudah melewati tahap ini (selesai, atau tahap berjalannya sesudahnya). */
function isPastStage(inspection, stage) {
    if (inspection.status === INSPECTION_STATUS.COMPLETED) return true;
    const current = findStage(inspection.currentApprovalStage);
    return Boolean(current) && current.order > stage.order;
}

/**
 * Tahap yang dilalui inspeksi ini. Tahap yang ditambahkan belakangan
 * (`addedLater`, mis. Manajer SHE) tidak berlaku bagi inspeksi yang sudah
 * melewatinya tanpa keputusan apa pun di tahap itu: inspeksi yang sudah
 * selesai, atau yang sudah sampai Ketua P2K3, sebelum tahap itu ada. Datanya
 * tidak diubah; riwayat, ringkasan "x/y", dan PDF-nya hanya memuat tahap yang
 * memang dilaluinya. Tanpa inspeksi: seluruh tahap.
 */
export function applicableStages(inspection) {
    if (!inspection) return APPROVAL_STAGES;
    return APPROVAL_STAGES.filter((stage) => !stage.addedLater
        || stageDecisions(inspection, stage.id).length > 0
        || !isPastStage(inspection, stage));
}

/** Jumlah tahap (yang dilalui inspeksi ini) yang keputusan terakhirnya disetujui. */
export function countApproved(inspection) {
    return applicableStages(inspection).filter((stage) => isStageApproved(inspection, stage.id)).length;
}

/** Total tahap pengesahan yang harus dilalui — untuk inspeksi tertentu bila diberikan. */
export function totalStages(inspection) {
    return applicableStages(inspection).length;
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
 * ({id, displayName}). `reason` hanya untuk penolakan, `signatureMethod`
 * hanya untuk persetujuan (Phase 17.4A) — kewajiban keduanya diperiksa
 * approval-service.js, bukan di sini. Berkas tanda tangannya tidak ikut di
 * entri ini. `watermark` ({x, y} atau null, Phase 17.4D) juga hanya untuk
 * persetujuan — bentuknya sama dengan `watermark` di detail inspeksi.
 */
export function buildDecisionRecord(inspection, stage, decision, reviewer, reason = null, signatureMethod = null, watermark = null) {
    return {
        stage: stage.id,
        attempt: nextAttempt(inspection, stage.id),
        decision,
        reviewerUserId: reviewer ? reviewer.id : null,
        reviewerName: reviewer ? reviewer.displayName : null,
        rejectionReason: decision === APPROVAL_DECISION.REJECTED ? reason : null,
        signatureMethod: decision === APPROVAL_DECISION.APPROVED ? signatureMethod : null,
        watermark: decision === APPROVAL_DECISION.APPROVED ? watermark : null,
        decidedAt: new Date().toISOString(),
    };
}
