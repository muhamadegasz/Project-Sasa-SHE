/* approval-service.js — operasi pengesahan inspeksi.
 *
 * Menyusun aturan dari domain/approval-rules.js dengan data dari repository.
 * Tidak menyentuh DOM, tidak menampilkan toast, tidak me-render apa pun.
 */

import * as inspectionRepository from '../repositories/inspection-repository.js';
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
 * @returns ok({ inspection, stage, fullyApproved }) atau fail(APPROVAL_ERROR.*)
 */
export function approve(inspectionId, stageId) {
    const inspection = inspectionRepository.findById(inspectionId);
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
    inspection.approvals[stageId] = buildApprovalRecord(stage, inspection);

    const fullyApproved = isFullyApproved(inspection);
    if (fullyApproved) {
        inspection.status = INSPECTION_STATUS.SELESAI;
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
 * @returns ok({ inspection, stage }) atau fail(APPROVAL_ERROR.*)
 */
export function reject(inspectionId, stageId) {
    const inspection = inspectionRepository.findById(inspectionId);
    if (!inspection) return fail(APPROVAL_ERROR.INSPECTION_NOT_FOUND);

    const stage = findStage(stageId);
    if (!stage) return fail(APPROVAL_ERROR.STAGE_NOT_FOUND);

    if (!inspection.approvals) inspection.approvals = {};
    inspection.approvals[stageId] = buildRejectionRecord(stage);
    inspection.status = INSPECTION_STATUS.TINJAU;

    return ok({ inspection, stage });
}
