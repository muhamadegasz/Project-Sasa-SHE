/* toast.js — notifikasi kecil yang muncul sebentar di pojok layar.
 *
 * Dipindah apa adanya dari legacy-app.js (Phase 7). Dipakai di hampir
 * seluruh alur (approval, jadwal, perbaikan, ekspor, login/logout) untuk
 * memberi umpan balik non-blocking.
 */

const toast = document.getElementById('toastMessage');
const toastText = document.getElementById('toastText');

export function showToast(msg) {
    toastText.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.classList.remove('show'); }, 5000);
}
