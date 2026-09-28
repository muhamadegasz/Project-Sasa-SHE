/* signature-rules.js — aturan tanda tangan pada persetujuan (Phase 17.4A).
 *
 * Persetujuan WAJIB bertanda tangan; penolakan TIDAK PERNAH bertanda tangan.
 * Dua cara membuat tanda tangan (SIGNATURE_METHOD di statuses.js), keduanya
 * berakhir sebagai satu gambar:
 *
 *   UPLOAD — berkas gambar yang diunggah: PNG atau JPEG.
 *   CANVAS — gambar coretan di kanvas browser, dikirim sebagai berkas PNG.
 *
 * Ini "tanda tangan digital" dalam arti pembubuhan gambar tanda tangan,
 * BUKAN tanda tangan elektronik tersertifikasi.
 *
 * `mimeType` yang diperiksa di sini harus hasil DETEKSI ISI berkas
 * (server/config/upload.js detectSignatureMimeType), bukan klaim klien —
 * aturan ini murni dan tidak membaca byte sendiri.
 */

import { SIGNATURE_METHOD } from './statuses.js';

/**
 * Batas ukuran berkas tanda tangan: 1 MB. Tanda tangan bukan foto resolusi
 * tinggi — PNG dari kanvas umumnya puluhan KB, pindaian/foto yang dipotong
 * wajar jauh di bawah 1 MB. Sengaja lebih kecil dari batas foto (5 MB).
 */
export const SIGNATURE_MAX_BYTES = 1024 * 1024;

/** Format gambar yang sah per metode. CANVAS selalu PNG. */
export const SIGNATURE_MIME_TYPES = {
    [SIGNATURE_METHOD.UPLOAD]: ['image/png', 'image/jpeg'],
    [SIGNATURE_METHOD.CANVAS]: ['image/png'],
};

/** Ekstensi berkas tersimpan, diturunkan dari format HASIL DETEKSI — tidak pernah dari nama berkas klien. */
export const SIGNATURE_EXTENSIONS = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
};

/**
 * Memeriksa tanda tangan untuk sebuah persetujuan.
 *
 * `signature`: { method, mimeType, size, file } atau null/undefined.
 *   method   — 'upload' | 'canvas' dari isian pemanggil
 *   mimeType — format hasil deteksi isi berkas, atau null bila tidak dikenali
 *   size     — ukuran berkas dalam byte
 *   file     — isi berkas (Buffer di server, File/Blob di browser); opaque di sini
 *
 * @returns {{ value: { method, mimeType, size, file } }
 *         | { error: 'REQUIRED' | 'METHOD_INVALID' | 'CONTENT_INVALID' | 'TOO_LARGE' }}
 */
export function checkSignature(signature) {
    if (!signature || !signature.file) return { error: 'REQUIRED' };

    const method = signature.method;
    if (typeof method !== 'string' || !Object.hasOwn(SIGNATURE_MIME_TYPES, method)) return { error: 'METHOD_INVALID' };

    const size = Number(signature.size);
    if (!Number.isFinite(size) || size <= 0) return { error: 'CONTENT_INVALID' };
    if (size > SIGNATURE_MAX_BYTES) return { error: 'TOO_LARGE' };

    if (!SIGNATURE_MIME_TYPES[method].includes(signature.mimeType)) return { error: 'CONTENT_INVALID' };

    return { value: { method, mimeType: signature.mimeType, size, file: signature.file } };
}

/*
 * Watermark (Phase 17.4D) — opsional, terpisah dari sah/tidaknya tanda tangan.
 * Teks "SHE Sasa" yang digambar UI di atas gambar tanda tangan; yang disimpan
 * hanya posisinya (approvals.watermark_*), berkas tanda tangan tidak diubah.
 * Posisi = titik TENGAH watermark, ternormalisasi 0..1 terhadap lebar/tinggi
 * gambar tanda tangan ((0,0) kiri atas). Ukuran dan opacity tetap dari sistem.
 * Watermark hanya penanda visual, bukan tanda tangan elektronik tersertifikasi.
 */

/** Posisi awal saat watermark diaktifkan: tengah tanda tangan. */
export const WATERMARK_DEFAULT_POSITION = Object.freeze({ x: 0.5, y: 0.5 });

/** Kolom watermark_x/y DECIMAL(5,4): posisi dibulatkan ke 4 desimal. */
const WATERMARK_PRECISION = 10000;

/** Angka desimal biasa dari field multipart — bukan '', spasi, '1e-1', '0x1', 'Infinity'. */
const DECIMAL_TEXT = /^\d+(\.\d+)?$/;

function toWatermarkCoordinate(value) {
    let number = null;
    if (typeof value === 'number') number = value;
    else if (typeof value === 'string' && DECIMAL_TEXT.test(value)) number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 1) return null;
    return Math.round(number * WATERMARK_PRECISION) / WATERMARK_PRECISION;
}

/**
 * Memeriksa watermark sebuah persetujuan.
 *
 * `watermark`: { enabled, x, y } dari isian, atau null/undefined (= tidak aktif).
 *   enabled — true/false, atau 'true'/'false' (field multipart)
 *   x, y    — angka atau teks desimal, 0..1; wajib bila aktif, tidak boleh
 *             diisi bila tidak aktif (tidak diabaikan diam-diam)
 *
 * @returns {{ value: { x, y } | null }
 *         | { error: 'INVALID' | 'POSITION_REQUIRED' | 'POSITION_INVALID' }}
 */
export function checkWatermark(watermark) {
    if (watermark == null) return { value: null };
    const { enabled, x, y } = watermark;

    if (enabled === undefined || enabled === false || enabled === 'false') {
        return x == null && y == null ? { value: null } : { error: 'INVALID' };
    }
    if (enabled !== true && enabled !== 'true') return { error: 'INVALID' };

    if (x == null || y == null || x === '' || y === '') return { error: 'POSITION_REQUIRED' };
    const position = { x: toWatermarkCoordinate(x), y: toWatermarkCoordinate(y) };
    if (position.x === null || position.y === null) return { error: 'POSITION_INVALID' };
    return { value: position };
}
