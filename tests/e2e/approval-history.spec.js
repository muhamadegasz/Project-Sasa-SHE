/* approval-history.spec.js — release: seluruh attempt pengesahan per tahap.
 *
 * Koordinator menolak (beralasan) -> pemilik mengajukan ulang -> Koordinator
 * menyetujui. Riwayat tahap Koordinator harus menampilkan KEDUA attempt urut,
 * dengan alasan penolakan, di modal pengesahan dan modal detail. Data dibuat
 * lewat API sungguhan; tampilan hanya membaca riwayat append-only.
 */

import { test, expect, newIsolatedPage } from './support/test.js';
import { loginViaUi, allInspeksiRow } from './support/ui.js';
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

test('penolakan lalu persetujuan ulang: kedua attempt tampil urut dengan alasan — di modal pengesahan peninjau dan di Detail pemilik', async ({ page, browser }) => {
    const arif = await apiLogin('arif');
    const dewi = await apiLogin('dewi');
    const reason = `Foto kurang jelas ${Date.now()}`;
    const inspection = await createInspectionFixture(arif);
    await rejectViaApi(dewi, inspection.id, 'koordinator_k3l', reason);
    await resubmitViaApi(arif, inspection.id);

    // Diajukan ulang, menunggu Koordinator lagi: di modal pengesahan Koordinator,
    // penolakan sebelumnya tetap terlihat, ditutup attempt berikutnya yang menunggu.
    const reviewerPage = await newIsolatedPage(browser);
    await loginViaUi(reviewerPage, 'dewi');
    const reviewerRow = await allInspeksiRow(reviewerPage, inspection.id);
    await reviewerRow.getByTestId('row-approve-btn').click();
    const waiting = stageBlock(reviewerPage.locator('#approvalContent'), 'Koordinator K3L Bagian');
    await expect(waiting.locator('.stage-status')).toContainText('Menunggu Persetujuan');
    await expect(waiting.getByTestId('stage-attempt')).toHaveCount(1);
    await expect(waiting.getByTestId('stage-attempt')).toContainText(`Alasan: ${reason}`);
    await expect(waiting.getByTestId('stage-attempt-pending')).toHaveText(/Percobaan 2\s+Menunggu persetujuan Koordinator K3L Bagian/);
    await reviewerPage.close();

    // Setelah disetujui: pemilik membaca riwayat lengkap di Detail (tanpa tombol Pengesahan).
    await approveViaApi(dewi, inspection.id, 'koordinator_k3l');
    await loginViaUi(page, 'arif');
    const row = await allInspeksiRow(page, inspection.id);
    await expect(row.getByTestId('row-approve-btn')).toHaveCount(0);
    await row.getByTestId('row-detail-btn').click();
    await expect(page.locator('#detailModal')).toHaveClass(/show/);
    await expectKoordinatorHistory(page.locator('#detailModal'), reason);

    await arif.context.dispose();
    await dewi.context.dispose();
});
