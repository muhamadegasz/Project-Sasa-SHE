/* user-service.js — pengelolaan akun oleh Admin (Phase 18).
 *
 * Menyusun aturan domain/user-rules.js dengan data dari repository. Tidak
 * menyentuh DOM, tidak menampilkan toast. Dipakai di browser (umpan balik
 * cepat) DAN di server (otoritatif) — sama seperti approval-service.js.
 *
 * Password tidak pernah di-hash di sini: service ini ikut berjalan di
 * browser. Repository server yang meng-hash (bcryptjs), repository browser
 * hanya meneruskannya ke API. Hash tidak pernah keluar dari repository server.
 *
 * Pengaman yang ditegakkan di sini (bukan hanya di UI):
 *   - hanya Admin (canManageUsers) — di luar itu FORBIDDEN;
 *   - Admin tidak bisa menonaktifkan, menghapus, atau mengganti role akunnya
 *     sendiri (sessionAuth memeriksa is_active di setiap permintaan, jadi
 *     menonaktifkan diri sendiri langsung mengunci Admin itu keluar);
 *   - invarian role/plant (normalizePlantAssignment) + plant harus ada;
 *   - hapus permanen hanya untuk akun NONAKTIF yang tidak lagi memiliki
 *     inspeksi yang belum selesai (lihat remove()).
 */

import * as userRepository from '#repositories/user-repository.js';
import * as plantRepository from '#repositories/plant-repository.js';
import {
    canManageUsers, checkActiveFlag, checkDisplayName, checkPassword, checkRole, checkUsername,
    normalizePlantAssignment,
} from '../domain/user-rules.js';
import { ACCESS_ERROR, fail, ok } from './result.js';

export const USER_ERROR = {
    // NOT_FOUND (404) / FORBIDDEN (403): lihat ACCESS_ERROR di result.js.
    ...ACCESS_ERROR,
    USERNAME_REQUIRED: 'USERNAME_REQUIRED',
    USERNAME_INVALID: 'USERNAME_INVALID',
    USERNAME_TOO_LONG: 'USERNAME_TOO_LONG',
    USERNAME_TAKEN: 'USERNAME_TAKEN',
    DISPLAY_NAME_REQUIRED: 'DISPLAY_NAME_REQUIRED',
    DISPLAY_NAME_INVALID: 'DISPLAY_NAME_INVALID',
    DISPLAY_NAME_TOO_LONG: 'DISPLAY_NAME_TOO_LONG',
    ROLE_REQUIRED: 'ROLE_REQUIRED',
    ROLE_INVALID: 'ROLE_INVALID',
    PASSWORD_REQUIRED: 'PASSWORD_REQUIRED',
    PASSWORD_INVALID: 'PASSWORD_INVALID',
    PASSWORD_TOO_SHORT: 'PASSWORD_TOO_SHORT',
    PASSWORD_TOO_LONG: 'PASSWORD_TOO_LONG',
    PLANT_REQUIRED: 'PLANT_REQUIRED',
    PLANT_INVALID: 'PLANT_INVALID',
    PLANT_NOT_FOUND: 'PLANT_NOT_FOUND',
    ACTIVE_INVALID: 'ACTIVE_INVALID',
    CANNOT_DEACTIVATE_SELF: 'CANNOT_DEACTIVATE_SELF',
    CANNOT_CHANGE_OWN_ROLE: 'CANNOT_CHANGE_OWN_ROLE',
    CANNOT_DELETE_SELF: 'CANNOT_DELETE_SELF',
    // Hapus permanen hanya untuk akun yang sudah dinonaktifkan.
    USER_ACTIVE: 'USER_ACTIVE',
    USER_HAS_OPEN_INSPECTIONS: 'USER_HAS_OPEN_INSPECTIONS',
};

