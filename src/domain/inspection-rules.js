/* inspection-rules.js — aturan bisnis seputar inspeksi dan tindakan perbaikan.
 *
 * Seluruh fungsi di sini murni: menerima data, mengembalikan nilai, tanpa
 * menyentuh DOM, tanpa memutasi apa pun, tanpa menampilkan pesan.
 *
 * Renderer memakai hasilnya, bukan menghitung ulang sendiri.
 *
 * Phase 17.2: progres perbaikan di sini TIDAK menentukan status alur kerja
 * inspeksi (statusFromActions() dihapus — dulu menimpa status inspeksi setiap
 * tindakan ditambahkan). Status alur kerja ada di workflow-rules.js.
 */

import { ACTION_STATUS, REPAIR_STATUS } from './statuses.js';
import { FINDING_CATEGORIES, FINDING_CATEGORY_OTHER } from '../config/constants.js';

/** Panjang maksimum penjelasan kategori "Lainnya" — sama dengan VARCHAR(100) findings.kategori_lainnya. */
export const FINDING_OTHER_CATEGORY_MAX_LENGTH = 100;

/**
 * Memeriksa kategori satu temuan dari isian pengguna.
 *
 *   kategori              wajib, salah satu FINDING_CATEGORIES (ENUM findings.kategori)
 *   kategori "Lainnya"    kategoriLainnya wajib: di-trim, tidak kosong, maks. 100 karakter
 *   kategori lain         kategoriLainnya SELALU null — isian custom tidak ikut tersimpan
 *
 * Penjelasan tidak pernah menggantikan nilai kategori: kategori tetap "Lainnya".
 *
 * @returns {{ value: { kategori: string, kategoriLainnya: string|null } }
 *   | { error: 'CATEGORY_REQUIRED' | 'CATEGORY_INVALID' | 'OTHER_REQUIRED' | 'OTHER_INVALID' | 'OTHER_TOO_LONG' }}
 */
export function checkFindingCategory({ kategori, kategoriLainnya } = {}) {
    if (kategori === undefined || kategori === null || kategori === '') return { error: 'CATEGORY_REQUIRED' };
    if (typeof kategori !== 'string' || !FINDING_CATEGORIES.includes(kategori)) return { error: 'CATEGORY_INVALID' };
    if (kategori !== FINDING_CATEGORY_OTHER) return { value: { kategori, kategoriLainnya: null } };

    if (kategoriLainnya === undefined || kategoriLainnya === null) return { error: 'OTHER_REQUIRED' };
    if (typeof kategoriLainnya !== 'string') return { error: 'OTHER_INVALID' };
    const value = kategoriLainnya.trim();
    if (!value) return { error: 'OTHER_REQUIRED' };
    // Dihitung per karakter (code point), sama seperti VARCHAR di database.
    if (Array.from(value).length > FINDING_OTHER_CATEGORY_MAX_LENGTH) return { error: 'OTHER_TOO_LONG' };
    return { value: { kategori, kategoriLainnya: value } };
}

/**
 * Urutan siklus hidup satu tindakan perbaikan (release): hanya MAJU —
 * open -> on-progress -> closed. Tidak ada pembukaan kembali (closed -> open).
 */
const ACTION_STATUS_ORDER = [ACTION_STATUS.OPEN, ACTION_STATUS.ON_PROGRESS, ACTION_STATUS.CLOSED];

/** Status yang boleh dituju dari `current` (maju saja; boleh melompati on-progress). */
export function nextActionStatuses(current) {
    const index = ACTION_STATUS_ORDER.indexOf(current);
    return index === -1 ? [] : ACTION_STATUS_ORDER.slice(index + 1);
}

/**
 * Memeriksa perubahan status sebuah tindakan perbaikan dari `current` ke `next`.
 * @returns {{ value: string } | { error: 'INVALID' | 'NOT_FORWARD' }}
 *   INVALID     — `next` bukan open/on-progress/closed
 *   NOT_FORWARD — mundur, sama, atau dari status yang sudah final (closed)
 */
export function checkActionStatusChange(current, next) {
    if (typeof next !== 'string' || !ACTION_STATUS_ORDER.includes(next)) return { error: 'INVALID' };
    if (!nextActionStatuses(current).includes(next)) return { error: 'NOT_FORWARD' };
    return { value: next };
}

/** Apakah inspeksi punya minimal satu tindakan perbaikan. */
function hasActions(inspection) {
    return Boolean(inspection && inspection.perbaikan && inspection.perbaikan.length > 0);
}

/**
 * Persentase penyelesaian perbaikan: tindakan closed dibagi total tindakan.
 *
 * Tanpa tindakan sama sekali hasilnya 0, bukan 100 — inspeksi yang belum
 * ditindaklanjuti tidak boleh terlihat selesai.
 */
export function getProgress(inspection) {
    if (!hasActions(inspection)) return 0;
    const closed = inspection.perbaikan.filter((action) => action.status === ACTION_STATUS.CLOSED).length;
    return Math.round((closed / inspection.perbaikan.length) * 100);
}

/**
 * Status perbaikan sebuah inspeksi, diturunkan dari seluruh tindakannya.
 *
 *   semua closed            -> SELESAI
 *   ada yang on-progress    -> PERBAIKAN
 *   ada tindakan, tak satu pun berjalan -> TINJAU
 *   belum ada tindakan      -> OPEN
 */
export function getRepairStatus(inspection) {
    if (!hasActions(inspection)) return REPAIR_STATUS.OPEN;

    if (allActionsClosed(inspection)) return REPAIR_STATUS.SELESAI;
    if (hasActionInProgress(inspection)) return REPAIR_STATUS.PERBAIKAN;
    return REPAIR_STATUS.TINJAU;
}

/** Apakah seluruh tindakan perbaikan sudah closed. */
export function allActionsClosed(inspection) {
    return hasActions(inspection)
        && inspection.perbaikan.every((action) => action.status === ACTION_STATUS.CLOSED);
}

/** Apakah ada tindakan yang sedang dikerjakan. */
export function hasActionInProgress(inspection) {
    return hasActions(inspection)
        && inspection.perbaikan.some((action) => action.status === ACTION_STATUS.ON_PROGRESS);
}

/** Apakah ada tindakan yang belum dikerjakan. */
export function hasActionOpen(inspection) {
    return hasActions(inspection)
        && inspection.perbaikan.some((action) => action.status === ACTION_STATUS.OPEN);
}

/**
 * Tindakan perbaikan awal untuk satu temuan: "Temuan N: <deskripsi>",
 * status open. Sejak Phase 17.3B dibuat saat temuan MASUK ke inspeksi yang
 * sudah diajukan (pengajuan pertama, atau temuan baru saat revisi) — bukan
 * saat draft dibuat, supaya mengubah temuan draft tidak meninggalkan tindakan
 * basi. `position` dimulai dari 1.
 */
export function buildInitialAction(finding, position, pic) {
    return {
        action: `Temuan ${position}: ${finding.deskripsi}`,
        status: ACTION_STATUS.OPEN,
        pic,
    };
}

/** Jumlah temuan pada sebuah inspeksi. */
export function countFindings(inspection) {
    return inspection && inspection.temuan ? inspection.temuan.length : 0;
}

/** Total temuan dari sekumpulan inspeksi. */
export function countAllFindings(inspections) {
    return inspections.reduce((total, inspection) => total + countFindings(inspection), 0);
}
