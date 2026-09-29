/* revision-info.test.js — UX "Perlu Revisi": permintaan revisi yang sedang
 * berlaku (hanya dari riwayat pengesahan yang sudah ada), bloknya di Detail /
 * form, dan tombol Revisi di tabel Inspeksi Terbaru — hanya untuk Safety
 * Officer pemilik, terpisah dari "Perbaikan & Progres".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderRevisionInfo, revisionRequest } from '../../src/presentation/components/revision-info.js';
import { setSession, clearSession } from '../../src/infrastructure/session.js';

const OWNER = { id: 1, role: 'safety_officer' };
const OTHER_OFFICER = { id: 2, role: 'safety_officer' };
const COORDINATOR = { id: 5, role: 'koordinator_k3l', plantId: 1 };
const MANAGER = { id: 7, role: 'manajer_bagian' };

const decision = (id, stage, attempt, verdict, extra = {}) => ({
    id, stage, attempt, decision: verdict, reviewerName: 'Dewi', hasSignature: verdict === 'approved',
    rejectionReason: verdict === 'rejected' ? 'Foto bukti belum menunjukkan kondisi aktual.' : null,
    decidedAt: '2026-09-29T03:00:00.000Z', ...extra,
});

/** Manajer menolak setelah Koordinator menyetujui — revisi kembali ke Manajer. */
const rejectedByManager = (overrides = {}) => ({
    id: 'INS-020', plantId: 1, petugasUserId: 1, status: 'revision_required', currentApprovalStage: 'manajer',
    approvalHistory: [
        decision(1, 'koordinator_k3l', 1, 'approved'),
        decision(2, 'manajer', 1, 'rejected', { reviewerName: 'Andi', rejectionReason: 'Lampirkan foto label panel.' }),
    ],
    ...overrides,
});

/** Teks yang terbaca pengguna: tanpa tag, entity &amp; di-decode, spasi dirapatkan. */
const textOf = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

test('revisionRequest: penolakan terakhir tahap berjalan — tahap, peninjau, tanggal, alasan; null bila bukan Perlu Revisi', () => {
    assert.deepEqual(revisionRequest(rejectedByManager()), {
        stageTitle: 'Manajer Bagian', reviewerName: 'Andi', decidedAt: '2026-09-29T03:00:00.000Z', reason: 'Lampirkan foto label panel.',
    });
    for (const status of ['draft', 'in_review', 'completed']) {
        assert.equal(revisionRequest(rejectedByManager({ status })), null, status);
    }
    assert.equal(revisionRequest(null), null);
});

test('revisionRequest: ditolak berulang -> attempt TERAKHIR tahap itu; attempt lama tidak dipakai', () => {
    const item = rejectedByManager({ approvalHistory: [
        decision(1, 'koordinator_k3l', 1, 'approved'),
        decision(2, 'manajer', 1, 'rejected', { rejectionReason: 'Alasan lama' }),
        decision(3, 'manajer', 2, 'rejected', { rejectionReason: 'Alasan terbaru', reviewerName: 'Andi' }),
    ] });
    assert.equal(revisionRequest(item).reason, 'Alasan terbaru');
});

test('revisionRequest: data tanpa penolakan tercatat (data lama) -> field null, tidak mengarang peninjau/alasan', () => {
    const item = rejectedByManager({ approvalHistory: [decision(1, 'koordinator_k3l', 1, 'approved')] });
    assert.deepEqual(revisionRequest(item), { stageTitle: 'Manajer Bagian', reviewerName: null, decidedAt: null, reason: null });
    const text = textOf(renderRevisionInfo(item));
    assert.ok(text.includes('Diminta oleh Manajer Bagian'));
    assert.ok(text.includes('Alasan Revisi -'));
});

