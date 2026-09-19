/* plant-repository.js — akses ke daftar plant.
 *
 * Plant adalah data referensi: hanya dibaca, tidak pernah ditambah atau
 * dihapus oleh aplikasi. Karena itu repository ini tidak punya add/remove.
 */

import { PLANT_LIST } from '../data/plants.js';

/** Seluruh plant. */
export function getAll() {
    return PLANT_LIST;
}

/**
 * Satu plant berdasarkan id.
 *
 * Perbandingan sengaja dilakukan sebagai string. Alasannya: id datang dari dua
 * sumber dengan tipe berbeda — angka (dari data inspeksi/jadwal) dan string
 * (dari nilai <input type="hidden">). Kode lama menanganinya tidak konsisten,
 * dua tempat memakai === dan dua tempat memakai ==. String(...) di kedua sisi
 * mencakup keduanya tanpa mengubah hasil untuk kasus mana pun.
 */
export function findById(id) {
    return PLANT_LIST.find((plant) => String(plant.id) === String(id));
}

/**
 * Mencari plant berdasarkan nama atau kode, tidak peka huruf besar/kecil.
 *
 * Query kosong mengembalikan seluruh plant — sama seperti perilaku dropdown
 * sebelumnya.
 */
export function search(query) {
    const needle = String(query || '').toLowerCase();
    if (needle === '') return PLANT_LIST;
    return PLANT_LIST.filter(
        (plant) =>
            plant.name.toLowerCase().includes(needle) ||
            plant.code.toLowerCase().includes(needle)
    );
}

/** Jumlah plant terdaftar. */
export function count() {
    return PLANT_LIST.length;
}
