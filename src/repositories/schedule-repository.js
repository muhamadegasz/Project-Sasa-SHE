/* schedule-repository.js — pemilik tunggal koleksi data jadwal inspeksi.
 *
 * Menggantikan variabel global `let jadwalData`.
 *
 * Perhatikan remove(): kode lama melakukan `jadwalData = jadwalData.filter(...)`,
 * yaitu MENGGANTI binding variabel global. Itu persis alasan kenapa state
 * semacam ini perlu punya pemilik — penggantian binding di satu tempat diam-diam
 * memutus referensi yang dipegang tempat lain. Sekarang penggantian itu terjadi
 * di dalam modul ini saja, dan pemanggil selalu mendapat koleksi terkini lewat
 * getAll().
 *
 * Soal getAll() yang mengembalikan array hidup, berlaku catatan yang sama
 * seperti pada inspection-repository.js.
 */

import { generateWeeklySchedule } from '../data/schedules.seed.js';

let schedules = generateWeeklySchedule();

/** Seluruh jadwal. Array hidup. */
export function getAll() {
    return schedules;
}

/** Satu jadwal berdasarkan id, atau undefined bila tidak ada. */
export function findById(id) {
    return schedules.find((schedule) => schedule.id === id);
}

/**
 * Menambahkan jadwal baru di posisi paling belakang. Id ditentukan DI SINI
 * (lewat nextId()) — lihat catatan yang sama di inspection-repository.js.
 */
export function add(schedule) {
    const withId = { id: nextId(), ...schedule };
    schedules.push(withId);
    return withId;
}

/**
 * Menyimpan perubahan field jadwal (dipanggil schedule-service.js setelah
 * Object.assign ke objek hasil findById()).
 *
 * No-op di sini dengan alasan yang sama seperti saveApproval() di
 * inspection-repository.js — findById() mengembalikan referensi hidup.
 */
export function update(_id, _patch) {}

/**
 * Menghapus jadwal berdasarkan id.
 *
 * @returns {boolean} true bila ada yang terhapus.
 */
export function remove(id) {
    const before = schedules.length;
    schedules = schedules.filter((schedule) => schedule.id !== id);
    return schedules.length < before;
}

/** Jumlah jadwal. */
export function count() {
    return schedules.length;
}

/**
 * Id berikutnya, format SCH-nnn.
 *
 * Diturunkan dari jumlah data, persis seperti kode sebelumnya. Berbeda dengan
 * inspeksi, jadwal BISA dihapus — sehingga skema ini memang dapat menghasilkan
 * id kembar (hapus SCH-003 lalu tambah baru akan menghasilkan SCH-003 lagi).
 * Perilaku ini sudah ada sebelum refactoring dan sengaja tidak diubah di sini;
 * memperbaikinya adalah perubahan yang terlihat dan pantas dikerjakan terpisah.
 */
export function nextId() {
    return `SCH-${String(schedules.length + 1).padStart(3, '0')}`;
}
