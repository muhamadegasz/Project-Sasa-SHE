/* inspection-repository.js — pemilik tunggal koleksi data inspeksi.
 *
 * Menggantikan variabel global `let inspeksiData`. Tidak ada modul lain yang
 * boleh menyimpan atau mengganti koleksi ini; semua akses lewat sini.
 *
 * Inilah seam yang membuat backend dapat ditambahkan nanti tanpa menyentuh
 * domain maupun presentation: cukup ganti isi berkas ini dengan pemanggilan
 * API, selama bentuk nilai kembaliannya tetap sama.
 *
 * ---------------------------------------------------------------------------
 * CATATAN PENTING soal getAll()
 *
 * getAll() mengembalikan array HIDUP, bukan salinan. Ini disengaja untuk saat
 * ini karena kode pemanggil masih memutasi objek inspeksi secara langsung
 * (item.approvals[...] = ..., item.perbaikan.push(...), item.status = ...).
 * Mengembalikan salinan justru akan menyembunyikan mutasi itu dan mengubah
 * perilaku yang sedang berjalan.
 *
 * Abstraksinya memang bocor, dan itu diterima sementara. Saat repository ini
 * diganti versi API, mutasi tersebut harus lebih dulu dipindahkan menjadi
 * method eksplisit di sini (Phase 6 ke atas).
 * ---------------------------------------------------------------------------
 */

import { createInspectionSeed } from '../data/inspections.seed.js';

let inspections = createInspectionSeed();

/** Seluruh inspeksi, urutan terbaru di depan. Array hidup — lihat catatan di atas. */
export function getAll() {
    return inspections;
}

/** Satu inspeksi berdasarkan id, atau undefined bila tidak ada. */
export function findById(id) {
    return inspections.find((inspection) => inspection.id === id);
}

/**
 * Menyimpan inspeksi baru di posisi PALING DEPAN.
 *
 * Urutan ini penting dan harus dipertahankan: tabel "Inspeksi Terbaru" di
 * dashboard menampilkan koleksi ini apa adanya, sehingga entri baru harus
 * muncul di baris teratas.
 */
export function add(inspection) {
    inspections.unshift(inspection);
    return inspection;
}

/** Jumlah inspeksi. */
export function count() {
    return inspections.length;
}

/**
 * Id berikutnya, format INS-nnn.
 *
 * Diturunkan dari jumlah data, persis seperti kode sebelumnya. Skema ini akan
 * menghasilkan id kembar bila kelak ada fitur hapus inspeksi — saat ini tidak
 * ada, jadi dibiarkan apa adanya. Backend nanti sebaiknya yang menerbitkan id.
 */
export function nextId() {
    return `INS-${String(inspections.length + 1).padStart(3, '0')}`;
}
