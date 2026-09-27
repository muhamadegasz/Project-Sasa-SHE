/* corrective-action-service.js — penambahan progres perbaikan.
 *
 * Tidak menyentuh DOM dan tidak menampilkan pesan.
 */

import * as inspectionRepository from '#repositories/inspection-repository.js';
import { canEditCorrectiveAction, canView, isOwningOfficer } from '../domain/inspection-policy.js';
import { ACCESS_ERROR, fail, ok } from './result.js';

export const CORRECTIVE_ACTION_ERROR = {
    // NOT_FOUND (404) / FORBIDDEN (403): lihat ACCESS_ERROR di result.js.
    ...ACCESS_ERROR,
    ACTION_REQUIRED: 'ACTION_REQUIRED',
    PHOTO_REQUIRED: 'PHOTO_REQUIRED',
    // Pemilik, tapi inspeksi sudah COMPLETED — final, tindakan perbaikan hanya-baca.
    INSPECTION_COMPLETED: 'INSPECTION_COMPLETED',
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
 * Phase 17.3B (aturan terkunci): HANYA Safety Officer pemilik inspeksi yang
 * boleh menambah tindakan, dan hanya selama DRAFT / IN_REVIEW /
 * REVISION_REQUIRED. Inspeksi yang tidak boleh dilihat -> NOT_FOUND (identik
 * dengan id yang tidak ada); terlihat tapi bukan pemilik -> FORBIDDEN;
 * pemilik tapi inspeksi sudah COMPLETED -> INSPECTION_COMPLETED (final).
 *
 * Sejak Phase 12: async (repository backend adalah MySQL sungguhan).
 * addCorrectiveAction() adalah jalur yang benar-benar menyimpan tindakan ke
 * backend (INSERT ke tabel corrective_actions + photos) — lihat catatan di
 * src/repositories/inspection-repository.js.
 *
 * @param {string} inspectionId
 * @param {{action: string, status: string, pic: string, photos: Array}} input
 *   `photos`: `File[]` di browser (sebelum dikirim lewat FormData), objek metadata
 *   `{path, originalName, mimeType, size}[]` di server (dari multer, lihat
 *   inspections.routes.js) — service ini tidak menyentuh isinya, cuma memeriksa `.length`.
 * @param {{id: number, role: string}} actor pengguna login — di server dari sesi (req.user)
 * @returns ok({ inspection, action }) atau fail(CORRECTIVE_ACTION_ERROR.*)
 */
export async function addAction(inspectionId, input, actor) {
    const inspection = await inspectionRepository.findById(inspectionId);
    if (!inspection || !canView(actor, inspection)) return fail(CORRECTIVE_ACTION_ERROR.NOT_FOUND);
    if (!isOwningOfficer(actor, inspection)) return fail(CORRECTIVE_ACTION_ERROR.FORBIDDEN);
    if (!canEditCorrectiveAction(actor, inspection)) return fail(CORRECTIVE_ACTION_ERROR.INSPECTION_COMPLETED);

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
        // Identitas pengunggah selalu dari pengguna login, bukan body permintaan.
        uploadedBy: actor.id,
    };

    inspection.perbaikan = inspection.perbaikan || [];
    inspection.perbaikan.push(action);
    await inspectionRepository.addCorrectiveAction(inspectionId, action);

    return ok({ inspection, action });
}
