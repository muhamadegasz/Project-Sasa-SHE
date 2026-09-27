/* api.test.js — uji end-to-end API terhadap MySQL sungguhan.
 *
 * Setiap run mengulang seed.js dulu (lewat child process terpisah, supaya
 * pool koneksinya sendiri dan tidak bentrok dengan pool yang dipakai app),
 * supaya hasilnya deterministik terlepas dari urutan test sebelumnya.
 *
 * Sejak Phase 13: identitas didapat lewat login sungguhan (bcrypt + session),
 * BUKAN header X-Dev-User (dev-auth.js sudah dihapus). loginAs() memakai
 * supertest agent (request.agent) supaya cookie sesi otomatis terbawa di
 * setiap request berikutnya lewat agent yang sama — satu agent = satu
 * "pengguna yang sedang login", persis seperti satu tab browser. Setiap
 * permintaan yang mengubah state (POST/PUT/DELETE) wajib menyertakan header
 * X-CSRF-Token dari hasil login, atau ditolak 403 CSRF_INVALID.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

const FIXTURE_JPEG = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'label.jpg');

before(() => {
    execFileSync(process.execPath, ['server/db/seed.js'], { cwd: process.cwd(), stdio: 'inherit' });
});

after(async () => {
    await pool.end();
});

/** Login sebagai user seed (password = username, lihat server/db/seed.js). */
async function loginAs(username) {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ username, password: username });
    assert.equal(res.status, 200, `login ${username} gagal: ${JSON.stringify(res.body)}`);
    return { agent, csrfToken: res.body.csrfToken, user: res.body.user };
}

/** Helper: request mengubah state dengan header X-CSRF-Token otomatis terpasang. */
function withCsrf(agentRequest, csrfToken) {
    return agentRequest.set('X-CSRF-Token', csrfToken);
}

test('GET tanpa login -> 401', async () => {
    const res = await request(app).get('/api/inspections');
    assert.equal(res.status, 401);
});

test('login username tidak dikenal -> 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'tidak-ada', password: 'apapun' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'INVALID_CREDENTIALS');
});

test('login password salah -> 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'arif', password: 'salah' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'INVALID_CREDENTIALS');
});

test('login berhasil mengembalikan user + csrfToken, GET /api/auth/me konsisten', async () => {
    const { agent, csrfToken, user } = await loginAs('arif');
    assert.equal(user.role, 'safety_officer');
    assert.equal(user.displayName, 'Arif');
    assert.ok(csrfToken && csrfToken.length > 0);

    const me = await agent.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.username, 'arif');
});

test('permintaan mengubah state tanpa header X-CSRF-Token -> 403 CSRF_INVALID', async () => {
    const { agent } = await loginAs('arif');
    const res = await agent.post('/api/schedules').send({ plantId: 1, officer: 'Arif', tahun: 2026, tanggalJadwal: '2026-11-01', periode: 4, minggu: 1 });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'CSRF_INVALID');
});

test('logout menghapus sesi -> permintaan berikutnya dengan cookie lama jadi 401', async () => {
    const { agent, csrfToken } = await loginAs('arif');
    const logoutRes = await withCsrf(agent.post('/api/auth/logout'), csrfToken);
    assert.equal(logoutRes.status, 200);

    const afterLogout = await agent.get('/api/inspections');
    assert.equal(afterLogout.status, 401);
});

test('GET /api/plants -> 15 plant dari PLANT_LIST', async () => {
    const { agent } = await loginAs('arif');
    const res = await agent.get('/api/plants');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 15);
});

test('GET /api/inspections -> 6 inspeksi hasil seed', async () => {
    const { agent } = await loginAs('arif');
    const res = await agent.get('/api/inspections');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 6);
});

test('GET /api/users hanya boleh admin', async () => {
    const officer = await loginAs('arif');
    const asOfficer = await officer.agent.get('/api/users');
    assert.equal(asOfficer.status, 403);

    const admin = await loginAs('admin');
    const asAdmin = await admin.agent.get('/api/users');
    assert.equal(asAdmin.status, 200);
    // 9 sejak Phase 17.2: Koordinator kedua (rina, plant 9) untuk menguji cakupan plant.
    assert.equal(asAdmin.body.length, 9);
});

