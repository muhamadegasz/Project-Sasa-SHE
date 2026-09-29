/* overdue-indicator.js — penanda kecil "melewati due date" di samping tanggal.
 *
 * Menggantikan badge merah "OVERDUE" yang sebelumnya disalin di tabel, detail,
 * dan modal perbaikan. Ikon Font Awesome yang sudah dimuat (bukan dependency
 * baru), merah, dengan tooltip (title) dan label untuk pembaca layar — makna
 * tidak hanya dari warna, dan tooltip tidak mengubah tata letak. Aturan
 * overdue-nya sendiri tetap di pemanggil (shared/date.js, schedule-rules.js).
 */

export const OVERDUE_LABEL = 'Overdue — melewati due date';

export function overdueIndicator() {
    return `<span class="overdue-indicator" role="img" aria-label="${OVERDUE_LABEL}" title="${OVERDUE_LABEL}" data-testid="overdue-indicator"><i class="fas fa-circle-exclamation" aria-hidden="true"></i></span>`;
}
