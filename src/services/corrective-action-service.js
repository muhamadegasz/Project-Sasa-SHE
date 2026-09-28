/* corrective-action-service.js — penambahan progres perbaikan.
 *
 * Tidak menyentuh DOM dan tidak menampilkan pesan.
 */

import * as inspectionRepository from '#repositories/inspection-repository.js';
import { canEditCorrectiveAction, canView, isOwningOfficer } from '../domain/inspection-policy.js';
import { checkActionStatusChange } from '../domain/inspection-rules.js';
import { ACCESS_ERROR, fail, ok } from './result.js';

export const CORRECTIVE_ACTION_ERROR = {
    // NOT_FOUND (404) / FORBIDDEN (403): lihat ACCESS_ERROR di result.js.
    ...ACCESS_ERROR,
    ACTION_REQUIRED: 'ACTION_REQUIRED',
    PHOTO_REQUIRED: 'PHOTO_REQUIRED',
    // Pemilik, tapi inspeksi sudah COMPLETED — final, tindakan perbaikan hanya-baca.
    INSPECTION_COMPLETED: 'INSPECTION_COMPLETED',
    // Release: perubahan status tindakan yang sudah ada (maju saja).
    ACTION_STATUS_INVALID: 'ACTION_STATUS_INVALID',
    ACTION_STATUS_NOT_FORWARD: 'ACTION_STATUS_NOT_FORWARD',
    // Status tindakan/inspeksi berubah di antara pemeriksaan dan penyimpanan.
    STATE_CHANGED: 'STATE_CHANGED',
};

const STATUS_CHANGE_ERROR = {
    INVALID: CORRECTIVE_ACTION_ERROR.ACTION_STATUS_INVALID,
    NOT_FORWARD: CORRECTIVE_ACTION_ERROR.ACTION_STATUS_NOT_FORWARD,
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

/**
 * Mengubah status SATU tindakan perbaikan yang sudah ada — maju saja:
 * open -> on-progress -> closed (domain/inspection-rules.js
 * checkActionStatusChange). Tanpa foto; foto tetap wajib saat MENAMBAH progres.
 *
 * Wewenangnya sama persis dengan addAction(): hanya Safety Officer pemilik,
 * hanya selama inspeksi belum COMPLETED (canEditCorrectiveAction). Status
 * alur kerja inspeksi TIDAK disentuh — progres perbaikan terpisah dari
 * pengesahan (Phase 17.2).
 *
 * @returns ok({ inspection, action }) atau fail(CORRECTIVE_ACTION_ERROR.*)
 */
export async function changeActionStatus(inspectionId, actionId, status, actor) {
    const inspection = await inspectionRepository.findById(inspectionId);
    if (!inspection || !canView(actor, inspection)) return fail(CORRECTIVE_ACTION_ERROR.NOT_FOUND);
    if (!isOwningOfficer(actor, inspection)) return fail(CORRECTIVE_ACTION_ERROR.FORBIDDEN);
    if (!canEditCorrectiveAction(actor, inspection)) return fail(CORRECTIVE_ACTION_ERROR.INSPECTION_COMPLETED);

    // Tindakan harus milik inspeksi INI — id tindakan inspeksi lain tidak pernah bisa disentuh.
    const action = (inspection.perbaikan || []).find((item) => item.id != null && String(item.id) === String(actionId));
    if (!action) return fail(CORRECTIVE_ACTION_ERROR.NOT_FOUND);

    const checked = checkActionStatusChange(action.status, status);
    if (checked.error) return fail(STATUS_CHANGE_ERROR[checked.error]);

    // Penjaga di repository: status lama, pemilik, dan inspeksi belum selesai
    // diperiksa lagi saat menyimpan — false bila sudah berubah sejak dibaca.
    const saved = await inspectionRepository.updateCorrectiveActionStatus(inspection.id, action.id, action.status, checked.value, actor.id);
    if (!saved) return fail(CORRECTIVE_ACTION_ERROR.STATE_CHANGED);

    return ok({ inspection, action: { ...action, status: checked.value } });
}
