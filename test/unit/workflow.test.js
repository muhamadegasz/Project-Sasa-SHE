/* workflow.test.js — Phase 17.2: aturan alur kerja, tahap pengesahan, cakupan
 * plant, dan wewenang (domain/workflow-rules.js, approval-rules.js,
 * inspection-policy.js). Fungsi domain murni — tanpa repository, tanpa fake.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { APPROVAL_STAGE, APPROVAL_STAGES, ROLE } from '../../src/config/constants.js';
import { INSPECTION_STATUS } from '../../src/domain/statuses.js';
import {
    approvedState, canTransition, firstStageId, nextStageId, rejectedState, submittedState,
} from '../../src/domain/workflow-rules.js';
import { isStageApproved, latestDecision, nextAttempt, totalStages } from '../../src/domain/approval-rules.js';
import {
    canApprove, canDelete, canDeleteDraft, canEdit, canEditCorrectiveAction, canReject, canRevise, canSubmit, canView,
    isOwningOfficer,
} from '../../src/domain/inspection-policy.js';

const { DRAFT, IN_REVIEW, REVISION_REQUIRED, COMPLETED } = INSPECTION_STATUS;
const { KOORDINATOR_K3L, MANAJER, KETUA_P2K3 } = APPROVAL_STAGE;

const officer = { id: 1, role: ROLE.SAFETY_OFFICER };
const otherOfficer = { id: 2, role: ROLE.SAFETY_OFFICER };
const koordinatorPlant1 = { id: 5, role: ROLE.KOORDINATOR_K3L, plantId: 1 };
const koordinatorPlant9 = { id: 6, role: ROLE.KOORDINATOR_K3L, plantId: 9 };
const koordinatorNoPlant = { id: 9, role: ROLE.KOORDINATOR_K3L, plantId: null };
const manajer = { id: 7, role: ROLE.MANAJER_BAGIAN, plantId: null };
const ketua = { id: 8, role: ROLE.KETUA_P2K3 };
const admin = { id: 10, role: ROLE.ADMIN };

function inspection(overrides = {}) {
    return { id: 'INS-001', plantId: 1, petugasUserId: officer.id, status: IN_REVIEW, currentApprovalStage: KOORDINATOR_K3L, approvalHistory: [], ...overrides };
}

// =========================================================================
// Tahap pengesahan
// =========================================================================

test('tahap: tepat tiga, urut Koordinator -> Manajer -> Ketua, Safety Officer bukan tahap', () => {
    assert.deepEqual(APPROVAL_STAGES.map((stage) => stage.id), [KOORDINATOR_K3L, MANAJER, KETUA_P2K3]);
    assert.equal(totalStages(), 3);
    assert.ok(!APPROVAL_STAGES.some((stage) => stage.role === ROLE.SAFETY_OFFICER), 'Safety Officer bukan pemilik tahap mana pun');
    assert.ok(!APPROVAL_STAGES.some((stage) => stage.role === ROLE.ADMIN), 'Admin bukan pemilik tahap mana pun');
});

test('tahap: Koordinator -> Manajer -> Ketua -> selesai (null)', () => {
    assert.equal(firstStageId(), KOORDINATOR_K3L);
    assert.equal(nextStageId(KOORDINATOR_K3L), MANAJER);
    assert.equal(nextStageId(MANAJER), KETUA_P2K3);
    assert.equal(nextStageId(KETUA_P2K3), null);
});

// =========================================================================
// Transisi status
// =========================================================================

test('transisi sah: DRAFT -> IN_REVIEW, IN_REVIEW -> REVISION_REQUIRED/COMPLETED, REVISION_REQUIRED -> IN_REVIEW', () => {
    assert.ok(canTransition(DRAFT, IN_REVIEW));
    assert.ok(canTransition(IN_REVIEW, REVISION_REQUIRED));
    assert.ok(canTransition(IN_REVIEW, COMPLETED));
    assert.ok(canTransition(REVISION_REQUIRED, IN_REVIEW));
});

test('transisi tidak sah ditolak', () => {
    for (const [from, to] of [
        [DRAFT, COMPLETED], [DRAFT, REVISION_REQUIRED], [COMPLETED, IN_REVIEW], [COMPLETED, DRAFT],
        [REVISION_REQUIRED, COMPLETED], [IN_REVIEW, DRAFT], ['submitted', IN_REVIEW],
    ]) {
        assert.equal(canTransition(from, to), false, `${from} -> ${to} harus ditolak`);
    }
});

test('submit: DRAFT -> IN_REVIEW di tahap Koordinator; tidak ada status SUBMITTED', () => {
    assert.deepEqual(submittedState({ status: DRAFT, currentApprovalStage: null }), { status: IN_REVIEW, currentApprovalStage: KOORDINATOR_K3L });
    assert.ok(!Object.values(INSPECTION_STATUS).includes('submitted'));
});

test('submit ulang setelah revisi kembali ke tahap YANG MENOLAK, bukan ke Koordinator', () => {
    assert.deepEqual(submittedState({ status: REVISION_REQUIRED, currentApprovalStage: KETUA_P2K3 }), { status: IN_REVIEW, currentApprovalStage: KETUA_P2K3 });
    assert.deepEqual(submittedState({ status: REVISION_REQUIRED, currentApprovalStage: MANAJER }), { status: IN_REVIEW, currentApprovalStage: MANAJER });
});

test('submit tidak sah dari IN_REVIEW atau COMPLETED', () => {
    assert.equal(submittedState({ status: IN_REVIEW, currentApprovalStage: MANAJER }), null);
    assert.equal(submittedState({ status: COMPLETED, currentApprovalStage: null }), null);
});

test('approve: maju ke tahap berikutnya; approve tahap terakhir -> COMPLETED', () => {
    assert.deepEqual(approvedState(inspection({ currentApprovalStage: KOORDINATOR_K3L })), { status: IN_REVIEW, currentApprovalStage: MANAJER });
    assert.deepEqual(approvedState(inspection({ currentApprovalStage: MANAJER })), { status: IN_REVIEW, currentApprovalStage: KETUA_P2K3 });
    assert.deepEqual(approvedState(inspection({ currentApprovalStage: KETUA_P2K3 })), { status: COMPLETED, currentApprovalStage: null });
});

test('reject: -> REVISION_REQUIRED dan tahap TETAP (tidak mundur ke awal)', () => {
    assert.deepEqual(rejectedState(inspection({ currentApprovalStage: MANAJER })), { status: REVISION_REQUIRED, currentApprovalStage: MANAJER });
    assert.deepEqual(rejectedState(inspection({ currentApprovalStage: KETUA_P2K3 })), { status: REVISION_REQUIRED, currentApprovalStage: KETUA_P2K3 });
});

test('approve/reject tidak sah di luar IN_REVIEW', () => {
    for (const status of [DRAFT, REVISION_REQUIRED, COMPLETED]) {
        assert.equal(approvedState(inspection({ status })), null, `approve dari ${status}`);
        assert.equal(rejectedState(inspection({ status })), null, `reject dari ${status}`);
    }
});

// =========================================================================
// Riwayat append-only
// =========================================================================

test('riwayat: attempt bertambah per tahap, keputusan terakhir menentukan, persetujuan lama tetap', () => {
    const item = inspection({
        currentApprovalStage: KETUA_P2K3,
        approvalHistory: [
            { stage: KOORDINATOR_K3L, attempt: 1, decision: 'approved' },
            { stage: MANAJER, attempt: 1, decision: 'approved' },
            { stage: KETUA_P2K3, attempt: 1, decision: 'rejected', rejectionReason: 'x' },
        ],
    });
    assert.equal(nextAttempt(item, KETUA_P2K3), 2);
    assert.equal(nextAttempt(item, KOORDINATOR_K3L), 2);
    assert.equal(latestDecision(item, KETUA_P2K3).decision, 'rejected');
    assert.ok(isStageApproved(item, KOORDINATOR_K3L), 'persetujuan Koordinator tetap sah setelah Ketua menolak');
    assert.ok(isStageApproved(item, MANAJER), 'persetujuan Manajer tetap sah setelah Ketua menolak');
    assert.equal(isStageApproved(item, KETUA_P2K3), false);
});

// =========================================================================
// Cakupan plant Koordinator K3L
// =========================================================================

test('plant: koordinator boleh memutuskan inspeksi di plant-nya', () => {
    assert.ok(canApprove(koordinatorPlant1, inspection({ plantId: 1 })));
    assert.ok(canReject(koordinatorPlant1, inspection({ plantId: 1 })));
    assert.ok(canView(koordinatorPlant1, inspection({ plantId: 1 })));
});

test('plant: koordinator TIDAK boleh melihat/memutuskan inspeksi plant lain', () => {
    const otherPlant = inspection({ plantId: 1 });
    assert.equal(canApprove(koordinatorPlant9, otherPlant), false);
    assert.equal(canReject(koordinatorPlant9, otherPlant), false);
    assert.equal(canView(koordinatorPlant9, otherPlant), false);
    assert.equal(canView(koordinatorPlant9, inspection({ plantId: 1, status: COMPLETED, currentApprovalStage: null })), false);
});

test('plant: koordinator tanpa plant tidak punya cakupan apa pun (gagal-tertutup)', () => {
    assert.equal(canApprove(koordinatorNoPlant, inspection({ plantId: 1 })), false);
    assert.equal(canView(koordinatorNoPlant, inspection({ plantId: 1 })), false);
});

test('plant: Manajer tidak dibatasi cakupan plant Koordinator', () => {
    for (const plantId of [1, 9, 14]) {
        assert.ok(canApprove(manajer, inspection({ plantId, currentApprovalStage: MANAJER })), `plant ${plantId}`);
    }
});

// =========================================================================
// Wewenang per role
// =========================================================================

test('role: Safety Officer tidak bisa menyetujui tahap mana pun, walau pemilik', () => {
    for (const stage of [KOORDINATOR_K3L, MANAJER, KETUA_P2K3]) {
        assert.equal(canApprove(officer, inspection({ currentApprovalStage: stage })), false);
        assert.equal(canReject(officer, inspection({ currentApprovalStage: stage })), false);
    }
});

test('role: Koordinator tidak bisa menyetujui inspeksi di tahap Manajer', () => {
    assert.equal(canApprove(koordinatorPlant1, inspection({ currentApprovalStage: MANAJER })), false);
});

test('role: Manajer tidak bisa menyetujui inspeksi di tahap Koordinator', () => {
    assert.equal(canApprove(manajer, inspection({ currentApprovalStage: KOORDINATOR_K3L })), false);
});

test('role: Ketua tidak bisa menyetujui inspeksi di tahap Manajer', () => {
    assert.equal(canApprove(ketua, inspection({ currentApprovalStage: MANAJER })), false);
    assert.ok(canApprove(ketua, inspection({ currentApprovalStage: KETUA_P2K3 })));
});

test('role: Admin bukan tahap pengesahan — tidak bisa menyetujui/menolak di tahap mana pun', () => {
    for (const stage of [KOORDINATOR_K3L, MANAJER, KETUA_P2K3]) {
        assert.equal(canApprove(admin, inspection({ currentApprovalStage: stage })), false);
        assert.equal(canReject(admin, inspection({ currentApprovalStage: stage })), false);
    }
});

test('role: pemilik tahap pun tidak bisa memutuskan di luar IN_REVIEW', () => {
    assert.equal(canApprove(manajer, inspection({ status: REVISION_REQUIRED, currentApprovalStage: MANAJER })), false);
    assert.equal(canApprove(ketua, inspection({ status: COMPLETED, currentApprovalStage: null })), false);
    assert.equal(canApprove(koordinatorPlant1, inspection({ status: DRAFT, currentApprovalStage: null })), false);
});

// =========================================================================
// Draft, revisi, visibilitas, hapus
// =========================================================================

test('draft: hanya Safety Officer pemiliknya yang bisa edit/submit/hapus', () => {
    const draft = inspection({ status: DRAFT, currentApprovalStage: null });
    assert.ok(canEdit(officer, draft));
    assert.ok(canSubmit(officer, draft));
    assert.ok(canDelete(officer, draft));
    for (const user of [otherOfficer, koordinatorPlant1, manajer, ketua, admin]) {
        assert.equal(canEdit(user, draft), false, `${user.role} ${user.id} tidak boleh edit`);
        assert.equal(canSubmit(user, draft), false, `${user.role} ${user.id} tidak boleh submit`);
    }
    assert.equal(canEdit(officer, inspection({ status: IN_REVIEW })), false, 'setelah submit tidak bisa diedit');
});

test('revisi: hanya pemilik, hanya saat REVISION_REQUIRED', () => {
    const revision = inspection({ status: REVISION_REQUIRED, currentApprovalStage: MANAJER });
    assert.ok(canRevise(officer, revision));
    assert.ok(canSubmit(officer, revision));
    assert.equal(canRevise(otherOfficer, revision), false);
    assert.equal(canRevise(officer, inspection({ status: IN_REVIEW })), false);
});

test('visibilitas: draft Safety Officer privat — bahkan dari Admin dan role lebih tinggi', () => {
    const draft = inspection({ status: DRAFT, currentApprovalStage: null });
    assert.ok(canView(officer, draft));
    for (const user of [otherOfficer, koordinatorPlant1, manajer, ketua, admin]) {
        assert.equal(canView(user, draft), false, `${user.role} ${user.id}`);
    }
});

test('visibilitas: Safety Officer lain melihat IN_REVIEW/COMPLETED, bukan REVISION_REQUIRED', () => {
    assert.ok(canView(otherOfficer, inspection({ status: IN_REVIEW })));
    assert.ok(canView(otherOfficer, inspection({ status: COMPLETED, currentApprovalStage: null })));
    assert.equal(canView(otherOfficer, inspection({ status: REVISION_REQUIRED, currentApprovalStage: MANAJER })), false);
    assert.ok(canView(officer, inspection({ status: REVISION_REQUIRED, currentApprovalStage: MANAJER })), 'pemilik tetap melihat');
});

test('visibilitas: Manajer/Ketua hanya tahapnya sendiri + yang selesai', () => {
    assert.ok(canView(manajer, inspection({ currentApprovalStage: MANAJER })));
    assert.equal(canView(manajer, inspection({ currentApprovalStage: KOORDINATOR_K3L })), false);
    assert.ok(canView(ketua, inspection({ currentApprovalStage: KETUA_P2K3 })));
    assert.equal(canView(ketua, inspection({ currentApprovalStage: MANAJER })), false);
    assert.ok(canView(ketua, inspection({ status: COMPLETED, currentApprovalStage: null, plantId: 14 })));
});

test('Admin: melihat semua non-draft, boleh menghapus termasuk yang IN_REVIEW, bukan draft', () => {
    assert.ok(canView(admin, inspection({ status: REVISION_REQUIRED, currentApprovalStage: MANAJER })));
    assert.ok(canDelete(admin, inspection({ status: IN_REVIEW })));
    assert.ok(canDelete(admin, inspection({ status: COMPLETED, currentApprovalStage: null })));
    assert.equal(canDelete(admin, inspection({ status: DRAFT, currentApprovalStage: null })), false);
    assert.equal(canDelete(officer, inspection({ status: IN_REVIEW })), false, 'Safety Officer tidak menghapus setelah submit');
});

// =========================================================================
// Kepemilikan vs visibilitas (Phase 17.3B)
// =========================================================================

test('kepemilikan: tindakan perbaikan hanya pemilik — SO lain yang BISA melihat tetap tidak boleh', () => {
    const inReview = inspection({ status: IN_REVIEW });
    assert.ok(canView(otherOfficer, inReview), 'SO lain melihat IN_REVIEW');
    assert.equal(canEditCorrectiveAction(otherOfficer, inReview), false, '...tapi tidak boleh menambah tindakan');
    assert.equal(isOwningOfficer(otherOfficer, inReview), false);
    for (const status of [DRAFT, IN_REVIEW, REVISION_REQUIRED, COMPLETED]) {
        assert.ok(canEditCorrectiveAction(officer, inspection({ status })), `pemilik, ${status}`);
    }
    for (const user of [koordinatorPlant1, manajer, ketua, admin]) {
        assert.equal(canEditCorrectiveAction(user, inReview), false, user.role);
    }
});

test('kepemilikan: Safety Officer dengan id sama tapi role lain bukan pemilik', () => {
    const impostor = { id: officer.id, role: ROLE.ADMIN };
    assert.equal(isOwningOfficer(impostor, inspection()), false);
    assert.equal(canEditCorrectiveAction(impostor, inspection()), false);
});

test('hapus draft: hanya pemilik & hanya DRAFT; Admin tidak (penghapusan Admin fase lain)', () => {
    const draft = inspection({ status: DRAFT, currentApprovalStage: null });
    assert.ok(canDeleteDraft(officer, draft));
    assert.equal(canDeleteDraft(otherOfficer, draft), false);
    assert.equal(canDeleteDraft(admin, draft), false);
    assert.equal(canDeleteDraft(officer, inspection({ status: IN_REVIEW })), false);
});
