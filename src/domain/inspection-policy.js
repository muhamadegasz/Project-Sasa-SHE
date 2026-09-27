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

/**
 * Cakupan visibilitas seorang pengguna, sebagai daftar kriteria (Phase 17.3A).
 * Sebuah inspeksi terlihat bila cocok dengan SALAH SATU kriteria; di dalam
 * satu kriteria, SEMUA field yang disebut harus cocok:
 *
 *   { petugasUserId, plantId, statuses: [...], currentApprovalStage }
 *
 * Satu sumber aturan untuk dua pemakai: canView() di bawah (satu inspeksi di
 * memori) dan repository server (klausa WHERE, supaya inspeksi di luar
 * cakupan tidak pernah dibaca dari database). Daftar kosong = tidak melihat
 * apa pun.
 */
export function visibilityScope(user) {
    if (!user) return [];

    switch (user.role) {
    case ROLE.SAFETY_OFFICER:
        // Miliknya sendiri di status apa pun; milik orang lain hanya yang
        // sedang direview atau sudah selesai — draft & revisi tetap privat.
        return [
            { petugasUserId: user.id },
            { statuses: [IN_REVIEW, COMPLETED] },
        ];
    case ROLE.KOORDINATOR_K3L:
        // Tanpa plant yang ditugaskan: tidak melihat apa pun (gagal-tertutup).
        if (user.plantId == null) return [];
        return [
            { plantId: user.plantId, statuses: [IN_REVIEW], currentApprovalStage: APPROVAL_STAGE.KOORDINATOR_K3L },
            { plantId: user.plantId, statuses: [COMPLETED] },
        ];
    case ROLE.MANAJER_BAGIAN:
        return [
            { statuses: [IN_REVIEW], currentApprovalStage: APPROVAL_STAGE.MANAJER },
            { statuses: [COMPLETED] },
        ];
    case ROLE.KETUA_P2K3:
        return [
            { statuses: [IN_REVIEW], currentApprovalStage: APPROVAL_STAGE.KETUA_P2K3 },
            { statuses: [COMPLETED] },
        ];
    case ROLE.ADMIN:
        // Semua kecuali draft.
        return [{ statuses: [IN_REVIEW, REVISION_REQUIRED, COMPLETED] }];
    default:
        return [];
    }
}

function matchesCriterion(criterion, inspection) {
    if (criterion.petugasUserId != null && Number(inspection.petugasUserId) !== Number(criterion.petugasUserId)) return false;
    if (criterion.plantId != null && Number(inspection.plantId) !== Number(criterion.plantId)) return false;
    if (criterion.statuses && !criterion.statuses.includes(inspection.status)) return false;
    if (criterion.currentApprovalStage && inspection.currentApprovalStage !== criterion.currentApprovalStage) return false;
    return true;
}

/** Apakah pengguna boleh melihat inspeksi ini. */
export function canView(user, inspection) {
    if (!user || !inspection) return false;
    return visibilityScope(user).some((criterion) => matchesCriterion(criterion, inspection));
}

/**
 * KEPEMILIKAN (Phase 17.3B), terpisah dari visibilitas: apakah pengguna ini
 * Safety Officer yang bertanggung jawab atas inspeksi (petugas_user_id dari
 * sesi saat dibuat, tidak pernah dari body permintaan). Dasar semua izin
 * mengubah di bawah; service juga memakainya untuk membedakan "bukan
 * pemilik" (FORBIDDEN) dari "pemilik, tapi statusnya tidak mengizinkan".
 */
export function isOwningOfficer(user, inspection) {
    return Boolean(user && inspection)
        && user.role === ROLE.SAFETY_OFFICER
        && isOwner(user, inspection);
}

/** Mengubah isi draft: hanya Safety Officer pemiliknya, hanya selama DRAFT. */
export function canEdit(user, inspection) {
    return isOwningOfficer(user, inspection) && inspection.status === DRAFT;
}

/** Merevisi setelah ditolak: hanya Safety Officer pemiliknya, hanya selama REVISION_REQUIRED. */
export function canRevise(user, inspection) {
    return isOwningOfficer(user, inspection) && inspection.status === REVISION_REQUIRED;
}

/** Mengajukan (draft) atau mengajukan ulang (revisi): hanya Safety Officer pemiliknya. */
export function canSubmit(user, inspection) {
    return canEdit(user, inspection) || canRevise(user, inspection);
}

/** Menghapus draft (Phase 17.3B): hanya Safety Officer pemiliknya, hanya selama DRAFT. */
export function canDeleteDraft(user, inspection) {
    return canEdit(user, inspection);
}

/** Status di mana tindakan perbaikan masih boleh diubah pemiliknya. COMPLETED bersifat final. */
const CORRECTIVE_ACTION_EDITABLE_STATUSES = [DRAFT, IN_REVIEW, REVISION_REQUIRED];

/**
 * Menambah/mengubah tindakan perbaikan (Phase 17.3B, aturan terkunci):
 * HANYA Safety Officer pemilik inspeksi, dan hanya selama DRAFT, IN_REVIEW,
 * atau REVISION_REQUIRED. Setelah COMPLETED, tindakan perbaikan hanya-baca —
 * inspeksi yang selesai bersifat final di aplikasi ini (tidak ada alur
 * membuka kembali). Bisa melihat inspeksi (canView) tidak cukup: Safety
 * Officer lain tetap hanya-lihat.
 */
export function canEditCorrectiveAction(user, inspection) {
    return isOwningOfficer(user, inspection)
        && CORRECTIVE_ACTION_EDITABLE_STATUSES.includes(inspection.status);
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
