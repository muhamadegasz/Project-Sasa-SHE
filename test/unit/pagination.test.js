/* pagination.test.js — validasi parameter halaman & ringkasan (shared/pagination.js). Murni. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, checkPageRequest, pageRange, pageSummary, pageWindow,
} from '../../src/shared/pagination.js';

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
