/* plant-repository.js — akses ke daftar plant, versi BROWSER (Phase 14).
 *
 * Sejak Phase 14: mengambil data lewat GET /api/plants, bukan array statis
 * lagi. Plant adalah data referensi yang nyaris tidak pernah berubah dan
 * dipakai berulang kali saat mengetik (dropdown pencarian plant, satu
 * findById() per baris tabel jadwal) — di-cache di modul ini setelah
 * pengambilan pertama supaya pemakaian berulang itu tidak memicu satu
 * request jaringan per pemanggilan. Backend punya implementasinya sendiri di
 * server/repositories/plant-repository.js (query MySQL langsung, tanpa cache
 * karena dipakai dalam proses server yang sama) — signature fungsi sama
 * persis, dipertukarkan lewat specifier "#repositories/plant-repository.js"
 * (lihat docs/ROADMAP-PHASE12.md, docs/DECISIONS.md K-18).
 *
 * Seluruh fungsi di sini sekarang async — pemanggil WAJIB await, termasuk
 * yang sebelumnya terasa "instan" (in-memory). Lihat docs/DECISIONS.md
 * entri Phase 14 untuk daftar lengkap titik pemanggilan yang ikut berubah.
 */

import { apiGet } from '../infrastructure/api-client.js';

let cache = null;
let inflight = null;

async function ensureLoaded() {
    if (cache) return cache;
    if (!inflight) {
        inflight = apiGet('/plants')
            .then((rows) => {
                cache = rows;
                return cache;
            })
            .finally(() => {
                inflight = null;
            });
    }
    return inflight;
}

/** Seluruh plant. */
export async function getAll() {
    return ensureLoaded();
}

/** Satu plant berdasarkan id, atau undefined bila tidak ada. Perbandingan sebagai string — lihat catatan yang sama di versi lama berkas ini. */
export async function findById(id) {
    const plants = await ensureLoaded();
    return plants.find((plant) => String(plant.id) === String(id));
}

/** Mencari plant berdasarkan nama atau kode, tidak peka huruf besar/kecil. Query kosong mengembalikan seluruh plant. */
export async function search(query) {
    const plants = await ensureLoaded();
    const needle = String(query || '').toLowerCase();
    if (needle === '') return plants;
    return plants.filter(
        (plant) =>
            plant.name.toLowerCase().includes(needle) ||
            plant.code.toLowerCase().includes(needle)
    );
}

/** Jumlah plant terdaftar. */
export async function count() {
    const plants = await ensureLoaded();
    return plants.length;
}
