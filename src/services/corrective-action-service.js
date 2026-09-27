/* corrective-action-service.js — penambahan progres perbaikan.
 *
 * Tidak menyentuh DOM dan tidak menampilkan pesan.
 */

import * as inspectionRepository from '#repositories/inspection-repository.js';
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
 * Phase 17.2: status alur kerja inspeksi TIDAK disentuh di sini. Sebelumnya
 * setiap tindakan baru menimpa status inspeksi (selesai/proses) — itu
 * mencampur progres perbaikan dengan hasil pengesahan. Tindakan perbaikan
 * punya siklus hidupnya sendiri (open/on-progress/closed).
 *
 * Sejak Phase 12: async (repository backend adalah MySQL sungguhan).
 * addCorrectiveAction() adalah jalur yang benar-benar menyimpan tindakan ke
 * backend (INSERT ke tabel corrective_actions + photos) — lihat catatan di
 * src/repositories/inspection-repository.js.
 *
 * @param {string} inspectionId
 * @param {{action: string, status: string, pic: string, photos: Array, uploadedBy?: number}} input
 *   `photos`: `File[]` di browser (sebelum dikirim lewat FormData), objek metadata
 *   `{path, originalName, mimeType, size}[]` di server (dari multer, lihat
 *   inspections.routes.js) — service ini tidak menyentuh isinya, cuma memeriksa `.length`.
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
        // Diisi route handler backend dari req.user.id (bukan dari body permintaan) —
        // sama seperti petugasUserId di inspection-service.js. undefined di browser,
        // diabaikan repository in-memory di sana.
        uploadedBy: input.uploadedBy,
    };

    inspection.perbaikan = inspection.perbaikan || [];
    inspection.perbaikan.push(action);
    await inspectionRepository.addCorrectiveAction(inspectionId, action);

    return ok({ inspection, action });
}