test('renderRevisionInfo: diminta oleh / tanggal / alasan / langkah berikutnya — kembali ke tahap yang menolak', () => {
    const text = textOf(renderRevisionInfo(rejectedByManager(), 'viewer'));
    assert.ok(text.includes('Perlu Revisi'));
    assert.ok(text.includes('Diminta oleh Manajer Bagian · Andi'));
    assert.ok(text.includes('Tanggal 29/9/2026'));
    assert.ok(text.includes('Alasan Revisi Lampirkan foto label panel.'));
    assert.ok(text.includes('Setelah diajukan ulang, inspeksi kembali ke Manajer Bagian.'), 'bukan kembali ke Koordinator');
    assert.equal(renderRevisionInfo(rejectedByManager({ status: 'in_review' })), '');
});

test('renderRevisionInfo: tombol "Revisi Inspeksi" HANYA mode pemilik; form & pengguna lain tanpa tombol', () => {
    const owner = renderRevisionInfo(rejectedByManager(), 'owner');
    assert.match(owner, /data-action="editInspeksi" data-id="INS-020" data-testid="detail-revise-btn"/);
    assert.ok(textOf(owner).includes('Revisi Inspeksi'));
    for (const mode of ['viewer', 'form']) {
        assert.ok(!renderRevisionInfo(rejectedByManager(), mode).includes('data-action'), mode);
    }
    assert.ok(textOf(renderRevisionInfo(rejectedByManager(), 'form')).includes('pilih Simpan & Ajukan Ulang'));
});

test('renderRevisionInfo: alasan & nama peninjau (isian bebas) di-escape', () => {
    const html = renderRevisionInfo(rejectedByManager({ approvalHistory: [
        decision(1, 'manajer', 1, 'rejected', { reviewerName: '"><script>alert(1)</script>', rejectionReason: '<img src=x onerror=alert(2)>' }),
    ] }), 'owner');
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(2)&gt;'));
});

// Tabel Inspeksi Terbaru — renderInspeksiWithSearch menerima data langsung (tanpa fetch).
function makeTbodyStub() {
    const tbody = { _html: '', get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); } };
    globalThis.document = {
        getElementById: (id) => (id === 'inspeksiTableBody' ? tbody : null),
        addEventListener: () => {},
    };
    return tbody;
}

async function recentRowFor(user, item) {
    const tbody = makeTbodyStub();
    const { renderInspeksiWithSearch } = await import('../../src/presentation/views/tables.view.js');
    setSession(user, 'csrf');
    try {
        renderInspeksiWithSearch([{ lokasi: 'IT', dueDate: '1/10/2026', temuan: [], perbaikan: [], ...item }], '');
    } finally {
        clearSession();
    }
    return tbody.innerHTML;
}

test('Inspeksi Terbaru: tombol "Revisi" hanya untuk Safety Officer pemilik inspeksi Perlu Revisi', async () => {
    const owned = await recentRowFor(OWNER, rejectedByManager());
    assert.equal((owned.match(/data-testid="recent-revise-btn"/g) || []).length, 1);
    assert.match(owned, /data-action="editInspeksi" data-id="INS-020" data-testid="recent-revise-btn"/);
    assert.ok(owned.includes('data-testid="row-detail-btn"'), 'Lihat tetap ada');

    for (const [label, user, item] of [
        ['Safety Officer lain', OTHER_OFFICER, rejectedByManager()],
        ['Koordinator', COORDINATOR, rejectedByManager()],
        ['Manajer', MANAGER, rejectedByManager()],
        ['pemilik, Dalam Review', OWNER, rejectedByManager({ status: 'in_review' })],
        ['pemilik, Selesai', OWNER, rejectedByManager({ status: 'completed', currentApprovalStage: null })],
    ]) {
        assert.ok(!(await recentRowFor(user, item)).includes('recent-revise-btn'), label);
    }
});

test('Inspeksi Terbaru: "Perbaikan & Progres" berlabel jelas dan tetap membuka modal perbaikan, bukan revisi', async () => {
    const html = await recentRowFor(OWNER, rejectedByManager());
    const button = html.match(/<button[^>]*data-testid="recent-perbaikan-btn"[^>]*>/)[0];
    assert.match(button, /data-action="openPerbaikanModal"/);
    assert.match(button, /title="Perbaikan &amp; Progres/);
    assert.ok(!button.includes('editInspeksi'));
});
