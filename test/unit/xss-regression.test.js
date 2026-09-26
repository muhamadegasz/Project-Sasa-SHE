/* xss-regression.test.js — Phase 14.1-B: pemulihan regresi XSS (S-03).
 *
 * Menggantikan test-xss.mjs lama (scratchpad), yang membuktikan escaping lewat
 * bootstrap PENUH (login form -> initApp -> legacy-app.js). Sejak Phase 14
 * bootstrap itu butuh network sungguhan (login lewat fetch), jadi tidak bisa
 * lagi dipakai untuk test offline.
 *
 * Pendekatan di sini BERBEDA, bukan sekadar "network-mock"-kan yang lama:
 * dipanggil langsung adalah fungsi yang SESUNGGUHNYA bertanggung jawab atas
 * escaping —
 *
 *   - escapeHtml()/jsArg()/highlight()  (src/shared/html.js)     — primitif
 *     yang dipakai SETIAP view untuk menetralkan nilai sebelum masuk innerHTML.
 *     openDetailModal/openPerbaikanModal/openApprovalModal (src/presentation/
 *     views/*.js) memanggil primitif ini persis dengan cara yang sama seperti
 *     yang diuji di sini — tapi ketiga fungsi itu sendiri mencampur fetch
 *     repository + render dalam satu fungsi async yang tidak bisa dipanggil
 *     tanpa jaringan. Alih-alih memalsukan jaringan itu, primitifnya diuji
 *     langsung: itulah yang benar-benar menjamin (atau tidak) keamanannya.
 *   - renderApprovalStages(item)  (approval.view.js)             — SATU-SATUNYA
 *     fungsi render murni (terima objek, kembalikan string, tanpa DOM/repo)
 *     yang dipakai ULANG APA ADANYA oleh approval-modal, detail-modal, DAN
 *     perbaikan-modal (lihat impor renderApprovalStages di ketiga berkas itu)
 *     — menguji ini sekali menguji permukaan itu di ketiganya sekaligus.
 *   - renderInspeksiWithSearch/renderAllInspeksiWithSearch (tables.view.js) —
 *     menerima `data` langsung dari pemanggil (tidak fetch sendiri), hanya
 *     butuh document.getElementById minimal.
 *   - buildInspectionReportHtml(item)  (pdf-report.view.js)       — murni.
 *
 * Tidak ada login, tidak ada initApp, tidak ada fetch/API sungguhan.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { escapeHtml, jsArg, highlight } from '../../src/shared/html.js';
import { buildInspectionReportHtml } from '../../src/presentation/views/pdf-report.view.js';

// approval.view.js TIDAK bisa jadi static import di sini: berkas itu (lewat
// toast.js, dan bindModalClose() yang dipanggilnya sendiri di top-level)
// menyentuh `document` pada saat modul dievaluasi, bukan hanya di dalam
// openApprovalModal(). Static import dievaluasi sebelum baris manapun di
// berkas ini sendiri sempat berjalan, jadi document HARUS sudah ada duluan —
// karenanya diimpor secara dinamis di bawah, setelah stub document dipasang.
// Ini bukan network/repository — murni supaya modul bisa dievaluasi tanpa
// browser sungguhan; renderApprovalStages sendiri (yang benar-benar diuji)
// tidak pernah menyentuh document sama sekali.
function makeGenericElement() {
    return {
        addEventListener: () => {},
        removeEventListener: () => {},
        classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
        _html: '',
        get innerHTML() { return this._html; },
        set innerHTML(value) { this._html = String(value); },
    };
}
// addEventListener: modal.js (diimpor approval.view.js) memasang listener
// Escape di document saat dievaluasi (Phase 16.4).
globalThis.document = { getElementById: () => makeGenericElement(), addEventListener: () => {} };
const { renderApprovalStages } = await import('../../src/presentation/views/approval.view.js');

const XSS_TAG = '<img src=x onerror=alert(1)>';
const XSS_ATTR = '"><script>alert(2)</script>';
const EVIL_FILENAME = 'foto"jahat<b>.jpg';

// =========================================================================
// Primitif escaping (src/shared/html.js) — dasar seluruh permukaan render
// =========================================================================

test('escapeHtml: menetralkan tag dan atribut berbahaya menjadi entity, bukan HTML aktif', () => {
    const escaped = escapeHtml(XSS_TAG);
    assert.ok(!escaped.includes('<img'), 'tidak ada tag <img mentah');
    assert.equal(escaped, '&lt;img src=x onerror=alert(1)&gt;');
});

test('escapeHtml: menetralkan payload yang memutus atribut ganda + <script>', () => {
    const escaped = escapeHtml(XSS_ATTR);
    assert.ok(!escaped.includes('<script>'));
    assert.equal(escaped, '&quot;&gt;&lt;script&gt;alert(2)&lt;/script&gt;');
});

test('escapeHtml: nama file jahat (D-1/S-03) aman dipakai di dalam atribut title="..."', () => {
    const escaped = escapeHtml(EVIL_FILENAME);
    assert.ok(!escaped.includes('"jahat'), 'tanda kutip tidak menembus keluar atribut');
    assert.equal(escaped, 'foto&quot;jahat&lt;b&gt;.jpg');
});

test('escapeHtml: null/undefined menjadi string kosong, bukan literal "null"/"undefined"', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
});

test('jsArg: JSON array nama file jahat tetap terbaca valid setelah decode entity (dasar data-images)', () => {
    const encoded = jsArg([EVIL_FILENAME, 'aman.jpg']);
    assert.ok(!encoded.includes('"foto'), 'kutip ganda mentah tidak lolos ke dalam atribut');
    const decoded = encoded
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const parsed = JSON.parse(decoded);
    assert.deepEqual(parsed, [EVIL_FILENAME, 'aman.jpg'], 'payload utuh, bukan terpotong oleh kutip di dalamnya');
});

test('highlight: query kosong berperilaku sama seperti escapeHtml biasa (aman dipakai sebagai pengganti interpolasi langsung)', () => {
    assert.equal(highlight(XSS_TAG, ''), escapeHtml(XSS_TAG));
});

test('highlight: query yang match tetap escape teks di sekitarnya, tidak membuka tag', () => {
    const result = highlight(`Lihat ${XSS_TAG} di sini`, 'lihat');
    assert.ok(!result.includes('<img'), 'bagian non-match tetap ter-escape');
    assert.ok(result.includes('&lt;img'));
});

test('highlight: query itu sendiri berisi payload HTML tidak menghasilkan tag aktif', () => {
    // Kasus tepi: pengguna mengetik "<script>" di kotak pencarian. escapeRegExp()
    // menetralkannya sebagai pola regex, escapeHtml() menetralkannya sebagai HTML.
    const result = highlight('teks biasa', '<script>');
    assert.ok(!result.includes('<script>'));
});

// =========================================================================
// renderApprovalStages — dipakai ulang oleh approval/detail/perbaikan modal
// =========================================================================

test('renderApprovalStages: id inspeksi jahat di data-id tidak memutus atribut', () => {
    const item = {
        id: XSS_ATTR,
        approvals: { 1: { approved: true, by: 'Arif', jabatan: 'Safety Officer', tanggal: '1/1/2026' } },
    };
    const html = renderApprovalStages(item);
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('data-id="&quot;&gt;&lt;script&gt;alert(2)&lt;/script&gt;"'));
});

test('renderApprovalStages: nama penyetuju (approval.by) jahat tampil sebagai teks, bukan markup', () => {
    const item = {
        id: 'INS-001',
        approvals: { 1: { approved: true, by: XSS_TAG, jabatan: 'Safety Officer', tanggal: '1/1/2026' } },
    };
    const html = renderApprovalStages(item);
    assert.ok(!html.includes('<img src=x onerror'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

// =========================================================================
// tables.view.js — renderInspeksiWithSearch / renderAllInspeksiWithSearch
// =========================================================================

function makeTbodyStub() {
    const tbody = { _html: '', get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); } };
    globalThis.document = { getElementById: (id) => (id === 'inspeksiTableBody' || id === 'allInspeksiTable' ? tbody : null) };
    return tbody;
}

test('renderInspeksiWithSearch: temuan/lokasi/petugas jahat tampil sebagai entity di tabel dashboard', async () => {
    const tbody = makeTbodyStub();
    const { renderInspeksiWithSearch } = await import('../../src/presentation/views/tables.view.js');

    renderInspeksiWithSearch([{
        id: 'INS-001', lokasi: XSS_TAG, keteranganLokasi: '-', petugas: XSS_ATTR, status: 'proses',
        dueDate: '-', temuan: [{ deskripsi: XSS_TAG, kategori: 'Lainnya' }], perbaikan: [], approvals: {},
    }], '');

    assert.ok(!tbody.innerHTML.includes('<img src=x onerror'));
    assert.ok(!tbody.innerHTML.includes('<script>'));
    assert.ok(tbody.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('renderAllInspeksiWithSearch: query pencarian yang mengandung HTML tidak menghasilkan tag aktif (jalur highlight())', async () => {
    const tbody = makeTbodyStub();
    const { renderAllInspeksiWithSearch } = await import('../../src/presentation/views/tables.view.js');

    renderAllInspeksiWithSearch([{
        id: 'INS-002', lokasi: 'Fermentation', keteranganLokasi: XSS_ATTR, petugas: 'Arif', status: 'proses',
        tanggal: '-', temuan: [], perbaikan: [], approvals: {},
    }], '<script>alert(3)</script>');

    assert.ok(!tbody.innerHTML.includes('<script>alert(3)'));
    assert.ok(!tbody.innerHTML.includes('"><script>alert(2)'));
});

// =========================================================================
// pdf-report.view.js — buildInspectionReportHtml (murni, dipakai untuk cetak PDF)
// =========================================================================

test('buildInspectionReportHtml: petugas, temuan, dan tindakan perbaikan jahat semuanya ter-escape', () => {
    const html = buildInspectionReportHtml({
        id: 'INS-999', status: 'selesai', lokasi: 'Fermentation', keteranganLokasi: '-',
        tanggal: '1/1/2026', petugas: XSS_TAG, dueDate: '-',
        temuan: [{ deskripsi: XSS_ATTR, kategori: 'Lainnya' }],
        perbaikan: [{ tgl: '1/1/2026', action: XSS_TAG, pic: XSS_ATTR, status: 'closed', foto: [] }],
        approvals: { 1: { approved: true, by: XSS_TAG, jabatan: 'Safety Officer', tanggal: '1/1/2026' } },
    });

    assert.ok(!html.includes('<img src=x onerror'), 'petugas/tindakan tidak lolos sebagai tag aktif');
    assert.ok(!html.includes('<script>'), 'atribut-breakout tidak menghasilkan <script> aktif');
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(html.includes('&quot;&gt;&lt;script&gt;'));
});
