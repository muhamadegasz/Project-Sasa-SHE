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
 * saveApproval()/setStatus()/addCorrectiveAction() TIDAK menyimpan data
 * mentah seperti versi MySQL — endpoint backend yang dipanggil di sini
 * (POST .../approve, .../reject, .../corrective-actions) adalah AKSI BISNIS
 * lengkap (approval-service.js/corrective-action-service.js dijalankan LAGI,
 * penuh, di server, dengan data yang sungguh terbaru), bukan operasi tulis
 * baris-per-baris. Parameter `record`/`status` yang dikirim pemanggil di
 * sini karena itu SENGAJA tidak dipakai untuk membangun body request — server
 * selalu menjadi sumber kebenaran, persis seperti `petugas`/`approvedByName`
 * yang sudah dipaksa dari sesi login sejak Phase 12/13. Lihat
 * docs/DECISIONS.md entri Phase 14.
 */

import { apiGet, apiPost } from '../infrastructure/api-client.js';

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
function toIsoDate(localDate) {
    if (!localDate || localDate === '-') return undefined;
    const [day, month, year] = String(localDate).split('/');
    if (!day || !month || !year) return undefined;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** Seluruh inspeksi, urutan terbaru di depan (backend mengurutkan ORDER BY id DESC). */
export async function getAll() {
    return apiGet('/inspections');
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
    const formData = new FormData();
    formData.append('plantId', inspection.plantId);
    formData.append('keteranganLokasi', inspection.keteranganLokasi ?? '');
    formData.append('tanggal', toIsoDate(inspection.tanggal) || '');
    formData.append('status', inspection.status ?? '');
    formData.append('dueDate', toIsoDate(inspection.dueDate) || '');
    formData.append('temuan', JSON.stringify(inspection.temuan || []));
    for (const file of inspection.fotoDekat || []) formData.append('fotoDekat', file);
    for (const file of inspection.fotoJauh || []) formData.append('fotoJauh', file);

    const { inspection: created } = await apiPost('/inspections', formData);
    return created;
}

/**
 * Menyetujui/menolak satu tahap — memicu endpoint aksi bisnis penuh di
 * backend (approve() atau reject() dijalankan LAGI di sana, dengan data
 * server yang terbaru). `record.rejected` yang menentukan endpoint mana yang
 * dipanggil; `approverId` diabaikan di sini karena server selalu mengambil
 * identitas dari sesi login, bukan dari body request.
 */
export async function saveApproval(inspectionId, stageId, record) {
    const path = record.rejected
        ? `/inspections/${encodeURIComponent(inspectionId)}/reject`
        : `/inspections/${encodeURIComponent(inspectionId)}/approve`;
    await apiPost(path, { stageId });
}

/**
 * No-op di sini: status inspeksi sudah ikut diperbarui backend sebagai efek
 * samping saveApproval()/addCorrectiveAction() di atas (masing-masing
 * memanggil approval-service.js/corrective-action-service.js penuh di
 * server, yang sudah menghitung dan menyimpan status baru sendiri).
 */
export async function setStatus(_inspectionId, _status) {}

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

/** Jumlah inspeksi. Tidak ada endpoint hitung khusus — dihitung dari panjang array. */
export async function count() {
    return (await getAll()).length;
}
