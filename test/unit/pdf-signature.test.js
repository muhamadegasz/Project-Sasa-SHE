/* pdf-signature.test.js — release: tanda tangan + watermark di PDF.
 *
 * Bagian murni saja: geometri watermark (sama dengan pratinjau/riwayat) dan
 * markup blok pengesahan PDF. Penggambaran kanvas & pengambilan gambar
 * diuji di E2E (tests/e2e/pdf.spec.js) karena butuh browser sungguhan.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { watermarkBox, WATERMARK_WIDTH_RATIO } from '../../src/presentation/components/watermark.js';
import { buildInspectionReportHtml } from '../../src/presentation/views/pdf-report.view.js';

test('watermarkBox: tengah = posisi tersimpan x/y persis; lebar 45% gambar; rasio 120:28', () => {
    const box = watermarkBox(600, 180, { x: 0.25, y: 0.8 });
    assert.equal(box.width, 600 * WATERMARK_WIDTH_RATIO);
    assert.equal(box.height, box.width * 28 / 120);
    assert.equal(box.left + box.width / 2, 0.25 * 600);
    assert.equal(box.top + box.height / 2, 0.8 * 180);
});

test('watermarkBox: posisi tepi (0/1) tidak dibatasi ulang — posisi tersimpan adalah sumber kebenaran', () => {
    const box = watermarkBox(400, 100, { x: 0, y: 1 });
    assert.equal(box.left + box.width / 2, 0);
    assert.equal(box.top + box.height / 2, 100);
});

function completed(history) {
    return {
        id: 'INS-001', lokasi: 'Brewhouse', tanggal: '1/1/2026', petugas: 'Arif', status: 'completed',
        currentApprovalStage: null, temuan: [], perbaikan: [], approvalHistory: history,
    };
}
const approved = (id, stage, extra = {}) => ({ id, stage, attempt: 1, decision: 'approved', reviewerName: `R${id}`, hasSignature: true, decidedAt: '2026-01-01', ...extra });

test('PDF: setiap tahap bertanda tangan memakai gambar yang disiapkan; persetujuan lama tanpa tanda tangan diberi keterangan', () => {
    const item = completed([
        approved(1, 'koordinator_k3l', { watermark: { x: 0.2, y: 0.7 } }),
        approved(2, 'manajer', { watermark: null }),
        approved(3, 'ketua_p2k3', { hasSignature: false }),
    ]);
    const html = buildInspectionReportHtml(item, new Map([[1, 'blob:http://x/aaa'], [2, 'blob:http://x/bbb']]));
    const sources = [...html.matchAll(/<img class="pdf-signature" src="([^"]*)"/g)].map((match) => match[1]);
    assert.deepEqual(sources, ['blob:http://x/aaa', 'blob:http://x/bbb']);
    assert.ok(html.includes('Tanpa tanda tangan (data lama)'));
    assert.equal((html.match(/Tanpa tanda tangan \(data lama\)/g) || []).length, 1);
});

test('PDF: yang dicetak adalah keputusan TERAKHIR tiap tahap (persetujuan ulang), bukan attempt yang ditolak', () => {
    const item = completed([
        { id: 1, stage: 'koordinator_k3l', attempt: 1, decision: 'rejected', reviewerName: 'Dewi', rejectionReason: 'Foto kurang', hasSignature: false, decidedAt: '2026-01-01' },
        approved(2, 'koordinator_k3l', { attempt: 2 }),
        approved(3, 'manajer'),
        approved(4, 'ketua_p2k3'),
    ]);
    const html = buildInspectionReportHtml(item, new Map([[2, 'blob:k2'], [3, 'blob:m'], [4, 'blob:k']]));
    const sources = [...html.matchAll(/<img class="pdf-signature" src="([^"]*)"/g)].map((match) => match[1]);
    assert.deepEqual(sources, ['blob:k2', 'blob:m', 'blob:k']);
    assert.ok(!html.includes('data lama'));
});

test('PDF: tanpa gambar disiapkan -> tidak ada <img> tanda tangan; src dan nama selalu di-escape', () => {
    const item = completed([approved(1, 'koordinator_k3l', { reviewerName: '<script>x</script>' })]);
    assert.ok(!buildInspectionReportHtml(item).includes('pdf-signature"'));
    const html = buildInspectionReportHtml(item, new Map([[1, '"><script>alert(1)</script>']]));
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('src="&quot;&gt;&lt;script&gt;'));
});
