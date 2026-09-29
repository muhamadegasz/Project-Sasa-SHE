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
import { buildDecisionRecord, isStageApproved, latestDecision, nextAttempt, totalStages } from '../../src/domain/approval-rules.js';
import { SIGNATURE_EXTENSIONS, SIGNATURE_MAX_BYTES, checkSignature } from '../../src/domain/signature-rules.js';
import { detectImageType } from '../../src/presentation/components/signature-pad.js';
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
// Visibilitas lewat riwayat persetujuan — hak baca, bukan hak memutuskan
// =========================================================================

function decided(stage, reviewer, decision = 'approved') {
    return { stage, attempt: 1, decision, reviewerUserId: reviewer ? reviewer.id : null };
}

function assertReadOnly(user, item, label) {
    assert.ok(canView(user, item), `${label}: terlihat`);
    for (const [name, rule] of Object.entries({ canApprove, canReject, canEdit, canSubmit, canDelete, canEditCorrectiveAction })) {
        assert.equal(rule(user, item), false, `${label}: ${name} harus false`);
    }
}

test('riwayat: Koordinator yang menyetujui tetap melihat setelah tahap pindah, direvisi, atau selesai — tanpa hak memutuskan', () => {
    const approvalHistory = [decided(KOORDINATOR_K3L, koordinatorPlant1)];
    for (const [label, state] of [
        ['tahap Manajer', { status: IN_REVIEW, currentApprovalStage: MANAJER }],
        ['tahap Ketua', { status: IN_REVIEW, currentApprovalStage: KETUA_P2K3 }],
        ['ditolak Manajer', { status: REVISION_REQUIRED, currentApprovalStage: MANAJER }],
        ['selesai', { status: COMPLETED, currentApprovalStage: null }],
    ]) {
        assertReadOnly(koordinatorPlant1, inspection({ ...state, approvalHistory }), label);
    }
});

test('riwayat: Manajer yang menyetujui tetap melihat di tahap Ketua dan saat ditolak Ketua; Ketua tetap satu-satunya yang memutuskan', () => {
    const approvalHistory = [decided(KOORDINATOR_K3L, koordinatorPlant1), decided(MANAJER, manajer)];
    const atKetua = inspection({ currentApprovalStage: KETUA_P2K3, approvalHistory });
    assertReadOnly(manajer, atKetua, 'tahap Ketua');
    assert.ok(canApprove(ketua, atKetua), 'Ketua tetap berwenang atas tahapnya');
    assertReadOnly(manajer, inspection({
        status: REVISION_REQUIRED, currentApprovalStage: KETUA_P2K3,
        approvalHistory: [...approvalHistory, decided(KETUA_P2K3, ketua, 'rejected')],
    }), 'ditolak Ketua');
});

test('riwayat: hanya persetujuan MILIKNYA di tahap role-nya — bukan peninjau lain, bukan penolakan, bukan tahap lain', () => {
    const koordinatorLainPlant1 = { id: 11, role: ROLE.KOORDINATOR_K3L, plantId: 1 };
    const manajerLain = { id: 12, role: ROLE.MANAJER_BAGIAN };
    const atKetua = inspection({ currentApprovalStage: KETUA_P2K3, approvalHistory: [decided(KOORDINATOR_K3L, koordinatorPlant1), decided(MANAJER, manajer)] });
    assert.equal(canView(koordinatorLainPlant1, atKetua), false, 'Koordinator lain di plant yang sama');
    assert.equal(canView(manajerLain, atKetua), false, 'Manajer lain');

    const rejectedByManajer = inspection({ status: REVISION_REQUIRED, currentApprovalStage: MANAJER, approvalHistory: [decided(MANAJER, manajer, 'rejected')] });
    assert.equal(canView(manajer, rejectedByManajer), false, 'penolakan tidak memberi hak lihat');

    // Mis. akun yang dulu Koordinator lalu dijadikan Manajer: persetujuan tahap Koordinator tidak dihitung.
    const formerKoordinator = { id: koordinatorPlant1.id, role: ROLE.MANAJER_BAGIAN };
    assert.equal(canView(formerKoordinator, inspection({ currentApprovalStage: KETUA_P2K3, approvalHistory: [decided(KOORDINATOR_K3L, koordinatorPlant1)] })), false);

    // Safety Officer dan Admin tidak mendapat kriteria riwayat.
    assert.equal(canView(otherOfficer, inspection({ status: REVISION_REQUIRED, currentApprovalStage: MANAJER, approvalHistory: [decided(KOORDINATOR_K3L, otherOfficer)] })), false);
});

