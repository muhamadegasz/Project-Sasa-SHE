/* date.js — utilitas tanggal.
 *
 * Aplikasi ini memakai DUA format tanggal berdampingan, dan itu disengaja
 * dipertahankan apa adanya selama refactoring:
 *
 *   - ISO "YYYY-MM-DD"  dipakai oleh data jadwal dan seluruh <input type="date">
 *   - Lokal "D/M/YYYY"  dipakai oleh data inspeksi (hasil toLocaleDateString id-ID)
 *
 * Menyatukan keduanya akan mengubah perilaku yang terlihat, jadi itu pekerjaan
 * tersendiri, bukan bagian dari pemindahan ini.
 *
 * Berkas ini tidak mengenal DOM dan tidak punya dependency.
 */

/** Memformat tanggal ISO menjadi tampilan lokal Indonesia. '-' bila kosong. */
export function formatDate(dateStr) {
    if (!dateStr) return '-';
    const parsed = new Date(dateStr);
    return parsed.toLocaleDateString('id-ID');
}

/** Tanggal lokal Indonesia, `days` hari dari hari ini. Negatif = masa lalu. */
export function getDateOffset(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toLocaleDateString('id-ID');
}

/**
 * Menentukan apakah sebuah due date sudah lewat.
 *
 * Hanya menerima format lokal "D/M/YYYY" — itulah yang dipakai data inspeksi.
 * Nilai kosong, '-', atau format lain dianggap TIDAK overdue, sesuai perilaku
 * yang sudah berjalan.
 */
export function isOverdue(dueDate) {
    if (!dueDate || dueDate === '-') return false;

    const parts = String(dueDate).split('/');
    if (parts.length !== 3) return false;

    const due = new Date(parts[2], parts[1] - 1, parts[0]);
    return due < new Date();
}
