/* table-actions.test.js — aksi per role di tabel inspeksi (tampilan saja;
 * server tetap otoritatif). Tombol hanya untuk yang bisa memakainya:
 * Pengesahan untuk peninjau tahap berjalan, "Perbaikan & Progres" untuk
 * Safety Officer pemilik & Admin, "Lihat" untuk semua.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { setSession, clearSession } from '../../src/infrastructure/session.js';

const USERS = {
    owner: { id: 1, role: 'safety_officer' },
    otherOfficer: { id: 2, role: 'safety_officer' },
    dewi: { id: 5, role: 'koordinator_k3l', plantId: 1 },
    rina: { id: 6, role: 'koordinator_k3l', plantId: 9 },
    andi: { id: 7, role: 'manajer_bagian' },
    hadi: { id: 8, role: 'ketua_p2k3' },
    admin: { id: 9, role: 'admin' },
};

const inspection = (overrides = {}) => ({
    id: 'INS-030', plantId: 1, petugasUserId: 1, lokasi: 'IT', keteranganLokasi: '-', tanggal: '1/10/2026', petugas: 'Arif',
    dueDate: '15/10/2026', status: 'in_review', currentApprovalStage: 'koordinator_k3l',
    temuan: [{ deskripsi: 'Kabel', kategori: 'Lainnya' }], perbaikan: [], approvalHistory: [], ...overrides,
});

function makeStub() {
    const bodies = {};
    const element = (id) => {
        bodies[id] ??= { _html: '', get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); } };
        return bodies[id];
    };
    globalThis.document = { getElementById: element, addEventListener: () => {} };
    return bodies;
}

async function render(table, user, item) {
    const bodies = makeStub();
    const view = await import('../../src/presentation/views/tables.view.js');
    setSession(user, 'csrf');
    try {
        if (table === 'all') view.renderAllInspeksiWithSearch([item], '');
        else view.renderInspeksiWithSearch([item], '');
    } finally {
        clearSession();
    }
    return bodies[table === 'all' ? 'allInspeksiTable' : 'inspeksiTableBody'].innerHTML;
}

const has = (html, testId) => html.includes(`data-testid="${testId}"`);

test('Semua Data Inspeksi: Pengesahan hanya untuk peninjau tahap berjalan (bukan "Kelola Pengesahan" untuk semua); "Lihat" untuk semua', async () => {
    for (const [stage, decider] of [['koordinator_k3l', 'dewi'], ['manajer', 'andi'], ['ketua_p2k3', 'hadi']]) {
        const item = inspection({ currentApprovalStage: stage });
        for (const [name, user] of Object.entries(USERS)) {
            const html = await render('all', user, item);
            assert.equal(has(html, 'row-approve-btn'), name === decider, `${name} @ ${stage}: Pengesahan`);
            assert.ok(has(html, 'row-detail-btn'), `${name} @ ${stage}: Lihat`);
        }
    }
    const completed = inspection({ status: 'completed', currentApprovalStage: null });
    for (const user of Object.values(USERS)) assert.ok(!has(await render('all', user, completed), 'row-approve-btn'));
});

test('Inspeksi Terbaru: "Perbaikan & Progres" hanya untuk Safety Officer pemilik & Admin — bukan peninjau atau Safety Officer lain', async () => {
    for (const status of ['in_review', 'revision_required', 'completed']) {
        const item = inspection({ status, currentApprovalStage: status === 'completed' ? null : 'koordinator_k3l' });
        for (const [name, user] of Object.entries(USERS)) {
            const expected = name === 'owner' || name === 'admin';
            assert.equal(has(await render('recent', user, item), 'recent-perbaikan-btn'), expected, `${name} @ ${status}`);
        }
    }
});
