/* pdf-signature.test.js — release: tanda tangan + watermark di PDF.
 *
 * Bagian murni saja: geometri watermark (sama dengan pratinjau/riwayat) dan
 * markup blok pengesahan PDF. Penggambaran kanvas & pengambilan gambar
 * diuji di E2E (tests/e2e/pdf.spec.js) karena butuh browser sungguhan.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import {
    watermarkBox, WATERMARK_LOGO_URL, WATERMARK_MAX_HEIGHT_RATIO, WATERMARK_MAX_WIDTH_RATIO,
} from '../../src/presentation/components/watermark.js';
import { buildInspectionReportHtml } from '../../src/presentation/views/pdf-report.view.js';

// Rasio aspek SESUNGGUHNYA dari aset (header PNG), bukan angka yang diasumsikan.
const logoBytes = readFileSync(new URL(WATERMARK_LOGO_URL));
const LOGO_ASPECT = logoBytes.readUInt32BE(16) / logoBytes.readUInt32BE(20);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);

test('watermark: aset lokal src/asset/company_logo.png, PNG sungguhan (bukan URL eksternal)', () => {
    assert.match(WATERMARK_LOGO_URL, /^file:.*\/src\/asset\/company_logo\.png$/);
    assert.equal(logoBytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.ok(LOGO_ASPECT > 0);
});

test('watermarkBox: tengah = posisi tersimpan x/y persis; rasio aspek logo dijaga (tidak gepeng)', () => {
    const box = watermarkBox(600, 180, { x: 0.25, y: 0.8 }, LOGO_ASPECT);
    close(box.width / box.height, LOGO_ASPECT);
    close(box.left + box.width / 2, 0.25 * 600);
    close(box.top + box.height / 2, 0.8 * 180);
});

test('watermarkBox: ukuran "contain" tetap — maks. 35% lebar DAN 65% tinggi tanda tangan', () => {
    for (const [width, height] of [[600, 180], [160, 48], [300, 300], [1000, 100], [200, 600]]) {
        const box = watermarkBox(width, height, { x: 0.5, y: 0.5 }, LOGO_ASPECT);
        assert.ok(box.width <= width * WATERMARK_MAX_WIDTH_RATIO + 1e-9, `${width}x${height}: lebar`);
        assert.ok(box.height <= height * WATERMARK_MAX_HEIGHT_RATIO + 1e-9, `${width}x${height}: tinggi`);
        const hitsLimit = Math.abs(box.width - width * WATERMARK_MAX_WIDTH_RATIO) < 1e-9
            || Math.abs(box.height - height * WATERMARK_MAX_HEIGHT_RATIO) < 1e-9;
        assert.ok(hitsLimit, `${width}x${height}: sebesar mungkin dalam batas`);
        close(box.width / box.height, LOGO_ASPECT);
    }
});

test('watermarkBox: posisi tepi (0/1) tidak dibatasi ulang — posisi tersimpan adalah sumber kebenaran', () => {
    const box = watermarkBox(400, 100, { x: 0, y: 1 }, LOGO_ASPECT);
    close(box.left + box.width / 2, 0);
    close(box.top + box.height / 2, 100);
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

test('PDF footer: netral — tanpa klaim tanda tangan elektronik tersertifikasi/keabsahan hukum, tanpa tanggal "ditandatangani" = waktu cetak', () => {
    const html = buildInspectionReportHtml(completed([approved(1, 'koordinator_k3l')]));
    const footer = html.slice(html.indexOf('class="pdf-footer"'));
    for (const claim of [/ditandatangani dan disetujui secara elektronik/i, /sah dan berlaku/i, /bukti resmi/i]) {
        assert.doesNotMatch(footer, claim);
    }
    assert.match(footer, /bukan tanda tangan elektronik tersertifikasi/);
    assert.match(footer, /tercatat di sistem beserta nama penyetuju dan tanggal keputusannya/);
});

// =========================================================================
// Dokumentasi Foto di PDF — foto sungguhan dari gambar yang disiapkan
// (preparePhotoImages), bukan ikon kamera.
// =========================================================================

const withPhotos = (overrides = {}) => ({
    id: 'INS-010', lokasi: 'IT', status: 'completed', temuan: [], perbaikan: [], approvalHistory: [],
    fotoDekat: [{ id: 41, originalName: 'dekat.jpg' }], fotoJauh: [{ id: 42, originalName: 'jauh.png' }],
    ...overrides,
});

test('PDF foto: setiap foto dokumentasi memakai gambar yang disiapkan, berurutan dekat -> jauh, dengan keterangan slot + nama', () => {
    const html = buildInspectionReportHtml(withPhotos(), new Map(), new Map([[41, 'blob:foto-41'], [42, 'blob:foto-42']]));
    assert.match(html, /Dokumentasi Foto/);
    const sources = [...html.matchAll(/<img class="pdf-photo-img" src="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(sources, ['blob:foto-41', 'blob:foto-42']);
    assert.match(html, /Foto dekat · dekat\.jpg/);
    assert.match(html, /Foto jauh · jauh\.png/);
    assert.match(html, /2 foto/);
    assert.ok(!html.includes('📷'), 'tanpa ikon kamera pengganti foto');
    assert.ok(!html.includes('pdf-thumb'), 'tanpa kotak placeholder lama');
});

test('PDF foto: berkas yang tidak tersedia ditandai (bukan diganti ikon); tanpa foto -> "Tidak ada dokumentasi foto."', () => {
    const partial = buildInspectionReportHtml(withPhotos(), new Map(), new Map([[41, 'blob:foto-41']]));
    assert.equal((partial.match(/class="pdf-photo-img"/g) || []).length, 1);
    assert.match(partial, /<div class="pdf-photo-missing">Berkas foto tidak tersedia<\/div>\s*<figcaption>Foto jauh · jauh\.png/);

    const none = buildInspectionReportHtml(withPhotos({ fotoDekat: [], fotoJauh: [] }));
    assert.match(none, /<p class="pdf-photo-empty">Tidak ada dokumentasi foto\.<\/p>/);
    assert.ok(!none.includes('pdf-photo-row'), 'tanpa baris foto');
});

test('PDF foto: nama berkas & src di-escape (XSS)', () => {
    const evil = '"><img src=x onerror=alert(1)>.jpg';
    const html = buildInspectionReportHtml(
        withPhotos({ fotoDekat: [{ id: 7, originalName: evil }], fotoJauh: [] }), new Map(), new Map([[7, 'blob:x" onerror="alert(2)']]),
    );
    assert.ok(!html.includes('<img src=x onerror'));
    assert.ok(!html.includes('onerror="alert(2)"'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});
