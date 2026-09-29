/* pagination.js — permintaan & ringkasan halaman untuk daftar berhalaman
 * (GET /api/inspections?page=&limit=&q=).
 *
 * Murni, tanpa DOM: dipakai route server (validasi parameter) dan tampilan
 * browser (teks "Menampilkan 1–10 dari 57", nomor halaman).
 */

export const DEFAULT_PAGE_LIMIT = 10;
export const MAX_PAGE_LIMIT = 100;
export const MAX_SEARCH_LENGTH = 100;

function positiveInteger(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    if (!/^\d+$/.test(String(value))) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}

/**
 * Memeriksa parameter halaman dari query string. `page` wajib; `limit`
 * bawaan 10, maksimal 100; `q` (pencarian) opsional, di-trim.
 * @returns {{ value: { page: number, limit: number, search: string } } | { error: 'INVALID' }}
 */
export function checkPageRequest({ page, limit, q } = {}) {
    const pageNumber = positiveInteger(page);
    const limitNumber = limit === undefined ? DEFAULT_PAGE_LIMIT : positiveInteger(limit);
    if (!pageNumber || !limitNumber || limitNumber > MAX_PAGE_LIMIT) return { error: 'INVALID' };
    if (q !== undefined && typeof q !== 'string') return { error: 'INVALID' };
    const search = (q || '').trim();
    if (search.length > MAX_SEARCH_LENGTH) return { error: 'INVALID' };
    return { value: { page: pageNumber, limit: limitNumber, search } };
}

/** Bagian `pagination` dari respons. totalPages 0 bila tidak ada data. */
export function pageSummary(page, limit, total) {
    return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

/** Nomor urut baris pertama & terakhir di halaman ini, atau null bila halamannya kosong. */
export function pageRange({ page, limit, total }) {
    const from = (page - 1) * limit + 1;
    if (total === 0 || from > total) return null;
    return { from, to: Math.min(page * limit, total) };
}

/** Paling banyak `size` nomor halaman berurutan di sekitar halaman aktif. */
export function pageWindow(page, totalPages, size = 5) {
    if (totalPages <= 0) return [];
    const start = Math.max(1, Math.min(page - Math.floor(size / 2), totalPages - size + 1));
    const end = Math.min(totalPages, start + size - 1);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
