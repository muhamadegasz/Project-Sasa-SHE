/* lightbox.js — preview foto layar-penuh dengan navigasi sebelumnya/berikutnya.
 *
 * Dipindah apa adanya dari legacy-app.js (Phase 7). Sudah berdiri sendiri
 * sejak semula: hanya menyimpan daftar gambar & indeks aktif, tidak
 * menyentuh state lain di aplikasi. openLightbox() dipanggil lewat
 * data-action="openLightbox" (presentation/controllers/action-dispatcher.js,
 * Phase 9); pemanggilnya memakai jsArg() untuk membawa array nama file dengan
 * aman lewat atribut data-images.
 *
 * Gambar sungguhan tidak pernah diunggah aplikasi ini (tidak ada backend) —
 * placeholder SVG dipakai sebagai ganti foto asli, memuat nama filenya.
 */

import { svgText } from '../../shared/html.js';

let lightboxImages = [];
let currentLightboxIndex = 0;

function placeholderSvg(filename) {
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400'%3E%3Crect width='600' height='400' fill='%232a2a2a'/%3E%3Ctext x='50%25' y='45%25' text-anchor='middle' fill='%23666' font-size='40' font-family='sans-serif'%3E📷%3C/text%3E%3Ctext x='50%25' y='60%25' text-anchor='middle' fill='%23888' font-size='20' font-family='sans-serif'%3E${svgText(filename)}%3C/text%3E%3C/svg%3E`;
}

export function openLightbox(images, index = 0) {
    if (!images || images.length === 0) return;
    lightboxImages = images;
    currentLightboxIndex = index;
    const overlay = document.getElementById('lightboxOverlay');
    const img = document.getElementById('lightboxImage');
    const info = document.getElementById('lightboxFileName');
    const counter = document.getElementById('lightboxCounter');

    img.src = placeholderSvg(images[index]);
    info.textContent = images[index];
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
    img.src = placeholderSvg(lightboxImages[currentLightboxIndex]);
    info.textContent = lightboxImages[currentLightboxIndex];
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
