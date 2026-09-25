/* lightbox.js — preview foto layar-penuh dengan navigasi sebelumnya/berikutnya.
 *
 * Dipindah apa adanya dari legacy-app.js (Phase 7). Sudah berdiri sendiri
 * sejak semula: hanya menyimpan daftar gambar & indeks aktif, tidak
 * menyentuh state lain di aplikasi. openLightbox() dipanggil lewat
 * data-action="openLightbox" (presentation/controllers/action-dispatcher.js,
 * Phase 9); pemanggilnya memakai jsArg() untuk membawa array objek foto
 * ({id, originalName}) dengan aman lewat atribut data-images.
 *
 * Sejak Phase 15: foto sungguhan tersimpan di server (lihat
 * docs/DECISIONS.md) — img.src menunjuk ke endpoint API yang butuh sesi
 * login (photoUrl()), bukan lagi placeholder SVG.
 */

import { photoUrl } from '../../infrastructure/api-client.js';

let lightboxImages = [];
let currentLightboxIndex = 0;

export function openLightbox(images, index = 0) {
    if (!images || images.length === 0) return;
    lightboxImages = images;
    currentLightboxIndex = index;
    const overlay = document.getElementById('lightboxOverlay');
    const img = document.getElementById('lightboxImage');
    const info = document.getElementById('lightboxFileName');
    const counter = document.getElementById('lightboxCounter');

    img.src = photoUrl(images[index].id);
    info.textContent = images[index].originalName;
    counter.textContent = `${index + 1} dari ${images.length}`;
    document.getElementById('lightboxPrev').style.display = images.length > 1 ? 'flex' : 'none';
    document.getElementById('lightboxNext').style.display = images.length > 1 ? 'flex' : 'none';
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    document.getElementById('lightboxOverlay').classList.remove('show');
    document.body.style.overflow = '';
}

function navigateLightbox(direction) {
    const newIndex = currentLightboxIndex + direction;
    if (newIndex < 0 || newIndex >= lightboxImages.length) return;
    currentLightboxIndex = newIndex;
    const img = document.getElementById('lightboxImage');
    const info = document.getElementById('lightboxFileName');
    const counter = document.getElementById('lightboxCounter');
    img.src = photoUrl(lightboxImages[currentLightboxIndex].id);
    info.textContent = lightboxImages[currentLightboxIndex].originalName;
    counter.textContent = `${currentLightboxIndex + 1} dari ${lightboxImages.length}`;
}

document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
document.getElementById('lightboxOverlay').addEventListener('click', function(e) {
    if (e.target === this) closeLightbox();
});
document.getElementById('lightboxPrev').addEventListener('click', function(e) {
    e.stopPropagation();
    navigateLightbox(-1);
});
document.getElementById('lightboxNext').addEventListener('click', function(e) {
    e.stopPropagation();
    navigateLightbox(1);
});
document.addEventListener('keydown', function(e) {
    const overlay = document.getElementById('lightboxOverlay');
    if (!overlay.classList.contains('show')) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') navigateLightbox(-1);
    else if (e.key === 'ArrowRight') navigateLightbox(1);
});
