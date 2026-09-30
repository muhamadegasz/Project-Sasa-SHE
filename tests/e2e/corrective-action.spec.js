/* corrective-action.spec.js — release: status tindakan perbaikan lewat UI.
 *
 * Pemilik memajukan status tindakan yang sudah ada (open -> on-progress ->
 * closed, tanpa foto); menambah progres (dengan foto) tetap bekerja; Safety
 * Officer lain hanya melihat. Setiap hasil dibuktikan lewat API.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from './support/test.js';
import { loginViaUi } from './support/ui.js';
import { apiLogin, createInspectionFixture } from './support/api.js';

const PHOTO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'e2e-foto-bukti.jpg');

async function openPerbaikan(page, inspectionId) {
    await page.locator('#inspeksiTableBody').getByRole('row', { name: inspectionId })
        .locator('[data-action="openPerbaikanModal"]').click();
    await expect(page.locator('#perbaikanModal')).toHaveClass(/show/);
}

async function fetchInspection(session, inspectionId) {
    const res = await session.context.get(`/api/inspections/${inspectionId}`);
    expect(res.status()).toBe(200);
    return res.json();
}

test('pemilik memajukan status tindakan open -> on-progress -> closed tanpa foto; menambah progres dengan foto tetap bekerja; status inspeksi tidak berubah', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);
    const initialAction = (await fetchInspection(arif, inspection.id)).perbaikan[0];
    expect(initialAction.status).toBe('open');

    await loginViaUi(page, 'arif');
    await expect(page.locator('#statTotalInspeksi')).not.toHaveText('0', { timeout: 10_000 });
    await openPerbaikan(page, inspection.id);
    const item = () => page.locator(`#modalContent [data-testid="perbaikan-item"][data-action-id="${initialAction.id}"]`);

    // open: dua langkah maju yang boleh.
    await expect(item().getByTestId('action-status-btn')).toHaveCount(2);
    await item().locator('[data-status="on-progress"]').click();
    await expect(page.locator('#toastMessage')).toContainText('Status tindakan diubah');
    await expect(item().locator('.status-mini')).toHaveClass(/on-progress/);
    expect((await fetchInspection(arif, inspection.id)).perbaikan[0].status).toBe('on-progress');

    // on-progress: hanya closed; tidak ada jalan mundur.
    await expect(item().getByTestId('action-status-btn')).toHaveCount(1);
    await expect(item().locator('[data-status="open"]')).toHaveCount(0);
    await item().locator('[data-status="closed"]').click();
    await expect(item().locator('.status-mini')).toHaveClass(/closed/);
    await expect(item().getByTestId('action-status-btn')).toHaveCount(0);

    let saved = await fetchInspection(arif, inspection.id);
    expect(saved.perbaikan[0].status).toBe('closed');
    expect([saved.status, saved.currentApprovalStage]).toEqual(['in_review', 'koordinator_k3l']);

    // Menambah progres (dengan foto) masih bekerja seperti sebelumnya.
    await page.locator('#newAction').fill('Pemasangan pelindung kabel');
    await page.locator('#newStatus').selectOption('on-progress');
    await page.locator('#newFoto').setInputFiles(PHOTO);
    await page.locator('#modalContent').getByRole('button', { name: /Tambah Progres/ }).click();
    await expect(page.locator('#modalContent [data-testid="perbaikan-item"]')).toHaveCount(2);
    saved = await fetchInspection(arif, inspection.id);
    expect(saved.perbaikan.map((action) => [action.action, action.status])).toEqual([
        [initialAction.action, 'closed'], ['Pemasangan pelindung kabel', 'on-progress'],
    ]);
    expect(saved.perbaikan[1].foto).toHaveLength(1);
    await arif.context.dispose();
});

test('Safety Officer lain: tanpa tombol "Perbaikan & Progres" (Inspeksi Terbaru & halaman Perbaikan); server tetap menolak ubah status/tambah tindakan', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);
    const actionId = (await fetchInspection(arif, inspection.id)).perbaikan[0].id;

    await loginViaUi(page, 'tulus');
    await expect(page.locator('#statTotalInspeksi')).not.toHaveText('0', { timeout: 10_000 });
    const recent = page.locator('#inspeksiTableBody').getByRole('row', { name: inspection.id });
    await expect(recent.getByTestId('row-detail-btn')).toBeVisible();
    await expect(recent.locator('[data-action="openPerbaikanModal"]')).toHaveCount(0);

    await page.getByText('Perbaikan', { exact: true }).click();
    await page.locator('#searchPerbaikanInput').fill(inspection.id);
    const row = page.locator('#perbaikanTableBody tr', { has: page.locator('td:first-child', { hasText: inspection.id }) });
    await expect(row).toHaveCount(1);
    await expect(row.locator('[data-action="openDetailModal"]')).toBeVisible();
    await expect(row.getByTestId('perbaikan-open-btn')).toHaveCount(0);

    // Tampilan bukan otorisasi: kepemilikan tetap ditegakkan server.
    const tulus = await apiLogin('tulus');
    const put = await tulus.context.put(`/api/inspections/${inspection.id}/corrective-actions/${actionId}`, {
        headers: { 'X-CSRF-Token': tulus.csrfToken }, data: { status: 'on-progress' },
    });
    expect(put.status()).toBe(403);
    const post = await tulus.context.post(`/api/inspections/${inspection.id}/corrective-actions`, {
        headers: { 'X-CSRF-Token': tulus.csrfToken }, multipart: { action: 'Bukan milik saya', status: 'open', pic: 'Tulus' },
    });
    expect(post.status()).toBe(403);
    expect((await fetchInspection(arif, inspection.id)).perbaikan.map((action) => action.status)).toEqual(['open']);
    for (const session of [arif, tulus]) await session.context.dispose();
});
