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
