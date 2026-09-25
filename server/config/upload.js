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
import { open as fsOpen, unlink } from 'node:fs/promises';
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

// accept="image/*" di HTML cuma hint klien, dan fileFilter di bawah ini HANYA
// memeriksa header Content-Type yang diklaim klien pada bagian multipart —
// bukan byte sungguhan (fileFilter dipanggil multer sebelum body file itu
// di-stream, jadi tidak pernah punya akses ke isinya). Audit Phase 15 (F-01)
// membuktikan ini bisa dilewati trivial (curl -F "...;type=image/jpeg" pada
// file HTML/SVG apa pun). Dipertahankan sebagai saringan murah/cepat untuk
// request yang salah tipe secara jujur — penegakan SUNGGUHAN ada di
// verifyImageContent() di bawah, jalan SETELAH multer menulis file ke disk.
export const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 10 },
    fileFilter: (req, file, cb) => cb(null, ALLOWED_MIME_TYPES.has(file.mimetype)),
});

/**
 * Signature byte pertama tiap format — PERSIS 4 format yang sama seperti
 * ALLOWED_MIME_TYPES di atas, sengaja tidak diperluas (lihat docs/DECISIONS.md
 * Phase 15.1). WEBP butuh 12 byte (RIFF....WEBP), format lain lebih pendek.
 */
const SIGNATURES = [
    { mime: 'image/jpeg', check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { mime: 'image/png', check: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => b[i] === byte) },
    { mime: 'image/gif', check: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61 },
    { mime: 'image/webp', check: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
];

async function detectImageMimeType(filePath) {
    const handle = await fsOpen(filePath, 'r');
    try {
        const buffer = Buffer.alloc(12);
        await handle.read(buffer, 0, 12, 0);
        return SIGNATURES.find((sig) => sig.check(buffer))?.mime ?? null;
    } finally {
        await handle.close();
    }
}

function flattenFiles(files) {
    if (!files) return [];
    return Array.isArray(files) ? files : Object.values(files).flat();
}

/** F-04: dipanggil dari route handler saat operasi SETELAH upload gagal (validasi bisnis atau error DB) — menghapus HANYA file milik request yang sedang gagal ini (req.files), tidak pernah menyentuh file lain. Best-effort: kegagalan hapus (mis. file sudah tidak ada) sengaja diabaikan, tidak boleh menutupi error asli yang sedang ditangani pemanggil. */
export async function cleanupUploadedFiles(req) {
    for (const file of flattenFiles(req.files)) {
        await unlink(file.path).catch(() => {});
    }
}

/**
 * F-01: fileFilter di atas cuma memeriksa klaim klien. Middleware ini jalan
 * SETELAH multer selesai menulis file ke disk, membaca 12 byte pertama tiap
 * file dan mencocokkannya ke signature sungguhan. File yang isinya tidak
 * cocok signature manapun -> SELURUH file request ini dihapus (F-04 — bukan
 * cuma yang gagal, supaya tidak ada kombinasi file tersimpan-sebagian) dan
 * request ditolak 400, sebelum menyentuh business logic sama sekali.
 *
 * mimetype tiap file DITIMPA dengan hasil deteksi (bukan lagi klaim
 * klien) — filesToPhotoMeta() di inspections.routes.js membaca file.mimetype
 * setelah ini berjalan, jadi mime_type yang akhirnya tersimpan ke DB (dan
 * dipakai lagi sebagai Content-Type saat foto disajikan kembali, F-02) adalah
 * hasil verifikasi server, bukan input klien — tanpa perlu mengubah
 * filesToPhotoMeta() itu sendiri.
 */
export async function verifyImageContent(req, res, next) {
    const files = flattenFiles(req.files);
    if (files.length === 0) return next();

    for (const file of files) {
        const detected = await detectImageMimeType(file.path);
        if (!detected) {
            await cleanupUploadedFiles(req);
            return res.status(400).json({ error: 'INVALID_FILE_CONTENT' });
        }
        file.mimetype = detected;
    }
    next();
}