async function createInspection(officer, overrides = {}) {
    const res = await withCsrf(officer.agent.post('/api/inspections'), officer.csrfToken).send({
        plantId: 1,
        keteranganLokasi: 'Gudang B',
        tanggal: '2026-09-20',
        dueDate: '2026-10-01',
        temuan: [{ deskripsi: 'Uji end-to-end', kategori: 'Kelistrikan' }],
        ...overrides,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.inspection;
}

function decide(session, id, action, body) {
    return withCsrf(session.agent.post(`/api/inspections/${id}/${action}`), session.csrfToken).send(body);
}

test('alur penuh (Phase 17.2): ajukan -> Koordinator -> Manajer -> Ketua -> COMPLETED, dengan wewenang per tahap & plant', async () => {
    const arif = await loginAs('arif');
    const dewi = await loginAs('dewi'); // koordinator plant 1
    const rina = await loginAs('rina'); // koordinator plant 9
    const andi = await loginAs('andi');
    const hadi = await loginAs('hadi');
    const admin = await loginAs('admin');

    // 1. Safety Officer membuat inspeksi — petugas dipaksa dari sesi; status dari
    //    body DIABAIKAN; langsung diajukan ke tahap Koordinator (interim 17.2).
    const inspection = await createInspection(arif, { status: 'completed', petugas: 'Bukan Arif' });
    assert.equal(inspection.petugas, 'Arif', 'petugas dipaksa dari req.user, bukan body');
    assert.equal(inspection.status, 'in_review', 'status dari body diabaikan');
    assert.equal(inspection.currentApprovalStage, 'koordinator_k3l');
    assert.deepEqual(inspection.approvalHistory, [], 'Safety Officer bukan tahap pengesahan');
    const id = inspection.id;

    // 2. Admin bukan tahap pengesahan -> 403.
    const asAdmin = await decide(admin, id, 'approve', { stageId: 'koordinator_k3l' });
    assert.equal(asAdmin.status, 403);
    assert.equal(asAdmin.body.error, 'FORBIDDEN');

    // 3. Koordinator plant LAIN -> 403, walau tahu id inspeksinya.
    const otherPlant = await decide(rina, id, 'approve', { stageId: 'koordinator_k3l' });
    assert.equal(otherPlant.status, 403);

    // 4. Melompat ke tahap Ketua sebelum Koordinator/Manajer -> 400 STAGE_NOT_CURRENT.
    const skipAhead = await decide(hadi, id, 'approve', { stageId: 'ketua_p2k3' });
    assert.equal(skipAhead.status, 400);
    assert.equal(skipAhead.body.error, 'STAGE_NOT_CURRENT');

    // 5. Koordinator plant-nya sendiri menyetujui — identitas sungguhan tersimpan (S-07).
    const approveKoordinator = await decide(dewi, id, 'approve', { stageId: 'koordinator_k3l' });
    assert.equal(approveKoordinator.status, 200);
    assert.equal(approveKoordinator.body.fullyApproved, false);

    // 5b. Approve ulang tahap yang sudah lewat -> ditolak, bukan menimpa keputusan.
    const doubleApprove = await decide(dewi, id, 'approve', { stageId: 'koordinator_k3l' });
    assert.equal(doubleApprove.status, 400);
    assert.equal(doubleApprove.body.error, 'STAGE_NOT_CURRENT');

    const afterKoordinator = (await arif.agent.get(`/api/inspections/${id}`)).body;
    assert.equal(afterKoordinator.currentApprovalStage, 'manajer');
    assert.equal(afterKoordinator.approvalHistory.length, 1);
    assert.equal(afterKoordinator.approvalHistory[0].reviewerName, 'Dewi');
    assert.equal(afterKoordinator.approvalHistory[0].reviewerUserId, dewi.user.id);

    // 6. Manajer lalu Ketua -> COMPLETED.
    assert.equal((await decide(andi, id, 'approve', { stageId: 'manajer' })).status, 200);
    const approveKetua = await decide(hadi, id, 'approve', { stageId: 'ketua_p2k3' });
    assert.equal(approveKetua.status, 200);
    assert.equal(approveKetua.body.fullyApproved, true);

    const completed = (await arif.agent.get(`/api/inspections/${id}`)).body;
    assert.equal(completed.status, 'completed');
    assert.equal(completed.currentApprovalStage, null);
    assert.deepEqual(completed.approvalHistory.map((entry) => [entry.stage, entry.decision]),
        [['koordinator_k3l', 'approved'], ['manajer', 'approved'], ['ketua_p2k3', 'approved']]);

    // 7. Tambah tindakan perbaikan (butuh foto — PHOTO_REQUIRED bila kosong).
    const noPhoto = await withCsrf(arif.agent.post(`/api/inspections/${id}/corrective-actions`), arif.csrfToken)
        .send({ action: 'Tanpa foto', status: 'open', pic: 'Arif', photos: [] });
    assert.equal(noPhoto.status, 400);
    assert.equal(noPhoto.body.error, 'PHOTO_REQUIRED');

    // Phase 15: "foto wajib" menegakkan file sungguhan (multipart), bukan
    // cuma array nama file lewat JSON — .attach() mengirim byte sungguhan.
    const withPhoto = await withCsrf(arif.agent.post(`/api/inspections/${id}/corrective-actions`), arif.csrfToken)
        .field('action', 'Ganti label')
        .field('status', 'open')
        .field('pic', 'Arif')
        .attach('photos', FIXTURE_JPEG);
    assert.equal(withPhoto.status, 201);

    const afterAction = (await arif.agent.get(`/api/inspections/${id}`)).body;
    // 2 bukan 1: create() sudah otomatis membuat 1 tindakan per temuan.
    assert.equal(afterAction.perbaikan.length, 2);
    assert.equal(afterAction.perbaikan[1].foto[0].originalName, 'label.jpg');
    assert.equal(afterAction.status, 'completed', 'tindakan perbaikan (open) tidak mengubah status alur kerja (Phase 17.2)');

    // 8. Hanya Safety Officer yang boleh menambah tindakan perbaikan.
    const wrongRoleAction = await withCsrf(admin.agent.post(`/api/inspections/${id}/corrective-actions`), admin.csrfToken)
        .send({ action: 'X', status: 'open', pic: 'Y', photos: ['a.jpg'] });
    assert.equal(wrongRoleAction.status, 403);
});

test('penolakan (Phase 17.2): alasan wajib, -> REVISION_REQUIRED di tahap yang menolak, persetujuan lama tetap', async () => {
    const arif = await loginAs('arif');
    const dewi = await loginAs('dewi');
    const andi = await loginAs('andi');
    const { id } = await createInspection(arif);

    assert.equal((await decide(dewi, id, 'approve', { stageId: 'koordinator_k3l' })).status, 200);

    const noReason = await decide(andi, id, 'reject', { stageId: 'manajer', reason: '   ' });
    assert.equal(noReason.status, 400);
    assert.equal(noReason.body.error, 'REJECTION_REASON_REQUIRED');

    const rejected = await decide(andi, id, 'reject', { stageId: 'manajer', reason: 'Foto area kurang jelas' });
    assert.equal(rejected.status, 200);

    const body = (await arif.agent.get(`/api/inspections/${id}`)).body;
    assert.equal(body.status, 'revision_required');
    assert.equal(body.currentApprovalStage, 'manajer', 'tahap tetap di Manajer, tidak mundur ke Koordinator');
    assert.deepEqual(body.approvalHistory.map((entry) => [entry.stage, entry.attempt, entry.decision]),
        [['koordinator_k3l', 1, 'approved'], ['manajer', 1, 'rejected']]);
    assert.equal(body.approvalHistory[1].rejectionReason, 'Foto area kurang jelas');
    assert.equal(body.approvalHistory[1].reviewerUserId, andi.user.id, 'identitas penolak tersimpan (dulu tidak pernah)');

    // Selama revisi, tahap itu tidak bisa diputuskan lagi.
    const whileRevising = await decide(andi, id, 'approve', { stageId: 'manajer' });
    assert.equal(whileRevising.status, 400);
    assert.equal(whileRevising.body.error, 'NOT_IN_REVIEW');
});

test('login mengembalikan plantId Koordinator (cakupan satu plant)', async () => {
    const dewi = await loginAs('dewi');
    const rina = await loginAs('rina');
    const arif = await loginAs('arif');
    assert.equal(dewi.user.plantId, 1);
    assert.equal(rina.user.plantId, 9);
    assert.equal(arif.user.plantId, null);
});

test('POST /api/inspections dengan plantId tidak ada -> 400 PLANT_NOT_FOUND (bukan 500)', async () => {
    const { agent, csrfToken } = await loginAs('arif');
    const res = await withCsrf(agent.post('/api/inspections'), csrfToken).send({
        plantId: 99999,
        tanggal: '2026-09-20',
        status: 'proses',
        temuan: [{ deskripsi: 'x', kategori: 'Lainnya' }],
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'PLANT_NOT_FOUND');
});

test('jadwal: buat, update, hapus (hapus hanya admin)', async () => {
    const arif = await loginAs('arif');
    const admin = await loginAs('admin');

    const created = await withCsrf(arif.agent.post('/api/schedules'), arif.csrfToken)
        .send({ plantId: 1, officer: 'Arif', tahun: 2026, tanggalJadwal: '2026-11-01', periode: 4, minggu: 1 });
    assert.equal(created.status, 201);
    const scheduleId = created.body.schedule.id;

    const updated = await withCsrf(arif.agent.put(`/api/schedules/${scheduleId}`), arif.csrfToken)
        .send({ plantId: 1, officer: 'Arif Diubah', tahun: 2026, tanggalJadwal: '2026-11-02', periode: 4, minggu: 1 });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.schedule.officer, 'Arif Diubah');

    const deleteAsOfficer = await withCsrf(arif.agent.delete(`/api/schedules/${scheduleId}`), arif.csrfToken);
    assert.equal(deleteAsOfficer.status, 403);

    const deleteAsAdmin = await withCsrf(admin.agent.delete(`/api/schedules/${scheduleId}`), admin.csrfToken);
    assert.equal(deleteAsAdmin.status, 200);

    const getDeleted = await arif.agent.get('/api/schedules');
    assert.ok(!getDeleted.body.some((s) => s.id === scheduleId));
});
