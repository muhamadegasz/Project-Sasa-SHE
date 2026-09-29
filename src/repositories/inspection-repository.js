/* inspection-repository.js — pemilik tunggal koleksi data inspeksi, versi
 * BROWSER (Phase 14).
 *
 * Sejak Phase 14: seluruh fungsi bicara ke backend lewat api-client.js,
 * bukan array in-memory lagi. Backend punya implementasinya sendiri di
 * server/repositories/inspection-repository.js (query MySQL) — signature
 * fungsi sama persis, dipertukarkan lewat specifier
 * "#repositories/inspection-repository.js" (lihat docs/ROADMAP-PHASE12.md,
 * docs/DECISIONS.md K-18).
 *
 * recordDecision()/addCorrectiveAction() TIDAK menyimpan data
 * mentah seperti versi MySQL — endpoint backend yang dipanggil di sini
 * (POST .../approve, .../reject, .../corrective-actions) adalah AKSI BISNIS
 * lengkap (approval-service.js/corrective-action-service.js dijalankan LAGI,
 * penuh, di server, dengan data yang sungguh terbaru), bukan operasi tulis
 * baris-per-baris. Record keputusan/status yang dikirim pemanggil di
 * sini karena itu SENGAJA tidak dipakai untuk membangun body request — server
 * selalu menjadi sumber kebenaran, persis seperti `petugas`/`approvedByName`
 * yang sudah dipaksa dari sesi login sejak Phase 12/13. Lihat
 * docs/DECISIONS.md entri Phase 14.
 */

import { apiDelete, apiGet, apiGetBlob, apiPost, apiPut } from '../infrastructure/api-client.js';
import { APPROVAL_DECISION } from '../domain/statuses.js';
import { localDateToIso } from '../shared/date.js';

/**
 * "D/M/YYYY" (format lokal — inspection-service.js `create()` sudah memanggil
 * formatDate() atas tanggal/dueDate SEBELUM add() dipanggil, lihat header
 * berkas ini) -> "YYYY-MM-DD" ISO. Wajib dikonversi balik di sini: backend
 * menjalankan inspection-service.js `create()` LAGI dari awal dan memanggil
 * formatDate() SEKALI LAGI atas apa pun yang dikirim sebagai tanggal/dueDate
 * — memformat string yang sudah dalam format lokal sebagai kalau itu ISO
 * menghasilkan "Invalid Date" (lalu NULL di kolom MySQL, ER_BAD_NULL_ERROR).
 * Ditemukan lewat pengujian browser sungguhan (Playwright), bukan test
 * otomatis — lihat docs/DECISIONS.md entri Phase 14.
 */
const toIsoDate = localDateToIso;

/** Seluruh inspeksi, urutan terbaru di depan (backend mengurutkan ORDER BY id DESC). */
export async function getAll() {
    return apiGet('/inspections');
}

/**
 * Satu halaman inspeksi — cakupan, pencarian, urutan, dan LIMIT/OFFSET di
 * server. @returns {{ items: object[], pagination: { page, limit, total, totalPages } }}
 */
export async function getPage({ page, limit, search = '' }) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set('q', search);
    return apiGet(`/inspections?${params}`);
}

/** Satu inspeksi berdasarkan id, atau undefined bila tidak ada (404). */
export async function findById(id) {
    try {
        return await apiGet(`/inspections/${encodeURIComponent(id)}`);
    } catch (error) {
        if (error.status === 404) return undefined;
        throw error;
    }
}

/**
 * Menyimpan inspeksi baru. Mengirim seluruh objek yang sudah dibangun
 * inspection-service.js (termasuk approvals/perbaikan yang dihitung di sisi
 * klien) — backend mengabaikan field itu dan menghitung ulang sendiri dari
 * plantId/temuan/tanggal (lihat inspection-service.js `create()`, dipakai
 * ulang APA ADANYA oleh backend). Pengecualian: tanggal/dueDate DIKONVERSI
 * BALIK ke ISO (toIsoDate() di atas) sebelum dikirim — backend memanggil
 * formatDate() atas keduanya lagi, dan itu bukan operasi yang aman dipanggil
 * dua kali (lihat komentar toIsoDate()).
 *
 * Phase 15: fotoDekat/fotoJauh berisi File asli (bukan nama file) sejak
 * legacy-app.js diubah — dikirim lewat FormData (multipart), bukan JSON,
 * supaya byte-nya sungguhan sampai ke server (lihat api-client.js `request()`).
 * temuan (array objek) tidak bisa ikut sebagai field FormData biasa, jadi
 * dikirim sebagai string JSON dan di-parse balik oleh route handler backend.
 */
export async function add(inspection) {
    const { inspection: created } = await apiPost('/inspections', contentFormData(inspection));
    return created;
}

/** Isi inspeksi sebagai FormData — dipakai add() dan update(). Hanya field konten. */
function contentFormData(content) {
    const formData = new FormData();
    formData.append('plantId', content.plantId);
    formData.append('keteranganLokasi', content.keteranganLokasi ?? '');
    formData.append('tanggal', toIsoDate(content.tanggal) || '');
    formData.append('dueDate', toIsoDate(content.dueDate) || '');
    formData.append('temuan', JSON.stringify(content.temuan || []));
    for (const file of content.fotoDekat || []) formData.append('fotoDekat', file);
    for (const file of content.fotoJauh || []) formData.append('fotoJauh', file);
    return formData;
}

