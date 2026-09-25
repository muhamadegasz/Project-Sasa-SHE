/* approval.spec.js — Phase 14.1-G: APPROVAL #9-12.
 *
 * Setiap test membuat inspeksi fixture-nya SENDIRI lewat API (support/api.js)
 * — tidak ada test yang bergantung pada inspeksi buatan test lain.
 */

import { test, expect } from '@playwright/test';
import { loginViaUi, goToTab } from './support/ui.js';
import { apiLogin, createInspectionFixture } from './support/api.js';

async function openApprovalModalFor(page, inspectionId) {
    await goToTab(page, 'Inspeksi');
    const row = page.locator('#allInspeksiTable').getByRole('row', { name: inspectionId });
    await row.getByTestId('row-approve-btn').click();
    await expect(page.locator('#approvalModal')).toHaveClass(/show/);
}

test('koordinator K3L yang berwenang bisa menyetujui tahap 2', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);

    await loginViaUi(page, 'dewi');
    await openApprovalModalFor(page, inspection.id);

    await page.locator('#approvalContent').getByRole('button', { name: /Setujui/ }).click();
    await expect(page.locator('#toastMessage')).toContainText('menyetujui inspeksi');

    const check = await page.request.get(`http://project-sasa-she.test:3001/api/inspections/${inspection.id}`);
    const body = await check.json();
    expect(body.approvals['2'].approved).toBe(true);
    expect(body.approvals['2'].by).toBe('Dewi');
});

test('koordinator K3L yang berwenang bisa menolak tahap 2', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);

    await loginViaUi(page, 'dewi');
    await openApprovalModalFor(page, inspection.id);

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#approvalContent').getByRole('button', { name: /Tolak/ }).click();
    await expect(page.locator('#toastMessage')).toContainText('menolak inspeksi');

    const check = await page.request.get(`http://project-sasa-she.test:3001/api/inspections/${inspection.id}`);
    const body = await check.json();
    expect(body.status).toBe('tinjau');
    expect(body.approvals['2'].rejected).toBe(true);
});

test('role yang tidak berwenang tidak bisa menyetujui — server menolak walau tombol diklik di UI', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);

    // arif (safety_officer) login lagi lewat UI — pemilik tahap 2 adalah
    // koordinator_k3l, bukan safety_officer. UI sendiri tidak menyembunyikan
    // tombol berdasar role (hanya berdasar urutan tahap) — proteksi
    // sesungguhnya harus datang dari server.
    await loginViaUi(page, 'arif');
    await openApprovalModalFor(page, inspection.id);

    await page.locator('#approvalContent').getByRole('button', { name: /Setujui/ }).click();
    await expect(page.locator('#toastMessage')).toContainText('Terjadi kesalahan');

    const check = await page.request.get(`http://project-sasa-she.test:3001/api/inspections/${inspection.id}`);
    const body = await check.json();
    expect(body.approvals['2'].approved, 'tetap belum disetujui — permintaan sungguhan ditolak server, bukan cuma UI diam-diam berhasil').toBe(false);
});

test('alur pengesahan tidak bisa dilompati lewat UI — hanya tahap yang sedang berjalan yang punya tombol aksi', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);

    await loginViaUi(page, 'dewi');
    await openApprovalModalFor(page, inspection.id);

    const approveButtons = page.locator('#approvalContent').getByRole('button', { name: /Setujui/ });
    await expect(approveButtons, 'hanya SATU tombol setujui yang tersedia — tahap 3 dan 4 belum menawarkan aksi apa pun sebelum tahap 2 selesai').toHaveCount(1);
    await expect(approveButtons.first()).toHaveAttribute('data-stage', '2');
});
