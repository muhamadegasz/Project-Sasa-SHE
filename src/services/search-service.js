/* search-service.js — pencarian sederhana lintas beberapa field.
 *
 * Fungsi murni, tanpa DOM. Dipakai keempat kotak pencarian di aplikasi.
 */

/**
 * Menyaring item yang salah satu field-nya memuat query.
 *
 * Tidak peka huruf besar/kecil. Query kosong mengembalikan seluruh item.
 * Field yang tidak ada atau bernilai null diperlakukan sebagai string kosong,
 * sehingga tidak pernah melempar error untuk data yang tidak lengkap.
 *
 * @param {object[]} items
 * @param {string} query
 * @param {string[]} fields nama field yang dicari
 */
export function filterByFields(items, query, fields) {
    const needle = String(query || '').trim().toLowerCase();
    if (needle === '') return items;

    return items.filter((item) =>
        fields.some((field) => String(item[field] || '').toLowerCase().includes(needle))
    );
}
