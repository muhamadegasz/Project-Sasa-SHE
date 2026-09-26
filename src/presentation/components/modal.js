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
 *
 * Phase 16.4 (U-04): isi modal tetap diisi oleh view masing-masing, tapi
 * langkah terakhirnya (menampilkan) sekarang lewat openModal() — supaya
 * Escape, fokus awal, dan pengembalian fokus ditangani di satu tempat.
 * Lightbox (components/lightbox.js) BUKAN modal ini: punya Escape/panah
 * sendiri dan tidak disentuh. Dialog konfirmasi memakai confirm() bawaan
 * browser, yang sudah menangani Escape sendiri.
 */

/** modalId -> id tombol close-nya (diisi bindModalClose), target fokus saat modal dibuka. */
const closeButtonIds = {};

/** Modal yang sedang terbuka, urut dari yang dibuka paling awal, beserta elemen pemicunya. */
const openStack = [];

/**
 * Menampilkan modal yang isinya sudah diisi pemanggil.
 *
 * Aman dipanggil ulang saat modal sudah terbuka (mis. modal pengesahan
 * dirender ulang setelah approve): pemicu awal tidak ditimpa, dan fokus hanya
 * dipindah bila sedang tidak berada di dalam modal — innerHTML yang dirender
 * ulang membuang elemen yang sedang fokus, sehingga fokus jatuh ke <body>.
 */
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!openStack.some((entry) => entry.modalId === modalId)) {
        openStack.push({ modalId, trigger: document.activeElement });
    }
    modal.classList.add('show');
    if (!modal.contains(document.activeElement)) {
        document.getElementById(closeButtonIds[modalId])?.focus();
    }
}

export function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
    const index = openStack.findIndex((entry) => entry.modalId === modalId);
    if (index === -1) return;
    const [{ trigger }] = openStack.splice(index, 1);
    // Pemicu bisa sudah hilang dari DOM (tabel dirender ulang setelah aksi) —
    // dalam kasus itu fokus dibiarkan, tidak dicarikan pengganti.
    if (trigger && trigger !== document.body && trigger.isConnected) trigger.focus();
}

/**
 * Memasang penutup modal: tombol close, dan klik di luar kotak modal (di
 * overlay-nya sendiri).
 */
export function bindModalClose(modalId, closeButtonId) {
    const modal = document.getElementById(modalId);
    closeButtonIds[modalId] = closeButtonId;
    document.getElementById(closeButtonId).addEventListener('click', function() {
        closeModal(modalId);
    });
    modal.addEventListener('click', function(e) {
        if (e.target === this) closeModal(modalId);
    });
}

// Escape menutup modal yang paling atas (terakhir dibuka). Fase CAPTURE,
// supaya keadaan dibaca SEBELUM handler Escape lain mengubahnya:
// - lightbox bisa terbuka di atas modal detail/perbaikan; Escape miliknya
//   (listener bubble di document) harus hanya menutup lightbox.
// - dropdown pencarian plant di modal jadwal menutup dirinya sendiri saat
//   Escape; tekanan Escape itu tidak boleh sekaligus menutup modalnya.
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape' || openStack.length === 0) return;
    if (document.getElementById('lightboxOverlay')?.classList.contains('show')) return;
    if (e.target.closest?.('.select-search-wrapper')?.querySelector('.dropdown-list.show')) return;
    closeModal(openStack[openStack.length - 1].modalId);
}, true);
