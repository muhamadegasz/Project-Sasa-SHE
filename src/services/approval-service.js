/* approval-service.js — operasi pengesahan inspeksi.
 *
 * Menyusun aturan dari domain/approval-rules.js dengan data dari repository.
 * Tidak menyentuh DOM, tidak menampilkan toast, tidak me-render apa pun.
 */

import * as inspectionRepository from '#repositories/inspection-repository.js';
import {
    buildApprovalRecord,
    buildRejectionRecord,
    findStage,
    isFullyApproved,
    isPreviousStageApproved,
    isStageApproved,
} from '../domain/approval-rules.js';
import { INSPECTION_STATUS } from '../domain/statuses.js';
import { fail, ok } from './result.js';

export const APPROVAL_ERROR = {
    INSPECTION_NOT_FOUND: 'INSPECTION_NOT_FOUND',
    STAGE_NOT_FOUND: 'STAGE_NOT_FOUND',
    PREVIOUS_STAGE_PENDING: 'PREVIOUS_STAGE_PENDING',
    ALREADY_APPROVED: 'ALREADY_APPROVED',
};

/**
 * Menyetujui satu tahap pengesahan.
 *
 * Begitu keempat tahap disetujui, status inspeksi berubah menjadi selesai.
 *
 * Sejak Phase 12: async (repository backend adalah MySQL sungguhan), dan
 * menerima `approver` (identitas pengguna login — {id, displayName}) yang
 * diteruskan ke buildApprovalRecord() dan ke inspectionRepository.saveApproval()
 * supaya identitas penyetuju benar-benar tersimpan (menutup S-07). Opsional
 * supaya kode lama tanpa auth sungguhan (sebelum Phase 13) tetap jalan.
 *
 * Mutasi langsung pada `inspection` dipertahankan (dipakai in-memory repo
 * lewat referensi hidup dari findById()); saveApproval()/setStatus() adalah
 * jalur yang BENAR-BENAR menyimpan pada repository backend (MySQL) — lihat
 * catatan di src/repositories/inspection-repository.js.
 *
 * @returns ok({ inspection, stage, fullyApproved }) atau fail(APPROVAL_ERROR.*)
 */
export async function approve(inspectionId, stageId, approver) {
    const inspection = await inspectionRepository.findById(inspectionId);
    if (!inspection) return fail(APPROVAL_ERROR.INSPECTION_NOT_FOUND);

    const stage = findStage(stageId);
    if (!stage) return fail(APPROVAL_ERROR.STAGE_NOT_FOUND);

    if (!isPreviousStageApproved(inspection, stage)) {
        return fail(APPROVAL_ERROR.PREVIOUS_STAGE_PENDING, { stage });
    }
    if (isStageApproved(inspection, stageId)) {
        return fail(APPROVAL_ERROR.ALREADY_APPROVED, { stage });
    }

    if (!inspection.approvals) inspection.approvals = {};
    const record = buildApprovalRecord(stage, inspection, approver);
    inspection.approvals[stageId] = record;
    await inspectionRepository.saveApproval(inspectionId, stageId, record, approver ? approver.id : null);

    const fullyApproved = isFullyApproved(inspection);
    if (fullyApproved) {
        inspection.status = INSPECTION_STATUS.SELESAI;
        await inspectionRepository.setStatus(inspectionId, inspection.status);
    }

    return ok({ inspection, stage, fullyApproved });
}

/**
 * Menolak satu tahap pengesahan.
 *
 * Penolakan mengembalikan status inspeksi ke tinjau. Tidak ada pemeriksaan
 * urutan di sini — perilaku itu dipertahankan apa adanya dari kode lama.
 *
 * Catatan: konfirmasi pengguna adalah urusan pemanggil. Service hanya
 * mengerjakan penolakannya.
 *
 * Sejak Phase 12: async + menerima `approver` opsional, sama seperti
 * approve() — identitasnya diteruskan ke saveApproval() untuk disimpan
 * (approved_by_user_id), walau teks tampilan tahap yang ditolak tetap
 * literal 'Rejected' (buildRejectionRecord tidak diubah, di luar cakupan
 * fase ini).
 *
 * @returns ok({ inspection, stage }) atau fail(APPROVAL_ERROR.*)
 */
export async function reject(inspectionId, stageId, approver) {
    const inspection = await inspectionRepository.findById(inspectionId);
    if (!inspection) return fail(APPROVAL_ERROR.INSPECTION_NOT_FOUND);

    const stage = findStage(stageId);
    if (!stage) return fail(APPROVAL_ERROR.STAGE_NOT_FOUND);

    if (!inspection.approvals) inspection.approvals = {};
    const record = buildRejectionRecord(stage);
    inspection.approvals[stageId] = record;
    await inspectionRepository.saveApproval(inspectionId, stageId, record, approver ? approver.id : null);
    inspection.status = INSPECTION_STATUS.TINJAU;
    await inspectionRepository.setStatus(inspectionId, inspection.status);

    return ok({ inspection, stage });
}
