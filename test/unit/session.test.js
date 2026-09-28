/* session.test.js — Phase 17.4C: notifySessionExpired() hanya memicu
 * "sesi berakhir" bila halaman memang sedang punya sesi.
 *
 * src/infrastructure/session.js murni (state di memori modul, tanpa DOM,
 * tanpa fetch), jadi bisa diuji langsung.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    clearSession, getCsrfToken, getCurrentUser, notifySessionExpired, onSessionExpired, setSession,
} from '../../src/infrastructure/session.js';

let expiredCalls = 0;
onSessionExpired(() => { expiredCalls++; });

beforeEach(() => {
    clearSession();
    expiredCalls = 0;
});

test('401 tanpa sesi (buka halaman login / login gagal) -> BUKAN sesi berakhir, handler tidak dipanggil', () => {
    notifySessionExpired();
    assert.equal(expiredCalls, 0);
    assert.equal(getCurrentUser(), null);
});

test('401 saat sesi aktif -> handler "sesi berakhir" dipanggil dan sesi di klien dibersihkan', () => {
    setSession({ id: 5, username: 'dewi' }, 'csrf-token');
    notifySessionExpired();
    assert.equal(expiredCalls, 1);
    assert.equal(getCurrentUser(), null);
    assert.equal(getCsrfToken(), null);
});

test('beberapa 401 bersamaan dalam satu sesi -> handler hanya sekali', () => {
    setSession({ id: 5, username: 'dewi' }, 'csrf-token');
    notifySessionExpired();
    notifySessionExpired();
    notifySessionExpired();
    assert.equal(expiredCalls, 1);
});
