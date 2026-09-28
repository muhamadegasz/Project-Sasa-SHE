/* approval-history.spec.js — release: seluruh attempt pengesahan per tahap.
 *
 * Koordinator menolak (beralasan) -> pemilik mengajukan ulang -> Koordinator
 * menyetujui. Riwayat tahap Koordinator harus menampilkan KEDUA attempt urut,
 * dengan alasan penolakan, di modal pengesahan dan modal detail. Data dibuat
 * lewat API sungguhan; tampilan hanya membaca riwayat append-only.
 */

import { test, expect } from './support/test.js';
import { loginViaUi, goToTab } from './support/ui.js';
import { apiLogin, approveViaApi, createInspectionFixture } from './support/api.js';

async function rejectViaApi(session, inspectionId, stageId, reason) {
    const res = await session.context.post(`/api/inspections/${inspectionId}/reject`, {
        headers: { 'X-CSRF-Token': session.csrfToken }, data: { stageId, reason },
    });
    expect(res.status(), await res.text()).toBe(200);
}

async function resubmitViaApi(session, inspectionId) {
    const res = await session.context.post(`/api/inspections/${inspectionId}/submit`, {
        headers: { 'X-CSRF-Token': session.csrfToken },
    });
    expect(res.status(), await res.text()).toBe(200);
}

const stageBlock = (container, title) => container.locator('.approval-stage', { has: container.page().locator('.stage-title', { hasText: title }) });

async function expectKoordinatorHistory(container, reason) {
    const koordinator = stageBlock(container, 'Koordinator K3L Bagian');
    const attempts = koordinator.getByTestId('stage-attempt');
    await expect(attempts).toHaveCount(2);
    await expect(attempts.nth(0)).toHaveAttribute('data-decision', 'rejected');
    await expect(attempts.nth(0)).toContainText('Percobaan 1');
    await expect(attempts.nth(0)).toContainText(`Alasan: ${reason}`);
    await expect(attempts.nth(1)).toHaveAttribute('data-decision', 'approved');
    await expect(attempts.nth(1)).toContainText('Percobaan 2');
    await expect(koordinator.locator('.stage-status')).toContainText('Disetujui');
    await expect(koordinator.getByTestId('stage-signature')).toHaveCount(1);
    // Tahap tanpa attempt yang belum terwakili tidak diberi daftar tambahan.
    await expect(stageBlock(container, 'Manajer Bagian').getByTestId('stage-history')).toHaveCount(0);
}

test('penolakan lalu persetujuan ulang: kedua attempt tampil urut dengan alasan, di modal pengesahan dan detail', async ({ page }) => {
    const arif = await apiLogin('arif');
    const dewi = await apiLogin('dewi');
    const reason = `Foto kurang jelas ${Date.now()}`;
    const inspection = await createInspectionFixture(arif);
    await rejectViaApi(dewi, inspection.id, 'koordinator_k3l', reason);
    await resubmitViaApi(arif, inspection.id);

    await loginViaUi(page, 'arif');
    await goToTab(page, 'Inspeksi');
    const row = page.locator('#allInspeksiTable').getByRole('row', { name: inspection.id });

    // Diajukan ulang, menunggu Koordinator lagi: penolakan sebelumnya tetap terlihat.
    await row.getByTestId('row-approve-btn').click();
    const approvalContent = page.locator('#approvalContent');
    const waiting = stageBlock(approvalContent, 'Koordinator K3L Bagian');
    await expect(waiting.locator('.stage-status')).toContainText('Menunggu Persetujuan');
    await expect(waiting.getByTestId('stage-attempt')).toHaveCount(1);
    await expect(waiting.getByTestId('stage-attempt')).toContainText(`Alasan: ${reason}`);
    await page.keyboard.press('Escape');
    await expect(page.locator('#approvalModal')).not.toHaveClass(/show/);

    await approveViaApi(dewi, inspection.id, 'koordinator_k3l');
    await page.reload();
    await expect(page.getByTestId('user-name')).toBeVisible();
    await goToTab(page, 'Inspeksi');
    await page.locator('#allInspeksiTable').getByRole('row', { name: inspection.id }).getByTestId('row-approve-btn').click();
    await expectKoordinatorHistory(approvalContent, reason);
    await page.keyboard.press('Escape');

    await goToTab(page, 'Dashboard');
    await page.locator('#inspeksiTableBody').getByRole('row', { name: inspection.id }).getByTestId('row-detail-btn').click();
    await expect(page.locator('#detailModal')).toHaveClass(/show/);
    await expectKoordinatorHistory(page.locator('#detailModal'), reason);

    await arif.context.dispose();
    await dewi.context.dispose();
});
