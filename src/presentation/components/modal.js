/* modal.js — perilaku umum yang dipakai kelima modal aplikasi
 * (jadwalModal, detailModal, perbaikanModal, approvalModal, calendarModal).
 *
 * Masing-masing modal punya isi dan cara "buka" yang berbeda (populate
 * konten dulu baru classList.add('show')), sehingga "open" TIDAK diseragamkan
 * di sini. Yang diseragamkan hanya "close": sebelum Phase 7, pola berikut
 * disalin persis 5 kali di legacy-app.js —
 *
 *   document.getElementById('closeXModal').addEventListener('click', function() {
 *       document.getElementById('xModal').classList.remove('show');
 *   });
 *   document.getElementById('xModal').addEventListener('click', function(e) {
 *       if (e.target === this) this.classList.remove('show');
 *   });
 *
 * bindModalClose() menggantikan kelima salinan itu dengan satu implementasi.
 */

export function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
}

/**
 * Memasang penutup modal: tombol close, dan klik di luar kotak modal (di
 * overlay-nya sendiri).
 */
export function bindModalClose(modalId, closeButtonId) {
    const modal = document.getElementById(modalId);
    document.getElementById(closeButtonId).addEventListener('click', function() {
        closeModal(modalId);
    });
    modal.addEventListener('click', function(e) {
        if (e.target === this) closeModal(modalId);
    });
}
