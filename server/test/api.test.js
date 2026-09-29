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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { UPLOAD_DIR } from '../config/upload.js';
import { SIGNATURE_DIR, detectSignatureMimeType } from '../config/signature-storage.js';
import { SIGNATURE_MAX_BYTES } from '../../src/domain/signature-rules.js';

const FIXTURE_JPEG = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'label.jpg');
const FIXTURE_PNG = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'signature.png');

// Phase 17.4B.1: DB_NAME dari .env.test (npm run test:api memakai --env-file),
// jadi seluruh berkas ini — app, pool, migrate, seed — memakai database UJI.
// migrate membuat she_sasa_test bila belum ada (idempoten); seed.js menolak
// database yang namanya tidak berakhiran _test.
before(() => {
    execFileSync(process.execPath, ['server/db/migrate.js'], { cwd: process.cwd(), stdio: ['ignore', 'ignore', 'inherit'] });
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

/**
 * Phase 17.4A: persetujuan wajib bertanda tangan, jadi `approve` selalu dikirim
 * multipart dengan tanda tangan PNG sah — penolakan 403/404 di test lain
 * karena itu terbukti berasal dari wewenang/visibilitas, bukan dari tanda
 * tangan yang tidak ada. `reject` tetap JSON.
 */
function decide(session, id, action, body) {
    const req = withCsrf(session.agent.post(`/api/inspections/${id}/${action}`), session.csrfToken);
    if (action !== 'approve') return req.send(body);
    return req.field('stageId', body.stageId).field('signatureMethod', 'upload').attach('signature', FIXTURE_PNG);
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

    // 5b. Approve ulang tahap yang sudah lewat -> ditolak, bukan menimpa keputusan.
    //     Koordinator tetap MELIHAT inspeksi yang dia setujui (riwayat), jadi
    //     penolakannya berasal dari tahap, bukan dari visibilitas.
    const doubleApprove = await decide(dewi, id, 'approve', { stageId: 'koordinator_k3l' });
    assert.equal(doubleApprove.status, 400);
    assert.equal(doubleApprove.body.error, 'STAGE_NOT_CURRENT');

    const afterKoordinator = (await arif.agent.get(`/api/inspections/${id}`)).body;
    assert.equal(afterKoordinator.currentApprovalStage, 'manajer');
    assert.equal(afterKoordinator.approvalHistory.length, 1);
    assert.equal(afterKoordinator.approvalHistory[0].reviewerName, 'Dewi');
    assert.equal(afterKoordinator.approvalHistory[0].reviewerUserId, dewi.user.id);

    // 6. Tindakan perbaikan oleh pemilik selagi IN_REVIEW (butuh foto — PHOTO_REQUIRED bila kosong).
    const noPhoto = await withCsrf(arif.agent.post(`/api/inspections/${id}/corrective-actions`), arif.csrfToken)
        .send({ action: 'Tanpa foto', status: 'open', pic: 'Arif', photos: [] });
    assert.equal(noPhoto.status, 400);
    assert.equal(noPhoto.body.error, 'PHOTO_REQUIRED');

    // Phase 15: "foto wajib" menegakkan file sungguhan (multipart), bukan
    // cuma array nama file lewat JSON — .attach() mengirim byte sungguhan.
    const withPhoto = await withCsrf(arif.agent.post(`/api/inspections/${id}/corrective-actions`), arif.csrfToken)
        .field('action', 'Ganti label')
        .field('status', 'closed')
        .field('pic', 'Arif')
        .attach('photos', FIXTURE_JPEG);
    assert.equal(withPhoto.status, 201);

    const afterAction = (await arif.agent.get(`/api/inspections/${id}`)).body;
    // 2 bukan 1: pengajuan pertama sudah membuat 1 tindakan awal per temuan.
    assert.equal(afterAction.perbaikan.length, 2);
    assert.equal(afterAction.perbaikan[1].foto[0].originalName, 'label.jpg');
    assert.equal(afterAction.status, 'in_review', 'tindakan perbaikan (closed) tidak mengubah status alur kerja (Phase 17.2)');
    assert.equal(afterAction.currentApprovalStage, 'manajer');

    // 7. Hanya Safety Officer yang boleh menambah tindakan perbaikan.
    const wrongRoleAction = await withCsrf(admin.agent.post(`/api/inspections/${id}/corrective-actions`), admin.csrfToken)
        .send({ action: 'X', status: 'open', pic: 'Y', photos: ['a.jpg'] });
    assert.equal(wrongRoleAction.status, 403);

    // 8. Manajer lalu Ketua -> COMPLETED.
    assert.equal((await decide(andi, id, 'approve', { stageId: 'manajer' })).status, 200);
    const approveKetua = await decide(hadi, id, 'approve', { stageId: 'ketua_p2k3' });
    assert.equal(approveKetua.status, 200);
    assert.equal(approveKetua.body.fullyApproved, true);

    const completed = (await arif.agent.get(`/api/inspections/${id}`)).body;
    assert.equal(completed.status, 'completed');
    assert.equal(completed.currentApprovalStage, null);
    assert.deepEqual(completed.approvalHistory.map((entry) => [entry.stage, entry.decision]),
        [['koordinator_k3l', 'approved'], ['manajer', 'approved'], ['ketua_p2k3', 'approved']]);

    // 9. COMPLETED bersifat final: pemilik pun tidak bisa lagi menambah tindakan perbaikan.
    const afterCompleted = await withCsrf(arif.agent.post(`/api/inspections/${id}/corrective-actions`), arif.csrfToken)
        .field('action', 'Setelah selesai')
        .field('status', 'open')
        .field('pic', 'Arif')
        .attach('photos', FIXTURE_JPEG);
    assert.equal(afterCompleted.status, 400);
    assert.equal(afterCompleted.body.error, 'INSPECTION_COMPLETED');
    assert.equal((await arif.agent.get(`/api/inspections/${id}`)).body.perbaikan.length, 2, 'tidak ada tindakan tersimpan');
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

test('jadwal: tanggal realisasi (opsional) tersimpan "YYYY-MM-DD" dan bisa dikosongkan; Admin boleh membuat & mengubah', async () => {
    const arif = await loginAs('arif');
    const admin = await loginAs('admin');
    const body = { plantId: 8, officer: 'Arif', tahun: 2026, tanggalJadwal: '2026-11-01', periode: 4, minggu: 2 };
    const scheduleOf = async (id) => (await arif.agent.get('/api/schedules')).body.find((s) => s.id === id);

    // Persis bentuk kiriman form (input date kosong -> "").
    const created = await withCsrf(arif.agent.post('/api/schedules'), arif.csrfToken).send({ ...body, tanggalRealisasi: '' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.schedule.id;
    assert.equal((await scheduleOf(id)).tanggalRealisasi, null, 'tanpa realisasi -> NULL');

    const realized = await withCsrf(arif.agent.put(`/api/schedules/${id}`), arif.csrfToken).send({ ...body, tanggalRealisasi: '2026-11-03' });
    assert.equal(realized.status, 200, JSON.stringify(realized.body));
    assert.deepEqual(
        (({ tanggalJadwal, tanggalRealisasi, minggu, periode, tahun, plantId }) => ({ tanggalJadwal, tanggalRealisasi, minggu, periode, tahun, plantId }))(await scheduleOf(id)),
        { tanggalJadwal: '2026-11-01', tanggalRealisasi: '2026-11-03', minggu: 2, periode: 4, tahun: 2026, plantId: 8 },
        'tersimpan di database, bukan hanya di respons',
    );

    const cleared = await withCsrf(arif.agent.put(`/api/schedules/${id}`), arif.csrfToken).send({ ...body, tanggalRealisasi: '' });
    assert.equal(cleared.status, 200);
    assert.equal((await scheduleOf(id)).tanggalRealisasi, null, 'realisasi boleh dikosongkan lagi');

    const byAdmin = await withCsrf(admin.agent.put(`/api/schedules/${id}`), admin.csrfToken).send({ ...body, tanggalRealisasi: '2026-11-04' });
    assert.equal(byAdmin.status, 200);
    assert.equal((await scheduleOf(id)).tanggalRealisasi, '2026-11-04');
});

test('jadwal: Koordinator, Manajer, Ketua -> 403 FORBIDDEN untuk membuat & mengubah (otorisasi tidak berubah); data tidak tersentuh', async () => {
    const arif = await loginAs('arif');
    const body = { plantId: 1, officer: 'Arif', tahun: 2026, tanggalJadwal: '2026-11-01', periode: 4, minggu: 1, tanggalRealisasi: '' };
    const created = await withCsrf(arif.agent.post('/api/schedules'), arif.csrfToken).send(body);
    const id = created.body.schedule.id;
    const [[{ total: before }]] = await pool.query('SELECT COUNT(*) AS total FROM schedules');

    for (const username of ['dewi', 'andi', 'hadi']) {
        const session = await loginAs(username);
        const post = await withCsrf(session.agent.post('/api/schedules'), session.csrfToken).send(body);
        assert.equal(post.status, 403, `${username} POST`);
        assert.equal(post.body.error, 'FORBIDDEN');
        const put = await withCsrf(session.agent.put(`/api/schedules/${id}`), session.csrfToken).send({ ...body, tanggalRealisasi: '2026-11-03' });
        assert.equal(put.status, 403, `${username} PUT`);
        assert.equal(put.body.error, 'FORBIDDEN');
    }

    const [[{ total: after }]] = await pool.query('SELECT COUNT(*) AS total FROM schedules');
    assert.equal(after, before, 'tidak ada jadwal baru');
    const stored = (await arif.agent.get('/api/schedules')).body.find((s) => s.id === id);
    assert.equal(stored.tanggalRealisasi, null, 'jadwal tidak berubah');
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

    // Setelah tahap Koordinator lewat, penyetujunya tetap melihat (riwayat), plant lain tetap tidak.
    assert.equal((await decide(dewi, plant1.id, 'approve', { stageId: 'koordinator_k3l' })).status, 200);
    await assertVisible(dewi, plant1.id, 'plant sendiri, disetujui dewi, tahap sudah lewat ke Manajer');
    assert.equal(await photoStatus(dewi, plant1Photo), 200);
    await assertHidden(rina, plant1.id, 'plant lain, tahap Manajer');
    assert.equal(await photoStatus(rina, plant1Photo), 404);
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
    // Seed: tahap Manajer INS-006 disetujui Andi -> tetap terlihat (riwayat);
    // INS-003 hanya pernah DITOLAK Andi -> penolakan tidak memberi hak lihat.
    await assertVisible(andi, 'INS-006', 'sudah di tahap Ketua, disetujui andi');
    await assertHidden(andi, 'INS-003', 'REVISION_REQUIRED yang ditolak andi (walau tahapnya Manajer)');
});

test('visibilitas Ketua P2K3: tahapnya sendiri + yang selesai', async () => {
    const hadi = await loginAs('hadi');
    await assertVisible(hadi, 'INS-006', 'tahap Ketua');
    await assertVisible(hadi, 'INS-001', 'COMPLETED');
    await assertVisible(hadi, 'INS-004', 'COMPLETED');
    await assertHidden(hadi, 'INS-002', 'tahap Koordinator');
    await assertHidden(hadi, 'INS-003', 'REVISION_REQUIRED');
});

test('visibilitas riwayat: penyetuju tetap melihat (daftar, detail, foto, tanda tangan) setelah tahap pindah/ditolak — tanpa hak approve/reject', async () => {
    const arif = await loginAs('arif');
    const dewi = await loginAs('dewi'); // koordinator plant 1
    const rina = await loginAs('rina'); // koordinator plant 9
    const andi = await loginAs('andi');
    const hadi = await loginAs('hadi');

    const inspection = await createInspectionWithPhoto(arif, 1);
    const photoId = inspection.fotoDekat[0].id;
    assert.equal((await decide(dewi, inspection.id, 'approve', { stageId: 'koordinator_k3l' })).status, 200);
    assert.equal((await decide(andi, inspection.id, 'approve', { stageId: 'manajer' })).status, 200);
    const read = async () => (await arif.agent.get(`/api/inspections/${inspection.id}`)).body;
    const [dewiApproval] = (await read()).approvalHistory;

    // Tahap Ketua: kedua penyetuju melihat semuanya; Koordinator plant lain tidak.
    for (const [label, session] of [['dewi', dewi], ['andi', andi]]) {
        await assertVisible(session, inspection.id, `${label}, tahap Ketua`);
        assert.equal(await photoStatus(session, photoId), 200, `${label}: foto`);
        assert.equal((await getSignature(session, inspection.id, dewiApproval.id)).status, 200, `${label}: tanda tangan`);
    }
    await assertHidden(rina, inspection.id, 'Koordinator plant lain');

    // Terlihat bukan berarti berwenang: tahap sendiri sudah lewat (400), tahap Ketua bukan miliknya (403).
    for (const [label, session, action, stageId, status, error] of [
        ['dewi approve ulang', dewi, 'approve', 'koordinator_k3l', 400, 'STAGE_NOT_CURRENT'],
        ['dewi reject tahapnya', dewi, 'reject', 'koordinator_k3l', 400, 'STAGE_NOT_CURRENT'],
        ['dewi approve tahap Ketua', dewi, 'approve', 'ketua_p2k3', 403, 'FORBIDDEN'],
        ['andi approve ulang', andi, 'approve', 'manajer', 400, 'STAGE_NOT_CURRENT'],
        ['andi reject tahap Ketua', andi, 'reject', 'ketua_p2k3', 403, 'FORBIDDEN'],
    ]) {
        const res = await decide(session, inspection.id, action, { stageId, reason: 'Bukan wewenang' });
        assert.deepEqual([res.status, res.body.error], [status, error], label);
    }
    const untouched = await read();
    assert.equal(untouched.approvalHistory.length, 2, 'tidak ada keputusan tambahan');
    assert.deepEqual([untouched.status, untouched.currentApprovalStage], ['in_review', 'ketua_p2k3']);

    // Ketua menolak -> REVISION_REQUIRED: penyetuju tetap melihat; Ketua (hanya menolak) tidak.
    assert.equal((await decide(hadi, inspection.id, 'reject', { stageId: 'ketua_p2k3', reason: 'Lengkapi foto' })).status, 200);
    await assertVisible(dewi, inspection.id, 'dewi, REVISION_REQUIRED');
    await assertVisible(andi, inspection.id, 'andi, REVISION_REQUIRED');
    await assertHidden(hadi, inspection.id, 'penolak tanpa persetujuan');
    const whileRevising = await decide(andi, inspection.id, 'approve', { stageId: 'ketua_p2k3' });
    assert.deepEqual([whileRevising.status, whileRevising.body.error], [400, 'NOT_IN_REVIEW']);

    // Koordinator dipindah ke plant lain: riwayat persetujuannya tidak ikut (cakupan plant).
    await pool.query('UPDATE users SET plant_id = 9 WHERE id = ?', [dewi.user.id]);
    try {
        await assertHidden(dewi, inspection.id, 'dewi setelah dipindah ke plant 9');
        assert.equal(await photoStatus(dewi, photoId), 404);
    } finally {
        await pool.query('UPDATE users SET plant_id = 1 WHERE id = ?', [dewi.user.id]);
    }
    await assertVisible(dewi, inspection.id, 'dewi kembali ke plant 1');
});

// =========================================================================
// Pagination GET /api/inspections?page=&limit=&q= — dari database, cakupan sama
// =========================================================================

async function fetchPage(session, query) {
    const res = await session.agent.get('/api/inspections').query(query);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body;
}

async function allPageIds(session, limit, q) {
    const first = await fetchPage(session, { page: 1, limit, ...(q ? { q } : {}) });
    const ids = first.items.map((item) => item.id);
    for (let page = 2; page <= first.pagination.totalPages; page++) {
        ids.push(...(await fetchPage(session, { page, limit, ...(q ? { q } : {}) })).items.map((item) => item.id));
    }
    return { ids, pagination: first.pagination };
}

test('pagination: halaman 1, terakhir, kosong; total & totalPages dari database; urutan sama dengan daftar penuh; tanpa ?page tetap array penuh', async () => {
    const arif = await loginAs('arif');
    for (let index = 0; index < 4; index++) await createInspection(arif, { plantId: 1 });
    const admin = await loginAs('admin');

    const full = (await admin.agent.get('/api/inspections')).body;
    assert.ok(Array.isArray(full), 'kontrak lama: tanpa ?page tetap array');
    assert.ok(full.length >= 7, `butuh cukup data: ${full.length}`);
    const limit = 3;
    const totalPages = Math.ceil(full.length / limit);

    const first = await fetchPage(admin, { page: 1, limit });
    assert.deepEqual(first.pagination, { page: 1, limit, total: full.length, totalPages });
    assert.deepEqual(first.items.map((item) => item.id), full.slice(0, limit).map((item) => item.id), 'id terbaru dulu, sama dengan daftar penuh');
    assert.deepEqual(first.items[0], full[0], 'isi item sama dengan daftar penuh (loadFull)');

    const last = await fetchPage(admin, { page: totalPages, limit });
    assert.deepEqual(last.items.map((item) => item.id), full.slice((totalPages - 1) * limit).map((item) => item.id));
    assert.equal(last.items.length, full.length - (totalPages - 1) * limit);

    const beyond = await fetchPage(admin, { page: totalPages + 1, limit });
    assert.deepEqual(beyond, { items: [], pagination: { page: totalPages + 1, limit, total: full.length, totalPages } }, 'halaman kosong, bukan error');

    const defaults = await fetchPage(admin, { page: 1 });
    assert.equal(defaults.pagination.limit, 10, 'limit bawaan 10');
    assert.equal(defaults.items.length, Math.min(10, full.length));

    for (const query of [{ page: 0 }, { page: -1 }, { page: 'abc' }, { page: '1.5' }, { page: 1, limit: 0 }, { page: 1, limit: 101 }, { page: 1, limit: 'x' }, { page: 1, q: 'a'.repeat(101) }]) {
        const res = await admin.agent.get('/api/inspections').query(query);
        assert.deepEqual({ status: res.status, body: res.body }, { status: 400, body: { error: 'INVALID_PAGINATION' } }, JSON.stringify(query));
    }
    const repeated = await admin.agent.get('/api/inspections?page=1&page=2');
    assert.equal(repeated.status, 400, 'parameter ganda ditolak');
    assert.equal((await request(app).get('/api/inspections').query({ page: 1 })).status, 401, 'tetap butuh login');
});

test('pagination mengikuti cakupan visibilitas setiap role: gabungan semua halaman == daftar penuh; halaman/offset berapa pun tidak memunculkan inspeksi di luar cakupan', async () => {
    const arif = await loginAs('arif');
    const tulus = await loginAs('tulus');
    const dewi = await loginAs('dewi');
    await createInspection(arif, { plantId: 1 });
    await createInspection(tulus, { plantId: 9 });
    await createInspection(arif, { plantId: 1 }, { submit: false }); // draft: hanya arif

    for (const username of ['arif', 'tulus', 'dewi', 'rina', 'andi', 'hadi', 'admin']) {
        const session = username === 'dewi' ? dewi : await loginAs(username);
        const full = (await session.agent.get('/api/inspections')).body.map((item) => item.id);
        const { ids, pagination } = await allPageIds(session, 2);
        assert.equal(pagination.total, full.length, `${username}: total = cakupan`);
        assert.deepEqual(ids, full, `${username}: gabungan halaman = daftar penuh, urutan sama, tanpa duplikat`);
        const far = await fetchPage(session, { page: 999, limit: 100 });
        assert.deepEqual(far.items, [], `${username}: offset jauh tetap kosong`);
    }

    // Inspeksi plant 9 tidak pernah muncul untuk Koordinator plant 1, di halaman mana pun.
    const [[{ id: plant9Id }]] = await pool.query('SELECT MAX(id) AS id FROM inspections WHERE plant_id = 9');
    const plant9 = `INS-${String(plant9Id).padStart(3, '0')}`;
    const dewiIds = (await allPageIds(dewi, 1)).ids;
    assert.ok(!dewiIds.includes(plant9), 'di luar cakupan tetap tidak muncul');
    assert.equal((await fetchPage(dewi, { page: 1, limit: 100, q: plant9 })).pagination.total, 0, 'mencari id-nya pun tidak menemukannya');
});

test('pagination + pencarian di server: id, plant, petugas, status (nilai & label), due date; total = hasil saring daftar penuh; % dan _ literal', async () => {
    const admin = await loginAs('admin');
    const full = (await admin.agent.get('/api/inspections')).body;
    const { formatInspectionStatus } = await import('../../src/shared/labels.js');
    const matches = (item, q) => [item.id, item.lokasi, item.petugas, item.status, formatInspectionStatus(item.status), item.dueDate]
        .some((value) => String(value ?? '').toLowerCase().includes(q.toLowerCase()));

    for (const q of ['Logistic', 'logistic', 'Tulus', 'INS-00', 'in_review', 'Dalam Review', 'perlu revisi', full[0].dueDate]) {
        const expected = full.filter((item) => matches(item, q)).map((item) => item.id);
        const { ids, pagination } = await allPageIds(admin, 2, q);
        assert.ok(expected.length > 0, `data uji untuk "${q}"`);
        assert.equal(pagination.total, expected.length, `"${q}": total`);
        assert.deepEqual(ids, expected, `"${q}": isi & urutan`);
    }
    // % dan _ bukan wildcard: "_" hanya cocok dengan teks yang memang memuat "_" (nilai status in_review / revision_required).
    for (const q of ['%', '_', 'tidak-ada-yang-cocok']) {
        const expected = full.filter((item) => matches(item, q)).length;
        const { total } = (await fetchPage(admin, { page: 1, q })).pagination;
        assert.equal(total, expected, `"${q}" dicari apa adanya`);
        assert.ok(total < full.length, `"${q}" tidak mencocokkan semua baris`);
    }
    const trimmed = await fetchPage(admin, { page: 1, q: '   ' });
    assert.equal(trimmed.pagination.total, full.length, 'q kosong setelah trim = tanpa pencarian');
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
    // Phase 18: Admin boleh menghapus inspeksi non-draft, tapi draft tidak terlihat olehnya -> 404.
    assert.equal((await deleteAs(admin, draft.id)).status, 404, 'Admin tidak melihat draft');
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

// =========================================================================
// Phase 17.4A — tanda tangan persetujuan: validasi isi, penyimpanan,
// penyajian terotorisasi, pembersihan berkas
// =========================================================================

const PNG_BYTES = readFileSync(FIXTURE_PNG);
const JPEG_BYTES = readFileSync(FIXTURE_JPEG);
const GIF_BYTES = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1');
const WEBP_BYTES = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(20)]);
const SVG_BYTES = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const HTML_BYTES = Buffer.from('<!doctype html><script>alert(document.cookie)</script>');
const RANDOM_BYTES = Buffer.concat([Buffer.from([0x00]), randomBytes(255)]);
const SIGNED_PATH = /^signatures\/[0-9a-f-]{36}\.(png|jpg)$/;

const toNumeric = (id) => Number(String(id).replace(/\D/g, ''));

/** approve multipart dengan bagian yang bisa diatur; method/file null = tidak dikirim. */
function approveWith(session, id, stageId, { method = 'upload', file = PNG_BYTES, filename = 'signature.png', contentType = 'image/png', extraFields = {} } = {}) {
    const req = withCsrf(session.agent.post(`/api/inspections/${id}/approve`), session.csrfToken).field('stageId', stageId);
    if (method !== null) req.field('signatureMethod', method);
    for (const [name, value] of Object.entries(extraFields)) req.field(name, value);
    if (file !== null) req.attach('signature', file, { filename, contentType });
    return req;
}

/** Berkas tanda tangan di disk (tanpa .htaccess), terurut. */
function signatureFiles() {
    return readdirSync(SIGNATURE_DIR).filter((name) => name !== '.htaccess').sort();
}

async function approvalRows(id) {
    const [rows] = await pool.query(
        `SELECT id, stage, attempt, decision, reviewer_user_id, reviewer_name, signature_method, signature_file_path,
                signature_mime_type, legacy_unsigned
         FROM approvals WHERE inspection_id = ? ORDER BY id`,
        [toNumeric(id)],
    );
    return rows;
}

function getSignature(session, inspectionId, approvalId) {
    return (session ? session.agent : request(app)).get(`/api/inspections/${inspectionId}/approvals/${approvalId}/signature`);
}

test('tanda tangan: deteksi format dari ISI — PNG/JPEG saja; GIF/WEBP/SVG/HTML/acak -> null', () => {
    assert.equal(detectSignatureMimeType(PNG_BYTES), 'image/png');
    assert.equal(detectSignatureMimeType(JPEG_BYTES), 'image/jpeg');
    for (const [label, bytes] of [['gif', GIF_BYTES], ['webp', WEBP_BYTES], ['svg', SVG_BYTES], ['html', HTML_BYTES], ['acak', RANDOM_BYTES], ['kosong', Buffer.alloc(0)], ['pendek', PNG_BYTES.subarray(0, 8)]]) {
        assert.equal(detectSignatureMimeType(bytes), null, label);
    }
});

test('approve tanpa tanda tangan -> 400 SIGNATURE_REQUIRED; data URL/base64 tidak pernah didekode; tidak ada keputusan/berkas', async () => {
    const arif = await loginAs('arif');
    const dewi = await loginAs('dewi');
    const inspection = await createInspection(arif, DRAFT_CONTENT);
    const before = signatureFiles();
    const postJson = (body) => withCsrf(dewi.agent.post(`/api/inspections/${inspection.id}/approve`), dewi.csrfToken).send(body);
    const dataUrl = `data:image/png;base64,${PNG_BYTES.toString('base64')}`;

    for (const [label, res] of [
        ['JSON lama tanpa tanda tangan', await postJson({ stageId: 'koordinator_k3l' })],
        ['JSON data URL PNG sah', await postJson({ stageId: 'koordinator_k3l', signatureMethod: 'canvas', signature: dataUrl })],
        ['JSON data URL rusak', await postJson({ stageId: 'koordinator_k3l', signatureMethod: 'canvas', signature: 'data:image/png;base64,@@@bukan-base64@@@' })],
        ['JSON data URL berisi HTML', await postJson({ stageId: 'koordinator_k3l', signatureMethod: 'canvas', signature: `data:image/png;base64,${HTML_BYTES.toString('base64')}` })],
        ['multipart metode tanpa berkas', await approveWith(dewi, inspection.id, 'koordinator_k3l', { file: null })],
    ]) {
        assert.equal(res.status, 400, label);
        assert.equal(res.body.error, 'SIGNATURE_REQUIRED', label);
    }
    const noMethod = await approveWith(dewi, inspection.id, 'koordinator_k3l', { method: null });
    assert.equal(noMethod.status, 400);
    assert.equal(noMethod.body.error, 'SIGNATURE_METHOD_INVALID', 'berkas tanpa metode');
    const multipartText = await withCsrf(dewi.agent.post(`/api/inspections/${inspection.id}/approve`), dewi.csrfToken)
        .field('stageId', 'koordinator_k3l').field('signatureMethod', 'canvas').field('signature', 'data:image/png;base64,AAAA');
    assert.equal(multipartText.status, 400);
    assert.equal(multipartText.body.error, 'SIGNATURE_REQUIRED', 'string di field signature bukan berkas');

    assert.equal((await approvalRows(inspection.id)).length, 0);
    assert.deepEqual(signatureFiles(), before, 'tidak ada berkas tertulis');
    assert.equal((await arif.agent.get(`/api/inspections/${inspection.id}`)).body.currentApprovalStage, 'koordinator_k3l');
});

test('approve dengan isi tanda tangan tidak sah -> 400, tidak ada keputusan/berkas (MIME klien & nama berkas tidak dipercaya)', async () => {
    const arif = await loginAs('arif');
    const dewi = await loginAs('dewi');
    const inspection = await createInspection(arif, DRAFT_CONTENT);
    const before = signatureFiles();

    for (const [label, options, error] of [
        ['GIF', { file: GIF_BYTES, filename: 'ttd.gif', contentType: 'image/gif' }, 'SIGNATURE_CONTENT_INVALID'],
        ['WEBP', { file: WEBP_BYTES, filename: 'ttd.webp', contentType: 'image/webp' }, 'SIGNATURE_CONTENT_INVALID'],
        ['SVG', { file: SVG_BYTES, filename: 'ttd.svg', contentType: 'image/svg+xml' }, 'SIGNATURE_CONTENT_INVALID'],
        ['SVG menyamar .png', { file: SVG_BYTES, filename: 'signature.png', contentType: 'image/png' }, 'SIGNATURE_CONTENT_INVALID'],
        ['byte acak .png', { file: RANDOM_BYTES, filename: 'signature.png', contentType: 'image/png' }, 'SIGNATURE_CONTENT_INVALID'],
        ['HTML .png', { file: HTML_BYTES, filename: 'signature.png', contentType: 'image/png' }, 'SIGNATURE_CONTENT_INVALID'],
        ['CANVAS dengan JPEG', { method: 'canvas', file: JPEG_BYTES, filename: 'blob', contentType: 'image/png' }, 'SIGNATURE_CONTENT_INVALID'],
        ['metode tidak dikenal', { method: 'draw' }, 'SIGNATURE_METHOD_INVALID'],
        ['metode huruf besar (nilai kontrak: upload/canvas)', { method: 'UPLOAD' }, 'SIGNATURE_METHOD_INVALID'],
        ['lebih dari 1 MB', { file: Buffer.concat([PNG_BYTES, Buffer.alloc(SIGNATURE_MAX_BYTES)]) }, 'SIGNATURE_TOO_LARGE'],
    ]) {
        const res = await approveWith(dewi, inspection.id, 'koordinator_k3l', options);
        assert.equal(res.status, 400, label);
        assert.equal(res.body.error, error, label);
    }
    const twoFiles = await approveWith(dewi, inspection.id, 'koordinator_k3l').attach('signature', PNG_BYTES, { filename: 'kedua.png', contentType: 'image/png' });
    assert.equal(twoFiles.status, 400, 'dua berkas');
    const wrongField = await approveWith(dewi, inspection.id, 'koordinator_k3l', { file: null }).attach('foto', PNG_BYTES, { filename: 'x.png', contentType: 'image/png' });
    assert.equal(wrongField.status, 400, 'berkas di field lain');

    assert.equal((await approvalRows(inspection.id)).length, 0);
    assert.deepEqual(signatureFiles(), before, 'berkas yang ditolak tidak pernah menyentuh disk');
});

test('approve bertanda tangan: UPLOAD PNG/JPEG & CANVAS PNG diterima; format tersimpan mengikuti ISI berkas; identitas dari sesi; path tidak bocor', async () => {
    const arif = await loginAs('arif');
    const dewi = await loginAs('dewi');
    const andi = await loginAs('andi');
    const hadi = await loginAs('hadi');
    const inspection = await createInspection(arif, DRAFT_CONTENT);

    // JPEG (.jpeg) lewat UPLOAD, dengan isian identitas/path palsu yang harus diabaikan.
    const byDewi = await approveWith(dewi, inspection.id, 'koordinator_k3l', {
        file: JPEG_BYTES, filename: 'ttd.jpeg', contentType: 'image/jpeg',
        extraFields: { reviewerUserId: String(arif.user.id), reviewerName: 'Palsu', signatureFilePath: '../../.env' },
    });
    assert.equal(byDewi.status, 200, JSON.stringify(byDewi.body));
    // Nama .jpg + MIME klien image/jpeg, tapi isinya PNG -> disimpan sebagai PNG.
    assert.equal((await approveWith(andi, inspection.id, 'manajer', { file: PNG_BYTES, filename: 'ttd.jpg', contentType: 'image/jpeg' })).status, 200);
    // Kanvas: Blob PNG tanpa nama/MIME yang berarti.
    const byHadi = await approveWith(hadi, inspection.id, 'ketua_p2k3', { method: 'canvas', filename: 'blob', contentType: 'application/octet-stream' });
    assert.equal(byHadi.status, 200);
    assert.equal(byHadi.body.fullyApproved, true);

    const rows = await approvalRows(inspection.id);
    assert.deepEqual(rows.map((row) => [row.stage, row.signature_method, row.signature_mime_type, row.legacy_unsigned]), [
        ['koordinator_k3l', 'upload', 'image/jpeg', 0], ['manajer', 'upload', 'image/png', 0], ['ketua_p2k3', 'canvas', 'image/png', 0],
    ]);
    assert.deepEqual([rows[0].reviewer_user_id, rows[0].reviewer_name], [dewi.user.id, 'Dewi'], 'identitas dari sesi, bukan isian');
    for (const row of rows) {
        assert.match(row.signature_file_path, SIGNED_PATH, 'nama berkas buatan server');
        assert.ok(existsSync(path.join(UPLOAD_DIR, row.signature_file_path)));
    }
    assert.ok(rows[0].signature_file_path.endsWith('.jpg'));
    assert.ok(rows[1].signature_file_path.endsWith('.png'), 'ekstensi dari isi berkas, bukan dari nama .jpg');
    assert.deepEqual(readFileSync(path.join(UPLOAD_DIR, rows[2].signature_file_path)), PNG_BYTES);
    assert.equal(new Set(rows.map((row) => row.signature_file_path)).size, 3, 'satu berkas per keputusan');

    const detail = await arif.agent.get(`/api/inspections/${inspection.id}`);
    assert.deepEqual(detail.body.approvalHistory.map((entry) => [entry.id, entry.signatureMethod, entry.hasSignature]),
        rows.map((row) => [row.id, row.signature_method, true]));
    assert.ok(!JSON.stringify(detail.body).includes('signatures/'), 'path berkas tidak ada di JSON');
    assert.ok(!JSON.stringify(byHadi.body).includes('signatures/'));
});

test('penyajian tanda tangan: hanya lewat visibilitas inspeksi; id keputusan tebakan / inspeksi lain / tanpa tanda tangan -> 404; tidak ada akses statis', async () => {
    const arif = await loginAs('arif');
    const dewi = await loginAs('dewi'); // koordinator plant 1
    const rina = await loginAs('rina'); // koordinator plant 9
    const andi = await loginAs('andi');
    const hadi = await loginAs('hadi');
    const admin = await loginAs('admin');
    const inspection = await createInspection(arif, DRAFT_CONTENT);
    const other = await createInspection(arif, DRAFT_CONTENT); // IN_REVIEW di tahap Koordinator plant 1 — terlihat oleh dewi

    assert.equal((await approveWith(dewi, inspection.id, 'koordinator_k3l', { file: JPEG_BYTES, filename: 'ttd.jpg', contentType: 'image/jpeg' })).status, 200);
    const [dewiApproval] = await approvalRows(inspection.id);

    const byOwner = await getSignature(arif, inspection.id, dewiApproval.id);
    assert.equal(byOwner.status, 200);
    assert.equal(byOwner.headers['content-type'], 'image/jpeg');
    assert.equal(byOwner.headers['x-content-type-options'], 'nosniff');
    assert.deepEqual(Buffer.from(byOwner.body), JPEG_BYTES);

    assert.equal((await getSignature(dewi, inspection.id, dewiApproval.id)).status, 200,
        'penyetuju melihat tanda tangannya sendiri setelah tahap pindah ke Manajer (riwayat)');
    const hidden = await getSignature(rina, inspection.id, dewiApproval.id);
    assert.deepEqual({ status: hidden.status, body: hidden.body }, { status: 404, body: { error: 'NOT_FOUND' } },
        'Koordinator plant lain tetap tidak bisa');

    assert.equal((await approveWith(andi, inspection.id, 'manajer')).status, 200);
    assert.equal((await approveWith(hadi, inspection.id, 'ketua_p2k3', { method: 'canvas' })).status, 200);
    assert.equal((await getSignature(dewi, inspection.id, dewiApproval.id)).status, 200, 'COMPLETED di plant-nya: terlihat lagi');
    assert.equal((await getSignature(admin, inspection.id, dewiApproval.id)).status, 200);

    const notFound = { status: 404, body: { error: 'NOT_FOUND' } };
    const [[legacy]] = await pool.query(
        `SELECT a.id, a.inspection_id FROM approvals a JOIN inspections i ON i.id = a.inspection_id
         WHERE a.legacy_unsigned = 1 AND i.status <> 'draft' LIMIT 1`,
    );
    const [[rejected]] = await pool.query("SELECT id, inspection_id FROM approvals WHERE decision = 'rejected' LIMIT 1");
    for (const [label, session, inspectionId, approvalId] of [
        ['Koordinator plant lain', rina, inspection.id, dewiApproval.id],
        ['id keputusan dipasangkan dengan inspeksi lain yang terlihat', dewi, other.id, dewiApproval.id],
        ['id keputusan tebakan', admin, inspection.id, 999999],
        ['id keputusan bukan angka', admin, inspection.id, 'abc'],
        ['id keputusan berisi SQL', admin, inspection.id, encodeURIComponent('1 OR 1=1')],
        ['id keputusan berisi traversal', admin, inspection.id, encodeURIComponent('../../.env')],
        ['persetujuan lama tanpa tanda tangan', admin, `INS-${legacy.inspection_id}`, legacy.id],
        ['penolakan', admin, `INS-${rejected.inspection_id}`, rejected.id],
    ]) {
        const res = await getSignature(session, inspectionId, approvalId);
        assert.deepEqual({ status: res.status, body: res.body }, notFound, label);
    }
    assert.equal((await getSignature(null, inspection.id, dewiApproval.id)).status, 401, 'tanpa login');

    // Tidak ada penyajian statis oleh Express, dan folder dijaga .htaccess untuk Apache (DocumentRoot = folder proyek).
    assert.equal((await request(app).get(`/uploads/${dewiApproval.signature_file_path}`)).status, 404);
    assert.equal((await request(app).get(`/${dewiApproval.signature_file_path}`)).status, 404);
    assert.equal(readFileSync(path.join(SIGNATURE_DIR, '.htaccess'), 'utf8').trim(), 'Require all denied');
});

test('penolakan tidak bertanda tangan: data tanda tangan pada reject -> 400 SIGNATURE_NOT_ALLOWED, tidak tersimpan; reject biasa tanpa kolom tanda tangan', async () => {
    const arif = await loginAs('arif');
    const dewi = await loginAs('dewi');
    const rina = await loginAs('rina');
    const inspection = await createInspection(arif, DRAFT_CONTENT);
    const before = signatureFiles();
    const rejectJson = (session, body) => withCsrf(session.agent.post(`/api/inspections/${inspection.id}/reject`), session.csrfToken).send(body);

    for (const [label, res] of [
        ['metode di JSON', await rejectJson(dewi, { stageId: 'koordinator_k3l', reason: 'Kurang jelas', signatureMethod: 'upload' })],
        ['data URL di JSON', await rejectJson(dewi, { stageId: 'koordinator_k3l', reason: 'Kurang jelas', signature: `data:image/png;base64,${PNG_BYTES.toString('base64')}` })],
        ['berkas multipart', await withCsrf(dewi.agent.post(`/api/inspections/${inspection.id}/reject`), dewi.csrfToken)
            .field('stageId', 'koordinator_k3l').field('reason', 'Kurang jelas').attach('signature', PNG_BYTES, { filename: 'ttd.png', contentType: 'image/png' })],
    ]) {
        assert.equal(res.status, 400, label);
        assert.equal(res.body.error, 'SIGNATURE_NOT_ALLOWED', label);
    }
    assert.equal((await rejectJson(rina, { stageId: 'koordinator_k3l', reason: 'x', signatureMethod: 'upload' })).status, 404, 'visibilitas tetap diperiksa lebih dulu');
    assert.equal((await approvalRows(inspection.id)).length, 0);
    assert.deepEqual(signatureFiles(), before);

    assert.equal((await rejectJson(dewi, { stageId: 'koordinator_k3l', reason: 'Kurang jelas' })).status, 200);
    const [row] = await approvalRows(inspection.id);
    assert.deepEqual([row.decision, row.signature_method, row.signature_file_path, row.signature_mime_type, row.legacy_unsigned],
        ['rejected', null, null, null, 0]);
    assert.deepEqual(signatureFiles(), before, 'penolakan tidak membuat berkas');
});

test('riwayat: persetujuan ulang setelah penolakan mendapat tanda tangan BARU; attempt ditolak tanpa tanda tangan; tanda tangan lama utuh', async () => {
    const arif = await loginAs('arif');
    const dewi = await loginAs('dewi');
    const andi = await loginAs('andi');
    const inspection = await createInspection(arif, DRAFT_CONTENT);

    assert.equal((await approveWith(dewi, inspection.id, 'koordinator_k3l', { file: JPEG_BYTES, filename: 'a.jpg', contentType: 'image/jpeg' })).status, 200);
    assert.equal((await decide(andi, inspection.id, 'reject', { stageId: 'manajer', reason: 'Lengkapi foto' })).status, 200);
    const [koordinator, rejectedBefore] = await approvalRows(inspection.id);
    await submitInspection(arif, inspection.id);
    assert.equal((await approveWith(andi, inspection.id, 'manajer', { method: 'canvas' })).status, 200);

    const rows = await approvalRows(inspection.id);
    assert.deepEqual(rows.map((row) => [row.stage, row.attempt, row.decision, row.signature_method]), [
        ['koordinator_k3l', 1, 'approved', 'upload'], ['manajer', 1, 'rejected', null], ['manajer', 2, 'approved', 'canvas'],
    ]);
    assert.deepEqual(rows[0], koordinator, 'persetujuan Koordinator tidak berubah');
    assert.deepEqual(rows[1], rejectedBefore, 'attempt 1 (ditolak) tidak ditimpa, tetap tanpa tanda tangan');
    assert.notEqual(rows[2].signature_file_path, rows[0].signature_file_path);
    assert.deepEqual(readFileSync(path.join(UPLOAD_DIR, rows[0].signature_file_path)), JPEG_BYTES, 'berkas tanda tangan lama utuh');
    assert.deepEqual(readFileSync(path.join(UPLOAD_DIR, rows[2].signature_file_path)), PNG_BYTES);
});

test('pembersihan: simpan ke DB gagal SETELAH berkas ditulis -> berkas baru dihapus, keputusan & tahap tidak berubah, berkas lama utuh', async () => {
    const arif = await loginAs('arif');
    const dewi = await loginAs('dewi');
    const inspection = await createInspection(arif, DRAFT_CONTENT);
    const before = signatureFiles();
    const beforeContents = before.map((name) => readFileSync(path.join(SIGNATURE_DIR, name)));

    // Kegagalan DB sungguhan pada INSERT approvals, khusus inspeksi ini.
    await pool.query('DROP TRIGGER IF EXISTS test_fail_approval_insert');
    await pool.query(
        `CREATE TRIGGER test_fail_approval_insert BEFORE INSERT ON approvals FOR EACH ROW
         IF NEW.inspection_id = ${toNumeric(inspection.id)} THEN
             SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'uji kegagalan simpan';
         END IF`,
    );
    try {
        const failed = await approveWith(dewi, inspection.id, 'koordinator_k3l');
        assert.equal(failed.status, 500);
        assert.deepEqual(failed.body, { error: 'INTERNAL_ERROR' });
    } finally {
        await pool.query('DROP TRIGGER IF EXISTS test_fail_approval_insert');
    }
    assert.deepEqual(signatureFiles(), before, 'berkas yang sempat ditulis dihapus');
    assert.deepEqual(before.map((name) => readFileSync(path.join(SIGNATURE_DIR, name))), beforeContents, 'berkas keputusan lain tidak tersentuh');
    assert.equal((await approvalRows(inspection.id)).length, 0);
    const detail = (await arif.agent.get(`/api/inspections/${inspection.id}`)).body;
    assert.deepEqual([detail.status, detail.currentApprovalStage], ['in_review', 'koordinator_k3l'], 'UPDATE status ikut dibatalkan');

    assert.equal((await approveWith(dewi, inspection.id, 'koordinator_k3l')).status, 200, 'setelah pulih, persetujuan berjalan normal');
    assert.equal(signatureFiles().length, before.length + 1);
});

test('konkurensi: dua persetujuan bertanda tangan bersamaan -> tepat satu keputusan & tepat satu berkas', async () => {
    const arif = await loginAs('arif');
    const dewi = await loginAs('dewi');
    const inspection = await createInspection(arif, DRAFT_CONTENT);
    const before = signatureFiles();

    const results = await Promise.all([
        approveWith(dewi, inspection.id, 'koordinator_k3l'),
        approveWith(dewi, inspection.id, 'koordinator_k3l', { method: 'canvas' }),
    ]);
    const statuses = results.map((res) => res.status).sort();
    assert.equal(statuses[0], 200);
    assert.ok([400, 404].includes(statuses[1]), `yang kalah ditolak (basi/tidak terlihat lagi): ${statuses}`);
    assert.equal((await approvalRows(inspection.id)).length, 1);
    assert.equal(signatureFiles().length, before.length + 1, 'yang kalah tidak meninggalkan berkas');
});

test('constraint DB: persetujuan tanpa tanda tangan, CANVAS non-PNG, tipe selain PNG/JPEG, tanda tangan pada penolakan, path ganda -> ditolak MariaDB', async () => {
    const arif = await loginAs('arif');
    const inspection = await createInspection(arif, DRAFT_CONTENT);
    const id = toNumeric(inspection.id);
    const connection = await pool.getConnection();
    const insert = (values) => connection.query(
        `INSERT INTO approvals (inspection_id, stage, attempt, decision, signature_method, signature_file_path, signature_mime_type, legacy_unsigned, rejection_reason)
         VALUES (?, 'koordinator_k3l', ?, ?, ?, ?, ?, ?, ?)`,
        [id, ...values],
    );
    try {
        await connection.beginTransaction();
        for (const [label, values] of [
            ['disetujui tanpa tanda tangan', [91, 'approved', null, null, null, 0, null]],
            ['disetujui tanpa berkas', [92, 'approved', 'upload', null, 'image/png', 0, null]],
            ['CANVAS JPEG', [93, 'approved', 'canvas', 'signatures/x-canvas.jpg', 'image/jpeg', 0, null]],
            ['tipe GIF', [94, 'approved', 'upload', 'signatures/x.gif', 'image/gif', 0, null]],
            ['penolakan bertipe tanda tangan', [95, 'rejected', null, null, 'image/png', 0, 'x']],
            ['penolakan ditandai legacy', [96, 'rejected', null, null, null, 1, 'x']],
        ]) {
            // MariaDB ER_CONSTRAINT_FAILED (errno 4025; mysql2 memberi nama kode versi MySQL untuk angka itu).
            await assert.rejects(insert(values), (error) => error.errno === 4025 && /CONSTRAINT `chk_approvals_/.test(error.message), label);
        }
        await insert([97, 'approved', 'upload', 'signatures/uji-ganda.png', 'image/png', 0, null]);
        await assert.rejects(insert([98, 'approved', 'upload', 'signatures/uji-ganda.png', 'image/png', 0, null]),
            (error) => error.code === 'ER_DUP_ENTRY', 'satu berkas milik satu keputusan');
    } finally {
        await connection.rollback();
        connection.release();
    }
});

// =========================================================================
// Phase 17.4D — watermark persetujuan: watermarkEnabled / watermarkX / watermarkY
// pada POST /approve yang sama; hanya metadata posisi, berkas tanda tangan tidak diubah
// =========================================================================

async function watermarkRows(id) {
    const [rows] = await pool.query(
        'SELECT stage, watermark_enabled, watermark_x, watermark_y FROM approvals WHERE inspection_id = ? ORDER BY id',
        [toNumeric(id)],
    );
    return rows.map((row) => [row.stage, row.watermark_enabled, row.watermark_x, row.watermark_y]);
}

test('watermark: tanpa field / nonaktif -> tersimpan nonaktif tanpa posisi; aktif -> posisi tersimpan & dikembalikan detail; berkas tanda tangan tetap byte asli', async () => {
    const arif = await loginAs('arif');
    const dewi = await loginAs('dewi');
    const andi = await loginAs('andi');
    const hadi = await loginAs('hadi');
    const inspection = await createInspection(arif, DRAFT_CONTENT);

    assert.equal((await approveWith(dewi, inspection.id, 'koordinator_k3l')).status, 200, 'tanpa field watermark (klien lama)');
    const withWatermark = await approveWith(andi, inspection.id, 'manajer', {
        method: 'canvas', extraFields: { watermarkEnabled: 'true', watermarkX: '0.25', watermarkY: '0.8123' },
    });
    assert.equal(withWatermark.status, 200, JSON.stringify(withWatermark.body));
    assert.equal((await approveWith(hadi, inspection.id, 'ketua_p2k3', { extraFields: { watermarkEnabled: 'false' } })).status, 200);

    assert.deepEqual(await watermarkRows(inspection.id), [
        ['koordinator_k3l', 0, null, null],
        ['manajer', 1, '0.2500', '0.8123'],
        ['ketua_p2k3', 0, null, null],
    ]);
    const detail = await arif.agent.get(`/api/inspections/${inspection.id}`);
    assert.deepEqual(detail.body.approvalHistory.map((entry) => [entry.stage, entry.watermark]), [
        ['koordinator_k3l', null], ['manajer', { x: 0.25, y: 0.8123 }], ['ketua_p2k3', null],
    ]);
    // Watermark hanya metadata: berkas tanda tangan yang tersimpan = berkas yang dikirim.
    const stored = await getSignature(arif, inspection.id, detail.body.approvalHistory[1].id);
    assert.deepEqual(Buffer.from(stored.body), PNG_BYTES);
});

test('watermark tidak sah -> 400, tidak ada keputusan/berkas; batas 0 dan 1 diterima', async () => {
    const arif = await loginAs('arif');
    const dewi = await loginAs('dewi');
    const inspection = await createInspection(arif, DRAFT_CONTENT);
    const before = signatureFiles();

    for (const [label, fields, error] of [
        ['aktif tanpa posisi', { watermarkEnabled: 'true' }, 'WATERMARK_POSITION_REQUIRED'],
        ['aktif tanpa Y', { watermarkEnabled: 'true', watermarkX: '0.5' }, 'WATERMARK_POSITION_REQUIRED'],
        ['X kosong', { watermarkEnabled: 'true', watermarkX: '', watermarkY: '0.5' }, 'WATERMARK_POSITION_REQUIRED'],
        ['X > 1', { watermarkEnabled: 'true', watermarkX: '1.0001', watermarkY: '0.5' }, 'WATERMARK_POSITION_INVALID'],
        ['Y < 0', { watermarkEnabled: 'true', watermarkX: '0.5', watermarkY: '-0.1' }, 'WATERMARK_POSITION_INVALID'],
        ['X bukan angka', { watermarkEnabled: 'true', watermarkX: 'kiri', watermarkY: '0.5' }, 'WATERMARK_POSITION_INVALID'],
        ['Y notasi eksponen', { watermarkEnabled: 'true', watermarkX: '0.5', watermarkY: '5e-1' }, 'WATERMARK_POSITION_INVALID'],
        ['X piksel', { watermarkEnabled: 'true', watermarkX: '120', watermarkY: '40' }, 'WATERMARK_POSITION_INVALID'],
        ['penanda tidak dikenal', { watermarkEnabled: 'on', watermarkX: '0.5', watermarkY: '0.5' }, 'WATERMARK_INVALID'],
        ['posisi saat nonaktif', { watermarkEnabled: 'false', watermarkX: '0.5', watermarkY: '0.5' }, 'WATERMARK_INVALID'],
        ['posisi tanpa penanda', { watermarkX: '0.5', watermarkY: '0.5' }, 'WATERMARK_INVALID'],
    ]) {
        const res = await approveWith(dewi, inspection.id, 'koordinator_k3l', { extraFields: fields });
        assert.equal(res.status, 400, label);
        assert.equal(res.body.error, error, label);
    }
    assert.equal((await approvalRows(inspection.id)).length, 0);
    assert.deepEqual(signatureFiles(), before, 'tidak ada berkas tertulis');

    const edge = await approveWith(dewi, inspection.id, 'koordinator_k3l', { extraFields: { watermarkEnabled: 'true', watermarkX: '0', watermarkY: '1' } });
    assert.equal(edge.status, 200, JSON.stringify(edge.body));
    assert.deepEqual(await watermarkRows(inspection.id), [['koordinator_k3l', 1, '0.0000', '1.0000']]);
});

test('watermark lewat permintaan langsung oleh peninjau yang tidak berwenang -> ditolak seperti biasa, tidak ada yang tersimpan', async () => {
    const arif = await loginAs('arif');
    const rina = await loginAs('rina'); // Koordinator plant lain
    const andi = await loginAs('andi'); // Manajer, tahapnya belum berjalan
    const inspection = await createInspection(arif, DRAFT_CONTENT);
    const fields = { watermarkEnabled: 'true', watermarkX: '0.5', watermarkY: '0.5' };

    const byOtherPlant = await approveWith(rina, inspection.id, 'koordinator_k3l', { extraFields: fields });
    assert.deepEqual({ status: byOtherPlant.status, body: byOtherPlant.body }, { status: 404, body: { error: 'NOT_FOUND' } });
    assert.equal((await approveWith(andi, inspection.id, 'koordinator_k3l', { extraFields: fields })).status, 404);
    assert.equal((await approveWith(arif, inspection.id, 'koordinator_k3l', { extraFields: fields })).status, 403, 'pemilik: terlihat tapi tidak berwenang');
    // Posisi tidak sah pun tidak membocorkan apa-apa sebelum wewenang diputuskan.
    const invalidByOtherPlant = await approveWith(rina, inspection.id, 'koordinator_k3l', { extraFields: { watermarkEnabled: 'true', watermarkX: '9', watermarkY: '9' } });
    assert.equal(invalidByOtherPlant.status, 404);
    assert.equal((await approvalRows(inspection.id)).length, 0);
});

test('constraint DB watermark: aktif tanpa posisi / di luar 0..1 / posisi saat nonaktif -> ditolak MariaDB', async () => {
    const arif = await loginAs('arif');
    const inspection = await createInspection(arif, DRAFT_CONTENT);
    const connection = await pool.getConnection();
    const insert = (attempt, enabled, x, y) => connection.query(
        `INSERT INTO approvals (inspection_id, stage, attempt, decision, signature_method, signature_file_path, signature_mime_type,
                                watermark_enabled, watermark_x, watermark_y)
         VALUES (?, 'koordinator_k3l', ?, 'approved', 'upload', ?, 'image/png', ?, ?, ?)`,
        [toNumeric(inspection.id), attempt, `signatures/uji-watermark-${attempt}.png`, enabled, x, y],
    );
    try {
        await connection.beginTransaction();
        for (const [label, values] of [
            ['aktif tanpa posisi', [81, 1, null, null]],
            ['aktif tanpa Y', [82, 1, 0.5, null]],
            ['X > 1', [83, 1, 1.5, 0.5]],
            ['Y < 0', [84, 1, 0.5, -0.5]],
            ['posisi saat nonaktif', [85, 0, 0.5, 0.5]],
        ]) {
            // MariaDB ER_CONSTRAINT_FAILED (errno 4025), seperti constraint tanda tangan di atas.
            await assert.rejects(insert(...values), (error) => error.errno === 4025 && /chk_approvals_watermark_position/.test(error.message), label);
        }
        await insert(86, 1, 0, 1);
    } finally {
        await connection.rollback();
        connection.release();
    }
});

// =========================================================================
// Phase 18 — pengelolaan akun oleh Admin: /api/users (buat, ubah, aktif/nonaktif)
// Akun uji dibuat baru di setiap test (password = username, supaya loginAs()
// berlaku) — akun seed tidak pernah diubah, karena test lain memakainya.
// =========================================================================

let userSeq = 0;
function uniqueUsername(prefix) {
    userSeq += 1;
    return `${prefix}${Date.now().toString(36)}${userSeq}`;
}

function postUser(session, body) {
    return withCsrf(session.agent.post('/api/users'), session.csrfToken).send(body);
}
function putUser(session, id, body) {
    return withCsrf(session.agent.put(`/api/users/${id}`), session.csrfToken).send(body);
}
function putActive(session, id, isActive) {
    return withCsrf(session.agent.put(`/api/users/${id}/active`), session.csrfToken).send({ isActive });
}
async function userRow(id) {
    const [[row]] = await pool.query('SELECT username, password_hash, display_name, role, plant_id, is_active FROM users WHERE id = ?', [id]);
    return row;
}
async function createOfficer(admin, overrides = {}) {
    const username = uniqueUsername('uji');
    const res = await postUser(admin, { username, displayName: 'Uji', role: 'safety_officer', password: username, ...overrides });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.user;
}

test('users: hanya Admin — role lain 403, tanpa login 401, tanpa CSRF 403; tidak ada yang berubah', async () => {
    const admin = await loginAs('admin');
    const target = await createOfficer(admin);
    const before = await userRow(target.id);
    const [[{ total: countBefore }]] = await pool.query('SELECT COUNT(*) total FROM users');

    for (const username of ['arif', 'dewi', 'andi', 'hadi']) {
        const session = await loginAs(username);
        const create = await postUser(session, { username: uniqueUsername('x'), displayName: 'X', role: 'admin', password: 'rahasia' });
        assert.equal(create.status, 403, `${username} create`);
        assert.equal((await putUser(session, target.id, { displayName: 'X', role: 'admin' })).status, 403, `${username} update`);
        assert.equal((await putActive(session, target.id, false)).status, 403, `${username} deactivate`);
        assert.equal((await session.agent.get('/api/users')).status, 403, `${username} list`);
    }
    assert.equal((await request(app).post('/api/users').send({ username: 'x' })).status, 401);
    assert.equal((await admin.agent.post('/api/users').send({ username: uniqueUsername('x'), displayName: 'X', role: 'admin', password: 'rahasia' })).status, 403, 'tanpa CSRF');

    assert.deepEqual(await userRow(target.id), before);
    const [[{ total: countAfter }]] = await pool.query('SELECT COUNT(*) total FROM users');
    assert.equal(countAfter, countBefore);
});

test('users: Admin membuat akun -> aktif, bisa login, password tersimpan sebagai hash bcrypt, hash tidak pernah dikirim', async () => {
    const admin = await loginAs('admin');
    const username = uniqueUsername('baru');
    const res = await postUser(admin, { username: `  ${username}  `, displayName: '  Petugas Baru  ', role: 'safety_officer', plantId: 9, password: username });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.deepEqual(res.body.user, { id: res.body.user.id, username, displayName: 'Petugas Baru', role: 'safety_officer', plantId: null, isActive: true });

    const row = await userRow(res.body.user.id);
    assert.match(row.password_hash, /^\$2[aby]\$10\$/, 'hash bcrypt');
    assert.notEqual(row.password_hash, username);
    assert.equal(row.plant_id, null, 'plant dinormalisasi null untuk role selain koordinator');

    const session = await loginAs(username);
    assert.equal(session.user.role, 'safety_officer');
    const list = await admin.agent.get('/api/users');
    assert.ok(Array.isArray(list.body));
    assert.ok(!JSON.stringify(list.body).includes('$2'), 'tidak ada hash di daftar');
    assert.ok(!JSON.stringify(res.body).includes('$2'));
});

test('users: Koordinator wajib plant yang ada; isian tidak sah & username terpakai -> 400 tanpa akun tersimpan', async () => {
    const admin = await loginAs('admin');
    const [[{ total: countBefore }]] = await pool.query('SELECT COUNT(*) total FROM users');
    const base = { username: uniqueUsername('koor'), displayName: 'Koor', role: 'koordinator_k3l', password: 'rahasia' };

    for (const [label, body, error] of [
        ['koordinator tanpa plant', base, 'PLANT_REQUIRED'],
        ['plant bukan angka', { ...base, plantId: '1 OR 1=1' }, 'PLANT_INVALID'],
        ['plant tidak ada (id 13 sengaja tidak ada)', { ...base, plantId: 13 }, 'PLANT_NOT_FOUND'],
        ['role tidak dikenal', { ...base, role: 'superadmin' }, 'ROLE_INVALID'],
        ['username berspasi', { ...base, username: 'a b' }, 'USERNAME_INVALID'],
        ['password pendek', { ...base, plantId: 1, password: 'abc' }, 'PASSWORD_TOO_SHORT'],
        ['username terpakai', { ...base, plantId: 1, username: 'arif' }, 'USERNAME_TAKEN'],
    ]) {
        const res = await postUser(admin, body);
        assert.equal(res.status, 400, label);
        assert.equal(res.body.error, error, label);
    }
    const [[{ total: countAfter }]] = await pool.query('SELECT COUNT(*) total FROM users');
    assert.equal(countAfter, countBefore, 'tidak ada akun tersimpan');

    const ok = await postUser(admin, { ...base, plantId: '9' });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal((await userRow(ok.body.user.id)).plant_id, 9);
});

test('users: ubah role Koordinator -> role lain melepas plant otomatis; ubah password; username tidak berubah', async () => {
    const admin = await loginAs('admin');
    const username = uniqueUsername('koor');
    const created = await postUser(admin, { username, displayName: 'Koor', role: 'koordinator_k3l', plantId: 1, password: username });
    const id = created.body.user.id;

    const demoted = await putUser(admin, id, { displayName: 'Koor Lama', role: 'manajer_bagian', plantId: 1, username: 'diganti' });
    assert.equal(demoted.status, 200, JSON.stringify(demoted.body));
    assert.deepEqual([demoted.body.user.role, demoted.body.user.plantId, demoted.body.user.username], ['manajer_bagian', null, username]);
    assert.deepEqual([(await userRow(id)).role, (await userRow(id)).plant_id], ['manajer_bagian', null]);

    assert.equal((await putUser(admin, id, { displayName: 'Koor', role: 'koordinator_k3l' })).body.error, 'PLANT_REQUIRED');
    assert.equal((await userRow(id)).role, 'manajer_bagian', 'penolakan tidak menyimpan apa pun');

    const hashBefore = (await userRow(id)).password_hash;
    assert.equal((await putUser(admin, id, { displayName: 'Koor', role: 'manajer_bagian', password: '' })).status, 200);
    assert.equal((await userRow(id)).password_hash, hashBefore, 'password kosong = tidak diganti');
    assert.equal((await putUser(admin, id, { displayName: 'Koor', role: 'manajer_bagian', password: 'sandibaru' })).status, 200);
    assert.equal((await request(app).post('/api/auth/login').send({ username, password: username })).status, 401, 'password lama ditolak');
    assert.equal((await request(app).post('/api/auth/login').send({ username, password: 'sandibaru' })).status, 200);

    assert.equal((await putUser(admin, 999999, { displayName: 'X', role: 'admin' })).status, 404);
});

test('users: nonaktif -> tidak bisa login DAN sesi yang berjalan langsung 401; aktif lagi -> bisa login; Admin tidak bisa menonaktifkan / mengganti role dirinya', async () => {
    const admin = await loginAs('admin');
    const target = await createOfficer(admin);
    const running = await loginAs(target.username);
    assert.equal((await running.agent.get('/api/inspections')).status, 200);

    const off = await putActive(admin, target.id, false);
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.equal(off.body.user.isActive, false);
    assert.equal((await running.agent.get('/api/inspections')).status, 401, 'sesi berjalan ditolak');
    assert.equal((await request(app).post('/api/auth/login').send({ username: target.username, password: target.username })).status, 401);

    assert.equal((await putActive(admin, target.id, 'false')).body.error, 'ACTIVE_INVALID');
    assert.equal((await putActive(admin, target.id, true)).body.user.isActive, true);
    await loginAs(target.username);

    const self = await putActive(admin, admin.user.id, false);
    assert.deepEqual([self.status, self.body.error], [400, 'CANNOT_DEACTIVATE_SELF']);
    const ownRole = await putUser(admin, admin.user.id, { displayName: 'Administrator', role: 'safety_officer' });
    assert.deepEqual([ownRole.status, ownRole.body.error], [400, 'CANNOT_CHANGE_OWN_ROLE']);
    assert.deepEqual([(await userRow(admin.user.id)).is_active, (await userRow(admin.user.id)).role], [1, 'admin']);
});

function deleteUser(session, id) {
    return withCsrf(session.agent.delete(`/api/users/${id}`), session.csrfToken);
}

test('users: hapus permanen — hanya akun nonaktif tanpa inspeksi belum selesai; riwayat bisnis tetap utuh, hanya tautan user menjadi NULL', async () => {
    const admin = await loginAs('admin');
    const andi = await loginAs('andi');
    const hadi = await loginAs('hadi');
    const officerName = uniqueUsername('ofc');
    const coordName = uniqueUsername('kor');
    const officerId = (await postUser(admin, { username: officerName, displayName: 'Petugas Dihapus', role: 'safety_officer', password: officerName })).body.user.id;
    const coordId = (await postUser(admin, { username: coordName, displayName: 'Koordinator Dihapus', role: 'koordinator_k3l', plantId: 1, password: coordName })).body.user.id;

    // Jejak bisnis: inspeksi + foto (pembuat), keputusan pengesahan (Koordinator), jadwal, dan satu draft.
    let officer = await loginAs(officerName);
    const coordinator = await loginAs(coordName);
    const inspection = await createInspectionWithPhoto(officer, 1);
    const draft = await createInspection(officer, DRAFT_CONTENT, { submit: false });
    const schedule = await withCsrf(officer.agent.post('/api/schedules'), officer.csrfToken)
        .send({ plantId: 1, officer: 'Petugas Dihapus', tahun: 2026, tanggalJadwal: '2026-11-01', periode: 4, minggu: 1 });
    assert.equal(schedule.status, 201);
    assert.equal((await approveWith(coordinator, inspection.id, 'koordinator_k3l')).status, 200);

    // Pengaman.
    assert.deepEqual([(await deleteUser(admin, officerId)).status, (await deleteUser(admin, officerId)).body.error], [400, 'USER_ACTIVE']);
    assert.equal((await putActive(admin, officerId, false)).status, 200);
    const open = await deleteUser(admin, officerId);
    assert.deepEqual({ status: open.status, error: open.body.error, data: open.body.data }, { status: 400, error: 'USER_HAS_OPEN_INSPECTIONS', data: { openInspections: 2 } },
        'draft + inspeksi yang sedang direview');
    assert.equal((await deleteUser(andi, coordId)).status, 403, 'bukan Admin');
    assert.deepEqual([(await deleteUser(admin, admin.user.id)).body.error], ['CANNOT_DELETE_SELF']);
    assert.equal((await deleteUser(admin, 999999)).status, 404);

    // Menuntaskan: pemilik (diaktifkan sebentar) menghapus draft-nya; inspeksi disetujui sampai selesai.
    await putActive(admin, officerId, true);
    officer = await loginAs(officerName);
    assert.equal((await withCsrf(officer.agent.delete(`/api/inspections/${draft.id}`), officer.csrfToken)).status, 200);
    await putActive(admin, officerId, false);
    assert.equal((await deleteUser(admin, officerId)).body.error, 'USER_HAS_OPEN_INSPECTIONS', 'masih ada yang sedang direview');
    assert.equal((await approveWith(andi, inspection.id, 'manajer')).status, 200);
    assert.equal((await approveWith(hadi, inspection.id, 'ketua_p2k3')).status, 200);

    const id = toNumeric(inspection.id);
    const counts = async () => {
        const [[row]] = await pool.query(
            `SELECT (SELECT COUNT(*) FROM findings WHERE inspection_id = ?) findings,
                    (SELECT COUNT(*) FROM corrective_actions WHERE inspection_id = ?) actions,
                    (SELECT COUNT(*) FROM photos WHERE inspection_id = ?) photos,
                    (SELECT COUNT(*) FROM approvals WHERE inspection_id = ?) approvals,
                    (SELECT COUNT(*) FROM inspections) inspections,
                    (SELECT COUNT(*) FROM schedules) schedules`,
            [id, id, id, id],
        );
        return row;
    };
    const before = await counts();

    // Hapus permanen kedua akun.
    assert.deepEqual((await deleteUser(admin, officerId)).body, { removed: true });
    await putActive(admin, coordId, false);
    assert.equal((await deleteUser(admin, coordId)).status, 200);

    assert.deepEqual(await counts(), before, 'tidak ada data bisnis yang ikut terhapus');
    const [[userRows]] = await pool.query('SELECT COUNT(*) n FROM users WHERE id IN (?, ?)', [officerId, coordId]);
    assert.equal(userRows.n, 0);
    const [[inspectionRow]] = await pool.query('SELECT petugas, petugas_user_id, status FROM inspections WHERE id = ?', [id]);
    assert.deepEqual(inspectionRow, { petugas: 'Petugas Dihapus', petugas_user_id: null, status: 'completed' });
    const [photoRows] = await pool.query('SELECT uploaded_by FROM photos WHERE inspection_id = ?', [id]);
    assert.ok(photoRows.length > 0 && photoRows.every((row) => row.uploaded_by === null));
    const [[scheduleRow]] = await pool.query('SELECT officer, officer_user_id FROM schedules WHERE id = ?', [toNumeric(schedule.body.schedule.id)]);
    assert.deepEqual(scheduleRow, { officer: 'Petugas Dihapus', officer_user_id: null });
    const [approvalRowsAfter] = await pool.query('SELECT stage, reviewer_user_id, reviewer_name FROM approvals WHERE inspection_id = ? ORDER BY id', [id]);
    assert.deepEqual(approvalRowsAfter.map((row) => [row.stage, row.reviewer_user_id, row.reviewer_name]), [
        ['koordinator_k3l', null, 'Koordinator Dihapus'], ['manajer', andi.user.id, 'Andi'], ['ketua_p2k3', hadi.user.id, 'Hadi'],
    ]);

    // Riwayat tetap terbaca lewat API, termasuk tanda tangan keputusan milik akun yang dihapus.
    const detail = await admin.agent.get(`/api/inspections/${inspection.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.petugas, 'Petugas Dihapus');
    assert.equal(detail.body.approvalHistory[0].reviewerName, 'Koordinator Dihapus');
    assert.equal((await getSignature(admin, inspection.id, detail.body.approvalHistory[0].id)).status, 200);

    // Sesi lama akun terhapus ditolak; login ditolak.
    assert.equal((await coordinator.agent.get('/api/inspections')).status, 401);
    assert.equal((await request(app).post('/api/auth/login').send({ username: officerName, password: officerName })).status, 401);
});

// =========================================================================
// Phase 18 — Admin menghapus inspeksi non-draft (inspection-policy canDelete)
// =========================================================================

async function inspectionFootprint(id) {
    const numericId = toNumeric(id);
    const [[row]] = await pool.query(
        `SELECT (SELECT COUNT(*) FROM inspections WHERE id = ?) inspections,
                (SELECT COUNT(*) FROM findings WHERE inspection_id = ?) findings,
                (SELECT COUNT(*) FROM corrective_actions WHERE inspection_id = ?) actions,
                (SELECT COUNT(*) FROM approvals WHERE inspection_id = ?) approvals,
                (SELECT COUNT(*) FROM photos WHERE inspection_id = ?) photos`,
        [numericId, numericId, numericId, numericId, numericId],
    );
    const [files] = await pool.query(
        `SELECT file_path AS p FROM photos WHERE inspection_id = ?
         UNION ALL SELECT signature_file_path FROM approvals WHERE inspection_id = ? AND signature_file_path IS NOT NULL`,
        [numericId, numericId],
    );
    return { counts: row, files: files.map((file) => file.p) };
}

test('Admin menghapus inspeksi non-draft: data turunan (CASCADE) + berkas foto & tanda tangannya ikut hilang; inspeksi lain, akun, jadwal tidak tersentuh', async () => {
    const arif = await loginAs('arif');
    const dewi = await loginAs('dewi');
    const andi = await loginAs('andi');
    const hadi = await loginAs('hadi');
    const admin = await loginAs('admin');
    const deleteAs = (session, id) => withCsrf(session.agent.delete(`/api/inspections/${id}`), session.csrfToken);

    // Target: selesai disahkan (foto + 3 tanda tangan). Pembanding: inspeksi lain dengan foto + tanda tangan.
    const target = await createInspectionWithPhoto(arif, 1);
    for (const [session, stage] of [[dewi, 'koordinator_k3l'], [andi, 'manajer'], [hadi, 'ketua_p2k3']]) {
        assert.equal((await approveWith(session, target.id, stage)).status, 200);
    }
    const sibling = await createInspectionWithPhoto(arif, 1);
    assert.equal((await approveWith(dewi, sibling.id, 'koordinator_k3l')).status, 200);

    const targetBefore = await inspectionFootprint(target.id);
    const siblingBefore = await inspectionFootprint(sibling.id);
    assert.ok(targetBefore.files.length >= 4, 'foto + 3 tanda tangan');
    assert.ok(targetBefore.files.every((file) => existsSync(path.join(UPLOAD_DIR, file))));
    const [[globalBefore]] = await pool.query('SELECT (SELECT COUNT(*) FROM users) users, (SELECT COUNT(*) FROM schedules) schedules, (SELECT COUNT(*) FROM plants) plants, (SELECT COUNT(*) FROM inspections) inspections');

    // Selain Admin: tidak ada jalur penghapusan.
    assert.equal((await deleteAs(dewi, sibling.id)).status, 403, 'Koordinator');
    assert.equal((await deleteAs(andi, target.id)).status, 403, 'Manajer');
    assert.equal((await deleteAs(hadi, target.id)).status, 403, 'Ketua P2K3');
    assert.equal((await deleteAs(arif, target.id)).body.error, 'NOT_DELETABLE', 'pemilik: hanya draft');
    assert.equal((await request(app).delete(`/api/inspections/${target.id}`)).status, 401);
    assert.equal((await admin.agent.delete(`/api/inspections/${target.id}`)).status, 403, 'tanpa CSRF');
    assert.deepEqual(await inspectionFootprint(target.id), targetBefore);

    // Admin: selesai (COMPLETED) dan sedang direview (IN_REVIEW) sama-sama bisa dihapus.
    assert.deepEqual((await deleteAs(admin, target.id)).body, { removed: true });
    const targetAfter = await inspectionFootprint(target.id);
    assert.deepEqual(targetAfter.counts, { inspections: 0, findings: 0, actions: 0, approvals: 0, photos: 0 });
    assert.ok(targetBefore.files.every((file) => !existsSync(path.join(UPLOAD_DIR, file))), 'berkas foto & tanda tangan terhapus dari disk');
    assert.equal((await admin.agent.get(`/api/inspections/${target.id}`)).status, 404);
    assert.equal((await deleteAs(admin, target.id)).status, 404, 'sudah terhapus');

    assert.deepEqual(await inspectionFootprint(sibling.id), siblingBefore, 'inspeksi lain utuh');
    assert.ok(siblingBefore.files.every((file) => existsSync(path.join(UPLOAD_DIR, file))), 'berkas inspeksi lain tetap ada');
    const [[globalAfter]] = await pool.query('SELECT (SELECT COUNT(*) FROM users) users, (SELECT COUNT(*) FROM schedules) schedules, (SELECT COUNT(*) FROM plants) plants, (SELECT COUNT(*) FROM inspections) inspections');
    assert.deepEqual(globalAfter, { ...globalBefore, inspections: globalBefore.inspections - 1 });

    assert.deepEqual((await deleteAs(admin, sibling.id)).body, { removed: true }, 'IN_REVIEW juga bisa dihapus Admin');
});

// =========================================================================
// Release — status tindakan perbaikan: PUT /api/inspections/:id/corrective-actions/:actionId
// Maju saja (open -> on-progress -> closed), tanpa foto, hanya Safety Officer pemilik,
// terkunci setelah COMPLETED; status alur kerja inspeksi tidak berubah.
// =========================================================================

function putActionStatus(session, inspectionId, actionId, status) {
    return withCsrf(session.agent.put(`/api/inspections/${inspectionId}/corrective-actions/${actionId}`), session.csrfToken).send({ status });
}
async function actionRow(actionId) {
    const [[row]] = await pool.query('SELECT inspection_id, status FROM corrective_actions WHERE id = ?', [actionId]);
    return row;
}

test('status tindakan perbaikan: pemilik memajukan tanpa foto; mundur/asing ditolak; status inspeksi tidak berubah', async () => {
    const arif = await loginAs('arif');
    const inspection = await createInspection(arif, DRAFT_CONTENT); // IN_REVIEW, dengan tindakan awal "open" per temuan
    const detail = (await arif.agent.get(`/api/inspections/${inspection.id}`)).body;
    const [first, second] = detail.perbaikan;
    assert.deepEqual([first.status, second.status], ['open', 'open']);

    const toProgress = await putActionStatus(arif, inspection.id, first.id, 'on-progress');
    assert.equal(toProgress.status, 200, JSON.stringify(toProgress.body));
    assert.equal(toProgress.body.action.status, 'on-progress');
    assert.equal((await putActionStatus(arif, inspection.id, first.id, 'closed')).status, 200);
    assert.equal((await putActionStatus(arif, inspection.id, second.id, 'closed')).status, 200, 'open -> closed langsung (maju)');
    assert.deepEqual([(await actionRow(first.id)).status, (await actionRow(second.id)).status], ['closed', 'closed']);

    for (const [label, actionId, status, error] of [
        ['reopen closed -> open', first.id, 'open', 'ACTION_STATUS_NOT_FORWARD'],
        ['closed -> on-progress', first.id, 'on-progress', 'ACTION_STATUS_NOT_FORWARD'],
        ['sama', second.id, 'closed', 'ACTION_STATUS_NOT_FORWARD'],
        ['nilai asing', second.id, 'selesai', 'ACTION_STATUS_INVALID'],
        ['huruf besar', second.id, 'CLOSED', 'ACTION_STATUS_INVALID'],
    ]) {
        const res = await putActionStatus(arif, inspection.id, actionId, status);
        assert.deepEqual([res.status, res.body.error], [400, error], label);
    }
    const missing = await withCsrf(arif.agent.put(`/api/inspections/${inspection.id}/corrective-actions/${first.id}`), arif.csrfToken).send({});
    assert.deepEqual([missing.status, missing.body.error], [400, 'ACTION_STATUS_INVALID'], 'tanpa status');

    const after = (await arif.agent.get(`/api/inspections/${inspection.id}`)).body;
    assert.deepEqual([after.status, after.currentApprovalStage], ['in_review', 'koordinator_k3l'], 'alur kerja inspeksi tidak tersentuh');
});

test('status tindakan perbaikan: hanya pemilik — SO lain / reviewer / Admin / tanpa login / tanpa CSRF ditolak; tindakan inspeksi lain -> 404; COMPLETED terkunci', async () => {
    const arif = await loginAs('arif');
    const tulus = await loginAs('tulus');
    const dewi = await loginAs('dewi');
    const andi = await loginAs('andi');
    const hadi = await loginAs('hadi');
    const admin = await loginAs('admin');
    const inspection = await createInspection(arif, DRAFT_CONTENT);
    const other = await createInspection(arif, DRAFT_CONTENT);
    const actionId = (await arif.agent.get(`/api/inspections/${inspection.id}`)).body.perbaikan[0].id;
    const otherActionId = (await arif.agent.get(`/api/inspections/${other.id}`)).body.perbaikan[0].id;

    assert.equal((await putActionStatus(tulus, inspection.id, actionId, 'closed')).status, 403, 'SO lain (melihat IN_REVIEW)');
    assert.equal((await putActionStatus(dewi, inspection.id, actionId, 'closed')).status, 403, 'Koordinator');
    assert.equal((await putActionStatus(admin, inspection.id, actionId, 'closed')).status, 403, 'Admin');
    assert.equal((await request(app).put(`/api/inspections/${inspection.id}/corrective-actions/${actionId}`).send({ status: 'closed' })).status, 401);
    assert.equal((await arif.agent.put(`/api/inspections/${inspection.id}/corrective-actions/${actionId}`).send({ status: 'closed' })).status, 403, 'tanpa CSRF');
    const crossed = await putActionStatus(arif, inspection.id, otherActionId, 'closed');
    assert.deepEqual({ status: crossed.status, body: crossed.body }, { status: 404, body: { error: 'NOT_FOUND' } }, 'id tindakan inspeksi lain');
    assert.equal((await putActionStatus(arif, inspection.id, 999999, 'closed')).status, 404);
    assert.deepEqual([(await actionRow(actionId)).status, (await actionRow(otherActionId)).status], ['open', 'open']);

    for (const [session, stage] of [[dewi, 'koordinator_k3l'], [andi, 'manajer'], [hadi, 'ketua_p2k3']]) {
        assert.equal((await approveWith(session, inspection.id, stage)).status, 200);
    }
    const locked = await putActionStatus(arif, inspection.id, actionId, 'closed');
    assert.deepEqual([locked.status, locked.body.error], [400, 'INSPECTION_COMPLETED']);
    assert.equal((await actionRow(actionId)).status, 'open');
});

test('status tindakan perbaikan: penjaga repository (satu UPDATE) — status lama basi, pemilik lain, atau inspeksi COMPLETED -> tidak disimpan', async () => {
    const { updateCorrectiveActionStatus } = await import('../repositories/inspection-repository.js');
    const arif = await loginAs('arif');
    const tulus = await loginAs('tulus');
    const inspection = await createInspection(arif, DRAFT_CONTENT);
    const actionId = (await arif.agent.get(`/api/inspections/${inspection.id}`)).body.perbaikan[0].id;

    assert.equal(await updateCorrectiveActionStatus(inspection.id, actionId, 'on-progress', 'closed', arif.user.id), false, 'status lama basi');
    assert.equal(await updateCorrectiveActionStatus(inspection.id, actionId, 'open', 'closed', tulus.user.id), false, 'bukan pemilik');
    await pool.query("UPDATE inspections SET status = 'completed', current_approval_stage = NULL WHERE id = ?", [toNumeric(inspection.id)]);
    assert.equal(await updateCorrectiveActionStatus(inspection.id, actionId, 'open', 'closed', arif.user.id), false, 'inspeksi COMPLETED');
    assert.equal((await actionRow(actionId)).status, 'open');
});
