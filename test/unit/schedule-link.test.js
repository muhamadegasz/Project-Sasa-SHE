/* schedule-link.test.js — laporan inspeksi tertaut ke jadwal (migrasi 008;
 * jadwal WAJIB untuk laporan baru, inspeksi lama tanpa jadwal tetap berlaku).
 *
 * Aturan domain (schedule-rules.js checkScheduleLink / eligibleSchedulesFor)
 * dan penerapannya di inspection-service lewat repository palsu: buat draft,
 * ubah, ajukan (jadwal Terlaksana), revisi & ajukan ulang, hapus oleh Admin.
 * Penjaga database (kunci UNIQUE, UPDATE bersyarat di transaksi) ditiru
 * repository palsu; versi MySQL-nya diuji di server/test/api.test.js.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import * as plantFake from '../fakes/plant-repository.js';
import * as scheduleFake from '../fakes/schedule-repository.js';
import * as inspectionFake from '../fakes/inspection-repository.js';
import * as approvalService from '../../src/services/approval-service.js';
import * as inspectionService from '../../src/services/inspection-service.js';
import { checkScheduleLink, eligibleSchedulesFor, isAssignedTo } from '../../src/domain/schedule-rules.js';

const IE = inspectionService.INSPECTION_ERROR;
const arif = { id: 1, displayName: 'Arif', role: 'safety_officer' };
const tulus = { id: 2, displayName: 'Tulus', role: 'safety_officer' };
const dewiPlant9 = { id: 5, displayName: 'Dewi', role: 'koordinator_k3l', plantId: 9 };
const andi = { id: 6, displayName: 'Andi', role: 'manajer_bagian' };
const admin = { id: 9, displayName: 'Admin', role: 'admin' };
const SIGNATURE = { method: 'upload', mimeType: 'image/png', size: 2048, file: 'png-bytes' };

const schedule = (id, overrides = {}) => ({
    id, plantId: 9, plantName: 'Logistic', periode: 4, tahun: 2026, minggu: 1, tanggalJadwal: '2026-10-26',
    tanggalRealisasi: null, officer: 'Arif', officerUserId: 1, status: 'aktif', inspectionId: null, ...overrides,
});

beforeEach(() => {
    plantFake.__seed([{ id: 9, name: 'Logistic', code: 'LOG' }, { id: 16, name: 'Utility', code: 'UTL' }]);
    inspectionFake.__seed([]);
    scheduleFake.__seed([
        schedule('SCH-001'),
        schedule('SCH-002', { officer: 'Tulus', officerUserId: 2 }),
        schedule('SCH-003', { plantId: 16, plantName: 'Utility' }),
        // Data lama: officer_user_id berisi PEMBUAT (Arif) untuk jadwal milik Tulus.
        schedule('SCH-004', { officer: 'Tulus', officerUserId: 1 }),
        schedule('SCH-005', { tanggalRealisasi: '2026-10-01', status: 'selesai' }),
    ]);
});

const content = (overrides = {}) => ({ plantId: '9', tanggal: '2026-10-21', dueDate: '2026-11-04', temuan: [{ deskripsi: 'Kabel terbuka', kategori: 'Kelistrikan' }], ...overrides });
const createAs = (user, overrides) => inspectionService.create({ ...content(overrides), petugas: user.displayName, petugasUserId: user.id });
const scheduleOf = (id) => scheduleFake.findById(id);

// =========================================================================
// Domain
// =========================================================================

test('checkScheduleLink: ditugaskan (id DAN nama), plant sama, belum tertaut laporan lain, belum Terlaksana', async () => {
    const link = { officerUserId: 1, officerName: 'Arif', plantId: 9 };
    assert.equal(checkScheduleLink(await scheduleOf('SCH-001'), link).value.id, 'SCH-001');
    assert.deepEqual(checkScheduleLink(undefined, link), { error: 'NOT_FOUND' });
    assert.deepEqual(checkScheduleLink(await scheduleOf('SCH-002'), link), { error: 'NOT_ASSIGNED' }, 'jadwal SO lain');
    assert.deepEqual(checkScheduleLink(await scheduleOf('SCH-004'), link), { error: 'NOT_ASSIGNED' }, 'data lama: id pembuat, nama orang lain');
    assert.deepEqual(checkScheduleLink(await scheduleOf('SCH-003'), link), { error: 'PLANT_MISMATCH' });
    assert.deepEqual(checkScheduleLink(await scheduleOf('SCH-005'), link), { error: 'ALREADY_REALIZED' });
    const linked = schedule('SCH-009', { inspectionId: 'INS-007', tanggalRealisasi: '2026-10-02', status: 'selesai' });
    assert.deepEqual(checkScheduleLink(linked, link), { error: 'ALREADY_LINKED' });
    assert.equal(checkScheduleLink(linked, { ...link, inspectionId: 'INS-007' }).value.id, 'SCH-009', 'tautan ke dirinya sendiri tetap sah (revisi)');
    assert.equal(isAssignedTo(schedule('X', { officer: '  arif ' }), 1, 'Arif'), true, 'nama dibandingkan tanpa beda huruf/spasi tepi');
    assert.equal(isAssignedTo(schedule('X', { officerUserId: null }), 1, 'Arif'), false);
});

test('eligibleSchedulesFor: hanya jadwal miliknya yang belum Terlaksana & belum tertaut — pilihan form Buat Inspeksi', async () => {
    const all = await scheduleFake.getAll();
    assert.deepEqual(eligibleSchedulesFor(all, arif).map((item) => item.id), ['SCH-001', 'SCH-003']);
    assert.deepEqual(eligibleSchedulesFor(all, tulus).map((item) => item.id), ['SCH-002']);
    assert.deepEqual(eligibleSchedulesFor(all, null), []);
});

// =========================================================================
// inspection-service
// =========================================================================

test('draft bertautan jadwal: tautan tersimpan, jadwal BELUM Terlaksana; pengajuan pertama menautkan & menandai Terlaksana; status pengesahan tetap terpisah', async () => {
    const created = await createAs(arif, { scheduleId: 'SCH-001' });
    assert.equal(created.ok, true, JSON.stringify(created));
    const draft = created.data.inspection;
    assert.equal(draft.scheduleId, 'SCH-001');
    assert.deepEqual([(await scheduleOf('SCH-001')).status, (await scheduleOf('SCH-001')).tanggalRealisasi], ['aktif', null], 'draft tidak menandai jadwal');

    const submitted = await inspectionService.submit(draft.id, arif);
    assert.equal(submitted.ok, true, JSON.stringify(submitted));
    assert.equal(submitted.data.scheduleCompleted, true);
    const done = await scheduleOf('SCH-001');
    assert.equal(done.status, 'selesai');
    assert.equal(done.tanggalRealisasi, new Date().toISOString().slice(0, 10));
    assert.equal(done.inspectionId, draft.id);
    // Terlaksana bukan berarti disahkan: inspeksi baru masuk tahap pertama, tanpa keputusan.
    const stored = await inspectionFake.findById(draft.id);
    assert.deepEqual([stored.status, stored.currentApprovalStage, stored.approvalHistory.length], ['in_review', 'koordinator_k3l', 0]);

    // Pengesahan berjalan seperti biasa dan tidak mengubah jadwal.
    assert.equal((await approvalService.approve(draft.id, 'koordinator_k3l', dewiPlant9, SIGNATURE)).ok, true);
    assert.deepEqual([(await scheduleOf('SCH-001')).status, (await inspectionFake.findById(draft.id)).currentApprovalStage], ['selesai', 'manajer']);
});

test('ditolak: jadwal SO lain, data lama milik orang lain, plant berbeda, jadwal tidak ada, sudah Terlaksana — tidak ada yang tersimpan', async () => {
    for (const [scheduleId, plantId, reason] of [
        ['SCH-002', '9', IE.SCHEDULE_NOT_ASSIGNED],
        ['SCH-004', '9', IE.SCHEDULE_NOT_ASSIGNED],
        ['SCH-001', '16', IE.SCHEDULE_PLANT_MISMATCH],
        ['SCH-999', '9', IE.SCHEDULE_NOT_FOUND],
        ['bukan-jadwal', '9', IE.SCHEDULE_NOT_FOUND],
        ['SCH-005', '9', IE.SCHEDULE_ALREADY_REALIZED],
    ]) {
        assert.equal((await createAs(arif, { scheduleId, plantId })).reason, reason, `${scheduleId} / plant ${plantId}`);
    }
    assert.equal(await inspectionFake.count(), 0);
    assert.deepEqual((await scheduleFake.getAll()).map((item) => item.status), ['aktif', 'aktif', 'aktif', 'aktif', 'selesai']);
});

test('jadwal WAJIB untuk laporan baru: tanpa jadwal ditolak saat buat, simpan draft, dan pengajuan pertama draft lama; inspeksi lama tanpa jadwal tetap bisa direvisi & diajukan ulang', async () => {
    for (const scheduleId of [undefined, null, '', '   ']) {
        assert.equal((await createAs(arif, { scheduleId })).reason, IE.SCHEDULE_REQUIRED, JSON.stringify(scheduleId));
    }
    // Urutan validasi lama tetap: isi diperiksa lebih dulu daripada jadwal.
    assert.equal((await createAs(arif, { temuan: [] })).reason, IE.FINDINGS_REQUIRED);
    assert.equal(await inspectionFake.count(), 0);

    // Data lama (pra-migrasi 008): draft & revisi tanpa jadwal.
    inspectionFake.__seed([
        { id: 'INS-101', plantId: 9, petugas: 'Arif', petugasUserId: 1, status: 'draft', currentApprovalStage: null, tanggal: '2026-09-01', temuan: [{ id: 1, deskripsi: 'Lama', kategori: 'Kelistrikan' }], approvalHistory: [], perbaikan: [] },
        { id: 'INS-102', plantId: 9, petugas: 'Arif', petugasUserId: 1, status: 'revision_required', currentApprovalStage: 'manajer', tanggal: '2026-09-01', temuan: [{ id: 2, deskripsi: 'Lama', kategori: 'Kelistrikan' }], approvalHistory: [], perbaikan: [] },
    ]);
    assert.equal((await inspectionService.submit('INS-101', arif)).reason, IE.SCHEDULE_REQUIRED, 'draft lama harus memilih jadwal dulu');
    assert.equal((await inspectionService.update('INS-101', content({ temuan: [{ id: 1, deskripsi: 'Lama', kategori: 'Kelistrikan' }] }), arif)).reason, IE.SCHEDULE_REQUIRED);
    assert.equal((await inspectionService.update('INS-101', content({ scheduleId: 'SCH-001', temuan: [{ id: 1, deskripsi: 'Lama', kategori: 'Kelistrikan' }] }), arif)).ok, true);
    assert.equal((await inspectionService.submit('INS-101', arif)).data.scheduleCompleted, true);

    const revised = await inspectionService.update('INS-102', content({ temuan: [{ id: 2, deskripsi: 'Lama direvisi', kategori: 'Kelistrikan' }] }), arif);
    assert.equal(revised.ok, true, JSON.stringify(revised));
    const resubmitted = await inspectionService.submit('INS-102', arif);
    assert.deepEqual([resubmitted.ok, resubmitted.data.resubmitted, resubmitted.data.scheduleCompleted], [true, true, false]);
    assert.equal((await inspectionFake.findById('INS-102')).scheduleId ?? null, null);
});
test('ganda: jadwal yang sudah dipakai draft lain / laporan lain ditolak; pengajuan ulang yang sama ditolak tanpa menandai ulang', async () => {
    const first = (await createAs(arif, { scheduleId: 'SCH-001' })).data.inspection;
    assert.equal((await createAs(arif, { scheduleId: 'SCH-001' })).reason, IE.SCHEDULE_ALREADY_LINKED, 'dipakai draft lain (kunci UNIQUE)');
    const other = (await createAs(arif, { scheduleId: 'SCH-003', plantId: '16' })).data.inspection;
    assert.equal((await inspectionService.update(other.id, content({ scheduleId: 'SCH-001' }), arif)).reason, IE.SCHEDULE_ALREADY_LINKED);
    assert.equal((await inspectionFake.findById(other.id)).scheduleId, 'SCH-003');

    assert.equal((await inspectionService.submit(first.id, arif)).ok, true);
    const realizedOn = (await scheduleOf('SCH-001')).tanggalRealisasi;
    const again = await inspectionService.submit(first.id, arif);
    assert.equal(again.ok, false, 'sudah IN_REVIEW');
    assert.equal((await scheduleOf('SCH-001')).tanggalRealisasi, realizedOn);
    assert.equal((await createAs(arif, { scheduleId: 'SCH-001' })).reason, IE.SCHEDULE_ALREADY_LINKED, 'sudah tertaut laporan yang diajukan');
});
test('kegagalan database di tengah pengajuan: inspeksi tetap DRAFT dan jadwal tetap belum Terlaksana', async () => {
    const draft = (await createAs(arif, { scheduleId: 'SCH-001' })).data.inspection;
    inspectionFake.__failSubmitOnce();
    await assert.rejects(inspectionService.submit(draft.id, arif), /simulasi kegagalan database/);
    assert.equal((await inspectionFake.findById(draft.id)).status, 'draft');
    assert.deepEqual([(await scheduleOf('SCH-001')).status, (await scheduleOf('SCH-001')).tanggalRealisasi], ['aktif', null]);

    // Jadwal berubah (dialihkan ke SO lain) di antara pemeriksaan & transaksi -> seluruh pengajuan batal.
    Object.assign(await scheduleOf('SCH-001'), { officerUserId: 2, officer: 'Tulus' });
    assert.equal((await inspectionService.submit(draft.id, arif)).reason, IE.SCHEDULE_NOT_ASSIGNED);
    assert.equal((await inspectionFake.findById(draft.id)).status, 'draft');
});

test('draft: jadwal bisa diganti sebelum diajukan, tetapi tidak bisa dikosongkan', async () => {
    const draft = (await createAs(arif, { scheduleId: 'SCH-001' })).data.inspection;
    assert.equal((await inspectionService.update(draft.id, content({ plantId: '16', scheduleId: 'SCH-003' }), arif)).ok, true);
    assert.equal((await inspectionFake.findById(draft.id)).scheduleId, 'SCH-003');
    assert.equal((await inspectionService.update(draft.id, content({ scheduleId: '' }), arif)).reason, IE.SCHEDULE_REQUIRED);
    assert.equal((await inspectionFake.findById(draft.id)).scheduleId, 'SCH-003');
    assert.equal((await createAs(arif, { scheduleId: 'SCH-001' })).ok, true, 'SCH-001 bebas lagi');
});
test('revisi & ajukan ulang: tautan asli dipertahankan (isian jadwal diabaikan), plant tidak boleh menjauh, jadwal tidak ditandai ulang', async () => {
    const draft = (await createAs(arif, { scheduleId: 'SCH-001' })).data.inspection;
    await inspectionService.submit(draft.id, arif);
    const realizedOn = (await scheduleOf('SCH-001')).tanggalRealisasi;
    await approvalService.approve(draft.id, 'koordinator_k3l', dewiPlant9, SIGNATURE);
    await approvalService.reject(draft.id, 'manajer', andi, 'Lengkapi foto');

    const revising = await inspectionFake.findById(draft.id);
    assert.equal((await inspectionService.update(draft.id, content({ plantId: '16', temuan: revising.temuan }), arif)).reason, IE.SCHEDULE_PLANT_MISMATCH);
    const saved = await inspectionService.update(draft.id, content({ scheduleId: '', temuan: revising.temuan }), arif);
    assert.equal(saved.ok, true, JSON.stringify(saved));
    assert.equal((await inspectionFake.findById(draft.id)).scheduleId, 'SCH-001', 'tidak bisa dilepas saat revisi');

    const resubmitted = await inspectionService.submit(draft.id, arif);
    assert.deepEqual([resubmitted.ok, resubmitted.data.resubmitted, resubmitted.data.scheduleCompleted], [true, true, false]);
    assert.deepEqual([(await scheduleOf('SCH-001')).status, (await scheduleOf('SCH-001')).tanggalRealisasi], ['selesai', realizedOn]);
    assert.equal((await inspectionFake.findById(draft.id)).currentApprovalStage, 'manajer');
});

test('SO lain tidak bisa mengajukan/mengubah laporan bertautan jadwal; Admin menghapus laporan -> jadwal kembali belum Terlaksana', async () => {
    const draft = (await createAs(arif, { scheduleId: 'SCH-001' })).data.inspection;
    assert.equal((await inspectionService.submit(draft.id, tulus)).reason, IE.NOT_FOUND, 'draft orang lain tidak terlihat');
    await inspectionService.submit(draft.id, arif);
    assert.equal((await inspectionService.update(draft.id, content({ scheduleId: 'SCH-002' }), tulus)).ok, false);

    assert.equal((await inspectionService.removeAsAdmin(draft.id, admin)).ok, true);
    const reopened = await scheduleOf('SCH-001');
    assert.deepEqual([reopened.status, reopened.tanggalRealisasi, reopened.inspectionId], ['aktif', null, null]);
});
