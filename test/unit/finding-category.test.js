/* finding-category.test.js — kategori temuan & penjelasan "Lainnya".
 *
 * Aturan domain (checkFindingCategory) dan penerapannya di inspection-service
 * (buat/ubah/revisi/ajukan ulang) lewat repository palsu — sama seperti
 * services.test.js. Kategori tetap salah satu ENUM findings.kategori;
 * penjelasan "Lainnya" disimpan TERPISAH di kategoriLainnya (migrasi 006).
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as plantFake from '../fakes/plant-repository.js';
import * as inspectionFake from '../fakes/inspection-repository.js';
import * as approvalService from '../../src/services/approval-service.js';
import * as inspectionService from '../../src/services/inspection-service.js';
import { FINDING_CATEGORIES, FINDING_CATEGORY_OTHER } from '../../src/config/constants.js';
import { FINDING_OTHER_CATEGORY_MAX_LENGTH, checkFindingCategory } from '../../src/domain/inspection-rules.js';

const IE = inspectionService.INSPECTION_ERROR;
const owner = { id: 1, displayName: 'Arif', role: 'safety_officer' };
const dewiPlant9 = { id: 5, displayName: 'Dewi', role: 'koordinator_k3l', plantId: 9 };
const andi = { id: 6, displayName: 'Andi', role: 'manajer_bagian' };
const SIGNATURE = { method: 'upload', mimeType: 'image/png', size: 2048, file: 'png-bytes' };

beforeEach(() => {
    plantFake.__seed([{ id: 9, name: 'Logistic', code: 'LOG' }, { id: 16, name: 'Utility', code: 'UTL' }]);
    inspectionFake.__seed([]);
});

const content = (temuan, overrides = {}) => ({ plantId: '9', tanggal: '2026-09-29', dueDate: '2026-10-10', temuan, ...overrides });

async function createDraft(temuan) {
    const result = await inspectionService.create({ ...content(temuan), petugas: 'Arif', petugasUserId: owner.id });
    assert.equal(result.ok, true, JSON.stringify(result));
    return result.data.inspection;
}

// =========================================================================
// Domain — checkFindingCategory
// =========================================================================

test('daftar kategori sama persis dengan ENUM findings.kategori (migrasi 001)', () => {
    const sql = readFileSync(new URL('../../server/db/migrations/001_init.sql', import.meta.url), 'utf8');
    const enumValues = sql.match(/kategori\s+ENUM\(([^)]*)\)/)[1].split(',').map((value) => value.trim().replace(/^'|'$/g, ''));
    assert.deepEqual(FINDING_CATEGORIES, enumValues);
    assert.equal(FINDING_CATEGORY_OTHER, 'Lainnya');
});

test('kategori wajib dipilih dan harus salah satu kategori baku', () => {
    for (const kategori of [undefined, null, '']) assert.deepEqual(checkFindingCategory({ kategori }), { error: 'CATEGORY_REQUIRED' });
    for (const kategori of ['Ergonomi', 'lainnya', ' Kebakaran', 5, ['Kebakaran']]) {
        assert.deepEqual(checkFindingCategory({ kategori }), { error: 'CATEGORY_INVALID' }, JSON.stringify(kategori));
    }
});

test('kategori baku tidak membutuhkan penjelasan; isian custom yang ikut terkirim dibuang (null)', () => {
    for (const kategori of FINDING_CATEGORIES.filter((value) => value !== 'Lainnya')) {
        assert.deepEqual(checkFindingCategory({ kategori }), { value: { kategori, kategoriLainnya: null } });
        assert.deepEqual(checkFindingCategory({ kategori, kategoriLainnya: 'Ergonomi' }), { value: { kategori, kategoriLainnya: null } });
    }
});

test('"Lainnya": penjelasan wajib, di-trim, maks. 100 karakter; kosong/whitespace/bukan teks ditolak; kategori tetap "Lainnya"', () => {
    assert.deepEqual(checkFindingCategory({ kategori: 'Lainnya', kategoriLainnya: '  Ergonomi  ' }), { value: { kategori: 'Lainnya', kategoriLainnya: 'Ergonomi' } });
    for (const kategoriLainnya of [undefined, null, '', '   ', '\t\n ']) {
        assert.deepEqual(checkFindingCategory({ kategori: 'Lainnya', kategoriLainnya }), { error: 'OTHER_REQUIRED' }, JSON.stringify(kategoriLainnya));
    }
    assert.deepEqual(checkFindingCategory({ kategori: 'Lainnya', kategoriLainnya: 12 }), { error: 'OTHER_INVALID' });
    const max = 'x'.repeat(FINDING_OTHER_CATEGORY_MAX_LENGTH);
    assert.equal(checkFindingCategory({ kategori: 'Lainnya', kategoriLainnya: max }).value.kategoriLainnya, max);
    assert.deepEqual(checkFindingCategory({ kategori: 'Lainnya', kategoriLainnya: `${max}y` }), { error: 'OTHER_TOO_LONG' });
    assert.equal(checkFindingCategory({ kategori: 'Lainnya', kategoriLainnya: `  ${max}  ` }).value.kategoriLainnya, max, 'spasi di tepi tidak dihitung');
});

// =========================================================================
// inspection-service — buat, ubah, revisi, ajukan ulang
// =========================================================================

test('buat: "Lainnya" + penjelasan tersimpan terpisah (kategori tetap "Lainnya"); tanpa penjelasan / kategori kosong ditolak', async () => {
    const draft = await createDraft([
        { deskripsi: 'Kursi kerja tidak ergonomis', kategori: 'Lainnya', kategoriLainnya: ' Ergonomi ' },
        { deskripsi: 'Kabel terbuka', kategori: 'Kelistrikan', kategoriLainnya: 'harus dibuang' },
    ]);
    const stored = await inspectionFake.findById(draft.id);
    assert.deepEqual(stored.temuan.map(({ kategori, kategoriLainnya }) => [kategori, kategoriLainnya]), [['Lainnya', 'Ergonomi'], ['Kelistrikan', null]]);

    const cases = [
        [{ deskripsi: 'x', kategori: 'Lainnya' }, IE.FINDING_OTHER_CATEGORY_REQUIRED],
        [{ deskripsi: 'x', kategori: 'Lainnya', kategoriLainnya: '   ' }, IE.FINDING_OTHER_CATEGORY_REQUIRED],
        [{ deskripsi: 'x', kategori: 'Lainnya', kategoriLainnya: 'y'.repeat(101) }, IE.FINDING_OTHER_CATEGORY_TOO_LONG],
        [{ deskripsi: 'x', kategori: '' }, IE.FINDING_CATEGORY_REQUIRED],
        [{ deskripsi: 'x', kategori: 'Ergonomi' }, IE.FINDING_CATEGORY_INVALID],
    ];
    const before = await inspectionFake.count();
    for (const [finding, reason] of cases) {
        const result = await inspectionService.create({ ...content([finding]), petugas: 'Arif', petugasUserId: owner.id });
        assert.equal(result.reason, reason, JSON.stringify(finding));
    }
    assert.equal(await inspectionFake.count(), before, 'tidak ada yang tersimpan');
});

test('urutan validasi lama tetap: plant/temuan/tanggal diperiksa lebih dulu daripada kategori', async () => {
    const noExplanation = [{ deskripsi: 'x', kategori: 'Lainnya' }];
    assert.equal((await inspectionService.create({ temuan: noExplanation })).reason, IE.PLANT_REQUIRED);
    assert.equal((await inspectionService.create({ plantId: '9', temuan: noExplanation })).reason, IE.DATE_REQUIRED);
    assert.equal((await inspectionService.create({ plantId: '99999', tanggal: '2026-09-29', temuan: noExplanation })).reason, IE.PLANT_NOT_FOUND);
});

test('ubah: "Lainnya" -> kategori baku mengosongkan penjelasan; kategori baku -> "Lainnya" tanpa penjelasan ditolak', async () => {
    const draft = await createDraft([{ deskripsi: 'Kursi', kategori: 'Lainnya', kategoriLainnya: 'Ergonomi' }]);
    const [finding] = (await inspectionFake.findById(draft.id)).temuan;

    const switched = await inspectionService.update(draft.id, content([{ ...finding, kategori: 'Kesehatan' }]), owner);
    assert.equal(switched.ok, true, JSON.stringify(switched));
    assert.deepEqual((await inspectionFake.findById(draft.id)).temuan.map(({ kategori, kategoriLainnya }) => [kategori, kategoriLainnya]), [['Kesehatan', null]]);

    const back = await inspectionService.update(draft.id, content([{ id: finding.id, deskripsi: 'Kursi', kategori: 'Lainnya' }]), owner);
    assert.equal(back.reason, IE.FINDING_OTHER_CATEGORY_REQUIRED);
});

test('data lama: temuan "Lainnya" tanpa penjelasan (pra-migrasi 006) boleh dikirim kembali TANPA perubahan; temuan baru/yang diubah tetap wajib dijelaskan', async () => {
    const draft = await createDraft([{ deskripsi: 'Temuan lama', kategori: 'Kelistrikan' }, { deskripsi: 'Temuan lain', kategori: 'Kebakaran' }]);
    const stored = await inspectionFake.findById(draft.id);
    Object.assign(stored.temuan[0], { kategori: 'Lainnya', kategoriLainnya: null }); // seperti baris lama di database
    const [legacy, other] = stored.temuan.map((finding) => ({ ...finding }));

    const unchanged = await inspectionService.update(draft.id, content([legacy, other]), owner);
    assert.equal(unchanged.ok, true, JSON.stringify(unchanged));
    assert.deepEqual((await inspectionFake.findById(draft.id)).temuan[0], { ...legacy, kategoriLainnya: null });

    assert.equal((await inspectionService.update(draft.id, content([legacy, { ...other, kategori: 'Lainnya' }]), owner)).reason,
        IE.FINDING_OTHER_CATEGORY_REQUIRED, 'temuan baku yang diubah menjadi "Lainnya"');
    assert.equal((await inspectionService.update(draft.id, content([legacy, { deskripsi: 'Baru', kategori: 'Lainnya' }]), owner)).reason,
        IE.FINDING_OTHER_CATEGORY_REQUIRED, 'temuan baru "Lainnya"');
});

test('revisi & ajukan ulang: penjelasan "Lainnya" tetap tersimpan sepanjang siklus; menyimpan revisi mempertahankannya', async () => {
    const draft = await createDraft([{ deskripsi: 'Kursi', kategori: 'Lainnya', kategoriLainnya: 'Ergonomi' }]);
    assert.equal((await inspectionService.submit(draft.id, owner)).ok, true);
    await approvalService.approve(draft.id, 'koordinator_k3l', dewiPlant9, SIGNATURE);
    await approvalService.reject(draft.id, 'manajer', andi, 'Lengkapi foto');

    const revising = await inspectionFake.findById(draft.id);
    assert.equal(revising.temuan[0].kategoriLainnya, 'Ergonomi');
    const revised = await inspectionService.update(draft.id, content(revising.temuan.map((finding) => ({ ...finding }))), owner);
    assert.equal(revised.ok, true, JSON.stringify(revised));
    const resubmitted = await inspectionService.submit(draft.id, owner);
    assert.equal(resubmitted.ok, true);
    const after = await inspectionFake.findById(draft.id);
    assert.deepEqual([after.status, after.currentApprovalStage], ['in_review', 'manajer']);
    assert.deepEqual(after.temuan.map(({ kategori, kategoriLainnya }) => [kategori, kategoriLainnya]), [['Lainnya', 'Ergonomi']]);
});
