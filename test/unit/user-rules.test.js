/* user-rules.test.js — Phase 18: aturan pengelolaan akun (domain/user-rules.js).
 * Murni, tanpa repository/DB.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    canManageUsers, checkActiveFlag, checkDisplayName, checkPassword, checkRole, checkUsername,
    normalizePlantAssignment, DISPLAY_NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH, USERNAME_MAX_LENGTH,
} from '../../src/domain/user-rules.js';

// ---- checkUsername ----

test('checkUsername: kosong/tidak dikirim -> REQUIRED', () => {
    for (const input of [undefined, null, '', '   ']) {
        assert.deepEqual(checkUsername(input), { error: 'REQUIRED' }, JSON.stringify(input));
    }
});

test('checkUsername: bukan string -> INVALID', () => {
    for (const input of [123, {}, [], true]) {
        assert.deepEqual(checkUsername(input), { error: 'INVALID' }, JSON.stringify(input));
    }
});

test('checkUsername: valid -> di-trim; karakter aman (huruf/angka/._-) diterima', () => {
    assert.deepEqual(checkUsername('  dewi  '), { value: 'dewi' });
    assert.deepEqual(checkUsername('dewi.k3l-2'), { value: 'dewi.k3l-2' });
    assert.deepEqual(checkUsername('a'), { value: 'a' });
});

test('checkUsername: spasi di tengah / karakter markup -> INVALID', () => {
    for (const input of ['de wi', '<script>', 'admin"OR"1"="1', 'a/b', 'a@b.com']) {
        assert.deepEqual(checkUsername(input), { error: 'INVALID' }, input);
    }
});

test(`checkUsername: melebihi ${USERNAME_MAX_LENGTH} karakter -> TOO_LONG`, () => {
    assert.deepEqual(checkUsername('a'.repeat(USERNAME_MAX_LENGTH)), { value: 'a'.repeat(USERNAME_MAX_LENGTH) });
    assert.deepEqual(checkUsername('a'.repeat(USERNAME_MAX_LENGTH + 1)), { error: 'TOO_LONG' });
});

// ---- checkDisplayName ----

test('checkDisplayName: kosong -> REQUIRED; bukan string -> INVALID; valid -> di-trim', () => {
    assert.deepEqual(checkDisplayName(''), { error: 'REQUIRED' });
    assert.deepEqual(checkDisplayName('   '), { error: 'REQUIRED' });
    assert.deepEqual(checkDisplayName(42), { error: 'INVALID' });
    assert.deepEqual(checkDisplayName('  Dewi Koordinator  '), { value: 'Dewi Koordinator' });
});

test(`checkDisplayName: melebihi ${DISPLAY_NAME_MAX_LENGTH} karakter -> TOO_LONG; karakter bebas (bukan tugas domain, escapeHtml di UI) diterima`, () => {
    assert.deepEqual(checkDisplayName('a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1)), { error: 'TOO_LONG' });
    assert.deepEqual(checkDisplayName('<b>Dewi</b>'), { value: '<b>Dewi</b>' });
});

// ---- checkRole ----

test('checkRole: kelima role ENUM diterima', () => {
    for (const role of ['safety_officer', 'koordinator_k3l', 'manajer_bagian', 'ketua_p2k3', 'admin']) {
        assert.deepEqual(checkRole(role), { value: role });
    }
});

test('checkRole: kosong -> REQUIRED; role tidak dikenal / huruf besar / tipe salah -> INVALID', () => {
    assert.deepEqual(checkRole(undefined), { error: 'REQUIRED' });
    assert.deepEqual(checkRole(null), { error: 'REQUIRED' });
    assert.deepEqual(checkRole(''), { error: 'REQUIRED' });
    for (const role of ['ADMIN', 'superadmin', 'safety officer', 123, {}]) {
        assert.deepEqual(checkRole(role), { error: 'INVALID' }, JSON.stringify(role));
    }
});

// ---- checkPassword ----

test('checkPassword: kosong -> REQUIRED; bukan string -> INVALID', () => {
    assert.deepEqual(checkPassword(undefined), { error: 'REQUIRED' });
    assert.deepEqual(checkPassword(''), { error: 'REQUIRED' });
    assert.deepEqual(checkPassword(12345678), { error: 'INVALID' });
});

test(`checkPassword: batas panjang ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} karakter`, () => {
    assert.deepEqual(checkPassword('a'.repeat(PASSWORD_MIN_LENGTH - 1)), { error: 'TOO_SHORT' });
    assert.deepEqual(checkPassword('a'.repeat(PASSWORD_MIN_LENGTH)), { value: 'a'.repeat(PASSWORD_MIN_LENGTH) });
    assert.deepEqual(checkPassword('a'.repeat(PASSWORD_MAX_LENGTH)), { value: 'a'.repeat(PASSWORD_MAX_LENGTH) });
    assert.deepEqual(checkPassword('a'.repeat(PASSWORD_MAX_LENGTH + 1)), { error: 'TOO_LONG' });
});

// ---- normalizePlantAssignment ----

test('normalizePlantAssignment: role SELAIN koordinator_k3l -> selalu null, apa pun plantId yang dikirim (normalisasi diam-diam)', () => {
    for (const role of ['safety_officer', 'manajer_bagian', 'ketua_p2k3', 'admin']) {
        for (const plantId of [undefined, null, '', 1, '9', 999]) {
            assert.deepEqual(normalizePlantAssignment(role, plantId), { value: null }, `${role}/${JSON.stringify(plantId)}`);
        }
    }
});

test('normalizePlantAssignment: koordinator_k3l tanpa plantId -> PLANT_REQUIRED', () => {
    for (const plantId of [undefined, null, '']) {
        assert.deepEqual(normalizePlantAssignment('koordinator_k3l', plantId), { error: 'PLANT_REQUIRED' }, JSON.stringify(plantId));
    }
});

test('normalizePlantAssignment: koordinator_k3l dengan plantId angka bulat positif (angka atau teks digit) -> diterima', () => {
    assert.deepEqual(normalizePlantAssignment('koordinator_k3l', 1), { value: 1 });
    assert.deepEqual(normalizePlantAssignment('koordinator_k3l', 9), { value: 9 });
    assert.deepEqual(normalizePlantAssignment('koordinator_k3l', '9'), { value: 9 });
    assert.deepEqual(normalizePlantAssignment('koordinator_k3l', '016'), { value: 16 });
});

test('normalizePlantAssignment: koordinator_k3l dengan plantId tidak sah -> PLANT_INVALID', () => {
    for (const plantId of [0, -1, 1.5, 'abc', '1e1', '1 OR 1=1', [], {}, true, '0x1']) {
        assert.deepEqual(normalizePlantAssignment('koordinator_k3l', plantId), { error: 'PLANT_INVALID' }, JSON.stringify(plantId));
    }
});

// ---- canManageUsers / checkActiveFlag ----

test('canManageUsers: hanya admin; role lain / tanpa user -> false', () => {
    assert.equal(canManageUsers({ id: 9, role: 'admin' }), true);
    for (const role of ['safety_officer', 'koordinator_k3l', 'manajer_bagian', 'ketua_p2k3', 'ADMIN', undefined]) {
        assert.equal(canManageUsers({ id: 1, role }), false, String(role));
    }
    assert.equal(canManageUsers(null), false);
    assert.equal(canManageUsers(undefined), false);
});

test('checkActiveFlag: hanya boolean sungguhan', () => {
    assert.deepEqual(checkActiveFlag(true), { value: true });
    assert.deepEqual(checkActiveFlag(false), { value: false });
    for (const input of ['false', 'true', 0, 1, null, undefined, 'yes', {}]) {
        assert.deepEqual(checkActiveFlag(input), { error: 'INVALID' }, JSON.stringify(input));
    }
});
