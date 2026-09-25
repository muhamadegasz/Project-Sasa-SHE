/* schedule-repository.js — pemilik tunggal koleksi data jadwal, versi
 * BROWSER (Phase 14).
 *
 * Sejak Phase 14: bicara ke backend lewat api-client.js. Backend punya
 * implementasinya sendiri di server/repositories/schedule-repository.js
 * (query MySQL) — signature sama persis, dipertukarkan lewat specifier
 * "#repositories/schedule-repository.js" (docs/ROADMAP-PHASE12.md,
 * docs/DECISIONS.md K-18).
 *
 * Tidak ada endpoint GET /api/schedules/:id tersendiri (di luar cakupan
 * Phase 12 — lihat server/routes/schedules.routes.js) — findById() di sini
 * mengambil seluruh daftar lalu memfilter di klien. Jumlah jadwal kecil
 * (mingguan per plant), jadi ini bukan masalah performa; tidak ditambah
 * endpoint baru semata untuk ini (YAGNI).
 */

import { apiGet, apiPost, apiPut, apiDelete } from '../infrastructure/api-client.js';

/** Seluruh jadwal. */
export async function getAll() {
    return apiGet('/schedules');
}

/** Satu jadwal berdasarkan id, atau undefined bila tidak ada. */
export async function findById(id) {
    const schedules = await getAll();
    return schedules.find((schedule) => schedule.id === id);
}

/** Menambahkan jadwal baru. Id ditentukan backend (AUTO_INCREMENT). */
export async function add(schedule) {
    const { schedule: created } = await apiPost('/schedules', schedule);
    return created;
}

/**
 * Menyimpan perubahan field jadwal lewat PUT — beda dari versi in-memory
 * lama (no-op): di sini benar-benar satu-satunya jalur yang menyimpan ke
 * server. schedule-service.js tidak memakai nilai kembaliannya (ia sudah
 * membangun objek gabungan sendiri secara lokal sebelum memanggil ini),
 * tapi TETAP di-await dan TIDAK menelan error — kalau PUT gagal, error-nya
 * harus tetap sampai ke pemanggil, supaya UI tidak salah bilang "berhasil
 * diupdate" padahal sebenarnya gagal.
 */
export async function update(id, patch) {
    await apiPut(`/schedules/${encodeURIComponent(id)}`, patch);
}

/** Menghapus jadwal berdasarkan id. @returns {boolean} true bila ada yang terhapus. */
export async function remove(id) {
    try {
        const result = await apiDelete(`/schedules/${encodeURIComponent(id)}`);
        return Boolean(result && result.removed);
    } catch (error) {
        if (error.status === 404) return false;
        throw error;
    }
}

/** Jumlah jadwal. */
export async function count() {
    return (await getAll()).length;
}
