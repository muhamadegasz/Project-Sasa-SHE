/* user-service.test.js — Phase 18: pengelolaan akun oleh Admin lewat
 * src/services/user-service.js, dengan repository palsu (test/fakes/).
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import * as userFake from '../fakes/user-repository.js';
import * as plantFake from '../fakes/plant-repository.js';
import * as userService from '../../src/services/user-service.js';

const UE = userService.USER_ERROR;
const admin = { id: 9, role: 'admin' };

function seed() {
    plantFake.__seed([{ id: 1, name: 'Brewhouse' }, { id: 9, name: 'Logistic' }]);
    userFake.__seed([
        { id: 1, username: 'arif', displayName: 'Arif', role: 'safety_officer' },
        { id: 5, username: 'dewi', displayName: 'Dewi', role: 'koordinator_k3l', plantId: 1 },
        { id: 9, username: 'admin', displayName: 'Administrator', role: 'admin' },
    ]);
}
beforeEach(seed);

const NEW_OFFICER = { username: 'budi', displayName: 'Budi', role: 'safety_officer', password: 'rahasia' };

// ---- otorisasi ----

test('selain Admin: list/create/update/setActive -> FORBIDDEN, tidak ada yang berubah', async () => {
    for (const actor of [{ id: 1, role: 'safety_officer' }, { id: 5, role: 'koordinator_k3l', plantId: 1 }, { id: 7, role: 'manajer_bagian' }, { id: 8, role: 'ketua_p2k3' }, null]) {
        const label = actor ? actor.role : 'tanpa user';
        assert.equal((await userService.list(actor)).reason, UE.FORBIDDEN, label);
        assert.equal((await userService.create(actor, NEW_OFFICER)).reason, UE.FORBIDDEN, label);
        assert.equal((await userService.update(actor, 1, { displayName: 'X', role: 'admin' })).reason, UE.FORBIDDEN, label);
        assert.equal((await userService.setActive(actor, 1, false)).reason, UE.FORBIDDEN, label);
    }
    assert.equal((await userFake.getAll()).length, 3);
    assert.deepEqual(await userFake.findById(1), { id: 1, username: 'arif', displayName: 'Arif', role: 'safety_officer', plantId: null, isActive: true });
});

test('Admin: list -> seluruh akun tanpa hash', async () => {
    const result = await userService.list(admin);
    assert.equal(result.ok, true);
    assert.deepEqual(result.data.users.map((user) => user.username), ['arif', 'dewi', 'admin']);
    assert.ok(result.data.users.every((user) => !('password' in user) && !('passwordHash' in user)));
});

// ---- create ----

test('create: Safety Officer baru -> aktif, plantId null, password diteruskan ke repository', async () => {
    const result = await userService.create(admin, { ...NEW_OFFICER, username: '  budi  ', displayName: '  Budi  ' });
    assert.equal(result.ok, true, result.reason);
    assert.deepEqual(result.data.user, { id: 10, username: 'budi', displayName: 'Budi', role: 'safety_officer', plantId: null, isActive: true });
    assert.equal(userFake.__passwords().get(10), 'rahasia');
});

test('create: Koordinator K3L wajib plant yang ada; role lain -> plantId dinormalisasi null walau dikirim', async () => {
    const base = { ...NEW_OFFICER, role: 'koordinator_k3l' };
    assert.equal((await userService.create(admin, base)).reason, UE.PLANT_REQUIRED);
    assert.equal((await userService.create(admin, { ...base, plantId: 'abc' })).reason, UE.PLANT_INVALID);
    assert.equal((await userService.create(admin, { ...base, plantId: 77 })).reason, UE.PLANT_NOT_FOUND);
    const coordinator = await userService.create(admin, { ...base, plantId: '9' });
    assert.equal(coordinator.data.user.plantId, 9);

    const manager = await userService.create(admin, { ...NEW_OFFICER, username: 'andi2', role: 'manajer_bagian', plantId: 9 });
    assert.equal(manager.data.user.plantId, null, 'role selain koordinator tidak pernah membawa plant');
});

test('create: isian tidak sah -> kode alasan per field; username terpakai -> USERNAME_TAKEN', async () => {
    for (const [patch, reason] of [
        [{ username: '' }, UE.USERNAME_REQUIRED],
        [{ username: 'bu di' }, UE.USERNAME_INVALID],
        [{ username: 'x'.repeat(51) }, UE.USERNAME_TOO_LONG],
        [{ displayName: ' ' }, UE.DISPLAY_NAME_REQUIRED],
        [{ role: undefined }, UE.ROLE_REQUIRED],
        [{ role: 'superadmin' }, UE.ROLE_INVALID],
        [{ password: undefined }, UE.PASSWORD_REQUIRED],
        [{ password: 'abc' }, UE.PASSWORD_TOO_SHORT],
        [{ password: 'x'.repeat(73) }, UE.PASSWORD_TOO_LONG],
        [{ username: 'arif' }, UE.USERNAME_TAKEN],
    ]) {
        assert.equal((await userService.create(admin, { ...NEW_OFFICER, ...patch })).reason, reason, JSON.stringify(patch));
    }
    assert.equal((await userFake.getAll()).length, 3, 'tidak ada akun tersimpan');
});

// ---- update ----

test('update: Koordinator diubah jadi role lain -> plant otomatis dilepas (null)', async () => {
    const result = await userService.update(admin, 5, { displayName: 'Dewi', role: 'manajer_bagian', plantId: 1 });
    assert.equal(result.ok, true, result.reason);
    assert.deepEqual([result.data.user.role, result.data.user.plantId], ['manajer_bagian', null]);
});

test('update: jadi Koordinator wajib plant yang ada; ganti plant Koordinator', async () => {
    assert.equal((await userService.update(admin, 1, { displayName: 'Arif', role: 'koordinator_k3l' })).reason, UE.PLANT_REQUIRED);
    assert.equal((await userService.update(admin, 1, { displayName: 'Arif', role: 'koordinator_k3l', plantId: 77 })).reason, UE.PLANT_NOT_FOUND);
    assert.equal((await userFake.findById(1)).role, 'safety_officer', 'tidak berubah saat ditolak');
    const moved = await userService.update(admin, 5, { displayName: 'Dewi', role: 'koordinator_k3l', plantId: 9 });
    assert.equal(moved.data.user.plantId, 9);
});

test('update: password kosong = tidak diganti; diisi = divalidasi lalu diganti; username tidak bisa diubah', async () => {
    await userService.update(admin, 1, { displayName: 'Arif', role: 'safety_officer', password: '' });
    assert.equal(userFake.__passwords().has(1), false);
    assert.equal((await userService.update(admin, 1, { displayName: 'Arif', role: 'safety_officer', password: 'ab' })).reason, UE.PASSWORD_TOO_SHORT);
    await userService.update(admin, 1, { displayName: 'Arif S.', role: 'safety_officer', password: 'baru1234', username: 'hacked' });
    assert.equal(userFake.__passwords().get(1), 'baru1234');
    assert.deepEqual([(await userFake.findById(1)).username, (await userFake.findById(1)).displayName], ['arif', 'Arif S.']);
});

test('update: akun tidak ada -> NOT_FOUND; Admin tidak bisa mengganti role-nya sendiri (nama/password boleh)', async () => {
    assert.equal((await userService.update(admin, 999, { displayName: 'X', role: 'admin' })).reason, UE.NOT_FOUND);
    assert.equal((await userService.update(admin, 9, { displayName: 'Admin', role: 'safety_officer' })).reason, UE.CANNOT_CHANGE_OWN_ROLE);
    assert.equal((await userFake.findById(9)).role, 'admin');
    assert.equal((await userService.update(admin, 9, { displayName: 'Admin Utama', role: 'admin' })).ok, true);
});

// ---- setActive ----

test('setActive: nonaktifkan/aktifkan lagi; hanya boolean; tidak bisa menonaktifkan diri sendiri; akun tidak ada -> NOT_FOUND', async () => {
    const off = await userService.setActive(admin, 1, false);
    assert.equal(off.data.user.isActive, false);
    assert.equal((await userService.setActive(admin, 1, true)).data.user.isActive, true);
    assert.equal((await userService.setActive(admin, 1, 'false')).reason, UE.ACTIVE_INVALID);
    assert.equal((await userService.setActive(admin, 9, false)).reason, UE.CANNOT_DEACTIVATE_SELF);
    assert.equal((await userFake.findById(9)).isActive, true);
    assert.equal((await userService.setActive(admin, 999, false)).reason, UE.NOT_FOUND);
});

// ---- remove (hapus permanen) ----

test('remove: bukan Admin -> FORBIDDEN; akun sendiri -> CANNOT_DELETE_SELF; akun masih aktif -> USER_ACTIVE', async () => {
    assert.equal((await userService.remove({ id: 1, role: 'safety_officer' }, 5)).reason, UE.FORBIDDEN);
    assert.equal((await userService.remove(admin, 9)).reason, UE.CANNOT_DELETE_SELF);
    assert.equal((await userService.remove(admin, 1)).reason, UE.USER_ACTIVE);
    assert.equal((await userService.remove(admin, 999)).reason, UE.NOT_FOUND);
    assert.equal((await userFake.getAll()).length, 3);
});

test('remove: akun nonaktif yang masih memiliki inspeksi belum selesai -> USER_HAS_OPEN_INSPECTIONS (+ jumlahnya)', async () => {
    await userService.setActive(admin, 1, false);
    userFake.__setOpenInspections(1, 2);
    const result = await userService.remove(admin, 1);
    assert.equal(result.reason, UE.USER_HAS_OPEN_INSPECTIONS);
    assert.deepEqual(result.data, { openInspections: 2 });
    assert.ok(await userFake.findById(1));
});

test('remove: akun nonaktif tanpa inspeksi belum selesai -> terhapus', async () => {
    await userService.setActive(admin, 5, false);
    assert.deepEqual(await userService.remove(admin, 5), { ok: true, data: { removed: true } });
    assert.equal(await userFake.findById(5), undefined);
});
