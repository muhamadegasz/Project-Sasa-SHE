/* signature-storage.js — Phase 17.4A: penerimaan & penyimpanan berkas tanda
 * tangan persetujuan.
 *
 * Berbeda dari foto (upload.js) dengan sengaja:
 *   - memoryStorage, bukan diskStorage: batasnya kecil (1 MB, satu berkas),
 *     dan isi berkas diverifikasi SEBELUM apa pun ditulis ke disk — berkas
 *     yang ditolak tidak pernah menyentuh disk.
 *   - Hanya PNG/JPEG (foto boleh juga GIF/WEBP). Deteksinya memakai
 *     detectImageMimeTypeFromBytes() yang sama dengan foto, lalu dipersempit.
 *   - Tidak ada fileFilter atas Content-Type klien: klaim klien tidak dipakai
 *     sama sekali, yang menentukan hanya byte berkas.
 *   - Berkas ditulis oleh repository (recordDecision) DI DALAM transaksi,
 *     setelah penjaga status/tahap lolos — lihat
 *     server/repositories/inspection-repository.js.
 *
 * Lokasi: uploads/signatures/<uuid>.<png|jpg>. Nama & ekstensi dibuat server
 * (ekstensi dari format hasil deteksi), path yang disimpan di DB relatif
 * terhadap UPLOAD_DIR. Folder ini tidak disajikan statis oleh Express; karena
 * vhost Laragon menjadikan folder proyek DocumentRoot Apache, folder ini juga
 * diberi .htaccess "Require all denied" (dibuat otomatis saat server mulai).
 * Satu-satunya jalan membaca berkasnya: GET /api/inspections/:id/approvals/
 * :approvalId/signature (butuh sesi + visibilitas inspeksi).
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { UPLOAD_DIR, detectImageMimeTypeFromBytes } from './upload.js';
import { SIGNATURE_EXTENSIONS, SIGNATURE_MAX_BYTES } from '../../src/domain/signature-rules.js';

const SIGNATURE_SUBDIR = 'signatures';
export const SIGNATURE_DIR = path.join(UPLOAD_DIR, SIGNATURE_SUBDIR);

mkdirSync(SIGNATURE_DIR, { recursive: true });
const HTACCESS = path.join(SIGNATURE_DIR, '.htaccess');
if (!existsSync(HTACCESS)) writeFileSync(HTACCESS, 'Require all denied\n');

const SIGNATURE_MIME_TYPES = new Set(Object.keys(SIGNATURE_EXTENSIONS));

/** Path tersimpan yang sah: persis "signatures/<uuid>.png|jpg" — tidak ada bentuk lain yang pernah dibaca/dihapus. */
const STORED_PATH = /^signatures\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$/;

/** Format tanda tangan dari ISI berkas: 'image/png' | 'image/jpeg', atau null (termasuk GIF/WEBP/SVG/HTML/acak). */
export function detectSignatureMimeType(bytes) {
    const detected = detectImageMimeTypeFromBytes(bytes);
    return SIGNATURE_MIME_TYPES.has(detected) ? detected : null;
}

export function isStoredSignaturePath(storedPath) {
    return typeof storedPath === 'string' && STORED_PATH.test(storedPath);
}

const signatureUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: SIGNATURE_MAX_BYTES, files: 1, fields: 5, fieldSize: 1024 },
}).single('signature');

/**
 * Mem-parsing multipart POST .../approve: berkas di field `signature` (paling
 * banyak satu, paling besar SIGNATURE_MAX_BYTES) ke req.file.buffer. Body JSON
 * (tanpa multipart) lewat tanpa tersentuh. Pelanggaran batas dijawab 400 di
 * sini, tanpa ada yang tersimpan.
 */
export function parseSignatureUpload(req, res, next) {
    signatureUpload(req, res, (error) => {
        if (!error) return next();
        if (error instanceof multer.MulterError) {
            const reason = error.code === 'LIMIT_FILE_SIZE' ? 'SIGNATURE_TOO_LARGE' : 'SIGNATURE_CONTENT_INVALID';
            return res.status(400).json({ error: reason, data: null });
        }
        next(error);
    });
}

/**
 * Menulis isi tanda tangan yang SUDAH lolos checkSignature() ke disk dengan
 * nama buatan server. Isi dideteksi ulang di sini (pertahanan berlapis) —
 * tidak ada yang ditulis bila tidak cocok. 'wx': tidak pernah menimpa berkas.
 *
 * @returns {Promise<string>} path relatif terhadap UPLOAD_DIR, untuk disimpan di DB
 */
export async function storeSignatureFile(bytes, mimeType) {
    if (!Buffer.isBuffer(bytes) || detectSignatureMimeType(bytes) !== mimeType) {
        throw new Error('storeSignatureFile: isi berkas tidak cocok dengan format yang sudah divalidasi');
    }
    const storedPath = `${SIGNATURE_SUBDIR}/${randomUUID()}${SIGNATURE_EXTENSIONS[mimeType]}`;
    await writeFile(path.join(UPLOAD_DIR, storedPath), bytes, { flag: 'wx' });
    return storedPath;
}

/** Menghapus SATU berkas tanda tangan milik operasi yang gagal. Best-effort; path di luar pola tidak pernah disentuh. */
export async function removeSignatureFile(storedPath) {
    if (!isStoredSignaturePath(storedPath)) return;
    await unlink(path.join(UPLOAD_DIR, storedPath)).catch(() => {});
}
