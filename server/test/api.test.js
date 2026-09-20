/* api.test.js — uji end-to-end API Phase 12 terhadap MySQL sungguhan.
 *
 * Setiap run mengulang seed.js dulu (lewat child process terpisah, supaya
 * pool koneksinya sendiri dan tidak bentrok dengan pool yang dipakai app),
 * supaya hasilnya deterministik terlepas dari urutan test sebelumnya.
 *
 * Header X-Dev-User dipakai untuk berpindah "identitas" antar role — lihat
 * peringatan di server/middleware/dev-auth.js: ini BUKAN mekanisme yang
 * boleh ada di luar pengujian/pengembangan.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

before(() => {
    execFileSync(process.execPath, ['server/db/seed.js'], { cwd: process.cwd(), stdio: 'inherit' });
});

after(async () => {
    await pool.end();
});

const asUser = (username) => (req) => req.set('X-Dev-User', username);

test('tanpa header X-Dev-User -> 401', async () => {
    const res = await request(app).get('/api/inspections');
    assert.equal(res.status, 401);
});

test('user tidak dikenal -> 401', async () => {
    const res = await request(app).get('/api/inspections').set('X-Dev-User', 'tidak-ada');
    assert.equal(res.status, 401);
});

test('GET /api/auth/me mengembalikan identitas dev-auth', async () => {
    const res = await request(app).get('/api/auth/me').set('X-Dev-User', 'arif');
    assert.equal(res.status, 200);
    assert.equal(res.body.user.role, 'safety_officer');
    assert.equal(res.body.user.displayName, 'Arif');
});

test('GET /api/plants -> 15 plant dari PLANT_LIST', async () => {
    const res = await request(app).get('/api/plants').set('X-Dev-User', 'arif');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 15);
});

test('GET /api/inspections -> 6 inspeksi hasil seed', async () => {
    const res = await request(app).get('/api/inspections').set('X-Dev-User', 'arif');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 6);
});

test('GET /api/users hanya boleh admin', async () => {
    const asOfficer = await request(app).get('/api/users').set('X-Dev-User', 'arif');
    assert.equal(asOfficer.status, 403);

    const asAdmin = await request(app).get('/api/users').set('X-Dev-User', 'admin');
    assert.equal(asAdmin.status, 200);
    assert.equal(asAdmin.body.length, 8);
});

test('alur penuh: buat inspeksi -> approve berjenjang 2/3/4 -> tambah tindakan perbaikan', async () => {
    // 1. Safety Officer membuat inspeksi baru. petugas HARUS dipaksa dari
    //    identitas login (Arif), bukan dari body, walau body tidak mengirim
    //    petugas sama sekali.
    const createRes = await request(app)
        .post('/api/inspections')
        .set('X-Dev-User', 'arif')
        .send({
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
    const wrongRole = await request(app)
        .post(`/api/inspections/${id}/approve`)
        .set('X-Dev-User', 'admin')
        .send({ stageId: 2 });
    assert.equal(wrongRole.status, 403);

    // 3. Lompat ke tahap 4 sebelum tahap 2/3 -> tetap ditolak service (403 role salah duluan; coba dengan role yang benar untuk stage 4 supaya PREVIOUS_STAGE_PENDING teruji)
    const skipAhead = await request(app)
        .post(`/api/inspections/${id}/approve`)
        .set('X-Dev-User', 'hadi')
        .send({ stageId: 4 });
    assert.equal(skipAhead.status, 400);
    assert.equal(skipAhead.body.error, 'PREVIOUS_STAGE_PENDING');

    // 4. Koordinator K3L (Dewi) menyetujui tahap 2 — identitas sungguhan tersimpan (menutup S-07).
    const approve2 = await request(app)
        .post(`/api/inspections/${id}/approve`)
        .set('X-Dev-User', 'dewi')
        .send({ stageId: 2 });
    assert.equal(approve2.status, 200);
    assert.equal(approve2.body.stage.id, 2);
    assert.equal(approve2.body.fullyApproved, false);

    const afterStage2 = await request(app).get(`/api/inspections/${id}`).set('X-Dev-User', 'arif');
    assert.equal(afterStage2.body.approvals[2].approved, true);
    assert.equal(afterStage2.body.approvals[2].by, 'Dewi', 'identitas asli tersimpan, bukan literal "Approver"');

    // 5. Manajer Bagian (Andi) menyetujui tahap 3.
    const approve3 = await request(app)
        .post(`/api/inspections/${id}/approve`)
        .set('X-Dev-User', 'andi')
        .send({ stageId: 3 });
    assert.equal(approve3.status, 200);

    // 6. Ketua P2K3 (Hadi) menyetujui tahap 4 -> lengkap, status jadi selesai.
    const approve4 = await request(app)
        .post(`/api/inspections/${id}/approve`)
        .set('X-Dev-User', 'hadi')
        .send({ stageId: 4 });
    assert.equal(approve4.status, 200);
    assert.equal(approve4.body.fullyApproved, true);

    const afterFull = await request(app).get(`/api/inspections/${id}`).set('X-Dev-User', 'arif');
    assert.equal(afterFull.body.status, 'selesai');
    assert.equal(afterFull.body.approvals[4].by, 'Hadi');

    // 7. Tambah tindakan perbaikan (butuh foto — PHOTO_REQUIRED bila kosong).
    const noPhoto = await request(app)
        .post(`/api/inspections/${id}/corrective-actions`)
        .set('X-Dev-User', 'arif')
        .send({ action: 'Tanpa foto', status: 'open', pic: 'Arif', photos: [] });
    assert.equal(noPhoto.status, 400);
    assert.equal(noPhoto.body.error, 'PHOTO_REQUIRED');

    const withPhoto = await request(app)
        .post(`/api/inspections/${id}/corrective-actions`)
        .set('X-Dev-User', 'arif')
        .send({ action: 'Ganti label', status: 'closed', pic: 'Arif', photos: ['label.jpg'] });
    assert.equal(withPhoto.status, 201);

    const afterAction = await request(app).get(`/api/inspections/${id}`).set('X-Dev-User', 'arif');
    // 2 bukan 1: create() sudah otomatis membuat 1 tindakan "Temuan 1: ..."
    // per temuan (lihat inspection-service.js) — "Ganti label" di atas
    // adalah tindakan KEDUA, ditambahkan lewat corrective-actions endpoint.
    assert.equal(afterAction.body.perbaikan.length, 2);
    assert.equal(afterAction.body.perbaikan[1].foto[0], 'label.jpg');

    // 8. Hanya Safety Officer yang boleh menambah tindakan perbaikan.
    const wrongRoleAction = await request(app)
        .post(`/api/inspections/${id}/corrective-actions`)
        .set('X-Dev-User', 'admin')
        .send({ action: 'X', status: 'open', pic: 'Y', photos: ['a.jpg'] });
    assert.equal(wrongRoleAction.status, 403);
});

test('jadwal: buat, update, hapus (hapus hanya admin)', async () => {
    const created = await request(app)
        .post('/api/schedules')
        .set('X-Dev-User', 'arif')
        .send({ plantId: 1, officer: 'Arif', tahun: 2026, tanggalJadwal: '2026-11-01', periode: 4, minggu: 1 });
    assert.equal(created.status, 201);
    const scheduleId = created.body.schedule.id;

    const updated = await request(app)
        .put(`/api/schedules/${scheduleId}`)
        .set('X-Dev-User', 'arif')
        .send({ plantId: 1, officer: 'Arif Diubah', tahun: 2026, tanggalJadwal: '2026-11-02', periode: 4, minggu: 1 });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.schedule.officer, 'Arif Diubah');

    const deleteAsOfficer = await request(app).delete(`/api/schedules/${scheduleId}`).set('X-Dev-User', 'arif');
    assert.equal(deleteAsOfficer.status, 403);

    const deleteAsAdmin = await request(app).delete(`/api/schedules/${scheduleId}`).set('X-Dev-User', 'admin');
    assert.equal(deleteAsAdmin.status, 200);

    const getDeleted = await request(app).get(`/api/schedules`).set('X-Dev-User', 'arif');
    assert.ok(!getDeleted.body.some((s) => s.id === scheduleId));
});
