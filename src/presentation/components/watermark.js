/* watermark.js — watermark logo perusahaan (src/asset/company_logo.png).
 *
 * Satu sumber untuk ketiga tampilan watermark: pratinjau di modal tanda
 * tangan (signature-modal.view.js), riwayat pengesahan (approval.view.js),
 * dan PDF (composeSignature di bawah). Geometrinya SAMA dengan aturan CSS
 * .signature-watermark di 08-approval.css:
 *
 *   - (x, y) tersimpan = TITIK TENGAH logo, ternormalisasi 0..1 terhadap gambar
 *     tanda tangan (domain/signature-rules.js) — posisi tersimpan adalah
 *     sumber kebenaran, tidak pernah diubah atau dibatasi ulang saat dirender;
 *   - ukuran logo "contain": selebar-lebarnya 35% lebar tanda tangan dan
 *     setinggi-tingginya 65% tingginya, rasio aspek asli logo selalu dijaga
 *     (tidak pernah gepeng) — satu aturan ukuran untuk semua tampilan;
 *   - opacity tetap 0.35; transparansi latar logo ikut dipertahankan.
 *
 * html2canvas (dipakai html2pdf) tidak dipakai untuk watermark PDF: tanda
 * tangan + logo digambar ke kanvas menjadi SATU gambar baru di memori.
 * Berkas tanda tangan yang tersimpan tidak pernah disentuh.
 */

/** Aset lokal (bukan CDN), relatif terhadap modul ini — sama di halaman mana pun aplikasi dibuka. */
export const WATERMARK_LOGO_URL = new URL('../../asset/company_logo.png', import.meta.url).href;
export const WATERMARK_MAX_WIDTH_RATIO = 0.35;
export const WATERMARK_MAX_HEIGHT_RATIO = 0.65;
export const WATERMARK_OPACITY = 0.35;

/** Tanda tangan kecil diperbesar sampai lebar ini supaya logo tetap jelas di PDF. */
const MIN_RENDER_WIDTH = 600;

/**
 * Kotak logo (piksel) di atas gambar `width`×`height`, untuk posisi tengah
 * `{x, y}` 0..1 dan rasio aspek logo `aspect` (lebar/tinggi, dari gambar logo
 * yang sesungguhnya dimuat — tidak diasumsikan). Murni, diuji tanpa browser.
 */
export function watermarkBox(width, height, position, aspect) {
    const boxWidth = Math.min(width * WATERMARK_MAX_WIDTH_RATIO, height * WATERMARK_MAX_HEIGHT_RATIO * aspect);
    const boxHeight = boxWidth / aspect;
    return {
        left: position.x * width - boxWidth / 2,
        top: position.y * height - boxHeight / 2,
        width: boxWidth,
        height: boxHeight,
    };
}

let logoPromise = null;

/**
 * Gambar logo yang sudah SIAP digambar (decode selesai). Dimuat sekali lalu
 * dipakai ulang; bila gagal, percobaan berikutnya memuat ulang.
 * @returns {Promise<HTMLImageElement>}
 */
export function loadWatermarkLogo() {
    if (!logoPromise) {
        const image = new Image();
        image.src = WATERMARK_LOGO_URL;
        logoPromise = image.decode().then(() => image, (error) => {
            logoPromise = null;
            throw new Error(`Logo watermark gagal dimuat: ${error && error.message}`);
        });
    }
    return logoPromise;
}

/** Menggambar logo ke `context` kanvas berukuran `width`×`height` di posisi tengah `position`. */
export function drawWatermark(context, width, height, position, logo) {
    const box = watermarkBox(width, height, position, logo.naturalWidth / logo.naturalHeight);
    context.save();
    context.globalAlpha = WATERMARK_OPACITY;
    context.drawImage(logo, box.left, box.top, box.width, box.height);
    context.restore();
}

/**
 * Gambar tanda tangan (`blob`) dengan logo di `position` (atau tanpa watermark
 * bila null) sebagai Blob PNG baru — hanya untuk dirender. Logo dipastikan
 * sudah termuat sebelum digambar.
 */
export async function composeSignature(blob, position) {
    const logo = position ? await loadWatermarkLogo() : null;
    const bitmap = await createImageBitmap(blob);
    const scale = Math.max(1, MIN_RENDER_WIDTH / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    if (logo) drawWatermark(context, canvas.width, canvas.height, position, logo);
    return new Promise((resolve, reject) => {
        canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Tanda tangan tidak bisa dirender'))), 'image/png');
    });
}
