/* approval.spec.js — Phase 14.1-G: APPROVAL #9-12, diperbarui Phase 17.2
 * (tiga tahap berkode string, riwayat append-only, alasan penolakan wajib,
 * wewenang lewat domain/inspection-policy.js).
 *
 * Setiap test membuat inspeksi fixture-nya SENDIRI lewat API (support/api.js)
 * — tidak ada test yang bergantung pada inspeksi buatan test lain. Fixture
 * dibuat di plant 1, plant yang ditugaskan ke koordinator seed "dewi".
 */

import { test, expect } from '@playwright/test';
import { loginViaUi, goToTab } from './support/ui.js';
import { apiLogin, createInspectionFixture } from './support/api.js';

const API = 'http://project-sasa-she.test:3001/api';

async function openApprovalModalFor(page, inspectionId) {
    await goToTab(page, 'Inspeksi');
    const row = page.locator('#allInspeksiTable').getByRole('row', { name: inspectionId });
    await row.getByTestId('row-approve-btn').click();
    await expect(page.locator('#approvalModal')).toHaveClass(/show/);
}

/**
 * Membaca inspeksi lewat API dengan sesi `requestContext` (page.request milik
 * pengguna UI, atau context apiLogin()). Sejak Phase 17.3A server hanya
 * menyajikan inspeksi yang boleh dilihat sesi itu — setelah memutuskan,
 * penyetuju tidak lagi melihat inspeksinya, jadi hasil keputusan dibaca
 * sebagai pemiliknya (Safety Officer pembuat).
 */
async function fetchInspection(requestContext, inspectionId) {
    const res = await requestContext.get(`${API}/inspections/${inspectionId}`);
    expect(res.status(), 'inspeksi harus terlihat oleh sesi pembacanya').toBe(200);
    return res.json();
}

test('koordinator K3L plant yang bersangkutan bisa menyetujui tahapnya — tahap maju ke Manajer', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);

    await loginViaUi(page, 'dewi');
    await openApprovalModalFor(page, inspection.id);

    await page.locator('#approvalContent').getByRole('button', { name: /Setujui/ }).click();
    await expect(page.locator('#toastMessage')).toContainText('menyetujui inspeksi');

    const body = await fetchInspection(arif.context, inspection.id);
    expect(body.status).toBe('in_review');
    expect(body.currentApprovalStage).toBe('manajer');
    expect(body.approvalHistory).toHaveLength(1);
    expect(body.approvalHistory[0]).toMatchObject({ stage: 'koordinator_k3l', attempt: 1, decision: 'approved', reviewerName: 'Dewi' });
});

test('koordinator K3L bisa menolak dengan alasan — inspeksi perlu revisi, tahap tetap di Koordinator', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);

    await loginViaUi(page, 'dewi');
    await openApprovalModalFor(page, inspection.id);

    // Phase 17.3B: alasan wajib diisi lewat modal penolakan (menggantikan prompt()).
    await page.locator('#approvalContent').getByRole('button', { name: /Tolak/ }).click();
    const rejectModal = page.locator('#rejectModal');
    await expect(rejectModal).toHaveClass(/show/);

    // Alasan kosong ditolak di form, tanpa mengirim apa pun.
    await rejectModal.getByRole('button', { name: 'Tolak Inspeksi' }).click();
    await expect(page.locator('#toastMessage')).toContainText('Alasan penolakan wajib diisi');
    await expect(rejectModal).toHaveClass(/show/);

    await rejectModal.getByLabel(/Alasan penolakan/).fill('Foto area kurang jelas');
    await rejectModal.getByRole('button', { name: 'Tolak Inspeksi' }).click();
    await expect(page.locator('#toastMessage')).toContainText('menolak inspeksi');
    await expect(rejectModal).not.toHaveClass(/show/);

    const body = await fetchInspection(arif.context, inspection.id);
    expect(body.status).toBe('revision_required');
    expect(body.currentApprovalStage).toBe('koordinator_k3l');
    expect(body.approvalHistory[0]).toMatchObject({ stage: 'koordinator_k3l', decision: 'rejected', rejectionReason: 'Foto area kurang jelas' });
});

test('role yang tidak berwenang tidak bisa menyetujui — ditolak di UI DAN oleh server', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);

    // arif (safety_officer) — pembuat inspeksi, bukan tahap pengesahan. UI
    // sendiri belum menyembunyikan tombol berdasar role (UI Phase 17.3).
    await loginViaUi(page, 'arif');
    await openApprovalModalFor(page, inspection.id);

    await page.locator('#approvalContent').getByRole('button', { name: /Setujui/ }).click();
    await expect(page.locator('#toastMessage')).toContainText('tidak berwenang');

    // Pemeriksaan di browser bukan otorisasi: kirim langsung ke server dengan
    // sesi arif sendiri — server yang harus menolak.
    const { csrfToken } = await (await page.request.get(`${API}/auth/me`)).json();
    const direct = await page.request.post(`${API}/inspections/${inspection.id}/approve`, {
        headers: { 'X-CSRF-Token': csrfToken },
        data: { stageId: 'koordinator_k3l' },
    });
    expect(direct.status()).toBe(403);

    const body = await fetchInspection(page.request, inspection.id);
    expect(body.approvalHistory, 'tetap belum ada keputusan — permintaan sungguhan ditolak server').toHaveLength(0);
    expect(body.currentApprovalStage).toBe('koordinator_k3l');
});

test('alur pengesahan tidak bisa dilompati lewat UI — hanya tahap yang sedang berjalan yang punya tombol aksi', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);

    await loginViaUi(page, 'dewi');
    await openApprovalModalFor(page, inspection.id);

    const approveButtons = page.locator('#approvalContent').getByRole('button', { name: /Setujui/ });
    await expect(approveButtons, 'hanya SATU tombol setujui — tahap Manajer dan Ketua belum menawarkan aksi apa pun').toHaveCount(1);
    await expect(approveButtons.first()).toHaveAttribute('data-stage', 'koordinator_k3l');
});
