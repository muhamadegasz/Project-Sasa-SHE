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

/** Jumlah temuan pada sebuah inspeksi. */
export function countFindings(inspection) {
    return inspection && inspection.temuan ? inspection.temuan.length : 0;
}

/** Total temuan dari sekumpulan inspeksi. */
export function countAllFindings(inspections) {
    return inspections.reduce((total, inspection) => total + countFindings(inspection), 0);
}
