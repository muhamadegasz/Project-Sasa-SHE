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

// Stub minimal untuk excel-exporter.js (lapisan infrastruktur, bukan repository) —
// hanya dipakai bagian S-04 di bawah. Bukan mock jaringan/DOM apa pun yang lain.
const capturedSheets = [];
globalThis.XLSX = {
    utils: {
        book_new: () => ({ sheets: [] }),
        json_to_sheet: (rows) => { capturedSheets.push(rows); return { rows }; },
        book_append_sheet: (workbook, sheet, name) => { workbook.sheets.push({ name, sheet }); },
    },
    write: () => new Uint8Array([1, 2, 3]),
    writeFile: () => {},
};
globalThis.Blob = class {};
globalThis.URL = { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} };
globalThis.document = {
    createElement: () => ({ click: () => {}, href: '', download: '' }),
    body: { appendChild: () => {}, removeChild: () => {} },
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
const AE = approvalService.APPROVAL_ERROR;
const dewiPlant9 = { id: 5, displayName: 'Dewi', role: 'koordinator_k3l', plantId: 9 };
const koordinatorPlant3 = { id: 11, displayName: 'Bambang', role: 'koordinator_k3l', plantId: 3 };
const andi = { id: 6, displayName: 'Andi', role: 'manajer_bagian' };
const hadi = { id: 7, displayName: 'Hadi', role: 'ketua_p2k3' };

test('approve: inspeksi tidak ada -> INSPECTION_NOT_FOUND', async () => {
    const result = await approvalService.approve('TIDAK-ADA', 'koordinator_k3l', dewiPlant9);
    assert.equal(result.ok, false);
    assert.equal(result.reason, AE.INSPECTION_NOT_FOUND);
});

test('approve: kode tahap tidak dikenal (termasuk tahap lama bernomor) -> STAGE_NOT_FOUND', async () => {
    assert.equal((await approvalService.approve('INS-002', 'safety_officer', dewiPlant9)).reason, AE.STAGE_NOT_FOUND);
    assert.equal((await approvalService.approve('INS-002', 2, dewiPlant9)).reason, AE.STAGE_NOT_FOUND);
});

test('approve: tahap yang bukan tahap berjalan -> STAGE_NOT_CURRENT (tidak bisa melompat)', async () => {
    const result = await approvalService.approve('INS-002', 'ketua_p2k3', hadi);
    assert.equal(result.reason, AE.STAGE_NOT_CURRENT);
});

test('approve: inspeksi yang tidak IN_REVIEW -> NOT_IN_REVIEW', async () => {
    const stored = await inspectionFake.findById('INS-002');
    stored.status = 'revision_required';
    assert.equal((await approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9)).reason, AE.NOT_IN_REVIEW);
});

test('approve: role bukan pemilik tahap -> FORBIDDEN (Manajer di tahap Koordinator)', async () => {
    assert.equal((await approvalService.approve('INS-002', 'koordinator_k3l', andi)).reason, AE.FORBIDDEN);
});

test('approve: Koordinator plant lain -> FORBIDDEN, riwayat tidak berubah', async () => {
    const result = await approvalService.approve('INS-002', 'koordinator_k3l', koordinatorPlant3);
    assert.equal(result.reason, AE.FORBIDDEN);
    assert.equal((await inspectionFake.findById('INS-002')).approvalHistory.length, 0);
});

test('approve: Koordinator plant-nya sendiri berhasil — riwayat bertambah, tahap maju ke Manajer, identitas tersimpan (S-07)', async () => {
    const result = await approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9);
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
    await approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9);
    await approvalService.approve('INS-002', 'manajer', andi);
    const result = await approvalService.approve('INS-002', 'ketua_p2k3', hadi);
    assert.equal(result.data.fullyApproved, true);

    const stored = await inspectionFake.findById('INS-002');
    assert.equal(stored.status, 'completed');
    assert.equal(stored.currentApprovalStage, null);
    assert.equal(stored.approvalHistory.length, 3);
});

test('approve: approve ulang tahap yang sudah lewat -> STAGE_NOT_CURRENT, bukan menimpa keputusan', async () => {
    await approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9);
    const again = await approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9);
    assert.equal(again.reason, AE.STAGE_NOT_CURRENT);
    assert.equal((await inspectionFake.findById('INS-002')).approvalHistory.length, 1);
});

test('approve: dua persetujuan bersamaan untuk tahap yang sama -> tepat satu tersimpan', async () => {
    const [first, second] = await Promise.all([
        approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9),
        approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9),
    ]);
    assert.equal([first, second].filter((result) => result.ok).length, 1);
    assert.equal([first, second].find((result) => !result.ok).reason, AE.STAGE_NOT_CURRENT);
    assert.equal((await inspectionFake.findById('INS-002')).approvalHistory.length, 1);
});

test('reject: alasan wajib (kosong/spasi) -> REJECTION_REASON_REQUIRED, tidak ada yang tersimpan', async () => {
    assert.equal((await approvalService.reject('INS-002', 'koordinator_k3l', dewiPlant9, '   ')).reason, AE.REJECTION_REASON_REQUIRED);
    assert.equal((await approvalService.reject('INS-002', 'koordinator_k3l', dewiPlant9)).reason, AE.REJECTION_REASON_REQUIRED);
    const stored = await inspectionFake.findById('INS-002');
    assert.equal(stored.status, 'in_review');
    assert.equal(stored.approvalHistory.length, 0);
});

