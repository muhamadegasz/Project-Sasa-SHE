/* watermark.js — watermark "SHE Sasa" untuk keluaran PDF (release).
 *
 * Geometrinya SAMA dengan watermark di pratinjau tanda tangan dan riwayat
 * pengesahan (SVG viewBox 120×28 di index.html / approval.view.js, gaya
 * .signature-watermark di 08-approval.css): lebar 45% lebar gambar tanda
 * tangan, rasio 120:28, opacity 0.35, warna #d42a2a, dan (x, y) tersimpan
 * adalah TITIK TENGAH ternormalisasi 0..1 (domain/signature-rules.js). Posisi
 * tersimpan adalah sumber kebenaran — tidak pernah diubah atau dibatasi ulang.
 *
 * html2canvas (dipakai html2pdf) tidak andal merender SVG bergaya CSS, jadi
 * untuk PDF tanda tangan + watermark digambar ke kanvas menjadi SATU gambar
 * baru di memori. Berkas tanda tangan yang tersimpan tidak pernah disentuh.
 */

export const WATERMARK_TEXT = 'SHE Sasa';
export const WATERMARK_WIDTH_RATIO = 0.45;
export const WATERMARK_OPACITY = 0.35;
export const WATERMARK_COLOR = '#d42a2a';
const VIEWBOX_WIDTH = 120;
const VIEWBOX_HEIGHT = 28;

/** Tanda tangan kecil diperbesar sampai lebar ini supaya teks watermark tetap terbaca di PDF. */
const MIN_RENDER_WIDTH = 600;

/**
 * Kotak watermark (piksel) di atas gambar `width`×`height`, untuk posisi
 * tengah `{x, y}` 0..1. Murni — dipakai kanvas dan diuji tanpa browser.
 */
export function watermarkBox(width, height, position) {
    const boxWidth = width * WATERMARK_WIDTH_RATIO;
    const boxHeight = boxWidth * (VIEWBOX_HEIGHT / VIEWBOX_WIDTH);
    return {
        left: position.x * width - boxWidth / 2,
        top: position.y * height - boxHeight / 2,
        width: boxWidth,
        height: boxHeight,
    };
}

/** Menggambar watermark ke `context` kanvas berukuran `width`×`height`. */
export function drawWatermark(context, width, height, position) {
    const box = watermarkBox(width, height, position);
    const unit = box.width / VIEWBOX_WIDTH;
    context.save();
    context.globalAlpha = WATERMARK_OPACITY;
    context.translate(box.left, box.top);
    context.scale(unit, unit);
    context.strokeStyle = WATERMARK_COLOR;
    context.fillStyle = WATERMARK_COLOR;
    // Sama dengan <rect x="2" y="2" width="116" height="24" rx="6"> ber-stroke 2.
    context.lineWidth = 2;
    const [x, y, w, h, r] = [2, 2, 116, 24, 6];
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
    context.stroke();
    // Sama dengan <text x="60" y="20"> 700 18px, rata tengah.
    context.font = '700 18px "Segoe UI", Roboto, system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillText(WATERMARK_TEXT, 60, 20);
    context.restore();
}

/**
 * Gambar tanda tangan (`blob`) dengan watermark di `position` (atau tanpa
 * watermark bila null) sebagai Blob PNG baru — hanya untuk dirender.
 */
export async function composeSignature(blob, position) {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.max(1, MIN_RENDER_WIDTH / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    if (position) drawWatermark(context, canvas.width, canvas.height, position);
    return new Promise((resolve, reject) => {
        canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Tanda tangan tidak bisa dirender'))), 'image/png');
    });
}
