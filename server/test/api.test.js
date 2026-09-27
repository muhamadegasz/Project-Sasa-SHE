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

test('GET /api/inspections -> 6 inspeksi hasil seed, sesuai cakupan pengguna (Phase 17.3A)', async () => {
    // Admin melihat semua non-draft: keenam inspeksi seed.
    const admin = await loginAs('admin');
    const asAdmin = await admin.agent.get('/api/inspections');
    assert.equal(asAdmin.status, 200);
    assert.equal(asAdmin.body.length, 6);

    // Safety Officer tidak melihat revisi milik SO lain (INS-003, Melka) —
    // sebelum Phase 17.3A daftar ini membocorkannya.
    const { agent } = await loginAs('arif');
    const res = await agent.get('/api/inspections');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 5);
    assert.ok(!res.body.some((inspection) => inspection.id === 'INS-003'));
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

/**
 * Membuat inspeksi (Phase 17.3B: selalu DRAFT) lalu — kecuali { submit: false } —
 * mengajukannya lewat endpoint submit, karena kebanyakan test butuh inspeksi
 * yang sudah IN_REVIEW.
 */
async function createInspection(officer, overrides = {}, { submit = true } = {}) {
    const res = await withCsrf(officer.agent.post('/api/inspections'), officer.csrfToken).send({
        plantId: 1,
        keteranganLokasi: 'Gudang B',
        tanggal: '2026-09-20',
        dueDate: '2026-10-01',
        temuan: [{ deskripsi: 'Uji end-to-end', kategori: 'Kelistrikan' }],
        ...overrides,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    if (!submit) return res.body.inspection;
    return submitInspection(officer, res.body.inspection.id);
}

async function submitInspection(officer, id) {
    const res = await withCsrf(officer.agent.post(`/api/inspections/${id}/submit`), officer.csrfToken);
    assert.equal(res.status, 200, JSON.stringify(res.body));
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
    //    body DIABAIKAN; hasilnya DRAFT (Phase 17.3B), lalu diajukan eksplisit.
    const draft = await createInspection(arif, { status: 'completed', petugas: 'Bukan Arif' }, { submit: false });
    assert.equal(draft.petugas, 'Arif', 'petugas dipaksa dari req.user, bukan body');
    assert.equal(draft.status, 'draft', 'status dari body diabaikan — inspeksi baru selalu DRAFT');
    const inspection = await submitInspection(arif, draft.id);
    assert.equal(inspection.status, 'in_review');
    assert.equal(inspection.currentApprovalStage, 'koordinator_k3l');
    assert.deepEqual(inspection.approvalHistory, [], 'Safety Officer bukan tahap pengesahan');
    const id = inspection.id;

    // 2. Admin bukan tahap pengesahan -> 403.
    const asAdmin = await decide(admin, id, 'approve', { stageId: 'koordinator_k3l' });
    assert.equal(asAdmin.status, 403);
    assert.equal(asAdmin.body.error, 'FORBIDDEN');

    // 3. Koordinator plant LAIN tidak melihat inspeksi ini -> 404 (Phase 17.3B:
    //    tidak membocorkan keberadaannya), walau tahu id-nya.
    const otherPlant = await decide(rina, id, 'approve', { stageId: 'koordinator_k3l' });
    assert.equal(otherPlant.status, 404);

    // 4. Ketua belum melihat inspeksi di tahap Koordinator -> 404; Koordinator
    //    (yang melihatnya) mengirim tahap yang salah -> 400 STAGE_NOT_CURRENT.
    const skipAhead = await decide(hadi, id, 'approve', { stageId: 'ketua_p2k3' });
    assert.equal(skipAhead.status, 404);
    const wrongStage = await decide(dewi, id, 'approve', { stageId: 'manajer' });
    assert.equal(wrongStage.status, 400);
    assert.equal(wrongStage.body.error, 'STAGE_NOT_CURRENT');

    // 5. Koordinator plant-nya sendiri menyetujui — identitas sungguhan tersimpan (S-07).
    const approveKoordinator = await decide(dewi, id, 'approve', { stageId: 'koordinator_k3l' });
    assert.equal(approveKoordinator.status, 200);
    assert.equal(approveKoordinator.body.fullyApproved, false);

    // 5b. Approve ulang tahap yang sudah lewat -> ditolak, bukan menimpa keputusan
    //     (Koordinator tidak lagi melihat inspeksi setelah tahapnya lewat -> 404).
    const doubleApprove = await decide(dewi, id, 'approve', { stageId: 'koordinator_k3l' });
    assert.equal(doubleApprove.status, 404);

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

    // Selama revisi, tahap itu tidak bisa diputuskan lagi — Manajer bahkan
    // tidak melihat inspeksi yang sedang direvisi (Phase 17.3B) -> 404.
    const whileRevising = await decide(andi, id, 'approve', { stageId: 'manajer' });
    assert.equal(whileRevising.status, 404);
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

// =========================================================================
// Phase 17.3A — visibilitas baca di server (daftar, detail, file foto).
//
// Seed (server/db/seed.js, di-reset di before()): INS-001 completed plant 1
// (Arif), INS-002 in_review@koordinator plant 3 (Mustofa), INS-003
// revision_required@manajer plant 6 (Melka), INS-004 completed plant 9
// (Tulus), INS-005 in_review@koordinator plant 16, INS-006 in_review@ketua
// plant 14. Koordinator: dewi = plant 1, rina = plant 9.
//
// Inspeksi di luar cakupan harus dijawab 404 {error:'NOT_FOUND'} yang SAMA
// PERSIS dengan id yang tidak ada — setiap test di bawah menguji akses
// LANGSUNG by id (IDOR), bukan hanya isi daftar.
// =========================================================================

/** Inspeksi dengan satu foto sungguhan (multipart) di plant tertentu. */
async function createInspectionWithPhoto(officer, plantId) {
    const res = await withCsrf(officer.agent.post('/api/inspections'), officer.csrfToken)
        .field('plantId', String(plantId))
        .field('keteranganLokasi', `visibilitas plant ${plantId}`)
        .field('tanggal', '2026-09-20')
        .field('dueDate', '2026-10-01')
        .field('temuan', JSON.stringify([{ deskripsi: `Temuan plant ${plantId}`, kategori: 'Lainnya' }]))
        .attach('fotoDekat', FIXTURE_JPEG);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return submitInspection(officer, res.body.inspection.id);
}

async function listedIds(session) {
    const res = await session.agent.get('/api/inspections');
    assert.equal(res.status, 200);
    return res.body.map((inspection) => inspection.id);
}

async function detailStatus(session, id) {
    return (await session.agent.get(`/api/inspections/${id}`)).status;
}

async function photoStatus(session, photoId) {
    return (await session.agent.get(`/api/inspections/photos/${photoId}/file`)).status;
}

async function assertHidden(session, id, label) {
    assert.ok(!(await listedIds(session)).includes(id), `${label}: tidak boleh ada di daftar`);
    assert.equal(await detailStatus(session, id), 404, `${label}: akses langsung by id harus 404`);
}

async function assertVisible(session, id, label) {
    assert.ok((await listedIds(session)).includes(id), `${label}: harus ada di daftar`);
    assert.equal(await detailStatus(session, id), 200, `${label}: akses langsung by id harus 200`);
}

test('visibilitas: 404 untuk inspeksi/foto di luar cakupan identik dengan id yang tidak ada (tidak bisa dienumerasi)', async () => {
    const arif = await loginAs('arif');
    const dewi = await loginAs('dewi');
    const inspection = await createInspectionWithPhoto(arif, 9); // di luar plant dewi
    const photoId = inspection.fotoDekat[0].id;

    const hidden = await dewi.agent.get(`/api/inspections/${inspection.id}`);
    const missing = await dewi.agent.get('/api/inspections/INS-99999');
    assert.equal(hidden.status, 404);
    assert.deepEqual({ status: hidden.status, body: hidden.body }, { status: missing.status, body: missing.body });

    const hiddenPhoto = await dewi.agent.get(`/api/inspections/photos/${photoId}/file`);
    const missingPhoto = await dewi.agent.get('/api/inspections/photos/99999999/file');
    assert.deepEqual({ status: hiddenPhoto.status, body: hiddenPhoto.body }, { status: missingPhoto.status, body: missingPhoto.body });
});

test('visibilitas Safety Officer: miliknya di semua status; milik orang lain hanya IN_REVIEW/COMPLETED; draft & revisi orang lain privat', async () => {
    const arif = await loginAs('arif');
    const tulus = await loginAs('tulus');
    const dewi = await loginAs('dewi');

    const own = await createInspection(arif, { plantId: 1 });
    const others = await createInspection(tulus, { plantId: 1 });

    await assertVisible(arif, own.id, 'IN_REVIEW milik sendiri');
    await assertVisible(arif, others.id, 'IN_REVIEW milik SO lain');
    await assertVisible(arif, 'INS-001', 'COMPLETED milik sendiri (seed)');
    await assertVisible(arif, 'INS-004', 'COMPLETED milik SO lain (seed)');

    // REVISION_REQUIRED: pemilik melihat, SO lain tidak.
    assert.equal((await decide(dewi, own.id, 'reject', { stageId: 'koordinator_k3l', reason: 'Lengkapi foto' })).status, 200);
    await assertVisible(arif, own.id, 'REVISION_REQUIRED milik sendiri');
    await assertHidden(tulus, own.id, 'REVISION_REQUIRED milik SO lain');
    await assertHidden(arif, 'INS-003', 'REVISION_REQUIRED milik SO lain (seed)');

    // DRAFT: pemilik melihat, siapa pun yang lain tidak — termasuk Admin.
    const othersDraft = await createInspection(tulus, { plantId: 1 }, { submit: false });
    await assertVisible(tulus, othersDraft.id, 'DRAFT milik sendiri');
    await assertHidden(arif, othersDraft.id, 'DRAFT milik SO lain');
    for (const username of ['dewi', 'andi', 'hadi', 'admin']) {
        await assertHidden(await loginAs(username), othersDraft.id, `DRAFT dilihat ${username}`);
    }
});

test('visibilitas Koordinator: hanya plant yang ditugaskan — daftar, akses langsung, dan file foto (termasuk foto tindakan perbaikan)', async () => {
    const arif = await loginAs('arif');
    const tulus = await loginAs('tulus');
    const dewi = await loginAs('dewi'); // plant 1
    const rina = await loginAs('rina'); // plant 9

    const plant1 = await createInspectionWithPhoto(arif, 1);
    const plant9 = await createInspectionWithPhoto(tulus, 9);
    const plant1Photo = plant1.fotoDekat[0].id;
    const plant9Photo = plant9.fotoDekat[0].id;

    await assertVisible(dewi, plant1.id, 'plant sendiri, tahap Koordinator');
    await assertHidden(dewi, plant9.id, 'plant lain');
    await assertVisible(rina, plant9.id, 'plant sendiri (rina)');
    await assertHidden(rina, plant1.id, 'plant lain (rina)');
    await assertVisible(dewi, 'INS-001', 'COMPLETED di plant sendiri (seed)');
    await assertHidden(dewi, 'INS-004', 'COMPLETED di plant lain (seed)');

    assert.equal(await photoStatus(dewi, plant1Photo), 200, 'foto inspeksi plant sendiri');
    assert.equal(await photoStatus(dewi, plant9Photo), 404, 'foto inspeksi plant lain — tahu id foto tidak cukup');
    assert.equal(await photoStatus(rina, plant9Photo), 200);
    assert.equal(await photoStatus(rina, plant1Photo), 404);

    // Foto tindakan perbaikan diselesaikan ke inspeksinya dulu.
    const action = await withCsrf(tulus.agent.post(`/api/inspections/${plant9.id}/corrective-actions`), tulus.csrfToken)
        .field('action', 'Bukti perbaikan')
        .field('status', 'open')
        .field('pic', 'Tulus')
        .attach('photos', FIXTURE_JPEG);
    assert.equal(action.status, 201);
    const withAction = (await tulus.agent.get(`/api/inspections/${plant9.id}`)).body;
    const actionPhoto = withAction.perbaikan.at(-1).foto[0].id;
    assert.equal(await photoStatus(rina, actionPhoto), 200, 'foto tindakan perbaikan, plant sendiri');
    assert.equal(await photoStatus(dewi, actionPhoto), 404, 'foto tindakan perbaikan, plant lain');

    // Cakupan mengikuti alur kerja: setelah tahap Koordinator lewat, koordinator tidak lagi melihatnya.
    assert.equal((await decide(dewi, plant1.id, 'approve', { stageId: 'koordinator_k3l' })).status, 200);
    await assertHidden(dewi, plant1.id, 'plant sendiri, tahap sudah lewat ke Manajer');
    assert.equal(await photoStatus(dewi, plant1Photo), 404);
});

test('visibilitas Koordinator tanpa plant yang ditugaskan: tidak melihat apa pun', async () => {
    const rina = await loginAs('rina');
    const [[{ id: rinaId }]] = await pool.query("SELECT id FROM users WHERE username = 'rina'");
    const arif = await loginAs('arif');
    const inspection = await createInspectionWithPhoto(arif, 9);

    await pool.query('UPDATE users SET plant_id = NULL WHERE id = ?', [rinaId]);
    try {
        const list = await rina.agent.get('/api/inspections');
        assert.equal(list.status, 200);
        assert.deepEqual(list.body, [], 'daftar kosong');
        assert.equal(await detailStatus(rina, inspection.id), 404);
        assert.equal(await detailStatus(rina, 'INS-004'), 404, 'bahkan COMPLETED di plant yang dulu miliknya');
        assert.equal(await photoStatus(rina, inspection.fotoDekat[0].id), 404);
    } finally {
        await pool.query('UPDATE users SET plant_id = 9 WHERE id = ?', [rinaId]);
    }
});

test('visibilitas Manajer: lintas plant (tidak mewarisi batas plant Koordinator), hanya tahapnya + yang selesai', async () => {
    const arif = await loginAs('arif');
    const dewi = await loginAs('dewi');
    const rina = await loginAs('rina');
    const andi = await loginAs('andi');

    const plant1 = await createInspection(arif, { plantId: 1 });
    const plant9 = await createInspection(arif, { plantId: 9 });
    assert.equal((await decide(dewi, plant1.id, 'approve', { stageId: 'koordinator_k3l' })).status, 200);
    assert.equal((await decide(rina, plant9.id, 'approve', { stageId: 'koordinator_k3l' })).status, 200);

    await assertVisible(andi, plant1.id, 'tahap Manajer, plant 1');
    await assertVisible(andi, plant9.id, 'tahap Manajer, plant 9');
    await assertVisible(andi, 'INS-001', 'COMPLETED plant 1');
    await assertVisible(andi, 'INS-004', 'COMPLETED plant 9');
    await assertHidden(andi, 'INS-002', 'masih di tahap Koordinator');
    await assertHidden(andi, 'INS-006', 'sudah di tahap Ketua');
    await assertHidden(andi, 'INS-003', 'REVISION_REQUIRED (walau tahapnya Manajer)');
});

test('visibilitas Ketua P2K3: tahapnya sendiri + yang selesai', async () => {
    const hadi = await loginAs('hadi');
    await assertVisible(hadi, 'INS-006', 'tahap Ketua');
    await assertVisible(hadi, 'INS-001', 'COMPLETED');
    await assertVisible(hadi, 'INS-004', 'COMPLETED');
    await assertHidden(hadi, 'INS-002', 'tahap Koordinator');
    await assertHidden(hadi, 'INS-003', 'REVISION_REQUIRED');
});

test('visibilitas Admin: IN_REVIEW, REVISION_REQUIRED, COMPLETED terlihat; DRAFT tidak', async () => {
    const admin = await loginAs('admin');
    const arif = await loginAs('arif');
    await assertVisible(admin, 'INS-002', 'IN_REVIEW');
    await assertVisible(admin, 'INS-003', 'REVISION_REQUIRED');
    await assertVisible(admin, 'INS-001', 'COMPLETED');

    const draft = await createInspection(arif, { plantId: 3 }, { submit: false });
    await assertHidden(admin, draft.id, 'DRAFT');
});

test('visibilitas tindakan perbaikan: draft/revisi SO lain tidak bisa dibaca atau ditulisi lewat POST corrective-actions', async () => {
    const arif = await loginAs('arif');
    const tulus = await loginAs('tulus');
    const dewi = await loginAs('dewi');
    const { readdirSync } = await import('node:fs');
    const { UPLOAD_DIR } = await import('../config/upload.js');

    const postAction = (session, id) => withCsrf(session.agent.post(`/api/inspections/${id}/corrective-actions`), session.csrfToken)
        .field('action', 'Tindakan dari SO lain')
        .field('status', 'open')
        .field('pic', 'Tulus')
        .attach('photos', FIXTURE_JPEG);
    const actionCount = async (id) => {
        const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM corrective_actions WHERE inspection_id = ?', [Number(String(id).replace(/\D/g, ''))]);
        return total;
    };

    const draft = await createInspection(arif, { plantId: 1, keteranganLokasi: 'RAHASIA-DRAFT' }, { submit: false });
    const revision = await createInspection(arif, { plantId: 1 });
    assert.equal((await decide(dewi, revision.id, 'reject', { stageId: 'koordinator_k3l', reason: 'Lengkapi' })).status, 200);

    const missing = await postAction(tulus, 'INS-99999');
    for (const [label, target] of [['DRAFT', draft], ['REVISION_REQUIRED', revision]]) {
        const filesBefore = readdirSync(UPLOAD_DIR).length;
        const actionsBefore = await actionCount(target.id);
        const res = await postAction(tulus, target.id);
        assert.equal(res.status, 404, `${label} SO lain: ditolak`);
        assert.deepEqual({ status: res.status, body: res.body }, { status: missing.status, body: missing.body }, `${label}: identik dengan id tidak ada`);
        assert.ok(!JSON.stringify(res.body).includes('RAHASIA'), `${label}: tidak ada data inspeksi di respons`);
        assert.equal(await actionCount(target.id), actionsBefore, `${label}: tidak ada tindakan tersimpan`);
        assert.equal(readdirSync(UPLOAD_DIR).length, filesBefore, `${label}: foto yang terlanjur diunggah dibersihkan`);
    }

    // Pemilik tetap bisa menambah tindakan ke revisinya. SO lain yang BISA
    // melihat inspeksinya (IN_REVIEW) tetap ditolak 403 — sejak Phase 17.3B
    // hanya pemilik yang boleh (sebelumnya 201).
    assert.equal((await postAction(arif, revision.id)).status, 201, 'pemilik, REVISION_REQUIRED');
    const visibleToTulus = await createInspection(arif, { plantId: 1 });
    assert.equal((await postAction(tulus, visibleToTulus.id)).status, 403, 'SO lain, IN_REVIEW: hanya-lihat');
});

// =========================================================================
// Phase 17.3B — siklus hidup draft, kepemilikan, dan keterbukaan informasi
// approve/reject. Setiap aksi juga diuji lewat akses LANGSUNG by id (IDOR).
// =========================================================================

function putDraft(session, id, body) {
    return withCsrf(session.agent.put(`/api/inspections/${id}`), session.csrfToken).send(body);
}

const DRAFT_CONTENT = {
    plantId: 1,
    keteranganLokasi: 'Draft awal',
    tanggal: '2026-09-21',
    dueDate: '2026-10-05',
    temuan: [{ deskripsi: 'Temuan draft A', kategori: 'Kelistrikan' }, { deskripsi: 'Temuan draft B', kategori: 'Lainnya' }],
};

test('draft: dibuat sebagai DRAFT milik pengguna login — tanpa tahap/pengajuan/riwayat/tindakan; privat; isian status & pemilik diabaikan', async () => {
    const arif = await loginAs('arif');
    const tulus = await loginAs('tulus');
    const draft = await createInspection(arif, {
        ...DRAFT_CONTENT, status: 'in_review', currentApprovalStage: 'manajer', petugasUserId: tulus.user.id, submittedAt: '2026-01-01',
    }, { submit: false });

    assert.equal(draft.status, 'draft');
    assert.equal(draft.currentApprovalStage, null);
    assert.equal(draft.submittedAt, null);
    assert.deepEqual(draft.approvalHistory, []);
    assert.deepEqual(draft.perbaikan, [], 'tindakan awal baru dibuat saat pengajuan pertama');
    assert.equal(draft.petugasUserId, arif.user.id, 'pemilik dari sesi, bukan body');

    await assertVisible(arif, draft.id, 'pemilik');
    for (const username of ['tulus', 'dewi', 'andi', 'hadi', 'admin']) {
        await assertHidden(await loginAs(username), draft.id, `draft dilihat ${username}`);
    }
});

test('ubah draft: hanya pemilik; status tetap DRAFT; temuan diperbarui/ditambah/dihapus; status/tahap/pemilik dari body diabaikan; foto baru ditambahkan', async () => {
    const arif = await loginAs('arif');
    const tulus = await loginAs('tulus');
    const admin = await loginAs('admin');
    const dewi = await loginAs('dewi');
    const draft = await createInspection(arif, DRAFT_CONTENT, { submit: false });
    const [findingA] = draft.temuan;

    const edited = {
        ...DRAFT_CONTENT,
        keteranganLokasi: 'Draft diubah',
        temuan: [{ id: findingA.id, deskripsi: 'Temuan draft A (diperbarui)', kategori: 'Kebakaran' }, { deskripsi: 'Temuan draft C', kategori: 'Kebocoran' }],
        status: 'completed', currentApprovalStage: 'ketua_p2k3', petugasUserId: tulus.user.id,
    };

    // Bukan pemilik: SO lain tidak melihat draft -> 404 (sama dengan id tidak ada); non-SO -> 403 (role).
    assert.equal((await putDraft(tulus, draft.id, edited)).status, 404);
    assert.equal((await putDraft(admin, draft.id, edited)).status, 403);
    assert.equal((await putDraft(dewi, draft.id, edited)).status, 403);
    assert.equal((await putDraft(arif, 'INS-99999', edited)).status, 404);

    const res = await putDraft(arif, draft.id, edited);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const saved = res.body.inspection;
    assert.equal(saved.status, 'draft');
    assert.equal(saved.currentApprovalStage, null);
    assert.equal(saved.petugasUserId, arif.user.id);
    assert.equal(saved.keteranganLokasi, 'Draft diubah');
    assert.deepEqual(saved.temuan.map((finding) => [finding.deskripsi, finding.kategori]),
        [['Temuan draft A (diperbarui)', 'Kebakaran'], ['Temuan draft C', 'Kebocoran']], 'B dihapus, A diperbarui, C ditambahkan');
    assert.equal(saved.temuan[0].id, findingA.id, 'temuan A diperbarui di tempat, bukan diganti');

    // Id temuan milik inspeksi LAIN tidak bisa dipakai untuk menyentuhnya — diperlakukan sebagai temuan baru.
    const other = await createInspection(tulus, DRAFT_CONTENT, { submit: false });
    const foreignId = other.temuan[0].id;
    const withForeign = await putDraft(arif, draft.id, { ...DRAFT_CONTENT, temuan: [{ id: foreignId, deskripsi: 'Mencoba menimpa', kategori: 'Lainnya' }] });
    assert.equal(withForeign.status, 200);
    const [[foreignRow]] = await pool.query('SELECT deskripsi, inspection_id FROM findings WHERE id = ?', [foreignId]);
    assert.equal(foreignRow.deskripsi, 'Temuan draft A', 'temuan milik inspeksi lain tidak berubah');

    // Validasi isi tetap berlaku saat mengubah.
    const invalid = await putDraft(arif, draft.id, { ...DRAFT_CONTENT, temuan: [] });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error, 'FINDINGS_REQUIRED');

    // Foto baru lewat multipart ditambahkan ke draft.
    const withPhoto = await withCsrf(arif.agent.put(`/api/inspections/${draft.id}`), arif.csrfToken)
        .field('plantId', '1').field('tanggal', '2026-09-21').field('dueDate', '2026-10-05')
        .field('temuan', JSON.stringify(DRAFT_CONTENT.temuan))
        .attach('fotoDekat', FIXTURE_JPEG);
    assert.equal(withPhoto.status, 200, JSON.stringify(withPhoto.body));
    assert.equal(withPhoto.body.inspection.fotoDekat.length, 1);
    assert.equal(await photoStatus(arif, withPhoto.body.inspection.fotoDekat[0].id), 200);
});

test('ajukan: DRAFT -> IN_REVIEW di Koordinator, submittedAt terisi, tanpa entri pengesahan, tindakan awal per temuan; hanya pemilik; tidak dua kali', async () => {
    const arif = await loginAs('arif');
    const tulus = await loginAs('tulus');
    const admin = await loginAs('admin');
    const draft = await createInspection(arif, DRAFT_CONTENT, { submit: false });
    const submitAs = (session, id) => withCsrf(session.agent.post(`/api/inspections/${id}/submit`), session.csrfToken);

    assert.equal((await submitAs(tulus, draft.id)).status, 404, 'SO lain tidak melihat draft');
    assert.equal((await submitAs(admin, draft.id)).status, 403, 'non-SO');
    assert.equal((await submitAs(arif, 'INS-99999')).status, 404);

    const res = await submitAs(arif, draft.id);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const submitted = res.body.inspection;
    assert.equal(submitted.status, 'in_review');
    assert.equal(submitted.currentApprovalStage, 'koordinator_k3l');
    assert.ok(submitted.submittedAt, 'submittedAt terisi');
    assert.deepEqual(submitted.approvalHistory, [], 'pengajuan bukan keputusan pengesahan');
    assert.deepEqual(submitted.perbaikan.map((action) => [action.action, action.status]),
        [['Temuan 1: Temuan draft A', 'open'], ['Temuan 2: Temuan draft B', 'open']]);
    const [[{ total: approvalRows }]] = await pool.query('SELECT COUNT(*) AS total FROM approvals WHERE inspection_id = ?', [Number(draft.id.replace(/\D/g, ''))]);
    assert.equal(approvalRows, 0, 'tidak ada baris approvals palsu untuk pengajuan');

    const again = await submitAs(arif, draft.id);
    assert.equal(again.status, 400);
    assert.equal(again.body.error, 'NOT_SUBMITTABLE');

    // Setelah diajukan, draft tidak bisa lagi diubah.
    const editAfter = await putDraft(arif, draft.id, DRAFT_CONTENT);
    assert.equal(editAfter.status, 400);
    assert.equal(editAfter.body.error, 'NOT_EDITABLE');

    // Dua pengajuan bersamaan: tepat satu berhasil, tindakan awal tidak terduplikasi.
    const race = await createInspection(arif, DRAFT_CONTENT, { submit: false });
    const results = await Promise.all([submitAs(arif, race.id), submitAs(arif, race.id)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
    const [[{ total: actionRows }]] = await pool.query('SELECT COUNT(*) AS total FROM corrective_actions WHERE inspection_id = ?', [Number(race.id.replace(/\D/g, ''))]);
    assert.equal(actionRows, 2);
});

test('revisi: tolak -> REVISION_REQUIRED (tahap tetap) -> pemilik merevisi -> ajukan ulang ke tahap YANG SAMA -> attempt baru; riwayat utuh', async () => {
    const arif = await loginAs('arif');
    const tulus = await loginAs('tulus');
    const dewi = await loginAs('dewi');
    const andi = await loginAs('andi');
    const hadi = await loginAs('hadi');
    const inspection = await createInspection(arif, DRAFT_CONTENT);

    assert.equal((await decide(dewi, inspection.id, 'approve', { stageId: 'koordinator_k3l' })).status, 200);
    assert.equal((await decide(andi, inspection.id, 'reject', { stageId: 'manajer', reason: 'Tambahkan temuan jalur evakuasi' })).status, 200);

    const rejected = (await arif.agent.get(`/api/inspections/${inspection.id}`)).body;
    assert.equal(rejected.status, 'revision_required');
    assert.equal(rejected.currentApprovalStage, 'manajer', 'tidak kembali ke Koordinator');

    // Hanya pemilik yang boleh merevisi.
    const revisedContent = { ...DRAFT_CONTENT, temuan: [...rejected.temuan, { deskripsi: 'Jalur evakuasi terhalang', kategori: 'Kecelakaan' }] };
    assert.equal((await putDraft(tulus, inspection.id, revisedContent)).status, 404, 'SO lain tidak melihat revisi');
    assert.equal((await putDraft(andi, inspection.id, revisedContent)).status, 403, 'peninjau bukan SO');

    const revised = await putDraft(arif, inspection.id, revisedContent);
    assert.equal(revised.status, 200, JSON.stringify(revised.body));
    assert.equal(revised.body.inspection.status, 'revision_required', 'menyimpan revisi bukan mengajukan ulang');
    assert.equal(revised.body.inspection.perbaikan.at(-1).action, 'Temuan 3: Jalur evakuasi terhalang', 'temuan baru pada revisi mendapat tindakan awal');

    const resubmitRes = await withCsrf(tulus.agent.post(`/api/inspections/${inspection.id}/submit`), tulus.csrfToken);
    assert.equal(resubmitRes.status, 404, 'SO lain tidak bisa mengajukan ulang');
    const resubmitted = await submitInspection(arif, inspection.id);
    assert.equal(resubmitted.status, 'in_review');
    assert.equal(resubmitted.currentApprovalStage, 'manajer', 'kembali ke tahap yang menolak');
    assert.deepEqual(resubmitted.approvalHistory.map((entry) => [entry.stage, entry.attempt, entry.decision]),
        [['koordinator_k3l', 1, 'approved'], ['manajer', 1, 'rejected']], 'tidak ada keputusan baru sampai peninjau memutuskan');

    assert.equal((await decide(andi, inspection.id, 'approve', { stageId: 'manajer' })).status, 200);
    assert.equal((await decide(hadi, inspection.id, 'approve', { stageId: 'ketua_p2k3' })).status, 200);
    const completed = (await arif.agent.get(`/api/inspections/${inspection.id}`)).body;
    assert.equal(completed.status, 'completed');
    assert.deepEqual(completed.approvalHistory.map((entry) => [entry.stage, entry.attempt, entry.decision]), [
        ['koordinator_k3l', 1, 'approved'], ['manajer', 1, 'rejected'], ['manajer', 2, 'approved'], ['ketua_p2k3', 1, 'approved'],
    ], 'attempt 1 tidak ditimpa');
});

test('hapus draft: hanya pemilik & hanya DRAFT; file fotonya ikut dihapus dari disk', async () => {
    const arif = await loginAs('arif');
    const tulus = await loginAs('tulus');
    const admin = await loginAs('admin');
    const { readdirSync } = await import('node:fs');
    const { UPLOAD_DIR } = await import('../config/upload.js');
    const deleteAs = (session, id) => withCsrf(session.agent.delete(`/api/inspections/${id}`), session.csrfToken);

    const created = await withCsrf(arif.agent.post('/api/inspections'), arif.csrfToken)
        .field('plantId', '1').field('tanggal', '2026-09-21')
        .field('temuan', JSON.stringify(DRAFT_CONTENT.temuan))
        .attach('fotoDekat', FIXTURE_JPEG);
    assert.equal(created.status, 201);
    const draft = created.body.inspection;
    const filesWithDraft = readdirSync(UPLOAD_DIR).length;

    assert.equal((await deleteAs(tulus, draft.id)).status, 404, 'SO lain');
    assert.equal((await deleteAs(admin, draft.id)).status, 403, 'Admin (penghapusan Admin fase lain)');
    const submitted = await createInspection(arif, DRAFT_CONTENT);
    const notDraft = await deleteAs(arif, submitted.id);
    assert.equal(notDraft.status, 400);
    assert.equal(notDraft.body.error, 'NOT_DELETABLE');

    assert.equal((await deleteAs(arif, draft.id)).status, 200);
    assert.equal(await detailStatus(arif, draft.id), 404);
    assert.equal(readdirSync(UPLOAD_DIR).length, filesWithDraft - 1, 'file foto draft terhapus');
});

test('approve/reject: inspeksi yang tidak terlihat -> 404 identik dengan id tidak ada (status/tahap tidak bocor); terlihat tapi tidak berwenang -> 403', async () => {
    const arif = await loginAs('arif');
    const rina = await loginAs('rina');
    const admin = await loginAs('admin');
    const draft = await createInspection(arif, DRAFT_CONTENT, { submit: false });
    const inReview = await createInspection(arif, DRAFT_CONTENT);

    const missingApprove = await decide(rina, 'INS-99999', 'approve', { stageId: 'koordinator_k3l' });
    assert.equal(missingApprove.status, 404);
    for (const [label, id, action, body] of [
        ['approve, plant lain (IN_REVIEW)', inReview.id, 'approve', { stageId: 'koordinator_k3l' }],
        ['reject, plant lain (IN_REVIEW)', inReview.id, 'reject', { stageId: 'koordinator_k3l', reason: 'x' }],
        ['approve, draft', draft.id, 'approve', { stageId: 'koordinator_k3l' }],
        ['approve, tahap salah & tidak terlihat', inReview.id, 'approve', { stageId: 'manajer' }],
    ]) {
        const res = await decide(rina, id, action, body);
        assert.deepEqual({ status: res.status, body: res.body }, { status: missingApprove.status, body: missingApprove.body }, label);
    }
    // Admin melihat draft? Tidak -> juga 404.
    assert.equal((await decide(admin, draft.id, 'approve', { stageId: 'koordinator_k3l' })).status, 404);

    // Terlihat tapi tidak berwenang: aturan wewenang yang ada tetap berlaku.
    const ownerApprove = await decide(arif, inReview.id, 'approve', { stageId: 'koordinator_k3l' });
    assert.equal(ownerApprove.status, 403);
    assert.equal(ownerApprove.body.error, 'FORBIDDEN');
    assert.equal((await decide(admin, inReview.id, 'reject', { stageId: 'koordinator_k3l', reason: 'x' })).status, 403);
});

test('alasan penolakan divalidasi server: kosong, spasi, bukan string, terlalu panjang -> 400; valid -> diterima', async () => {
    const arif = await loginAs('arif');
    const dewi = await loginAs('dewi');
    const inspection = await createInspection(arif, DRAFT_CONTENT);
    const rejectWith = (reason) => decide(dewi, inspection.id, 'reject', { stageId: 'koordinator_k3l', reason });

    for (const [reason, error] of [
        ['', 'REJECTION_REASON_REQUIRED'],
        ['   ', 'REJECTION_REASON_REQUIRED'],
        [undefined, 'REJECTION_REASON_REQUIRED'],
        [{ injected: '<script>' }, 'REJECTION_REASON_INVALID'],
        [['a', 'b'], 'REJECTION_REASON_INVALID'],
        [12345, 'REJECTION_REASON_INVALID'],
        ['x'.repeat(1001), 'REJECTION_REASON_TOO_LONG'],
    ]) {
        const res = await rejectWith(reason);
        assert.equal(res.status, 400, JSON.stringify(reason));
        assert.equal(res.body.error, error, JSON.stringify(reason));
    }
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM approvals WHERE inspection_id = ?', [Number(inspection.id.replace(/\D/g, ''))]);
    assert.equal(total, 0, 'tidak ada keputusan tersimpan dari alasan yang ditolak');

    const valid = await rejectWith('  Foto kurang jelas  ');
    assert.equal(valid.status, 200);
    const body = (await arif.agent.get(`/api/inspections/${inspection.id}`)).body;
    assert.equal(body.approvalHistory[0].rejectionReason, 'Foto kurang jelas', 'disimpan setelah di-trim');
});

test('tindakan perbaikan: HANYA SO pemilik — SO lain yang melihat, peninjau, Manajer, Admin ditolak; id yang diketahui tidak cukup', async () => {
    const arif = await loginAs('arif');
    const tulus = await loginAs('tulus');
    const inspection = await createInspection(arif, DRAFT_CONTENT);
    const postAction = (session, id) => withCsrf(session.agent.post(`/api/inspections/${id}/corrective-actions`), session.csrfToken)
        .field('action', 'Tindakan uji kepemilikan').field('status', 'open').field('pic', 'X')
        .attach('photos', FIXTURE_JPEG);

    assert.equal(await detailStatus(tulus, inspection.id), 200, 'SO lain MELIHAT inspeksi IN_REVIEW...');
    const byOther = await postAction(tulus, inspection.id);
    assert.equal(byOther.status, 403, '...tapi tidak boleh menambah tindakan');
    assert.equal(byOther.body.error, 'FORBIDDEN');
    for (const username of ['dewi', 'andi', 'hadi', 'admin']) {
        assert.equal((await postAction(await loginAs(username), inspection.id)).status, 403, username);
    }
    assert.equal((await postAction(arif, inspection.id)).status, 201, 'pemilik');
});