test('riwayat: gagal-tertutup — plant yang sudah bukan miliknya, tanpa plant, penyetuju NULL, riwayat tidak ada, DRAFT', () => {
    const approvalHistory = [decided(KOORDINATOR_K3L, koordinatorPlant1)];
    const atManajer = inspection({ plantId: 1, currentApprovalStage: MANAJER, approvalHistory });
    assert.equal(canView({ ...koordinatorPlant1, plantId: 9 }, atManajer), false, 'dipindah ke plant lain');
    assert.equal(canView({ ...koordinatorPlant1, plantId: null }, atManajer), false, 'tanpa plant');
    assert.equal(canView(manajer, inspection({ currentApprovalStage: KETUA_P2K3, approvalHistory: [decided(MANAJER, null)] })), false, 'penyetuju lama/terhapus (NULL)');
    assert.equal(canView({ id: null, role: ROLE.MANAJER_BAGIAN }, inspection({ currentApprovalStage: KETUA_P2K3, approvalHistory: [decided(MANAJER, null)] })), false, 'pengguna tanpa id');
    assert.equal(canView(koordinatorPlant1, { ...atManajer, approvalHistory: undefined }), false, 'riwayat tidak ada');
    assert.equal(canView(koordinatorPlant1, inspection({ status: DRAFT, currentApprovalStage: null, approvalHistory })), false, 'DRAFT');
});

// =========================================================================
// Kepemilikan vs visibilitas (Phase 17.3B)
// =========================================================================

