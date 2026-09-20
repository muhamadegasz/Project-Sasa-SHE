/* inspection-repository.js — pemilik tunggal koleksi data inspeksi (versi
 * in-memory, dipakai BROWSER).
 *
 * Menggantikan variabel global `let inspeksiData`. Tidak ada modul lain yang
 * boleh menyimpan atau mengganti koleksi ini; semua akses lewat sini.
 *
 * Sejak Phase 12: berkas ini TIDAK diganti/ditimpa oleh backend — backend
 * punya implementasi sendiri di server/repositories/inspection-repository.js
 * (MySQL), dengan signature fungsi yang sama persis. src/services/*.js
 * meng-import salah satu dari keduanya lewat specifier
 * "#repositories/inspection-repository.js", diarahkan oleh import map di
 * index.html (browser) atau package.json "imports" + Node --conditions=server
 * (backend). Lihat docs/ROADMAP-PHASE12.md dan docs/DECISIONS.md K-18.
 *
 * ---------------------------------------------------------------------------
 * CATATAN PENTING soal getAll()
 *
 * getAll() mengembalikan array HIDUP, bukan salinan. Ini disengaja karena
 * kode pemanggil masih memutasi objek inspeksi secara langsung
 * (item.approvals[...] = ..., item.perbaikan.push(...), item.status = ...).
 * Mengembalikan salinan justru akan menyembunyikan mutasi itu dan mengubah
 * perilaku yang sedang berjalan.
 *
 * Abstraksinya memang bocor, dan itu diterima DI SINI secara permanen —
 * versi backend (MySQL) TIDAK bisa memutasi-lewat-referensi seperti ini;
 * approval-service.js dkk memanggil saveApproval()/setStatus()/
 * addCorrectiveAction() secara eksplisit untuk kasus itu (no-op di berkas
 * ini, query sungguhan di server/repositories/).
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
 * Menyimpan inspeksi baru di posisi PALING DEPAN. Id ditentukan DI SINI
 * (lewat nextId()), bukan oleh pemanggil — sejak Phase 12 ini juga jadi
 * kontrak yang dipakai backend (id ditentukan oleh datastore saat insert,
 * bukan dihitung di service).
 *
 * Urutan ini penting dan harus dipertahankan: tabel "Inspeksi Terbaru" di
 * dashboard menampilkan koleksi ini apa adanya, sehingga entri baru harus
 * muncul di baris teratas.
 */
export function add(inspection) {
    const withId = { id: nextId(), ...inspection };
    inspections.unshift(withId);
    return withId;
}

/**
 * Menyimpan satu tahap pengesahan (dipanggil approval-service.js setelah
 * memutasi inspection.approvals[stageId]).
 *
 * Di sini SENGAJA no-op: findById() mengembalikan array hidup, jadi objek
 * yang dimutasi pemanggil SUDAH menjadi data yang tersimpan. Method ini ada
 * supaya bentuk kontraknya sama dengan server/repositories/ (yang bukan
 * no-op — di sana ini satu-satunya jalur yang benar-benar menyimpan ke MySQL).
 */
export function saveApproval(_inspectionId, _stageId, _record, _approverId) {}

/** Sama seperti saveApproval() — no-op di sini, real UPDATE di backend. */
export function setStatus(_inspectionId, _status) {}

/** Sama seperti saveApproval() — no-op di sini, real INSERT di backend. */
export function addCorrectiveAction(_inspectionId, _action) {
    return _action;
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
