/* inspection-rules.js — aturan bisnis seputar inspeksi dan tindakan perbaikan.
 *
 * Seluruh fungsi di sini murni: menerima data, mengembalikan nilai, tanpa
 * menyentuh DOM, tanpa memutasi apa pun, tanpa menampilkan pesan.
 *
 * Renderer memakai hasilnya, bukan menghitung ulang sendiri.
 */

import { ACTION_STATUS, INSPECTION_STATUS, REPAIR_STATUS } from './statuses.js';

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
 * Status inspeksi yang seharusnya setelah daftar tindakannya berubah.
 *
 * Dipakai ketika progres perbaikan baru ditambahkan: begitu seluruh tindakan
 * closed, inspeksi dianggap selesai; selain itu kembali ke proses.
 *
 * Catatan: aturan ini TIDAK mempertimbangkan pengesahan. Pengesahan punya
 * jalurnya sendiri di approval-rules.js, dan juga dapat mengubah status
 * inspeksi. Perilaku itu sudah begitu sebelum refactoring dan tidak diubah.
 */
export function statusFromActions(inspection) {
    return allActionsClosed(inspection)
        ? INSPECTION_STATUS.SELESAI
        : INSPECTION_STATUS.PROSES;
}

/** Jumlah temuan pada sebuah inspeksi. */
export function countFindings(inspection) {
    return inspection && inspection.temuan ? inspection.temuan.length : 0;
}

/** Total temuan dari sekumpulan inspeksi. */
export function countAllFindings(inspections) {
    return inspections.reduce((total, inspection) => total + countFindings(inspection), 0);
}