test('reject: -> REVISION_REQUIRED, tahap TETAP, alasan tersimpan, persetujuan sebelumnya tidak disentuh', async () => {
    await approvalService.approve('INS-002', 'koordinator_k3l', dewiPlant9);
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

test('reject: wewenang sama dengan approve — Safety Officer dan Admin -> FORBIDDEN', async () => {
    assert.equal((await approvalService.reject('INS-002', 'koordinator_k3l', { id: 1, role: 'safety_officer' }, 'x')).reason, AE.FORBIDDEN);
    assert.equal((await approvalService.reject('INS-002', 'koordinator_k3l', { id: 9, role: 'admin' }, 'x')).reason, AE.FORBIDDEN);
});

test('reject: inspeksi tidak ada -> INSPECTION_NOT_FOUND', async () => {
    const result = await approvalService.reject('TIDAK-ADA', 'koordinator_k3l', dewiPlant9, 'x');
    assert.equal(result.reason, AE.INSPECTION_NOT_FOUND);
});

// =========================================================================
// corrective-action-service
// =========================================================================

const CA = correctiveActionService.CORRECTIVE_ACTION_ERROR;

test('addAction: inspeksi tidak ada -> INSPECTION_NOT_FOUND', async () => {
    const result = await correctiveActionService.addAction('TIDAK-ADA', { action: 'a', photos: ['f.jpg'] });
    assert.equal(result.reason, CA.INSPECTION_NOT_FOUND);
});

test('addAction: tindakan kosong/spasi saja -> ACTION_REQUIRED', async () => {
    assert.equal((await correctiveActionService.addAction('INS-001', { action: '   ', photos: ['f.jpg'] })).reason, CA.ACTION_REQUIRED);
    assert.equal((await correctiveActionService.addAction('INS-001', { photos: ['f.jpg'] })).reason, CA.ACTION_REQUIRED);
});

test('addAction: foto wajib -> PHOTO_REQUIRED', async () => {
    assert.equal((await correctiveActionService.addAction('INS-001', { action: 'Perbaiki' })).reason, CA.PHOTO_REQUIRED);
    assert.equal((await correctiveActionService.addAction('INS-001', { action: 'Perbaiki', photos: [] })).reason, CA.PHOTO_REQUIRED);
});

test('addAction: berhasil — deskripsi di-trim, jumlah bertambah, status alur kerja inspeksi TIDAK berubah (Phase 17.2)', async () => {
    const before = (await inspectionFake.findById('INS-001')).perbaikan.length;
    const result = await correctiveActionService.addAction('INS-001', {
        action: '  Ganti kabel  ', status: 'on-progress', pic: 'Tulus', photos: ['a.jpg', 'b.jpg'],
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.action.action, 'Ganti kabel');
    assert.equal(result.data.action.foto.length, 2);

    const stored = await inspectionFake.findById('INS-001');
    assert.equal(stored.perbaikan.length, before + 1);
    assert.equal(stored.status, 'in_review', 'tindakan perbaikan tidak menentukan status alur kerja');
    assert.equal(stored.currentApprovalStage, 'koordinator_k3l');

    await correctiveActionService.addAction('INS-001', { action: 'Tutup semua', status: 'closed', pic: 'Tulus', photos: ['c.jpg'] });
    assert.equal((await inspectionFake.findById('INS-001')).status, 'in_review', 'bahkan saat tindakan closed');
});

// =========================================================================
// inspection-service
// =========================================================================

const IE = inspectionService.INSPECTION_ERROR;

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

test('create: berhasil — lokasi dari plant, langsung diajukan ke Koordinator (interim 17.2), satu tindakan per temuan', async () => {
    const countBefore = await inspectionFake.count();
    const result = await inspectionService.create({
        // status dari form DIABAIKAN — hanya transisi alur kerja yang boleh menentukannya.
        plantId: '16', tanggal: '2026-09-19', petugas: 'Penguji', status: 'completed', dueDate: '2026-10-01',
        temuan: [{ deskripsi: 'Temuan A', kategori: 'Kelistrikan' }, { deskripsi: 'Temuan B', kategori: 'Kebakaran' }],
    });
    assert.equal(result.ok, true);
    assert.equal(await inspectionFake.count(), countBefore + 1);
    assert.equal(result.data.inspection.lokasi, 'Utility');
    assert.equal(result.data.inspection.status, 'in_review');
    assert.equal(result.data.inspection.currentApprovalStage, 'koordinator_k3l');
    assert.deepEqual(result.data.inspection.approvalHistory, [], 'Safety Officer bukan tahap pengesahan — tidak ada persetujuan otomatis');
    assert.equal(result.data.inspection.perbaikan.length, 2);
    assert.equal(result.data.inspection.perbaikan[0].status, 'open');
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
        keteranganLokasi: '@evil', temuan: [{ deskripsi: '=1+1', kategori: '+X' }],
    });
    const evil = created.data.inspection;

    capturedSheets.length = 0;
    const findingsResult = excel.exportFindingsOf(evil);
    const findingRow = capturedSheets[0][0];
    assert.equal(findingsResult.count, 1);
    assert.equal(findingRow['Deskripsi Temuan'], "'=1+1");
    assert.equal(findingRow['Kategori'], "'+X");
    assert.equal(findingRow['Safety Officer'], "'=CMD()");
    assert.equal(findingRow['Keterangan Lokasi'], "'@evil");
    assert.ok(findingsResult.filename.includes(evil.id));

    capturedSheets.length = 0;
    excel.exportInspections([evil], 'uji.xlsx');
    assert.equal(capturedSheets[0][0]['Daftar Temuan'], "'=1+1 (+X)");
});
