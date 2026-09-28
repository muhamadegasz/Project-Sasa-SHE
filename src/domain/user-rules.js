/* user-rules.js — aturan pengelolaan akun oleh Admin (Phase 18).
 *
 * Murni: data masuk, `{ value }`/`{ error }` keluar — sama seperti
 * signature-rules.js/approval-rules.js. Tidak menyentuh DB (keunikan
 * username dan keberadaan plant diperiksa service lewat repository), tidak
 * menyentuh hashing password (urusan route/service, lewat bcryptjs — sudah
 * dipakai auth.routes.js).
 *
 * Invarian inti (disetujui pemilik project): KOORDINATOR_K3L WAJIB punya
 * tepat satu plant_id; role lain WAJIB plant_id NULL. normalizePlantAssignment()
 * adalah satu-satunya tempat aturan itu ditegakkan — dipanggil setiap kali
 * role atau plant_id sebuah user berubah (buat baru maupun ubah role),
 * supaya kombinasi role/plant yang tidak sah tidak pernah sampai ke database.
 */

import { ROLE } from '../config/constants.js';

const ROLE_VALUES = Object.values(ROLE);

/**
 * Hanya Admin yang mengelola akun. Service memeriksanya (FORBIDDEN) di
 * samping requireRole('admin') pada route — server tetap otoritatif,
 * penyembunyian menu di UI bukan otorisasi.
 */
export function canManageUsers(user) {
    return Boolean(user) && user.role === ROLE.ADMIN;
}

/** Status aktif dari isian: hanya boolean sungguhan — bukan 'false', 0, atau 'yes'. */
export function checkActiveFlag(isActive) {
    if (typeof isActive !== 'boolean') return { error: 'INVALID' };
    return { value: isActive };
}

export const USERNAME_MAX_LENGTH = 50; // VARCHAR(50), lihat server/db/migrations/001_init.sql
export const DISPLAY_NAME_MAX_LENGTH = 100; // VARCHAR(100)
export const PASSWORD_MIN_LENGTH = 4; // konsisten dengan akun seed terpendek (mis. 'arif', 'andi', 'hadi')
export const PASSWORD_MAX_LENGTH = 72; // batas bcrypt (72 byte) — dibatasi karakter supaya tidak diam-diam terpotong

/** Username: identitas login, bukan teks bebas — karakter dibatasi supaya tidak berupa spasi/markup. */
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

/**
 * Memeriksa username. Mengembalikan `{ value }` (sudah di-trim) atau
 * `{ error: 'REQUIRED' | 'INVALID' | 'TOO_LONG' }`. Keunikan TIDAK diperiksa
 * di sini — itu urusan repository (constraint UNIQUE sebagai penjaga
 * terakhir; service memeriksa dulu supaya pesannya jelas).
 */
export function checkUsername(username) {
    if (username === undefined || username === null) return { error: 'REQUIRED' };
    if (typeof username !== 'string') return { error: 'INVALID' };
    const value = username.trim();
    if (!value) return { error: 'REQUIRED' };
    if (value.length > USERNAME_MAX_LENGTH) return { error: 'TOO_LONG' };
    if (!USERNAME_PATTERN.test(value)) return { error: 'INVALID' };
    return { value };
}

/** Memeriksa nama tampilan. Bebas karakter (ditampilkan lewat escapeHtml di UI), hanya panjang & wajib yang dibatasi. */
export function checkDisplayName(displayName) {
    if (displayName === undefined || displayName === null) return { error: 'REQUIRED' };
    if (typeof displayName !== 'string') return { error: 'INVALID' };
    const value = displayName.trim();
    if (!value) return { error: 'REQUIRED' };
    if (value.length > DISPLAY_NAME_MAX_LENGTH) return { error: 'TOO_LONG' };
    return { value };
}

/** Memeriksa role terhadap ENUM users.role (config/constants.js ROLE). */
export function checkRole(role) {
    if (role === undefined || role === null || role === '') return { error: 'REQUIRED' };
    if (typeof role !== 'string' || !ROLE_VALUES.includes(role)) return { error: 'INVALID' };
    return { value: role };
}

/**
 * Memeriksa password baru (buat akun atau ganti password). Panjang saja —
 * belum ada kebijakan kerumitan password dari pemilik project.
 */
export function checkPassword(password) {
    if (password === undefined || password === null) return { error: 'REQUIRED' };
    if (typeof password !== 'string') return { error: 'INVALID' };
    if (password.length === 0) return { error: 'REQUIRED' };
    if (password.length < PASSWORD_MIN_LENGTH) return { error: 'TOO_SHORT' };
    if (password.length > PASSWORD_MAX_LENGTH) return { error: 'TOO_LONG' };
    return { value: password };
}

/**
 * Angka bulat positif dari input isian (angka atau teks digit) — bentuk
 * yang sama dipakai id plant di seluruh aplikasi (lihat plant-repository.js).
 */
function toPositivePlantId(value) {
    if (typeof value === 'number') {
        return Number.isInteger(value) && value > 0 ? value : null;
    }
    if (typeof value === 'string' && /^\d+$/.test(value)) {
        const number = Number(value);
        return number > 0 ? number : null;
    }
    return null;
}

/**
 * Menegakkan invarian role/plant_id: KOORDINATOR_K3L wajib plant_id (angka
 * bulat positif — KEBERADAANNYA di tabel plants diperiksa service lewat
 * plantRepository.findById, bukan di sini, domain tidak menyentuh DB); role
 * lain SELALU dinormalisasi ke null, apa pun yang dikirim pemanggil — jadi
 * mengubah Koordinator menjadi role lain otomatis melepas plant_id-nya tanpa
 * langkah terpisah, dan tidak ada jalan bagi kombinasi role/plant yang tidak
 * sah untuk sampai ke database.
 *
 * @returns {{ value: number | null } | { error: 'PLANT_REQUIRED' | 'PLANT_INVALID' }}
 */
export function normalizePlantAssignment(role, plantId) {
    if (role !== ROLE.KOORDINATOR_K3L) return { value: null };

    if (plantId === undefined || plantId === null || plantId === '') return { error: 'PLANT_REQUIRED' };
    const value = toPositivePlantId(plantId);
    if (value === null) return { error: 'PLANT_INVALID' };
    return { value };
}
