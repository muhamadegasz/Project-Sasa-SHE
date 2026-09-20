/* corrective-action-service.js — penambahan progres perbaikan.
 *
 * Tidak menyentuh DOM dan tidak menampilkan pesan.
 */

import * as inspectionRepository from '#repositories/inspection-repository.js';
import { statusFromActions } from '../domain/inspection-rules.js';
import { fail, ok } from './result.js';

export const CORRECTIVE_ACTION_ERROR = {
    INSPECTION_NOT_FOUND: 'INSPECTION_NOT_FOUND',
    ACTION_REQUIRED: 'ACTION_REQUIRED',
    PHOTO_REQUIRED: 'PHOTO_REQUIRED',
};

/**
 * Menambahkan satu tindakan perbaikan ke sebuah inspeksi.
 *
 * Aturan "foto wajib" ditegakkan di sini, bukan di form. Foto adalah bukti
 * pelaksanaan perbaikan K3 — tanpa itu catatannya tidak bermakna. Validasi di
 * form hanyalah kenyamanan; inilah tempat aturannya benar-benar dijaga.
 *
 * Status inspeksi ikut diperbarui: selesai bila seluruh tindakan sudah closed,
 * selain itu kembali ke proses.
 *
 * Sejak Phase 12: async (repository backend adalah MySQL sungguhan).
 * addCorrectiveAction() adalah jalur yang benar-benar menyimpan tindakan ke
 * backend (INSERT ke tabel corrective_actions + photos) — lihat catatan di
 * src/repositories/inspection-repository.js.
 *
 * @param {string} inspectionId
 * @param {{action: string, status: string, pic: string, photos: string[]}} input
 * @returns ok({ inspection, action }) atau fail(CORRECTIVE_ACTION_ERROR.*)
 */
export async function addAction(inspectionId, input) {
    const inspection = await inspectionRepository.findById(inspectionId);
    if (!inspection) return fail(CORRECTIVE_ACTION_ERROR.INSPECTION_NOT_FOUND);

    const description = String(input.action || '').trim();
    if (!description) return fail(CORRECTIVE_ACTION_ERROR.ACTION_REQUIRED);

    const photos = input.photos || [];
    if (photos.length === 0) return fail(CORRECTIVE_ACTION_ERROR.PHOTO_REQUIRED);

    const action = {
        tgl: new Date().toLocaleDateString('id-ID'),
        action: description,
        status: input.status,
        pic: input.pic,
        foto: photos,
    };

    inspection.perbaikan = inspection.perbaikan || [];
    inspection.perbaikan.push(action);
    await inspectionRepository.addCorrectiveAction(inspectionId, action);

    inspection.status = statusFromActions(inspection);
    await inspectionRepository.setStatus(inspectionId, inspection.status);

    return ok({ inspection, action });
}
