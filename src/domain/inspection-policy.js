/* inspection-policy.js — siapa boleh melihat dan melakukan apa atas sebuah
 * inspeksi (Phase 17.2).
 *
 * MELIHAT dan BERTINDAK sengaja dipisah: bisa melihat sebuah inspeksi tidak
 * berarti boleh menyetujui, menolak, mengubah, atau menghapusnya.
 *
 * `user` adalah pengguna login ({id, role, plantId}) — di server berasal dari
 * sesi (server/middleware/session-auth.js, yang sudah menolak pengguna tidak
 * aktif sebelum sampai ke sini). Aturan ini dipakai service di browser dan di
 * server; server yang otoritatif, penyaringan di frontend BUKAN otorisasi.
 *
 * Seluruh fungsi murni: data masuk, boolean keluar. Gagal-tertutup (false)
 * bila data yang dibutuhkan tidak ada.
 */

import { ROLE, APPROVAL_STAGE } from '../config/constants.js';
import { INSPECTION_STATUS } from './statuses.js';
import { findStage } from './approval-rules.js';
import { isAwaitingStage } from './workflow-rules.js';

const { DRAFT, IN_REVIEW, REVISION_REQUIRED, COMPLETED } = INSPECTION_STATUS;

function isOwner(user, inspection) {
    return inspection.petugasUserId != null && Number(inspection.petugasUserId) === Number(user.id);
}

/**
 * Koordinator K3L bertanggung jawab atas tepat satu plant (users.plant_id).
 * Koordinator tanpa plant tidak punya cakupan apa pun — gagal-tertutup.
 */
export function isInAssignedPlant(user, inspection) {
    return user.plantId != null && Number(user.plantId) === Number(inspection.plantId);
}

/** Apakah pengguna boleh melihat inspeksi ini. */
export function canView(user, inspection) {
    if (!user || !inspection) return false;
    const { status } = inspection;

    switch (user.role) {
    case ROLE.SAFETY_OFFICER:
        // Miliknya sendiri di status apa pun; milik orang lain hanya yang
        // sedang direview atau sudah selesai — draft & revisi tetap privat.
        return isOwner(user, inspection) || status === IN_REVIEW || status === COMPLETED;
    case ROLE.KOORDINATOR_K3L:
        return isInAssignedPlant(user, inspection)
            && (status === COMPLETED || isAwaitingStage(inspection, APPROVAL_STAGE.KOORDINATOR_K3L));
    case ROLE.MANAJER_BAGIAN:
        return status === COMPLETED || isAwaitingStage(inspection, APPROVAL_STAGE.MANAJER);
    case ROLE.KETUA_P2K3:
        return status === COMPLETED || isAwaitingStage(inspection, APPROVAL_STAGE.KETUA_P2K3);
    case ROLE.ADMIN:
        return status !== DRAFT;
    default:
        return false;
    }
}

/** Mengubah isi draft: hanya Safety Officer pemiliknya, hanya selama DRAFT. */
export function canEdit(user, inspection) {
    return Boolean(user && inspection)
        && user.role === ROLE.SAFETY_OFFICER
        && isOwner(user, inspection)
        && inspection.status === DRAFT;
}

/** Merevisi setelah ditolak: hanya Safety Officer pemiliknya, hanya selama REVISION_REQUIRED. */
export function canRevise(user, inspection) {
    return Boolean(user && inspection)
        && user.role === ROLE.SAFETY_OFFICER
        && isOwner(user, inspection)
        && inspection.status === REVISION_REQUIRED;
}

/** Mengajukan (draft) atau mengajukan ulang (revisi): hanya Safety Officer pemiliknya. */
export function canSubmit(user, inspection) {
    return canEdit(user, inspection) || canRevise(user, inspection);
}

/**
 * Memutuskan tahap yang sedang berjalan: status IN_REVIEW, role pengguna sama
 * dengan role pemilik tahap itu, dan — khusus Koordinator K3L — inspeksi
 * berada di plant yang ditugaskan kepadanya. Admin dan Safety Officer bukan
 * pemilik tahap mana pun, jadi selalu false.
 */
function canDecide(user, inspection) {
    if (!user || !inspection || inspection.status !== IN_REVIEW) return false;
    const stage = findStage(inspection.currentApprovalStage);
    if (!stage || user.role !== stage.role) return false;
    if (stage.id === APPROVAL_STAGE.KOORDINATOR_K3L && !isInAssignedPlant(user, inspection)) return false;
    return true;
}

/** Menyetujui tahap yang sedang berjalan. */
export function canApprove(user, inspection) {
    return canDecide(user, inspection);
}

/** Menolak tahap yang sedang berjalan — aturan wewenangnya sama dengan menyetujui. */
export function canReject(user, inspection) {
    return canDecide(user, inspection);
}

/**
 * Menghapus inspeksi: Safety Officer pemilik atas draft-nya sendiri, atau
 * Admin atas inspeksi non-draft (termasuk yang sedang IN_REVIEW) — Admin
 * memang tidak bisa melihat draft Safety Officer.
 */
export function canDelete(user, inspection) {
    if (!user || !inspection) return false;
    if (user.role === ROLE.ADMIN) return inspection.status !== DRAFT;
    return canEdit(user, inspection);
}