const FIELD_ERROR = {
    username: { REQUIRED: USER_ERROR.USERNAME_REQUIRED, INVALID: USER_ERROR.USERNAME_INVALID, TOO_LONG: USER_ERROR.USERNAME_TOO_LONG },
    displayName: { REQUIRED: USER_ERROR.DISPLAY_NAME_REQUIRED, INVALID: USER_ERROR.DISPLAY_NAME_INVALID, TOO_LONG: USER_ERROR.DISPLAY_NAME_TOO_LONG },
    role: { REQUIRED: USER_ERROR.ROLE_REQUIRED, INVALID: USER_ERROR.ROLE_INVALID },
    password: {
        REQUIRED: USER_ERROR.PASSWORD_REQUIRED, INVALID: USER_ERROR.PASSWORD_INVALID,
        TOO_SHORT: USER_ERROR.PASSWORD_TOO_SHORT, TOO_LONG: USER_ERROR.PASSWORD_TOO_LONG,
    },
    plant: { PLANT_REQUIRED: USER_ERROR.PLANT_REQUIRED, PLANT_INVALID: USER_ERROR.PLANT_INVALID },
};

const isSelf = (actor, userId) => Number(actor.id) === Number(userId);

/**
 * Role + plant yang akan disimpan: role sah, plant dinormalisasi (null untuk
 * role selain Koordinator K3L), dan plant Koordinator benar-benar ada (aktif).
 * @returns {{ role, plantId }} atau {{ failure }}
 */
async function checkRoleAndPlant(role, plantId) {
    const checkedRole = checkRole(role);
    if (checkedRole.error) return { failure: fail(FIELD_ERROR.role[checkedRole.error]) };

    const plant = normalizePlantAssignment(checkedRole.value, plantId);
    if (plant.error) return { failure: fail(FIELD_ERROR.plant[plant.error]) };
    if (plant.value !== null && !(await plantRepository.findById(plant.value))) {
        return { failure: fail(USER_ERROR.PLANT_NOT_FOUND) };
    }
    return { role: checkedRole.value, plantId: plant.value };
}

/** Memuat user target untuk aksi Admin: FORBIDDEN bila bukan Admin, NOT_FOUND bila tidak ada. */
async function loadForAdmin(actor, userId) {
    if (!canManageUsers(actor)) return { failure: fail(USER_ERROR.FORBIDDEN) };
    const user = await userRepository.findById(userId);
    if (!user) return { failure: fail(USER_ERROR.NOT_FOUND) };
    return { user };
}

/** Seluruh akun (bentuk publik, tanpa hash). */
export async function list(actor) {
    if (!canManageUsers(actor)) return fail(USER_ERROR.FORBIDDEN);
    return ok({ users: await userRepository.getAll() });
}

/**
 * Membuat akun baru (aktif). `input`: { username, displayName, role, plantId, password }.
 * @returns ok({ user }) atau fail(USER_ERROR.*)
 */
export async function create(actor, input = {}) {
    if (!canManageUsers(actor)) return fail(USER_ERROR.FORBIDDEN);

    const username = checkUsername(input.username);
    if (username.error) return fail(FIELD_ERROR.username[username.error]);
    const displayName = checkDisplayName(input.displayName);
    if (displayName.error) return fail(FIELD_ERROR.displayName[displayName.error]);
    const assignment = await checkRoleAndPlant(input.role, input.plantId);
    if (assignment.failure) return assignment.failure;
    const password = checkPassword(input.password);
    if (password.error) return fail(FIELD_ERROR.password[password.error]);

    // null = username sudah dipakai (constraint UNIQUE sebagai penjaga terakhir, termasuk saat bersamaan).
    const user = await userRepository.create({
        username: username.value,
        displayName: displayName.value,
        role: assignment.role,
        plantId: assignment.plantId,
        password: password.value,
    });
    if (!user) return fail(USER_ERROR.USERNAME_TAKEN);
    return ok({ user });
}

/**
 * Mengubah nama tampilan, role, plant, dan — bila `password` diisi —
 * mengganti password. Username tidak bisa diubah (identitas login).
 * Mengubah Koordinator K3L menjadi role lain otomatis melepas plant-nya.
 * @returns ok({ user }) atau fail(USER_ERROR.*)
 */
