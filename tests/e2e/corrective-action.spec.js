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

test('Safety Officer lain melihat timeline tanpa tombol ubah status', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);

    await loginViaUi(page, 'tulus');
    await expect(page.locator('#statTotalInspeksi')).not.toHaveText('0', { timeout: 10_000 });
    await openPerbaikan(page, inspection.id);
    await expect(page.locator('#modalContent [data-testid="perbaikan-item"]').first()).toBeVisible();
    await expect(page.locator('#modalContent').getByTestId('action-status-btn')).toHaveCount(0);
    await expect(page.getByTestId('perbaikan-view-only')).toBeVisible();
    await arif.context.dispose();
});
