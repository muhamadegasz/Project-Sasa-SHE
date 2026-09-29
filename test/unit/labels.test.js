/* labels.test.js — label role di header (shared/labels.js formatUserRole). */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROLE } from '../../src/config/constants.js';
import { formatInspectionStatusDetail, formatRole, formatUserRole } from '../../src/shared/labels.js';

test('label role: istilah yang sama untuk header dan pengelolaan akun', () => {
    assert.equal(formatRole(ROLE.SAFETY_OFFICER), 'Safety Officer');
    assert.equal(formatRole(ROLE.KOORDINATOR_K3L), 'Koordinator K3L');
    assert.equal(formatRole(ROLE.MANAJER_BAGIAN), 'Manajer Bagian');
    assert.equal(formatRole(ROLE.KETUA_P2K3), 'Ketua P2K3');
    assert.equal(formatRole(ROLE.ADMIN), 'Administrator');
});

test('role di header: plant hanya untuk Koordinator K3L', () => {
    assert.equal(formatUserRole({ role: ROLE.KOORDINATOR_K3L, plantId: 8 }, 'IT'), 'Koordinator K3L · IT');
    assert.equal(formatUserRole({ role: ROLE.KOORDINATOR_K3L, plantId: 8 }), 'Koordinator K3L', 'nama plant belum/tidak tersedia');
    for (const role of [ROLE.SAFETY_OFFICER, ROLE.MANAJER_BAGIAN, ROLE.KETUA_P2K3, ROLE.ADMIN]) {
        assert.equal(formatUserRole({ role, plantId: 8 }, 'IT'), formatRole(role), `${role} tidak menampilkan plant`);
    }
});

test('keterangan status: Dalam Review menyebut tahap yang ditunggu (currentApprovalStage); Perlu Revisi menunggu Safety Officer; lainnya kosong', () => {
    assert.equal(formatInspectionStatusDetail({ status: 'in_review', currentApprovalStage: 'koordinator_k3l' }), 'Menunggu Koordinator K3L Bagian');
    assert.equal(formatInspectionStatusDetail({ status: 'in_review', currentApprovalStage: 'manajer' }), 'Menunggu Manajer Bagian');
    assert.equal(formatInspectionStatusDetail({ status: 'in_review', currentApprovalStage: 'ketua_p2k3' }), 'Menunggu Ketua P2K3');
    assert.equal(formatInspectionStatusDetail({ status: 'revision_required', currentApprovalStage: 'manajer' }), 'Menunggu revisi Safety Officer');
    assert.equal(formatInspectionStatusDetail({ status: 'completed', currentApprovalStage: null }), '');
    assert.equal(formatInspectionStatusDetail({ status: 'draft', currentApprovalStage: null }), '');
    assert.equal(formatInspectionStatusDetail({ status: 'in_review', currentApprovalStage: 'tidak_dikenal' }), '', 'tahap tak dikenal: tanpa keterangan, bukan tebakan');
});
