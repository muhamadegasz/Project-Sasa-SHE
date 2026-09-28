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
    // Phase 17.2: tombol (dengan data-id) hanya ada di tahap yang sedang menunggu.
    // Release: dan hanya untuk peninjau yang berwenang — Koordinator plant-nya.
    const item = {
        id: XSS_ATTR, plantId: 1, status: 'in_review', currentApprovalStage: 'koordinator_k3l', approvalHistory: [],
    };
    const html = renderApprovalStages(item, { id: 5, role: 'koordinator_k3l', plantId: 1 });
    assert.ok(html.includes('data-action="approveStage"'), 'tombol dirender, jadi data-id benar-benar diuji');
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('data-id="&quot;&gt;&lt;script&gt;alert(2)&lt;/script&gt;"'));
});

test('renderApprovalStages: nama penyetuju (reviewerName) jahat tampil sebagai teks, bukan markup', () => {
    const item = {
        id: 'INS-001', status: 'in_review', currentApprovalStage: 'manajer',
        approvalHistory: [{ stage: 'koordinator_k3l', attempt: 1, decision: 'approved', reviewerName: XSS_TAG, decidedAt: '2026-01-01' }],
    };
    const html = renderApprovalStages(item);
    assert.ok(!html.includes('<img src=x onerror'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('renderApprovalStages: alasan penolakan jahat (isian bebas penyetuju, Phase 17.2) tampil sebagai teks', () => {
    const item = {
        id: 'INS-001', status: 'revision_required', currentApprovalStage: 'koordinator_k3l',
        approvalHistory: [{ stage: 'koordinator_k3l', attempt: 1, decision: 'rejected', reviewerName: 'Dewi', rejectionReason: XSS_TAG, decidedAt: '2026-01-01' }],
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
        id: 'INS-999', status: 'completed', currentApprovalStage: null, lokasi: 'Fermentation', keteranganLokasi: '-',
        tanggal: '1/1/2026', petugas: XSS_TAG, dueDate: '-',
        temuan: [{ deskripsi: XSS_ATTR, kategori: 'Lainnya' }],
        perbaikan: [{ tgl: '1/1/2026', action: XSS_TAG, pic: XSS_ATTR, status: 'closed', foto: [] }],
        approvalHistory: [{ stage: 'koordinator_k3l', attempt: 1, decision: 'approved', reviewerName: XSS_TAG, decidedAt: '2026-01-01' }],
    });

    assert.ok(!html.includes('<img src=x onerror'), 'petugas/tindakan tidak lolos sebagai tag aktif');
    assert.ok(!html.includes('<script>'), 'atribut-breakout tidak menghasilkan <script> aktif');
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(html.includes('&quot;&gt;&lt;script&gt;'));
});

// =========================================================================
// Phase 17.4B — gambar tanda tangan di daftar tahap
// =========================================================================

test('renderApprovalStages: tanda tangan lewat endpoint API terotorisasi; id jahat ter-encode, tidak memutus atribut', () => {
    const item = {
        id: XSS_ATTR, status: 'completed', currentApprovalStage: null,
        approvalHistory: [
            { id: 7, stage: 'koordinator_k3l', attempt: 1, decision: 'approved', reviewerName: XSS_TAG, hasSignature: true, decidedAt: '2026-01-01' },
            { id: '8"><b>', stage: 'manajer', attempt: 1, decision: 'approved', reviewerName: 'Andi', hasSignature: true, decidedAt: '2026-01-02' },
            { id: 9, stage: 'ketua_p2k3', attempt: 1, decision: 'approved', reviewerName: 'Lama', hasSignature: false, decidedAt: '2026-01-03' },
        ],
    };
    const html = renderApprovalStages(item);
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img src=x onerror'));
    assert.ok(!html.includes('<b>'), 'id keputusan jahat tidak menjadi markup');
    assert.ok(!html.includes('/uploads'), 'tidak pernah menunjuk berkas statis');
    const sources = [...html.matchAll(/<img src="([^"]*)"/g)].map((match) => match[1]);
    assert.equal(sources.length, 2, 'hanya persetujuan bertanda tangan yang punya gambar');
    for (const source of sources) {
        assert.match(source, /^http:\/\/project-sasa-she\.test:3001\/api\/inspections\/[^"<>]+\/approvals\/[^"<>/]+\/signature$/);
    }
    assert.ok(sources[0].includes('%22%3E%3Cscript%3E'), 'id inspeksi di-encode di path');
    assert.ok(html.includes('Tanpa tanda tangan (data lama)'));
});

test('renderApprovalStages: watermark (Phase 17.4D) hanya dari angka posisi — nilai jahat/di luar 0..1 tidak menjadi markup', () => {
    const item = {
        id: 'INS-001', status: 'completed', currentApprovalStage: null,
        approvalHistory: [
            { id: 1, stage: 'koordinator_k3l', attempt: 1, decision: 'approved', reviewerName: 'Dewi', hasSignature: true, watermark: { x: 0.25, y: 0.75 }, decidedAt: '2026-01-01' },
            { id: 2, stage: 'manajer', attempt: 1, decision: 'approved', reviewerName: 'Andi', hasSignature: true, watermark: { x: XSS_ATTR, y: 7 }, decidedAt: '2026-01-02' },
            { id: 3, stage: 'ketua_p2k3', attempt: 1, decision: 'approved', reviewerName: 'Hadi', hasSignature: true, watermark: null, decidedAt: '2026-01-03' },
        ],
    };
    const html = renderApprovalStages(item);
    assert.ok(!html.includes('<script>'));
    const styles = [...html.matchAll(/data-testid="stage-watermark"[^>]*style="([^"]*)"/g)].map((match) => match[1]);
    assert.deepEqual(styles, ['left:25%;top:75%', 'left:0%;top:100%'], 'satu watermark per persetujuan yang memilikinya, posisi dipaksa ke 0..1');
});

// Release: seluruh attempt per tahap (riwayat append-only), hanya dari item.approvalHistory.
const attempt = (id, stage, n, decision, extra = {}) => ({
    id, stage, attempt: n, decision, reviewerName: 'Dewi', hasSignature: decision === 'approved',
    rejectionReason: decision === 'rejected' ? 'Foto kurang jelas' : null, decidedAt: `2026-01-0${id}`, ...extra,
});
const historyOf = (html, stageTitle) => {
    const block = html.split('<div class="approval-stage').find((part) => part.includes(`>${stageTitle}<`)) || '';
    return [...block.matchAll(/data-decision="(\w+)"[\s\S]*?Percobaan (\d+)/g)].map((m) => [Number(m[2]), m[1]]);
};

test('riwayat pengesahan: ditolak lalu disetujui pada attempt berikutnya -> kedua attempt urut, alasan penolakan tampil; kartu tetap "Disetujui"', () => {
    const item = { id: 'INS-001', status: 'in_review', currentApprovalStage: 'manajer', approvalHistory: [
        attempt(1, 'koordinator_k3l', 1, 'rejected'),
        attempt(2, 'koordinator_k3l', 2, 'approved'),
    ] };
    const html = renderApprovalStages(item);
    assert.deepEqual(historyOf(html, 'Koordinator K3L Bagian'), [[1, 'rejected'], [2, 'approved']]);
    assert.ok(html.includes('Alasan: Foto kurang jelas'));
    assert.ok(html.includes('✅ Disetujui'));
    assert.equal((html.match(/data-testid="stage-history"/g) || []).length, 1, 'hanya tahap dengan attempt yang belum terwakili');
});

test('riwayat pengesahan: ditolak Ketua lalu diajukan ulang -> tahap Ketua kembali menunggu, penolakan sebelumnya tetap terlihat; tahap lain tanpa daftar berlebih', () => {
    const item = { id: 'INS-002', status: 'in_review', currentApprovalStage: 'ketua_p2k3', approvalHistory: [
        attempt(1, 'koordinator_k3l', 1, 'approved'),
        attempt(2, 'manajer', 1, 'approved', { reviewerName: 'Andi' }),
        attempt(3, 'ketua_p2k3', 1, 'rejected', { reviewerName: 'Hadi', rejectionReason: 'Lengkapi bukti' }),
    ] };
    const html = renderApprovalStages(item);
    assert.deepEqual(historyOf(html, 'Ketua P2K3'), [[1, 'rejected']]);
    assert.ok(html.includes('Alasan: Lengkapi bukti'));
    assert.ok(html.includes('Menunggu Persetujuan'), 'status tahap berjalan tidak berubah');
    assert.deepEqual(historyOf(html, 'Koordinator K3L Bagian'), []);
    assert.deepEqual(historyOf(html, 'Manajer Bagian'), []);
});

test('riwayat pengesahan: satu penolakan yang menunggu revisi sudah diringkas kartu -> tidak diulang; alasan jahat di-escape', () => {
    const single = { id: 'INS-003', status: 'revision_required', currentApprovalStage: 'koordinator_k3l', approvalHistory: [attempt(1, 'koordinator_k3l', 1, 'rejected')] };
    assert.ok(!renderApprovalStages(single).includes('data-testid="stage-history"'));

    const hostile = { id: 'INS-004', status: 'in_review', currentApprovalStage: 'koordinator_k3l', approvalHistory: [
        attempt(1, 'koordinator_k3l', 1, 'rejected', { rejectionReason: XSS_TAG, reviewerName: XSS_ATTR }),
    ] };
    const html = renderApprovalStages(hostile);
    assert.ok(html.includes('data-testid="stage-history"'));
    assert.ok(!html.includes('<img src=x onerror'));
    assert.ok(!html.includes('<script>'));
});

// Release: tombol Setujui/Tolak hanya untuk peninjau yang berwenang atas tahap berjalan.
const buttonsFor = (html) => [...html.matchAll(/data-action="(approveStage|rejectStage)"[^>]*data-stage="([^"]+)"/g)].map((m) => `${m[1]}:${m[2]}`);
const awaiting = (stage) => ({ id: 'INS-010', plantId: 1, petugasUserId: 1, status: 'in_review', currentApprovalStage: stage, approvalHistory: [] });
const ROLES = {
    officer: { id: 1, role: 'safety_officer' },
    dewi: { id: 5, role: 'koordinator_k3l', plantId: 1 },
    rina: { id: 6, role: 'koordinator_k3l', plantId: 9 },
    andi: { id: 7, role: 'manajer_bagian' },
    hadi: { id: 8, role: 'ketua_p2k3' },
    admin: { id: 9, role: 'admin' },
};

test('tombol aksi pengesahan: hanya role pemilik tahap berjalan (Koordinator plant-nya / Manajer / Ketua); Safety Officer & Admin hanya-baca', () => {
    for (const [stage, actor] of [['koordinator_k3l', 'dewi'], ['manajer', 'andi'], ['ketua_p2k3', 'hadi']]) {
        const item = awaiting(stage);
        assert.deepEqual(buttonsFor(renderApprovalStages(item, ROLES[actor])), [`approveStage:${stage}`, `rejectStage:${stage}`], `${actor} @ ${stage}`);
        for (const other of Object.keys(ROLES).filter((name) => name !== actor)) {
            const html = renderApprovalStages(item, ROLES[other]);
            assert.deepEqual(buttonsFor(html), [], `${other} @ ${stage}: tanpa tombol`);
            assert.ok(html.includes('data-testid="stage-readonly"'), `${other} @ ${stage}: penanda hanya-baca`);
        }
    }
});

test('tampilan hanya-baca Safety Officer: "Menunggu persetujuan <tahap>" + riwayat attempt tetap tampil', () => {
    const item = { ...awaiting('koordinator_k3l'), approvalHistory: [attempt(1, 'koordinator_k3l', 1, 'rejected')] };
    const html = renderApprovalStages(item, ROLES.officer);
    assert.ok(html.includes('Menunggu persetujuan Koordinator K3L Bagian'));
    assert.ok(html.includes('Hanya informasi'));
    assert.ok(html.includes('data-testid="stage-history"'), 'riwayat penolakan sebelumnya tetap tampil');
    assert.deepEqual(buttonsFor(html), []);
});
