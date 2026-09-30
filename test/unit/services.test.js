/* services.test.js — Phase 14.1-A: pemulihan unit test business rules.
 *
 * Menggantikan test-services.mjs lama (scratchpad, tidak pernah masuk repo),
 * yang rusak sejak Phase 14 karena src/repositories/*.js jadi fetch()
 * sungguhan tanpa mode in-memory. Di sini services diuji lewat FAKE
 * repository (test/fakes/*.js), disuntikkan lewat kondisi "test" pada
 * package.json "imports" — mekanisme yang SAMA dengan yang sudah dipakai
 * untuk memilih repository server vs browser sejak Phase 12 (lihat
 * docs/ROADMAP-PHASE12.md K-18), bukan mekanisme baru.
 *
 * Jalankan: npm run test:unit (mengeset --conditions=test).
 * Tanpa browser, tanpa HTTP server, tanpa MySQL, tanpa fetch sungguhan.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import * as plantFake from '../fakes/plant-repository.js';
import * as inspectionFake from '../fakes/inspection-repository.js';
import * as scheduleFake from '../fakes/schedule-repository.js';

import * as approvalService from '../../src/services/approval-service.js';
import * as correctiveActionService from '../../src/services/corrective-action-service.js';
import * as inspectionService from '../../src/services/inspection-service.js';
import * as scheduleService from '../../src/services/schedule-service.js';
import { filterByFields } from '../../src/services/search-service.js';
import { SCHEDULE_EDITOR_ROLES, canManageSchedules } from '../../src/domain/schedule-rules.js';

// Stub minimal untuk excel-exporter.js (lapisan infrastruktur, bukan repository) —
// hanya dipakai bagian S-04 di bawah. Bukan mock jaringan/DOM apa pun yang lain.
const capturedSheets = [];
globalThis.XLSX = {
    utils: {
        book_new: () => ({ sheets: [] }),
        json_to_sheet: (rows) => { capturedSheets.push(rows); return { rows }; },
        book_append_sheet: (workbook, sheet, name) => { workbook.sheets.push({ name, sheet }); },
    },
    writeFile: () => {},
};
const excel = await import('../../src/infrastructure/excel-exporter.js');

function seedBaseline() {
    plantFake.__seed([
        { id: 3, name: 'Fermentation', code: 'FERM' },
        { id: 9, name: 'Logistic', code: 'LOG' },
        { id: 16, name: 'Utility', code: 'UTL' },
    ]);
    inspectionFake.__seed([
        {
            id: 'INS-001',
            plantId: 3, lokasi: 'Fermentation', petugas: 'Arif', petugasUserId: 1,
            status: 'in_review', currentApprovalStage: 'koordinator_k3l', approvalHistory: [],
            temuan: [{ deskripsi: 'Kabel terkelupas', kategori: 'Kelistrikan' }],
            perbaikan: [{ tgl: '1/1/2026', action: 'Tindakan awal', status: 'open', pic: 'Arif', foto: ['awal.jpg'] }],
        },
        {
            id: 'INS-002',
            plantId: 9, lokasi: 'Logistic', petugas: 'Arif', petugasUserId: 1,
            status: 'in_review', currentApprovalStage: 'koordinator_k3l', approvalHistory: [],
            temuan: [], perbaikan: [],
        },
    ]);
    scheduleFake.__seed([]);
}

beforeEach(seedBaseline);

// =========================================================================
// approval-service
// =========================================================================

// Phase 17.2: tiga tahap, riwayat append-only, wewenang lewat inspection-policy.
// Phase 17.3B: inspeksi yang tidak TERLIHAT oleh pengguna -> NOT_FOUND (sama
// dengan id yang tidak ada) sebelum pemeriksaan lain; terlihat tapi tidak
// berwenang -> FORBIDDEN.
const AE = approvalService.APPROVAL_ERROR;
const dewiPlant9 = { id: 5, displayName: 'Dewi', role: 'koordinator_k3l', plantId: 9 };
const koordinatorPlant3 = { id: 11, displayName: 'Bambang', role: 'koordinator_k3l', plantId: 3 };
const andi = { id: 6, displayName: 'Andi', role: 'manajer_bagian' };
const hadi = { id: 7, displayName: 'Hadi', role: 'ketua_p2k3' };
const admin = { id: 9, displayName: 'Admin', role: 'admin' };
const owner = { id: 1, displayName: 'Arif', role: 'safety_officer' }; // petugasUserId inspeksi baseline
const otherOfficer = { id: 2, displayName: 'Tulus', role: 'safety_officer' };
// Phase 17.4A: persetujuan wajib bertanda tangan. mimeType = hasil deteksi isi
// berkas (di server: detectSignatureMimeType); `file` opaque bagi service.
const SIGNATURE = { method: 'upload', mimeType: 'image/png', size: 2048, file: 'png-bytes' };

test('approve: inspeksi tidak ada -> NOT_FOUND', async () => {
    const result = await approvalService.approve('TIDAK-ADA', 'koordinator_k3l', dewiPlant9);
    assert.equal(result.ok, false);
    assert.equal(result.reason, AE.NOT_FOUND);
});

test('approve: kode tahap tidak dikenal (termasuk tahap lama bernomor) -> STAGE_NOT_FOUND', async () => {
    assert.equal((await approvalService.approve('INS-002', 'safety_officer', dewiPlant9)).reason, AE.STAGE_NOT_FOUND);
    assert.equal((await approvalService.approve('INS-002', 2, dewiPlant9)).reason, AE.STAGE_NOT_FOUND);
});

test('approve: tahap yang bukan tahap berjalan -> STAGE_NOT_CURRENT (tidak bisa melompat)', async () => {
    // Dewi bisa melihat INS-002 (tahap Koordinator, plant-nya) tapi mengirim tahap Manajer.
    const result = await approvalService.approve('INS-002', 'manajer', dewiPlant9);
    assert.equal(result.reason, AE.STAGE_NOT_CURRENT);
});

test('approve: inspeksi yang terlihat tapi tidak IN_REVIEW -> NOT_IN_REVIEW', async () => {
    const stored = await inspectionFake.findById('INS-002');
    stored.status = 'revision_required';
    // Admin tetap melihat revisi -> mendapat alasan status, bukan NOT_FOUND.
    assert.equal((await approvalService.approve('INS-002', 'koordinator_k3l', admin)).reason, AE.NOT_IN_REVIEW);
});

test('approve: terlihat tapi tidak berwenang -> FORBIDDEN (Admin, Safety Officer pemilik)', async () => {
    assert.equal((await approvalService.approve('INS-002', 'koordinator_k3l', admin)).reason, AE.FORBIDDEN);
    assert.equal((await approvalService.approve('INS-002', 'koordinator_k3l', owner)).reason, AE.FORBIDDEN);
});

test('approve: tidak terlihat -> NOT_FOUND, status/tahap tidak bocor (Manajer di tahap Koordinator, Koordinator plant lain)', async () => {
    assert.equal((await approvalService.approve('INS-002', 'koordinator_k3l', andi)).reason, AE.NOT_FOUND);
    assert.equal((await approvalService.approve('INS-002', 'ketua_p2k3', hadi)).reason, AE.NOT_FOUND);
    const result = await approvalService.approve('INS-002', 'koordinator_k3l', koordinatorPlant3);
    assert.equal(result.reason, AE.NOT_FOUND);
    assert.equal((await inspectionFake.findById('INS-002')).approvalHistory.length, 0);
});

test('approve: Koordinator plant-nya sendiri berhasil — riwayat bertambah, tahap maju ke Manajer, identitas tersimpan (S-07)', async () => {
    const result = await approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9, SIGNATURE);
    assert.equal(result.ok, true);
    assert.equal(result.data.stage.id, 'koordinator_k3l');
    assert.equal(result.data.fullyApproved, false);

    const stored = await inspectionFake.findById('INS-002');
    assert.equal(stored.status, 'in_review');
    assert.equal(stored.currentApprovalStage, 'manajer');
    assert.equal(stored.approvalHistory.length, 1);
    const [entry] = stored.approvalHistory;
    assert.deepEqual(
        { stage: entry.stage, attempt: entry.attempt, decision: entry.decision, reviewerUserId: entry.reviewerUserId, reviewerName: entry.reviewerName },
        { stage: 'koordinator_k3l', attempt: 1, decision: 'approved', reviewerUserId: 5, reviewerName: 'Dewi' },
    );
});

test('approve: ketiga tahap -> COMPLETED, fullyApproved true', async () => {
    await approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9, SIGNATURE);
    await approvalService.approve('INS-002', 'manajer', andi, SIGNATURE);
    const result = await approvalService.approve('INS-002', 'ketua_p2k3', hadi, SIGNATURE);
    assert.equal(result.data.fullyApproved, true);

    const stored = await inspectionFake.findById('INS-002');
    assert.equal(stored.status, 'completed');
    assert.equal(stored.currentApprovalStage, null);
    assert.equal(stored.approvalHistory.length, 3);
});

test('approve: approve ulang tahap yang sudah lewat ditolak, keputusan lama tidak ditimpa', async () => {
    await approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9, SIGNATURE);
    // Koordinator tetap MELIHAT inspeksi yang dia setujui (riwayat), tapi tidak
    // bisa memutuskan lagi: tahapnya sudah lewat, dan tahap Manajer bukan miliknya.
    const again = await approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9, SIGNATURE);
    assert.equal(again.reason, AE.STAGE_NOT_CURRENT);
    const rejectAgain = await approvalService.reject('INS-002', 'koordinator_k3l', dewiPlant9, 'Berubah pikiran');
    assert.equal(rejectAgain.reason, AE.STAGE_NOT_CURRENT);
    assert.equal((await approvalService.approve('INS-002', 'manajer', dewiPlant9, SIGNATURE)).reason, AE.FORBIDDEN);
    assert.equal((await approvalService.reject('INS-002', 'manajer', dewiPlant9, 'Bukan tahap saya')).reason, AE.FORBIDDEN);
    const stored = await inspectionFake.findById('INS-002');
    assert.equal(stored.approvalHistory.length, 1);
    assert.deepEqual([stored.status, stored.currentApprovalStage], ['in_review', 'manajer']);
});

test('approve: dua persetujuan bersamaan untuk tahap yang sama -> tepat satu tersimpan', async () => {
    const [first, second] = await Promise.all([
        approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9, SIGNATURE),
        approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9, SIGNATURE),
    ]);
    assert.equal([first, second].filter((result) => result.ok).length, 1);
    assert.equal([first, second].find((result) => !result.ok).reason, AE.STAGE_NOT_CURRENT);
    assert.equal((await inspectionFake.findById('INS-002')).approvalHistory.length, 1);
});

test('reject: alasan tidak valid -> 400-level reason, tidak ada yang tersimpan', async () => {
    const cases = [
        [undefined, AE.REJECTION_REASON_REQUIRED],
        ['', AE.REJECTION_REASON_REQUIRED],
        ['   ', AE.REJECTION_REASON_REQUIRED],
        [{ toString: () => 'objek' }, AE.REJECTION_REASON_INVALID],
        [['array'], AE.REJECTION_REASON_INVALID],
        [42, AE.REJECTION_REASON_INVALID],
        ['x'.repeat(1001), AE.REJECTION_REASON_TOO_LONG],
    ];
    for (const [reason, expected] of cases) {
        assert.equal((await approvalService.reject('INS-002', 'koordinator_k3l', dewiPlant9, reason)).reason, expected, JSON.stringify(reason));
    }
    const stored = await inspectionFake.findById('INS-002');
    assert.equal(stored.status, 'in_review');
    assert.equal(stored.approvalHistory.length, 0);
});

test('reject: alasan tepat 1000 karakter diterima', async () => {
    const result = await approvalService.reject('INS-002', 'koordinator_k3l', dewiPlant9, 'y'.repeat(1000));
    assert.equal(result.ok, true);
});

test('reject: -> REVISION_REQUIRED, tahap TETAP, alasan tersimpan (di-trim), persetujuan sebelumnya tidak disentuh', async () => {
    await approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9, SIGNATURE);
    const result = await approvalService.reject('INS-002', 'manajer', andi, '  Foto kurang jelas  ');
    assert.equal(result.ok, true);

    const stored = await inspectionFake.findById('INS-002');
    assert.equal(stored.status, 'revision_required');
    assert.equal(stored.currentApprovalStage, 'manajer', 'kembali ke Manajer setelah revisi, bukan ke Koordinator');
    assert.equal(stored.approvalHistory.length, 2);
    assert.equal(stored.approvalHistory[0].decision, 'approved', 'persetujuan Koordinator tetap ada di riwayat');
    assert.equal(stored.approvalHistory[1].decision, 'rejected');
    assert.equal(stored.approvalHistory[1].rejectionReason, 'Foto kurang jelas');
});

test('reject: terlihat tapi tidak berwenang -> FORBIDDEN; tidak terlihat -> NOT_FOUND', async () => {
    assert.equal((await approvalService.reject('INS-002', 'koordinator_k3l', owner, 'x')).reason, AE.FORBIDDEN);
    assert.equal((await approvalService.reject('INS-002', 'koordinator_k3l', admin, 'x')).reason, AE.FORBIDDEN);
    assert.equal((await approvalService.reject('INS-002', 'koordinator_k3l', koordinatorPlant3, 'x')).reason, AE.NOT_FOUND);
});

test('reject: inspeksi tidak ada -> NOT_FOUND', async () => {
    const result = await approvalService.reject('TIDAK-ADA', 'koordinator_k3l', dewiPlant9, 'x');
    assert.equal(result.reason, AE.NOT_FOUND);
});

// =========================================================================
// corrective-action-service — Phase 17.3B: hanya Safety Officer PEMILIK
// =========================================================================

const CA = correctiveActionService.CORRECTIVE_ACTION_ERROR;

test('addAction: inspeksi tidak ada -> NOT_FOUND', async () => {
    const result = await correctiveActionService.addAction('TIDAK-ADA', { action: 'a', photos: ['f.jpg'] }, owner);
    assert.equal(result.reason, CA.NOT_FOUND);
});

test('addAction: hanya pemilik — SO lain yang MELIHAT inspeksi tetap FORBIDDEN; peninjau & Admin juga tidak', async () => {
    const input = { action: 'Perbaiki', status: 'open', pic: 'X', photos: ['f.jpg'] };
    assert.equal((await correctiveActionService.addAction('INS-001', input, otherOfficer)).reason, CA.FORBIDDEN, 'SO lain (bisa melihat IN_REVIEW)');
    assert.equal((await correctiveActionService.addAction('INS-001', input, admin)).reason, CA.FORBIDDEN, 'Admin (bisa melihat)');
    assert.equal((await correctiveActionService.addAction('INS-001', input, andi)).reason, CA.NOT_FOUND, 'Manajer (tidak melihat tahap Koordinator)');
    assert.equal((await inspectionFake.findById('INS-001')).perbaikan.length, 1, 'tidak ada yang tersimpan');
});

test('addAction: tindakan kosong/spasi saja -> ACTION_REQUIRED', async () => {
    assert.equal((await correctiveActionService.addAction('INS-001', { action: '   ', photos: ['f.jpg'] }, owner)).reason, CA.ACTION_REQUIRED);
    assert.equal((await correctiveActionService.addAction('INS-001', { photos: ['f.jpg'] }, owner)).reason, CA.ACTION_REQUIRED);
});

test('addAction: foto wajib -> PHOTO_REQUIRED', async () => {
    assert.equal((await correctiveActionService.addAction('INS-001', { action: 'Perbaiki' }, owner)).reason, CA.PHOTO_REQUIRED);
    assert.equal((await correctiveActionService.addAction('INS-001', { action: 'Perbaiki', photos: [] }, owner)).reason, CA.PHOTO_REQUIRED);
});

test('addAction: pemilik berhasil — deskripsi di-trim, pengunggah dari sesi, status alur kerja inspeksi TIDAK berubah', async () => {
    const before = (await inspectionFake.findById('INS-001')).perbaikan.length;
    const result = await correctiveActionService.addAction('INS-001', {
        action: '  Ganti kabel  ', status: 'on-progress', pic: 'Tulus', photos: ['a.jpg', 'b.jpg'], uploadedBy: 999,
    }, owner);
    assert.equal(result.ok, true);
    assert.equal(result.data.action.action, 'Ganti kabel');
    assert.equal(result.data.action.foto.length, 2);
    assert.equal(result.data.action.uploadedBy, owner.id, 'uploadedBy dari pengguna login, bukan isian');

    const stored = await inspectionFake.findById('INS-001');
    assert.equal(stored.perbaikan.length, before + 1);
    assert.equal(stored.status, 'in_review', 'tindakan perbaikan tidak menentukan status alur kerja');
    assert.equal(stored.currentApprovalStage, 'koordinator_k3l');

    await correctiveActionService.addAction('INS-001', { action: 'Tutup semua', status: 'closed', pic: 'Tulus', photos: ['c.jpg'] }, owner);
    assert.equal((await inspectionFake.findById('INS-001')).status, 'in_review', 'bahkan saat tindakan closed');
});

// =========================================================================
// inspection-service — Phase 17.3B: draft, ubah, ajukan, revisi, hapus draft
// =========================================================================

const IE = inspectionService.INSPECTION_ERROR;
const validContent = {
    plantId: '16', tanggal: '2026-09-19', dueDate: '2026-10-01',
    temuan: [{ deskripsi: 'Temuan A', kategori: 'Kelistrikan' }, { deskripsi: 'Temuan B', kategori: 'Kebakaran' }],
};

async function createDraft(overrides = {}) {
    const result = await inspectionService.create({ ...validContent, petugas: 'Arif', petugasUserId: owner.id, ...overrides });
    assert.equal(result.ok, true, JSON.stringify(result));
    return result.data.inspection;
}

test('create: plant wajib', async () => {
    assert.equal((await inspectionService.create({})).reason, IE.PLANT_REQUIRED);
});

test('create: temuan wajib', async () => {
    assert.equal((await inspectionService.create({ plantId: '3' })).reason, IE.FINDINGS_REQUIRED);
});

test('create: tanggal wajib', async () => {
    assert.equal((await inspectionService.create({ plantId: '3', temuan: [{ deskripsi: 'x' }] })).reason, IE.DATE_REQUIRED);
});

test('create: urutan validasi — plant menang atas temuan', async () => {
    assert.equal((await inspectionService.create({ temuan: [] })).reason, IE.PLANT_REQUIRED);
});

test('create: plantId tidak ditemukan -> PLANT_NOT_FOUND (regresi bug 500 pra-Phase-13, lihat DECISIONS.md K-19)', async () => {
    const result = await inspectionService.create({
        plantId: '99999', tanggal: '2026-09-20', temuan: [{ deskripsi: 'x', kategori: 'Lainnya' }],
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, IE.PLANT_NOT_FOUND);
});

test('create: menghasilkan DRAFT — tanpa tahap, tanpa waktu pengajuan, tanpa riwayat, tanpa tindakan; status dari isian diabaikan', async () => {
    const countBefore = await inspectionFake.count();
    const inspection = await createDraft({ status: 'completed', currentApprovalStage: 'manajer' });
    assert.equal(await inspectionFake.count(), countBefore + 1);
    assert.equal(inspection.lokasi, 'Utility');
    assert.equal(inspection.status, 'draft');
    assert.equal(inspection.currentApprovalStage, null);
    assert.equal(inspection.submittedAt, null);
    assert.deepEqual(inspection.approvalHistory, []);
    assert.deepEqual(inspection.perbaikan, [], 'tindakan awal dibuat saat pengajuan pertama, bukan saat draft dibuat');
    assert.equal(inspection.petugasUserId, owner.id);
});

test('update: pemilik mengubah draft — status tetap DRAFT, temuan diganti, status/tahap dari isian diabaikan', async () => {
    const draft = await createDraft();
    const result = await inspectionService.update(draft.id, {
        ...validContent,
        keteranganLokasi: 'Area baru',
        temuan: [{ id: draft.temuan[0].id, deskripsi: 'Temuan A diperbarui', kategori: 'Kesehatan' }, { deskripsi: 'Temuan C', kategori: 'Kebocoran' }],
        status: 'completed', currentApprovalStage: 'ketua_p2k3', petugasUserId: 999,
    }, owner);
    assert.equal(result.ok, true, JSON.stringify(result));

    const stored = await inspectionFake.findById(draft.id);
    assert.equal(stored.status, 'draft');
    assert.equal(stored.currentApprovalStage, null);
    assert.equal(stored.petugasUserId, owner.id);
    assert.equal(stored.keteranganLokasi, 'Area baru');
    assert.deepEqual(stored.temuan.map((finding) => finding.deskripsi), ['Temuan A diperbarui', 'Temuan C']);
    assert.equal(stored.temuan[0].id, draft.temuan[0].id, 'temuan dengan id miliknya diperbarui, bukan diganti');
    assert.deepEqual(stored.perbaikan, [], 'draft tidak mendapat tindakan awal');
});

test('update: SO lain -> NOT_FOUND (draft privat); non-SO -> NOT_FOUND; isi tidak valid -> tetap divalidasi', async () => {
    const draft = await createDraft();
    assert.equal((await inspectionService.update(draft.id, validContent, otherOfficer)).reason, IE.NOT_FOUND);
    assert.equal((await inspectionService.update(draft.id, validContent, admin)).reason, IE.NOT_FOUND);
    assert.equal((await inspectionService.update(draft.id, { ...validContent, temuan: [] }, owner)).reason, IE.FINDINGS_REQUIRED);
});

test('update: pemilik tidak bisa mengubah inspeksi IN_REVIEW -> NOT_EDITABLE; SO lain yang melihatnya -> FORBIDDEN', async () => {
    assert.equal((await inspectionService.update('INS-001', validContent, owner)).reason, IE.NOT_EDITABLE);
    assert.equal((await inspectionService.update('INS-001', validContent, otherOfficer)).reason, IE.FORBIDDEN);
});

test('submit: pemilik mengajukan draft -> IN_REVIEW di Koordinator, submittedAt terisi, tanpa entri pengesahan, tindakan awal per temuan', async () => {
    const draft = await createDraft();
    const result = await inspectionService.submit(draft.id, owner);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.data.resubmitted, false);

    const stored = await inspectionFake.findById(draft.id);
    assert.equal(stored.status, 'in_review');
    assert.equal(stored.currentApprovalStage, 'koordinator_k3l');
    assert.ok(stored.submittedAt);
    assert.deepEqual(stored.approvalHistory, [], 'pengajuan bukan keputusan pengesahan');
    assert.deepEqual(stored.perbaikan.map((action) => [action.action, action.status]),
        [['Temuan 1: Temuan A', 'open'], ['Temuan 2: Temuan B', 'open']]);
});

test('submit: SO lain -> NOT_FOUND; non-draft -> NOT_SUBMITTABLE; dua pengajuan bersamaan -> tepat satu', async () => {
    const draft = await createDraft();
    assert.equal((await inspectionService.submit(draft.id, otherOfficer)).reason, IE.NOT_FOUND);
    assert.equal((await inspectionService.submit(draft.id, admin)).reason, IE.NOT_FOUND);
    assert.equal((await inspectionService.submit('INS-001', owner)).reason, IE.NOT_SUBMITTABLE, 'sudah IN_REVIEW');

    const [first, second] = await Promise.all([inspectionService.submit(draft.id, owner), inspectionService.submit(draft.id, owner)]);
    assert.equal([first, second].filter((result) => result.ok).length, 1);
    assert.equal((await inspectionFake.findById(draft.id)).perbaikan.length, 2, 'tindakan awal tidak terduplikasi');
});

test('revisi & ajukan ulang: kembali ke tahap YANG MENOLAK, riwayat utuh, temuan baru mendapat tindakan awal', async () => {
    const draft = await createDraft({ plantId: '9' });
    await inspectionService.submit(draft.id, owner);
    await approvalService.approve(draft.id, 'koordinator_k3l', dewiPlant9, SIGNATURE);
    await approvalService.reject(draft.id, 'manajer', andi, 'Tambah temuan');

    // Hanya pemilik yang boleh merevisi; SO lain tidak melihat revisi sama sekali.
    assert.equal((await inspectionService.update(draft.id, validContent, otherOfficer)).reason, IE.NOT_FOUND);
    const revising = await inspectionFake.findById(draft.id);
    const revised = await inspectionService.update(draft.id, {
        ...validContent, plantId: '9',
        temuan: [...revising.temuan, { deskripsi: 'Temuan tambahan', kategori: 'Kesehatan' }],
    }, owner);
    assert.equal(revised.ok, true, JSON.stringify(revised));
    assert.equal((await inspectionFake.findById(draft.id)).status, 'revision_required', 'menyimpan revisi bukan mengajukan ulang');

    const resubmitted = await inspectionService.submit(draft.id, owner);
    assert.equal(resubmitted.ok, true);
    assert.equal(resubmitted.data.resubmitted, true);

    const stored = await inspectionFake.findById(draft.id);
    assert.equal(stored.status, 'in_review');
    assert.equal(stored.currentApprovalStage, 'manajer', 'bukan kembali ke Koordinator');
    assert.deepEqual(stored.approvalHistory.map((entry) => [entry.stage, entry.attempt, entry.decision]),
        [['koordinator_k3l', 1, 'approved'], ['manajer', 1, 'rejected']], 'tidak ada keputusan baru sampai peninjau memutuskan');
    assert.equal(stored.perbaikan.at(-1).action, 'Temuan 3: Temuan tambahan');

    // Keputusan berikutnya menjadi attempt 2 di tahap yang sama.
    await approvalService.approve(draft.id, 'manajer', andi, SIGNATURE);
    const afterApprove = await inspectionFake.findById(draft.id);
    assert.deepEqual(afterApprove.approvalHistory.at(-1).attempt, 2);
    assert.equal(afterApprove.currentApprovalStage, 'ketua_p2k3');
});

test('addAction: pemilik boleh di DRAFT, IN_REVIEW, REVISION_REQUIRED; COMPLETED final -> INSPECTION_COMPLETED, tidak tersimpan', async () => {
    const input = { action: 'Perbaiki', status: 'open', pic: 'Arif', photos: ['f.jpg'] };
    const draft = await createDraft();
    assert.equal((await correctiveActionService.addAction(draft.id, input, owner)).ok, true, 'DRAFT');
    assert.equal((await correctiveActionService.addAction('INS-001', input, owner)).ok, true, 'IN_REVIEW');

    const stored = await inspectionFake.findById('INS-001');
    stored.status = 'revision_required';
    assert.equal((await correctiveActionService.addAction('INS-001', input, owner)).ok, true, 'REVISION_REQUIRED');

    stored.status = 'completed';
    stored.currentApprovalStage = null;
    const before = stored.perbaikan.length;
    const result = await correctiveActionService.addAction('INS-001', input, owner);
    assert.equal(result.reason, CA.INSPECTION_COMPLETED);
    assert.equal(stored.perbaikan.length, before, 'tidak ada tindakan tersimpan');
    assert.equal((await correctiveActionService.addAction('INS-001', input, otherOfficer)).reason, CA.FORBIDDEN, 'SO lain tetap FORBIDDEN');
});

test('removeDraft: hanya pemilik, hanya DRAFT', async () => {
    const draft = await createDraft();
    assert.equal((await inspectionService.removeDraft(draft.id, otherOfficer)).reason, IE.NOT_FOUND);
    assert.equal((await inspectionService.removeDraft('INS-001', owner)).reason, IE.NOT_DELETABLE, 'sudah diajukan');
    assert.equal((await inspectionService.removeDraft(draft.id, owner)).ok, true);
    assert.equal(await inspectionFake.findById(draft.id), undefined);
});

// =========================================================================
// schedule-service
// =========================================================================

const SE = scheduleService.SCHEDULE_ERROR;

test('save: plant/officer/tahun/tanggal wajib', async () => {
    assert.equal((await scheduleService.save({})).reason, SE.PLANT_REQUIRED);
    assert.equal((await scheduleService.save({ plantId: '3' })).reason, SE.OFFICER_REQUIRED);
    assert.equal((await scheduleService.save({ plantId: '3', officer: '   ' })).reason, SE.OFFICER_REQUIRED);
    assert.equal((await scheduleService.save({ plantId: '3', officer: 'A' })).reason, SE.YEAR_REQUIRED);
    assert.equal((await scheduleService.save({ plantId: '3', officer: 'A', tahun: 1999 })).reason, SE.YEAR_REQUIRED);
    assert.equal((await scheduleService.save({ plantId: '3', officer: 'A', tahun: 2026 })).reason, SE.DATE_REQUIRED);
});

test('save: berhasil membuat jadwal baru — plantName terisi, officer di-trim, status aktif', async () => {
    const result = await scheduleService.save({
        plantId: '9', officer: '  Penguji  ', tahun: 2026, tanggalJadwal: '2026-10-05', periode: 2, minggu: 3,
    });
    assert.equal(result.data.created, true);
    assert.equal(result.data.schedule.officer, 'Penguji');
    assert.equal(result.data.schedule.plantName, 'Logistic');
    assert.equal(result.data.schedule.status, 'aktif');
});

test('save: id terisi -> update, bukan create', async () => {
    const created = await scheduleService.save({
        plantId: '9', officer: 'Awal', tahun: 2026, tanggalJadwal: '2026-10-05', periode: 2, minggu: 3,
    });
    const updated = await scheduleService.save({
        id: created.data.schedule.id, plantId: '9', officer: 'Diubah', tahun: 2026,
        tanggalJadwal: '2026-10-06', periode: 2, minggu: 3, tanggalRealisasi: '2026-10-07',
    });
    assert.equal(updated.data.created, false);
    assert.equal(updated.data.schedule.officer, 'Diubah');
    assert.equal(updated.data.schedule.tanggalRealisasi, '2026-10-07');
    assert.equal(await scheduleFake.count(), 1, 'jumlah tidak bertambah — ini update, bukan create baru');
});

test('save: id tak dikenal -> ok dengan schedule null (perilaku lama dipertahankan)', async () => {
    const result = await scheduleService.save({ id: 'TIDAK-ADA', plantId: '9', officer: 'X', tahun: 2026, tanggalJadwal: '2026-10-06' });
    assert.equal(result.ok, true);
    assert.equal(result.data.schedule, null);
});

test('remove: berhasil menghapus / id tak dikenal mengembalikan removed:false', async () => {
    const created = await scheduleService.save({
        plantId: '9', officer: 'X', tahun: 2026, tanggalJadwal: '2026-10-05', periode: 2, minggu: 3,
    });
    assert.equal((await scheduleService.remove(created.data.schedule.id)).data.removed, true);
    assert.equal((await scheduleService.remove('TIDAK-ADA')).data.removed, false);
    assert.equal(await scheduleFake.count(), 0);
});

test('schedule-rules: hanya Safety Officer & Admin boleh membuat/mengubah jadwal (sama dengan penjaga route)', () => {
    assert.deepEqual(SCHEDULE_EDITOR_ROLES, ['safety_officer', 'admin']);
    assert.ok(canManageSchedules({ id: 1, role: 'safety_officer' }));
    assert.ok(canManageSchedules({ id: 9, role: 'admin' }));
    for (const role of ['koordinator_k3l', 'manajer_bagian', 'ketua_p2k3', 'tidak_dikenal']) {
        assert.equal(canManageSchedules({ id: 5, role }), false, role);
    }
    assert.equal(canManageSchedules(null), false, 'tanpa login');
});

// =========================================================================
// search-service
// =========================================================================

test('filterByFields: query kosong/spasi mengembalikan semua, pencarian tidak peka huruf besar, lintas field', () => {
    const rows = [
        { id: 'INS-001', lokasi: 'Fermentation', petugas: 'Arif' },
        { id: 'INS-002', lokasi: 'Logistic', petugas: 'Melka' },
        { id: 'INS-003', lokasi: 'PMR 2' },
    ];
    assert.equal(filterByFields(rows, '', ['lokasi']).length, 3);
    assert.equal(filterByFields(rows, '   ', ['lokasi']).length, 3);
    assert.equal(filterByFields(rows, 'ferm', ['lokasi']).length, 1);
    assert.equal(filterByFields(rows, 'LOGIS', ['lokasi']).length, 1);
    assert.equal(filterByFields(rows, 'melka', ['lokasi', 'petugas']).length, 1);
    assert.equal(filterByFields(rows, 'arif', ['petugas']).length, 1, 'field tidak ada di baris lain tidak melempar error');
    assert.equal(filterByFields(rows, 'zzz', ['lokasi', 'petugas']).length, 0);
});

// =========================================================================
// excel-exporter — mitigasi formula injection (S-04)
// =========================================================================

test('sanitizeCell: menetralkan awalan pemicu formula (= + - @), tidak menyentuh angka/teks biasa', () => {
    assert.equal(excel.sanitizeCell('=1+1'), "'=1+1");
    assert.equal(excel.sanitizeCell('+SUM(A1)'), "'+SUM(A1)");
    assert.equal(excel.sanitizeCell('-2+3'), "'-2+3");
    assert.equal(excel.sanitizeCell('@SUM(A1)'), "'@SUM(A1)");
    assert.equal(excel.sanitizeCell('=HYPERLINK("http://x","klik")'), "'=HYPERLINK(\"http://x\",\"klik\")");
    assert.equal(excel.sanitizeCell('Kabel terbuka'), 'Kabel terbuka');
    assert.equal(excel.sanitizeCell(12), 12);
    assert.equal(excel.sanitizeCell(''), '');
    assert.equal(excel.sanitizeCell('a=b'), 'a=b', '"=" di tengah string tidak dianggap awalan formula');
});

test('S-04 jalur sungguhan: inspeksi dengan payload formula-injection diekspor dalam bentuk dinetralkan', async () => {
    const created = await inspectionService.create({
        plantId: '3', tanggal: '2026-09-19', petugas: '=CMD()', status: 'proses', dueDate: '2026-10-01',
        // Kategori kini ENUM tervalidasi (domain checkFindingCategory) — payload formula tidak
        // bisa lagi masuk lewat kategori; teks bebas lain tetap diuji di bawah.
        keteranganLokasi: '@evil', temuan: [{ deskripsi: '=1+1', kategori: 'Kelistrikan' }],
    });
    const evil = created.data.inspection;

    capturedSheets.length = 0;
    const findingsResult = excel.exportFindingsOf(evil);
    const findingRow = capturedSheets[0][0];
    assert.equal(findingsResult.count, 1);
    assert.equal(findingRow['Deskripsi Temuan'], "'=1+1");
    assert.equal(findingRow['Kategori'], 'Kelistrikan');
    assert.equal(findingRow['Safety Officer'], "'=CMD()");
    assert.equal(findingRow['Keterangan Lokasi'], "'@evil");
    assert.ok(findingsResult.filename.includes(evil.id));

    capturedSheets.length = 0;
    excel.exportInspections([evil], 'uji.xlsx');
    assert.equal(capturedSheets[0][0]['Daftar Temuan'], "'=1+1 (Kelistrikan)");
});

// =========================================================================
// Phase 17.4A — tanda tangan pada keputusan pengesahan
// =========================================================================

test('approve tanpa tanda tangan / tanda tangan tidak sah -> ditolak, tidak ada yang tersimpan', async () => {
    const cases = [
        [undefined, AE.SIGNATURE_REQUIRED],
        [null, AE.SIGNATURE_REQUIRED],
        [{ method: 'canvas' }, AE.SIGNATURE_REQUIRED],
        [{ ...SIGNATURE, method: 'draw' }, AE.SIGNATURE_METHOD_INVALID],
        [{ ...SIGNATURE, mimeType: null }, AE.SIGNATURE_CONTENT_INVALID],
        [{ ...SIGNATURE, mimeType: 'image/gif' }, AE.SIGNATURE_CONTENT_INVALID],
        [{ ...SIGNATURE, method: 'canvas', mimeType: 'image/jpeg' }, AE.SIGNATURE_CONTENT_INVALID],
        [{ ...SIGNATURE, size: 1024 * 1024 + 1 }, AE.SIGNATURE_TOO_LARGE],
    ];
    for (const [signature, expected] of cases) {
        const result = await approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9, signature);
        assert.equal(result.reason, expected, JSON.stringify(signature));
    }
    const stored = await inspectionFake.findById('INS-002');
    assert.equal(stored.currentApprovalStage, 'koordinator_k3l');
    assert.equal(stored.approvalHistory.length, 0);
    assert.equal(inspectionFake.__storedSignatures().length, 0);
});

test('approve: tidak terlihat / tidak berwenang diputuskan SEBELUM tanda tangan diperiksa', async () => {
    assert.equal((await approvalService.approve('INS-002', 'koordinator_k3l', koordinatorPlant3)).reason, AE.NOT_FOUND);
    assert.equal((await approvalService.approve('INS-002', 'koordinator_k3l', owner)).reason, AE.FORBIDDEN);
});

test('approve dengan tanda tangan sah (UPLOAD & CANVAS) -> satu tanda tangan per persetujuan, metode tercatat di riwayat', async () => {
    const first = await approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9, SIGNATURE);
    assert.equal(first.ok, true);
    const second = await approvalService.approve('INS-002', 'manajer', andi, { ...SIGNATURE, method: 'canvas' });
    assert.equal(second.ok, true);

    const stored = await inspectionFake.findById('INS-002');
    assert.deepEqual(stored.approvalHistory.map((entry) => [entry.stage, entry.signatureMethod, entry.hasSignature]),
        [['koordinator_k3l', 'upload', true], ['manajer', 'canvas', true]]);
    assert.deepEqual(inspectionFake.__storedSignatures().map((entry) => [entry.stage, entry.method, entry.mimeType]),
        [['koordinator_k3l', 'upload', 'image/png'], ['manajer', 'canvas', 'image/png']]);
    assert.equal(second.data.inspection.approvalHistory.at(-1).file, undefined, 'isi berkas tidak ikut di entri riwayat');
});

test('reject tanpa tanda tangan diterima; reject DENGAN data tanda tangan -> SIGNATURE_NOT_ALLOWED, tidak tersimpan', async () => {
    const withSignature = await approvalService.reject('INS-002', 'koordinator_k3l', dewiPlant9, 'Foto kurang jelas', SIGNATURE);
    assert.equal(withSignature.reason, AE.SIGNATURE_NOT_ALLOWED);
    assert.equal((await inspectionFake.findById('INS-002')).approvalHistory.length, 0);

    const result = await approvalService.reject('INS-002', 'koordinator_k3l', dewiPlant9, 'Foto kurang jelas');
    assert.equal(result.ok, true);
    const [entry] = (await inspectionFake.findById('INS-002')).approvalHistory;
    assert.equal(entry.signatureMethod, null);
    assert.equal(entry.hasSignature, false);
    assert.equal(inspectionFake.__storedSignatures().length, 0);
});

test('persetujuan ulang setelah penolakan: attempt 2 mendapat tanda tangannya sendiri, attempt 1 (ditolak) tidak berubah', async () => {
    await approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9, SIGNATURE);
    await approvalService.reject('INS-002', 'manajer', andi, 'Lengkapi foto');
    const rejectedAttempt = { ...(await inspectionFake.findById('INS-002')).approvalHistory[1] };
    await inspectionFake.submit('INS-002', 'revision_required', { status: 'in_review', currentApprovalStage: 'manajer' }, []);

    assert.equal((await approvalService.approve('INS-002', 'manajer', andi, { ...SIGNATURE, method: 'canvas' })).ok, true);
    const history = (await inspectionFake.findById('INS-002')).approvalHistory;
    assert.deepEqual(history.map((entry) => [entry.stage, entry.attempt, entry.decision, entry.signatureMethod]), [
        ['koordinator_k3l', 1, 'approved', 'upload'], ['manajer', 1, 'rejected', null], ['manajer', 2, 'approved', 'canvas'],
    ]);
    assert.deepEqual(history[1], rejectedAttempt, 'attempt 1 tidak ditimpa');
    assert.deepEqual(inspectionFake.__storedSignatures().map((entry) => [entry.stage, entry.attempt]),
        [['koordinator_k3l', 1], ['manajer', 2]], 'tidak ada tanda tangan untuk attempt yang ditolak');
});

test('dua persetujuan bersamaan bertanda tangan -> tepat satu keputusan, tepat satu tanda tangan tersimpan', async () => {
    const results = await Promise.all([
        approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9, SIGNATURE),
        approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9, SIGNATURE),
    ]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal((await inspectionFake.findById('INS-002')).approvalHistory.length, 1);
    assert.equal(inspectionFake.__storedSignatures().length, 1);
});

// Phase 17.4D: watermark opsional pada persetujuan, independen dari tanda tangan.
test('approve tanpa watermark -> riwayat watermark null; dengan watermark -> posisi ternormalisasi tercatat', async () => {
    const first = await approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9, SIGNATURE);
    assert.equal(first.ok, true);
    const second = await approvalService.approve('INS-002', 'manajer', andi, SIGNATURE, { enabled: 'true', x: '0.25', y: '0.8' });
    assert.equal(second.ok, true);
    const third = await approvalService.approve('INS-002', 'ketua_p2k3', hadi, SIGNATURE, { enabled: false });
    assert.equal(third.ok, true);

    const history = (await inspectionFake.findById('INS-002')).approvalHistory;
    assert.deepEqual(history.map((entry) => [entry.stage, entry.watermark]), [
        ['koordinator_k3l', null], ['manajer', { x: 0.25, y: 0.8 }], ['ketua_p2k3', null],
    ]);
});

test('approve dengan watermark tidak sah -> ditolak, tidak ada keputusan/tanda tangan tersimpan', async () => {
    for (const [watermark, expected] of [
        [{ enabled: 'true' }, AE.WATERMARK_POSITION_REQUIRED],
        [{ enabled: 'true', x: '1.5', y: '0.5' }, AE.WATERMARK_POSITION_INVALID],
        [{ enabled: 'true', x: '0.5', y: 'abc' }, AE.WATERMARK_POSITION_INVALID],
        [{ enabled: 'ya', x: '0.5', y: '0.5' }, AE.WATERMARK_INVALID],
        [{ enabled: 'false', x: '0.5', y: '0.5' }, AE.WATERMARK_INVALID],
    ]) {
        const result = await approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9, SIGNATURE, watermark);
        assert.equal(result.reason, expected, JSON.stringify(watermark));
    }
    const stored = await inspectionFake.findById('INS-002');
    assert.equal(stored.currentApprovalStage, 'koordinator_k3l');
    assert.equal(stored.approvalHistory.length, 0);
    assert.equal(inspectionFake.__storedSignatures().length, 0);
});

test('watermark tidak menggantikan tanda tangan; wewenang & visibilitas diputuskan sebelum watermark diperiksa', async () => {
    const watermark = { enabled: true, x: 0.5, y: 0.5 };
    assert.equal((await approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9, null, watermark)).reason, AE.SIGNATURE_REQUIRED);
    const invalid = { enabled: true, x: 9, y: 9 };
    assert.equal((await approvalService.approve('INS-002', 'koordinator_k3l', koordinatorPlant3, SIGNATURE, invalid)).reason, AE.NOT_FOUND);
    assert.equal((await approvalService.approve('INS-002', 'koordinator_k3l', owner, SIGNATURE, invalid)).reason, AE.FORBIDDEN);
    assert.equal((await approvalService.approve('INS-002', 'manajer', andi, SIGNATURE, invalid)).reason, AE.NOT_FOUND);
});

test('penolakan tidak pernah membawa watermark', async () => {
    assert.equal((await approvalService.reject('INS-002', 'koordinator_k3l', dewiPlant9, 'Foto kurang jelas')).ok, true);
    const [entry] = (await inspectionFake.findById('INS-002')).approvalHistory;
    assert.equal(entry.watermark, null);
});

// Phase 18: Admin menghapus inspeksi non-draft (inspection-policy canDelete).
test('removeAsAdmin: Admin menghapus inspeksi non-draft; draft tidak terlihat -> NOT_FOUND; role lain -> FORBIDDEN/NOT_FOUND', async () => {
    const draft = await createDraft();
    assert.equal((await inspectionService.removeAsAdmin(draft.id, admin)).reason, IE.NOT_FOUND, 'draft tidak terlihat oleh Admin');
    assert.equal((await inspectionService.removeAsAdmin('TIDAK-ADA', admin)).reason, IE.NOT_FOUND);
    assert.equal((await inspectionService.removeAsAdmin('INS-002', owner)).reason, IE.FORBIDDEN, 'pemilik (Safety Officer) bukan Admin');
    assert.equal((await inspectionService.removeAsAdmin('INS-002', dewiPlant9)).reason, IE.FORBIDDEN, 'Koordinator yang bisa melihat');

    assert.deepEqual(await inspectionService.removeAsAdmin('INS-002', admin), { ok: true, data: { removed: true } });
    assert.equal(await inspectionFake.findById('INS-002'), undefined);
    assert.ok(await inspectionFake.findById('INS-001'), 'inspeksi lain tidak tersentuh');
    assert.ok(await inspectionFake.findById(draft.id));
});