export async function update(actor, userId, input = {}) {
    const { user, failure } = await loadForAdmin(actor, userId);
    if (failure) return failure;

    const displayName = checkDisplayName(input.displayName);
    if (displayName.error) return fail(FIELD_ERROR.displayName[displayName.error]);
    const assignment = await checkRoleAndPlant(input.role, input.plantId);
    if (assignment.failure) return assignment.failure;
    if (isSelf(actor, user.id) && assignment.role !== user.role) return fail(USER_ERROR.CANNOT_CHANGE_OWN_ROLE);

    // Password kosong/tidak dikirim = tidak diganti.
    let password = null;
    if (input.password !== undefined && input.password !== null && input.password !== '') {
        const checked = checkPassword(input.password);
        if (checked.error) return fail(FIELD_ERROR.password[checked.error]);
        password = checked.value;
    }

    const updated = await userRepository.update(user.id, {
        displayName: displayName.value,
        role: assignment.role,
        plantId: assignment.plantId,
        password,
    });
    if (!updated) return fail(USER_ERROR.NOT_FOUND);
    return ok({ user: updated });
}

/**
 * Mengaktifkan/menonaktifkan akun. Akun nonaktif langsung tidak bisa login
 * dan sesi yang sedang berjalan ditolak di permintaan berikutnya
 * (server/middleware/session-auth.js). Data dan riwayatnya tetap utuh.
 * @returns ok({ user }) atau fail(USER_ERROR.*)
 */
export async function setActive(actor, userId, isActive) {
    const { user, failure } = await loadForAdmin(actor, userId);
    if (failure) return failure;

    const checked = checkActiveFlag(isActive);
    if (checked.error) return fail(USER_ERROR.ACTIVE_INVALID);
    if (!checked.value && isSelf(actor, user.id)) return fail(USER_ERROR.CANNOT_DEACTIVATE_SELF);

    const updated = await userRepository.setActive(user.id, checked.value);
    if (!updated) return fail(USER_ERROR.NOT_FOUND);
    return ok({ user: updated });
}

/**
 * Menghapus akun secara PERMANEN. Data bisnisnya tetap ada: migrasi 005
 * mengubah seluruh FK ke users menjadi ON DELETE SET NULL, dan nama yang
 * tampil di riwayat sudah dibekukan di kolom teks (petugas, officer,
 * reviewer_name). Pengaman:
 *   - bukan akun sendiri;
 *   - akun sudah dinonaktifkan lebih dulu (dua langkah untuk aksi yang tidak
 *     bisa dibatalkan) — akun nonaktif juga tidak bisa lagi membuat atau
 *     mengajukan inspeksi, jadi pemeriksaan di bawah tidak bisa didahului;
 *   - tidak memiliki inspeksi yang BELUM SELESAI (draft, sedang direview,
 *     perlu revisi). Tanpa pemilik, inspeksi itu tidak bisa lagi direvisi
 *     atau diajukan siapa pun — termasuk yang sedang direview, karena bisa
 *     ditolak kembali menjadi perlu revisi. Inspeksi COMPLETED bersifat final.
 * @returns ok({ removed: true }) atau fail(USER_ERROR.*)
 */
export async function remove(actor, userId) {
    const { user, failure } = await loadForAdmin(actor, userId);
    if (failure) return failure;

    if (isSelf(actor, user.id)) return fail(USER_ERROR.CANNOT_DELETE_SELF);
    if (user.isActive) return fail(USER_ERROR.USER_ACTIVE);
    const openInspections = await userRepository.countOpenOwnedInspections(user.id);
    if (openInspections > 0) return fail(USER_ERROR.USER_HAS_OPEN_INSPECTIONS, { openInspections });

    // false = diaktifkan lagi atau sudah terhapus di antara pemeriksaan dan penghapusan.
    const removed = await userRepository.remove(user.id);
    if (!removed) return fail(USER_ERROR.USER_ACTIVE);
    return ok({ removed: true });
}