/**
 * Phase 17.3B — tiga fungsi di bawah memicu endpoint aksi bisnis penuh
 * (inspection-service dijalankan LAGI di server, dengan data server dan
 * identitas dari sesi). Argumen status/pemilik yang dipakai versi MySQL
 * sengaja tidak dikirim. Penolakan server (4xx) dilempar sebagai ApiError.
 */

/** Menyimpan isi draft/revisi (PUT). @returns {Promise<boolean>} */
export async function update(inspectionId, fields, _options) {
    await apiPut(`/inspections/${encodeURIComponent(inspectionId)}`, contentFormData(fields));
    return true;
}

/** Mengajukan / mengajukan ulang. @returns {Promise<boolean>} */
export async function submit(inspectionId, _expectedStatus, _nextState, _initialActions) {
    await apiPost(`/inspections/${encodeURIComponent(inspectionId)}/submit`);
    return true;
}

/** Menghapus draft milik sendiri. @returns {Promise<boolean>} */
export async function removeDraft(inspectionId) {
    await apiDelete(`/inspections/${encodeURIComponent(inspectionId)}`);
    return true;
}

/**
 * Phase 18: Admin menghapus inspeksi non-draft — endpoint yang sama; server
 * memilih jalur Admin dari sesi dan menjalankan ulang seluruh pemeriksaan.
 * @returns {Promise<boolean>}
 */
export async function removeAsAdmin(inspectionId) {
    await apiDelete(`/inspections/${encodeURIComponent(inspectionId)}`);
    return true;
}

/**
 * Menyetujui/menolak tahap yang sedang berjalan — memicu endpoint aksi bisnis
 * penuh di backend (approve() atau reject() dijalankan LAGI di sana, dengan
 * data server yang terbaru). Hanya tahap (sebagai penjaga "layar basi"),
 * alasan penolakan, dan — Phase 17.4A — tanda tangan persetujuan yang
 * dikirim; identitas penyetuju, attempt, dan status berikutnya selalu
 * dihitung server, bukan diambil dari body request. Tanda tangan dikirim
 * sebagai berkas (multipart), dan format sungguhannya dideteksi ulang server.
 * Penolakan server (4xx) dilempar sebagai ApiError oleh api-client.js.
 *
 * @returns {Promise<boolean>} true — sama dengan kontrak versi MySQL
 */
export async function recordDecision(inspectionId, decision, _nextState, signature = null) {
    const base = `/inspections/${encodeURIComponent(inspectionId)}`;
    if (decision.decision === APPROVAL_DECISION.REJECTED) {
        await apiPost(`${base}/reject`, { stageId: decision.stage, reason: decision.rejectionReason });
    } else {
        const formData = new FormData();
        formData.append('stageId', decision.stage);
        if (signature) {
            formData.append('signatureMethod', signature.method);
            formData.append('signature', signature.file);
        }
        // Phase 17.4D: posisi watermark hanya dikirim bila aktif.
        formData.append('watermarkEnabled', decision.watermark ? 'true' : 'false');
        if (decision.watermark) {
            formData.append('watermarkX', String(decision.watermark.x));
            formData.append('watermarkY', String(decision.watermark.y));
        }
        await apiPost(`${base}/approve`, formData);
    }
    return true;
}

/** Menambahkan satu tindakan perbaikan lewat endpoint aksi bisnis penuh (foto wajib ditegakkan ulang di server). Phase 15: action.foto berisi File asli, dikirim lewat FormData. */
export async function addCorrectiveAction(inspectionId, action) {
    const formData = new FormData();
    formData.append('action', action.action);
    formData.append('status', action.status);
    formData.append('pic', action.pic);
    for (const file of action.foto || []) formData.append('photos', file);

    const { action: created } = await apiPost(`/inspections/${encodeURIComponent(inspectionId)}/corrective-actions`, formData);
    return created;
}

/**
 * Release: mengubah status satu tindakan perbaikan. Server menjalankan ulang
 * seluruh pemeriksaan (pemilik, belum selesai, maju saja); hanya status
 * tujuan yang dikirim. Penolakan (4xx) dilempar sebagai ApiError.
 * @returns {Promise<boolean>} true — sama dengan kontrak versi MySQL
 */
export async function updateCorrectiveActionStatus(inspectionId, actionId, _fromStatus, toStatus) {
    await apiPut(
        `/inspections/${encodeURIComponent(inspectionId)}/corrective-actions/${encodeURIComponent(actionId)}`,
        { status: toStatus },
    );
    return true;
}

/**
 * Release: gambar tanda tangan satu keputusan (Blob), lewat endpoint
 * terotorisasi yang sama dengan riwayat pengesahan
 * (GET /inspections/:id/approvals/:approvalId/signature). Dipakai PDF.
 */
export async function fetchSignatureImage(inspectionId, approvalId) {
    return apiGetBlob(`/inspections/${encodeURIComponent(inspectionId)}/approvals/${encodeURIComponent(approvalId)}/signature`);
}

/**
 * Berkas satu foto dokumentasi sebagai Blob — endpoint yang sama dengan
 * Detail/lightbox (sesi + cakupan visibilitas inspeksi), untuk laporan PDF.
 */
export async function fetchPhotoImage(photoId) {
    return apiGetBlob(`/inspections/photos/${encodeURIComponent(photoId)}/file`);
}

/** Jumlah inspeksi. Tidak ada endpoint hitung khusus — dihitung dari panjang array. */
export async function count() {
    return (await getAll()).length;
}
