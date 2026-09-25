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
    assert.equal(asAdmin.body.length, 8);
});

test('alur penuh: buat inspeksi -> approve berjenjang 2/3/4 -> tambah tindakan perbaikan', async () => {
    const arif = await loginAs('arif');
    const dewi = await loginAs('dewi');
    const andi = await loginAs('andi');
    const hadi = await loginAs('hadi');
    const admin = await loginAs('admin');

    // 1. Safety Officer membuat inspeksi baru. petugas HARUS dipaksa dari
    //    identitas login (Arif), bukan dari body, walau body tidak mengirim
    //    petugas sama sekali.
    const createRes = await withCsrf(arif.agent.post('/api/inspections'), arif.csrfToken).send({
        plantId: 9,
        keteranganLokasi: 'Gudang B',
        tanggal: '2026-09-20',
        status: 'proses',
        dueDate: '2026-10-01',
        temuan: [{ deskripsi: 'Uji end-to-end', kategori: 'Kelistrikan' }],
    });
    assert.equal(createRes.status, 201);
    const inspection = createRes.body.inspection;
    assert.equal(inspection.petugas, 'Arif', 'petugas dipaksa dari req.user, bukan body');
    assert.equal(inspection.approvals[1].approved, true, 'tahap 1 otomatis disetujui');
    assert.equal(inspection.approvals[1].by, 'Arif');
    assert.equal(inspection.approvals[2].approved, false);
    const id = inspection.id;

    // 2. Bukan koordinator -> 403, walau tahap sebelumnya sudah beres.
    const wrongRole = await withCsrf(admin.agent.post(`/api/inspections/${id}/approve`), admin.csrfToken).send({ stageId: 2 });
    assert.equal(wrongRole.status, 403);

    // 3. Lompat ke tahap 4 sebelum tahap 2/3 -> role benar untuk stage 4 (Hadi), supaya PREVIOUS_STAGE_PENDING teruji, bukan sekadar 403 role salah.
    const skipAhead = await withCsrf(hadi.agent.post(`/api/inspections/${id}/approve`), hadi.csrfToken).send({ stageId: 4 });
    assert.equal(skipAhead.status, 400);
    assert.equal(skipAhead.body.error, 'PREVIOUS_STAGE_PENDING');

    // 4. Koordinator K3L (Dewi) menyetujui tahap 2 — identitas sungguhan tersimpan (menutup S-07).
    const approve2 = await withCsrf(dewi.agent.post(`/api/inspections/${id}/approve`), dewi.csrfToken).send({ stageId: 2 });
    assert.equal(approve2.status, 200);
    assert.equal(approve2.body.stage.id, 2);
    assert.equal(approve2.body.fullyApproved, false);

    // 4b. Approve dobel pada tahap yang sama -> ditolak (bukan menimpa keputusan diam-diam).
    const doubleApprove = await withCsrf(dewi.agent.post(`/api/inspections/${id}/approve`), dewi.csrfToken).send({ stageId: 2 });
    assert.equal(doubleApprove.status, 400);
    assert.equal(doubleApprove.body.error, 'ALREADY_APPROVED');

    const afterStage2 = await arif.agent.get(`/api/inspections/${id}`);
    assert.equal(afterStage2.body.approvals[2].approved, true);
    assert.equal(afterStage2.body.approvals[2].by, 'Dewi', 'identitas asli tersimpan, bukan literal "Approver"');

    // 5. Manajer Bagian (Andi) menyetujui tahap 3.
    const approve3 = await withCsrf(andi.agent.post(`/api/inspections/${id}/approve`), andi.csrfToken).send({ stageId: 3 });
    assert.equal(approve3.status, 200);

    // 6. Ketua P2K3 (Hadi) menyetujui tahap 4 -> lengkap, status jadi selesai.
    const approve4 = await withCsrf(hadi.agent.post(`/api/inspections/${id}/approve`), hadi.csrfToken).send({ stageId: 4 });
    assert.equal(approve4.status, 200);
    assert.equal(approve4.body.fullyApproved, true);

    const afterFull = await arif.agent.get(`/api/inspections/${id}`);
    assert.equal(afterFull.body.status, 'selesai');
    assert.equal(afterFull.body.approvals[4].by, 'Hadi');

    // 7. Tambah tindakan perbaikan (butuh foto — PHOTO_REQUIRED bila kosong).
    const noPhoto = await withCsrf(arif.agent.post(`/api/inspections/${id}/corrective-actions`), arif.csrfToken)
        .send({ action: 'Tanpa foto', status: 'open', pic: 'Arif', photos: [] });
    assert.equal(noPhoto.status, 400);
    assert.equal(noPhoto.body.error, 'PHOTO_REQUIRED');

    // Phase 15: "foto wajib" sekarang menegakkan file sungguhan (multipart),
    // bukan lagi cuma array nama file lewat JSON — .attach() mengirim byte
    // sungguhan lewat FIXTURE_JPEG, persis seperti FormData dari browser.
    const withPhotoReq = withCsrf(arif.agent.post(`/api/inspections/${id}/corrective-actions`), arif.csrfToken);
    const withPhoto = await withPhotoReq
        .field('action', 'Ganti label')
        .field('status', 'closed')
        .field('pic', 'Arif')
        .attach('photos', FIXTURE_JPEG);
    assert.equal(withPhoto.status, 201);

    const afterAction = await arif.agent.get(`/api/inspections/${id}`);
    // 2 bukan 1: create() sudah otomatis membuat 1 tindakan "Temuan 1: ..."
    // per temuan (lihat inspection-service.js) — "Ganti label" di atas
    // adalah tindakan KEDUA, ditambahkan lewat corrective-actions endpoint.
    assert.equal(afterAction.body.perbaikan.length, 2);
    assert.equal(afterAction.body.perbaikan[1].foto[0].originalName, 'label.jpg');

    // 8. Hanya Safety Officer yang boleh menambah tindakan perbaikan.
    const wrongRoleAction = await withCsrf(admin.agent.post(`/api/inspections/${id}/corrective-actions`), admin.csrfToken)
        .send({ action: 'X', status: 'open', pic: 'Y', photos: ['a.jpg'] });
    assert.equal(wrongRoleAction.status, 403);
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
