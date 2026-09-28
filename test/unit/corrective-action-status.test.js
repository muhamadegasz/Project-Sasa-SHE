/* corrective-action-status.test.js — release: perubahan status tindakan
 * perbaikan yang sudah ada (maju saja). Aturan domain + service lewat fake.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import * as inspectionFake from '../fakes/inspection-repository.js';
import * as correctiveActionService from '../../src/services/corrective-action-service.js';
import { checkActionStatusChange, nextActionStatuses } from '../../src/domain/inspection-rules.js';

const CE = correctiveActionService.CORRECTIVE_ACTION_ERROR;
const owner = { id: 1, displayName: 'Arif', role: 'safety_officer' };
const otherOfficer = { id: 2, displayName: 'Tulus', role: 'safety_officer' };
const coordinator = { id: 5, displayName: 'Dewi', role: 'koordinator_k3l', plantId: 9 };
const admin = { id: 9, displayName: 'Admin', role: 'admin' };

function seed(status = 'in_review') {
    inspectionFake.__seed([{
        id: 'INS-001', plantId: 9, lokasi: 'Logistic', petugas: 'Arif', petugasUserId: 1,
        status, currentApprovalStage: status === 'completed' ? null : 'koordinator_k3l', approvalHistory: [],
        temuan: [{ id: 11, deskripsi: 'Kabel', kategori: 'Kelistrikan' }],
        perbaikan: [
            { id: 101, tgl: '1/1/2026', action: 'Temuan 1: Kabel', status: 'open', pic: 'Arif', foto: [] },
            { id: 102, tgl: '2/1/2026', action: 'Ganti kabel', status: 'on-progress', pic: 'Arif', foto: [] },
            { id: 103, tgl: '3/1/2026', action: 'Selesai', status: 'closed', pic: 'Arif', foto: [] },
        ],
    }]);
}
beforeEach(() => seed());

const statusOf = async (actionId) => (await inspectionFake.findById('INS-001')).perbaikan.find((a) => a.id === actionId).status;

// ---- domain ----

test('nextActionStatuses: maju saja; closed final', () => {
    assert.deepEqual(nextActionStatuses('open'), ['on-progress', 'closed']);
    assert.deepEqual(nextActionStatuses('on-progress'), ['closed']);
    assert.deepEqual(nextActionStatuses('closed'), []);
    assert.deepEqual(nextActionStatuses('bogus'), []);
});

test('checkActionStatusChange: maju diterima; mundur/sama/dari closed -> NOT_FORWARD; nilai asing -> INVALID', () => {
    assert.deepEqual(checkActionStatusChange('open', 'on-progress'), { value: 'on-progress' });
    assert.deepEqual(checkActionStatusChange('open', 'closed'), { value: 'closed' });
    assert.deepEqual(checkActionStatusChange('on-progress', 'closed'), { value: 'closed' });
    for (const [from, to] of [['closed', 'open'], ['closed', 'on-progress'], ['on-progress', 'open'], ['open', 'open'], ['closed', 'closed']]) {
        assert.deepEqual(checkActionStatusChange(from, to), { error: 'NOT_FORWARD' }, `${from}->${to}`);
    }
    for (const to of ['OPEN', 'ON_PROGRESS', 'done', '', null, undefined, 1, ['closed']]) {
        assert.deepEqual(checkActionStatusChange('open', to), { error: 'INVALID' }, JSON.stringify(to));
    }
});

// ---- service ----

test('pemilik memajukan status: open -> on-progress -> closed; tanpa foto; status inspeksi tidak berubah', async () => {
    const first = await correctiveActionService.changeActionStatus('INS-001', 101, 'on-progress', owner);
    assert.equal(first.ok, true, first.reason);
    assert.equal(first.data.action.status, 'on-progress');
    assert.equal((await correctiveActionService.changeActionStatus('INS-001', '101', 'closed', owner)).ok, true);
    assert.equal(await statusOf(101), 'closed');
    const inspection = await inspectionFake.findById('INS-001');
    assert.deepEqual([inspection.status, inspection.currentApprovalStage], ['in_review', 'koordinator_k3l']);
});

test('mundur / reopen / nilai asing ditolak, status tidak berubah', async () => {
    assert.equal((await correctiveActionService.changeActionStatus('INS-001', 103, 'open', owner)).reason, CE.ACTION_STATUS_NOT_FORWARD);
    assert.equal((await correctiveActionService.changeActionStatus('INS-001', 102, 'open', owner)).reason, CE.ACTION_STATUS_NOT_FORWARD);
    assert.equal((await correctiveActionService.changeActionStatus('INS-001', 101, 'selesai', owner)).reason, CE.ACTION_STATUS_INVALID);
    assert.deepEqual([await statusOf(101), await statusOf(102), await statusOf(103)], ['open', 'on-progress', 'closed']);
});

test('bukan pemilik -> FORBIDDEN/NOT_FOUND; tindakan tidak ada / milik inspeksi lain -> NOT_FOUND', async () => {
    assert.equal((await correctiveActionService.changeActionStatus('INS-001', 101, 'closed', otherOfficer)).reason, CE.FORBIDDEN, 'SO lain melihat IN_REVIEW');
    assert.equal((await correctiveActionService.changeActionStatus('INS-001', 101, 'closed', coordinator)).reason, CE.FORBIDDEN, 'Koordinator plant-nya');
    assert.equal((await correctiveActionService.changeActionStatus('INS-001', 101, 'closed', admin)).reason, CE.FORBIDDEN);
    assert.equal((await correctiveActionService.changeActionStatus('INS-404', 101, 'closed', owner)).reason, CE.NOT_FOUND);
    assert.equal((await correctiveActionService.changeActionStatus('INS-001', 999, 'closed', owner)).reason, CE.NOT_FOUND);
    assert.equal(await statusOf(101), 'open');
});

test('inspeksi COMPLETED: tindakan terkunci (INSPECTION_COMPLETED), juga untuk pemilik', async () => {
    seed('completed');
    assert.equal((await correctiveActionService.changeActionStatus('INS-001', 101, 'closed', owner)).reason, CE.INSPECTION_COMPLETED);
    assert.equal(await statusOf(101), 'open');
});
