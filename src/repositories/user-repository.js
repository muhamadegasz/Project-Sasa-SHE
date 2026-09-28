/* user-repository.js — akun pengguna, versi browser (Phase 18): fetch ke
 * /api/users. Padanan server: server/repositories/user-repository.js
 * (MySQL, dan satu-satunya tempat password di-hash).
 *
 * Seluruh endpoint ini khusus Admin dan otoritatif di server — service
 * dijalankan LAGI di sana. Penolakan server (4xx) dilempar sebagai ApiError
 * oleh api-client.js, sama seperti repository browser lain.
 */

import { apiDelete, apiGet, apiPost, apiPut } from '../infrastructure/api-client.js';

const path = (id) => `/users/${encodeURIComponent(id)}`;

/** Seluruh akun (bentuk publik). */
export async function getAll() {
    return apiGet('/users');
}

/** Satu akun berdasarkan id, atau undefined. */
export async function findById(id) {
    const users = await getAll();
    return users.find((user) => Number(user.id) === Number(id));
}

export async function create(user) {
    const { user: created } = await apiPost('/users', user);
    return created;
}

export async function update(id, patch) {
    const { user } = await apiPut(path(id), patch);
    return user;
}

export async function setActive(id, isActive) {
    const { user } = await apiPut(`${path(id)}/active`, { isActive });
    return user;
}

/**
 * Selalu 0 di browser: pengaman hapus permanen ditegakkan server (yang
 * menghitung draft/revisi milik akun itu); penolakannya sampai ke sini sebagai
 * ApiError USER_HAS_OPEN_INSPECTIONS dari remove().
 */
export async function countOpenOwnedInspections() {
    return 0;
}

/** Menghapus akun secara permanen. @returns {boolean} */
export async function remove(id) {
    const result = await apiDelete(path(id));
    return Boolean(result && result.removed);
}
