/* upload.js — Phase 15: instance multer bersama untuk kedua endpoint yang
 * menerima foto (POST /inspections, POST /inspections/:id/corrective-actions).
 *
 * diskStorage, bukan memoryStorage: foto SHE bisa berukuran beberapa MB per
 * file dan beberapa file sekaligus per request — menahannya di memori
 * proses Node sebelum ditulis tidak perlu, disk lokal (Laragon, deployment
 * sendiri) sudah cukup. Nama file di disk di-random (bukan nama asli
 * pengguna) supaya tidak ada tabrakan nama DAN supaya path traversal lewat
 * nama file tidak mungkin terjadi — nama asli tetap disimpan apa adanya di
 * kolom `original_name` (lihat server/repositories/inspection-repository.js)
 * untuk ditampilkan kembali ke pengguna.
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const storage = multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, randomUUID() + path.extname(file.originalname)),
});

// accept="image/*" di HTML cuma hint klien — fileFilter di sini yang
// sungguhan menegakkan tipe file, tidak pernah percaya Content-Type klien
// begitu saja untuk keputusan keamanan, tapi cukup memadai untuk mencegah
// upload tak sengaja/iseng file bukan gambar pada aplikasi internal ini.
export const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 10 },
    fileFilter: (req, file, cb) => cb(null, ALLOWED_MIME_TYPES.has(file.mimetype)),
});
