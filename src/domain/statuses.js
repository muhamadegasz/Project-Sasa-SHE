/* statuses.js — nilai status yang dipakai di seluruh domain.
 *
 * PENTING: nilai-nilai di bawah BUKAN sekadar label internal. Ia dipakai
 * sebagai nama CSS class pada markup, misalnya:
 *
 *     <span class="status-badge selesai">
 *     <div class="progress-fill selesai_perbaikan">
 *     <span class="status-mini on-progress">
 *
 * Mengubah salah satu nilainya akan mematikan style-nya secara diam-diam.
 * Bila kelak ingin diganti, CSS di assets/css/ harus ikut diganti.
 *
 * Berkas ini tidak mengenal DOM dan tidak punya dependency.
 */

/** Status sebuah inspeksi secara keseluruhan. */
export const INSPECTION_STATUS = {
    SELESAI: 'selesai',
    PROSES: 'proses',
    TINJAU: 'tinjau',
};

/** Status satu tindakan perbaikan di dalam timeline. */
export const ACTION_STATUS = {
    CLOSED: 'closed',
    ON_PROGRESS: 'on-progress',
    OPEN: 'open',
};

/**
 * Status perbaikan sebuah inspeksi, diturunkan dari seluruh tindakannya.
 *
 * OPEN dipakai khusus untuk kasus "belum ada tindakan sama sekali" — berbeda
 * dari TINJAU yang berarti ada tindakan tetapi belum satu pun dikerjakan.
 */
export const REPAIR_STATUS = {
    SELESAI: 'selesai_perbaikan',
    PERBAIKAN: 'perbaikan',
    TINJAU: 'tinjau',
    OPEN: 'open',
};

/** Keadaan sebuah jadwal inspeksi. */
export const SCHEDULE_STATE = {
    SELESAI: 'selesai',
    TERLAMBAT: 'terlambat',
    AKTIF: 'aktif',
};
