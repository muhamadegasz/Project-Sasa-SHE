/* pagination.test.js — validasi parameter halaman & ringkasan (shared/pagination.js). Murni. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, checkPageRequest, createClientPager, pageRange, pageSummary, pageWindow, paginate,
} from '../../src/shared/pagination.js';
import { renderPaginationNav } from '../../src/presentation/components/pagination-nav.js';

test('checkPageRequest: page wajib bilangan bulat >= 1; limit bawaan 10, maks 100; q di-trim', () => {
    assert.deepEqual(checkPageRequest({ page: '2' }), { value: { page: 2, limit: DEFAULT_PAGE_LIMIT, search: '' } });
    assert.deepEqual(checkPageRequest({ page: '1', limit: '25', q: '  Logistic ' }), { value: { page: 1, limit: 25, search: 'Logistic' } });
    assert.deepEqual(checkPageRequest({ page: '1', limit: String(MAX_PAGE_LIMIT) }).value.limit, MAX_PAGE_LIMIT);
    for (const query of [{}, { page: '0' }, { page: '-1' }, { page: '1.5' }, { page: 'abc' }, { page: ['1', '2'] },
        { page: '1', limit: '0' }, { page: '1', limit: '101' }, { page: '1', limit: 'x' }, { page: '1', q: ['a', 'b'] },
        { page: '1', q: 'a'.repeat(101) }, { page: '99999999999999999999' }]) {
        assert.deepEqual(checkPageRequest(query), { error: 'INVALID' }, JSON.stringify(query));
    }
});

test('pageSummary & pageRange: total, totalPages, rentang baris; halaman kosong -> null', () => {
    assert.deepEqual(pageSummary(1, 10, 57), { page: 1, limit: 10, total: 57, totalPages: 6 });
    assert.deepEqual(pageSummary(1, 10, 0), { page: 1, limit: 10, total: 0, totalPages: 0 });
    assert.deepEqual(pageRange({ page: 1, limit: 10, total: 57 }), { from: 1, to: 10 });
    assert.deepEqual(pageRange({ page: 6, limit: 10, total: 57 }), { from: 51, to: 57 });
    assert.equal(pageRange({ page: 7, limit: 10, total: 57 }), null);
    assert.equal(pageRange({ page: 1, limit: 10, total: 0 }), null);
});

test('pageWindow: paling banyak 5 nomor di sekitar halaman aktif, tidak keluar batas', () => {
    assert.deepEqual(pageWindow(1, 6), [1, 2, 3, 4, 5]);
    assert.deepEqual(pageWindow(4, 6), [2, 3, 4, 5, 6]);
    assert.deepEqual(pageWindow(6, 6), [2, 3, 4, 5, 6]);
    assert.deepEqual(pageWindow(5, 20), [3, 4, 5, 6, 7]);
    assert.deepEqual(pageWindow(2, 3), [1, 2, 3]);
    assert.deepEqual(pageWindow(1, 0), []);
});

test('paginate: daftar yang sudah dimuat penuh -> satu halaman; bentuk pagination sama dengan server; halaman dijepit', () => {
    const items = Array.from({ length: 23 }, (_, index) => index + 1);
    assert.deepEqual(paginate(items, 1), { items: items.slice(0, 10), pagination: { page: 1, limit: DEFAULT_PAGE_LIMIT, total: 23, totalPages: 3 } });
    assert.deepEqual(paginate(items, 3).items, [21, 22, 23]);
    assert.equal(paginate(items, 9).pagination.page, 3, 'di luar jangkauan -> halaman terakhir');
    assert.equal(paginate(items, 0).pagination.page, 1);
    assert.deepEqual(paginate([], 4), { items: [], pagination: { page: 1, limit: DEFAULT_PAGE_LIMIT, total: 0, totalPages: 0 } });
});

test('createClientPager (Penjadwalan, Perbaikan, Manajemen Pengguna): halaman dari hasil pencarian; kata kunci berubah -> halaman 1; data berkurang -> halaman terakhir yang ada', () => {
    const items = (count) => Array.from({ length: count }, (_, index) => index + 1);
    const pager = createClientPager();
    assert.deepEqual(pager.take(items(25), '').pagination, { page: 1, limit: DEFAULT_PAGE_LIMIT, total: 25, totalPages: 3 });

    // Pindah halaman memakai hasil pencarian yang sama.
    assert.deepEqual(pager.goTo(3), { data: items(25), query: '' });
    assert.deepEqual(pager.take(items(25), '').items, [21, 22, 23, 24, 25]);

    // Dirender ulang dengan kata kunci yang sama (mis. setelah aksi): halaman tetap.
    assert.equal(pager.take(items(25), '').pagination.page, 3);

    // Satu-satunya baris di halaman 3 dihapus: halaman 3 tidak ada lagi -> halaman 2.
    const afterDelete = pager.take(items(20), '');
    assert.deepEqual([afterDelete.pagination.page, afterDelete.items.length], [2, 10]);

    // Kata kunci berubah -> halaman 1; jumlah = jumlah hasil pencarian.
    const searched = pager.take(items(12), 'uji');
    assert.deepEqual([searched.pagination.page, searched.pagination.total, searched.items.length], [1, 12, 10]);
    pager.goTo(2);
    assert.equal(pager.take(items(12), 'uji').pagination.page, 2);
    assert.equal(pager.take(items(20), '').pagination.page, 1, 'pencarian dikosongkan juga perubahan kata kunci');

    // Hasil kosong: halaman 1 tanpa baris.
    assert.deepEqual(pager.take([], 'tidak-ada'), { items: [], pagination: { page: 1, limit: DEFAULT_PAGE_LIMIT, total: 0, totalPages: 0 } });
});

test('renderPaginationNav: pola Inspeksi Terbaru — ringkasan (teks panjang hanya untuk layar lebar), nomor halaman, ringkas N / M, aksi per tabel', () => {
    const nav = { innerHTML: '' };
    renderPaginationNav(nav, pageSummary(2, 10, 57), { action: 'schedulesPage', noun: 'jadwal', testId: 'jadwal-summary' });
    const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const summary = nav.innerHTML.match(/<p class="pagination-summary" data-testid="jadwal-summary">([\s\S]*?)<\/p>/)[1];
    assert.equal(text(summary), 'Menampilkan 11–20 dari 57 jadwal');
    assert.equal(text(summary.replace(/<span class="pagination-summary-long">[^<]*<\/span>/g, '')), '11–20 dari 57', 'layar sempit');
    assert.deepEqual([...nav.innerHTML.matchAll(/data-action="(\w+)" data-page="(\d+)"/g)].map((m) => [m[1], Number(m[2])]),
        [['schedulesPage', 1], ['schedulesPage', 1], ['schedulesPage', 3], ['schedulesPage', 4], ['schedulesPage', 5], ['schedulesPage', 3]]);
    assert.match(nav.innerHTML, /<span class="pagination-btn current" aria-current="page">2<\/span>/);
    assert.match(nav.innerHTML, /<span class="pagination-compact">2 \/ 6<\/span>/);

    renderPaginationNav(nav, pageSummary(1, 10, 4), { action: 'x', noun: 'inspeksi' });
    assert.ok(!nav.innerHTML.includes('pagination-controls'), 'satu halaman: ringkasan saja');
    renderPaginationNav(nav, pageSummary(1, 10, 0), { action: 'x', noun: 'inspeksi' });
    assert.equal(nav.innerHTML, '', 'tanpa data: kosong');
});
