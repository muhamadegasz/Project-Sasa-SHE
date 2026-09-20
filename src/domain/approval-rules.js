/* approval-rules.js — aturan pengesahan berjenjang empat tahap.
 *
 * Aturan intinya: tahap ke-N hanya dapat disetujui bila tahap ke-(N-1) sudah
 * disetujui. Tahap pertama tidak punya prasyarat.
 *
 * Sebelum refactoring, aturan ini ditulis dalam DUA bentuk berbeda yang
 * kebetulan setara: approveStage mencari tahap sebelumnya lewat `order - 1`,
 * sedangkan renderApprovalStages memakai indeks array `index - 1`. Keduanya
 * kini memanggil isPreviousStageApproved() yang sama, sehingga tidak bisa lagi
 * bergeser satu sama lain.
 *
 * Seluruh fungsi murni kecuali yang namanya jelas membangun record baru.
 * Tidak ada yang menyentuh DOM atau memutasi inspeksi.
 */

import { APPROVAL_STAGES } from '../config/constants.js';

/** Satu tahap berdasarkan id, atau undefined. */
export function findStage(stageId) {
    return APPROVAL_STAGES.find((stage) => stage.id === stageId);
}

/** Tahap tepat sebelum tahap ini menurut urutannya, atau undefined bila ia yang pertama. */
export function findPreviousStage(stage) {
    return APPROVAL_STAGES.find((candidate) => candidate.order === stage.order - 1);
}

/** Apakah satu tahap sudah disetujui. */
export function isStageApproved(inspection, stageId) {
    const approvals = inspection && inspection.approvals;
    return Boolean(approvals && approvals[stageId] && approvals[stageId].approved === true);
}

/**
 * Apakah prasyarat sebuah tahap sudah terpenuhi.
 *
 * Tahap pertama selalu terpenuhi karena tidak punya pendahulu.
 */
export function isPreviousStageApproved(inspection, stage) {
    const previous = findPreviousStage(stage);
    if (!previous) return true;
    return isStageApproved(inspection, previous.id);
}

/** Apakah tahap ini yang sedang menunggu giliran persetujuan. */
export function canApproveStage(inspection, stage) {
    return !isStageApproved(inspection, stage.id)
        && isPreviousStageApproved(inspection, stage);
}

/**
 * Apakah keempat tahap sudah disetujui.
 *
 * Menggantikan lima salinan ekspresi yang sebelumnya ditulis ulang di
 * cetakPDF, renderInspeksiTable, openPerbaikanModal, getApprovalStatusText,
 * dan approveStage.
 */
export function isFullyApproved(inspection) {
    return APPROVAL_STAGES.every((stage) => isStageApproved(inspection, stage.id));
}

/** Jumlah tahap yang sudah disetujui. */
export function countApproved(inspection) {
    const approvals = (inspection && inspection.approvals) || {};
    return Object.values(approvals).filter((entry) => entry && entry.approved === true).length;
}

/** Total tahap pengesahan yang harus dilalui. */
export function totalStages() {
    return APPROVAL_STAGES.length;
}

/**
 * Record pengesahan untuk satu tahap yang disetujui.
 *
 * Tahap Safety Officer selalu memakai nama petugas inspeksi (ia yang membuat
 * laporannya). Tahap lain memakai nama tampilan `approver` bila disediakan —
 * ini menutup S-07 (docs/SECURITY.md): sebelum Phase 12, tahap 2-4 selalu
 * memakai literal 'Approver', tanpa identitas sungguhan sama sekali.
 * `approver` opsional (undefined) supaya kode lama yang belum punya identitas
 * pengguna (sebelum auth sungguhan di Phase 13) tetap berperilaku sama persis
 * seperti sebelumnya — fallback ke 'Approver'.
 */
export function buildApprovalRecord(stage, inspection, approver) {
    return {
        approved: true,
        by: stage.name === 'Safety Officer' ? inspection.petugas : (approver ? approver.displayName : 'Approver'),
        jabatan: stage.title,
        tanggal: new Date().toLocaleString('id-ID'),
    };
}

/** Record penolakan untuk satu tahap. */
export function buildRejectionRecord(stage) {
    return {
        approved: false,
        by: 'Rejected',
        jabatan: stage.title,
        tanggal: new Date().toLocaleString('id-ID'),
        rejected: true,
    };
}

/**
 * Kumpulan pengesahan awal untuk inspeksi yang baru dibuat.
 *
 * Tahap pertama langsung disetujui atas nama Safety Officer yang melakukan
 * inspeksi — ia memang yang membuat laporannya. Tahap 2 sampai 4 menunggu.
 */
export function buildInitialApprovals(officerName) {
    const approvals = {};
    APPROVAL_STAGES.forEach((stage, index) => {
        approvals[stage.id] = index === 0
            ? {
                approved: true,
                by: officerName,
                jabatan: stage.title,
                tanggal: new Date().toLocaleString('id-ID'),
            }
            : {
                approved: false,
                by: null,
                jabatan: stage.title,
                tanggal: null,
            };
    });
    return approvals;
}