test('kepemilikan: tindakan perbaikan hanya pemilik — SO lain yang BISA melihat tetap tidak boleh', () => {
    const inReview = inspection({ status: IN_REVIEW });
    assert.ok(canView(otherOfficer, inReview), 'SO lain melihat IN_REVIEW');
    assert.equal(canEditCorrectiveAction(otherOfficer, inReview), false, '...tapi tidak boleh menambah tindakan');
    assert.equal(isOwningOfficer(otherOfficer, inReview), false);
    for (const status of [DRAFT, IN_REVIEW, REVISION_REQUIRED]) {
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

test('tindakan perbaikan: COMPLETED final — pemilik pun hanya-baca; SO lain tetap hanya-lihat di setiap status', () => {
    const completed = inspection({ status: COMPLETED, currentApprovalStage: null });
    assert.ok(canView(officer, completed));
    assert.equal(canEditCorrectiveAction(officer, completed), false, 'pemilik, COMPLETED');
    assert.ok(isOwningOfficer(officer, completed), 'tetap pemilik — hanya statusnya yang final');
    for (const status of [DRAFT, IN_REVIEW, REVISION_REQUIRED, COMPLETED]) {
        assert.equal(canEditCorrectiveAction(otherOfficer, inspection({ status })), false, `SO lain, ${status}`);
    }
});

// =========================================================================
// Phase 17.4A — aturan tanda tangan (domain/signature-rules.js)
// =========================================================================

const sig = (overrides = {}) => ({ method: 'upload', mimeType: 'image/png', size: 2048, file: 'bytes', ...overrides });

test('tanda tangan: UPLOAD menerima PNG dan JPEG; CANVAS menerima PNG saja', () => {
    assert.equal(checkSignature(sig()).value.mimeType, 'image/png');
    assert.equal(checkSignature(sig({ mimeType: 'image/jpeg' })).value.method, 'upload');
    assert.equal(checkSignature(sig({ method: 'canvas' })).value.method, 'canvas');
    assert.equal(checkSignature(sig({ method: 'canvas', mimeType: 'image/jpeg' })).error, 'CONTENT_INVALID', 'CANVAS selalu PNG');
});

test('tanda tangan: metode di luar UPLOAD/CANVAS ditolak METHOD_INVALID', () => {
    for (const method of ['draw', 'image', 'electronic', 'digital', 'typed', 'UPLOAD', 'Canvas', '', undefined, null, 1, ['upload'], { toString: () => 'upload' }, 'toString', '__proto__']) {
        assert.equal(checkSignature(sig({ method })).error, 'METHOD_INVALID', String(method));
    }
});

test('tanda tangan: format selain PNG/JPEG (hasil deteksi isi) ditolak CONTENT_INVALID', () => {
    for (const mimeType of [null, undefined, 'image/gif', 'image/webp', 'image/svg+xml', 'text/html', 'application/pdf', 'image/*']) {
        assert.equal(checkSignature(sig({ mimeType })).error, 'CONTENT_INVALID', String(mimeType));
    }
});

test('tanda tangan: tidak ada / tanpa berkas -> REQUIRED; berkas kosong -> CONTENT_INVALID', () => {
    assert.equal(checkSignature(undefined).error, 'REQUIRED');
    assert.equal(checkSignature(null).error, 'REQUIRED');
    assert.equal(checkSignature({ method: 'upload' }).error, 'REQUIRED', 'metode tanpa berkas');
    assert.equal(checkSignature(sig({ file: null })).error, 'REQUIRED');
    assert.equal(checkSignature(sig({ size: 0 })).error, 'CONTENT_INVALID');
});

test('tanda tangan: batas ukuran 1 MB — tepat di batas diterima, lebih 1 byte ditolak TOO_LARGE', () => {
    assert.equal(SIGNATURE_MAX_BYTES, 1024 * 1024);
    assert.ok(checkSignature(sig({ size: SIGNATURE_MAX_BYTES })).value);
    assert.equal(checkSignature(sig({ size: SIGNATURE_MAX_BYTES + 1 })).error, 'TOO_LARGE');
});

test('tanda tangan: ekstensi tersimpan diturunkan dari format hasil deteksi', () => {
    assert.deepEqual(SIGNATURE_EXTENSIONS, { 'image/png': '.png', 'image/jpeg': '.jpg' });
});

test('buildDecisionRecord: metode tanda tangan hanya melekat pada persetujuan', () => {
    const stage = APPROVAL_STAGES[0];
    const base = inspection({ approvalHistory: [] });
    assert.equal(buildDecisionRecord(base, stage, 'approved', koordinatorPlant1, null, 'canvas').signatureMethod, 'canvas');
    assert.equal(buildDecisionRecord(base, stage, 'rejected', koordinatorPlant1, 'alasan', 'canvas').signatureMethod, null);
});

test('detectImageType (browser): PNG/JPEG dari byte awal; lainnya null — tidak memakai nama/tipe berkas', () => {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
    const jpeg = [0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1];
    assert.equal(detectImageType(new Uint8Array(png)), 'image/png');
    assert.equal(detectImageType(new Uint8Array(jpeg)), 'image/jpeg');
    for (const [label, text] of [['GIF', 'GIF89a......'], ['WEBP', 'RIFF....WEBP'], ['SVG', '<svg xmlns="'], ['HTML', '<!doctype ht']]) {
        assert.equal(detectImageType(new TextEncoder().encode(text)), null, label);
    }
    assert.equal(detectImageType(new Uint8Array(png.slice(0, 8))), null, 'terlalu pendek');
    assert.equal(detectImageType(null), null);
});
