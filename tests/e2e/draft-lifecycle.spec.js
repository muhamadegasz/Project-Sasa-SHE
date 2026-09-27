/* draft-lifecycle.spec.js — Phase 17.3B: siklus hidup inspeksi lewat UI.
 *
 * Draft -> ubah -> ajukan -> ditolak Manajer (modal penolakan) -> direvisi
 * pemilik -> diajukan ulang ke tahap YANG SAMA; Safety Officer lain hanya
 * melihat; hapus draft. Hasil setiap langkah dibuktikan lewat API (sisi
 * server), bukan hanya tampilan.
 */

import { test, expect } from '@playwright/test';
import { loginViaUi, goToTab, selectPlant } from './support/ui.js';
import { apiLogin, approveViaApi, createInspectionFixture } from './support/api.js';

const API = 'http://project-sasa-she.test:3001/api';
const PLANT_SEARCH_PLACEHOLDER = 'Cari plant... (ketik nama plant)';

function inspeksiRow(page, inspectionId) {
    return page.locator('#allInspeksiTable').getByRole('row', { name: inspectionId });
}

async function fetchAs(session, inspectionId) {
    const res = await session.context.get(`${API}/inspections/${inspectionId}`);
    expect(res.status()).toBe(200);
    return res.json();
}

test('draft -> ubah -> ajukan -> ditolak Manajer -> revisi pemilik -> ajukan ulang kembali ke Manajer', async ({ page, browser }) => {
    const arif = await apiLogin('arif');

    // 1. Simpan sebagai draft lewat form.
    await loginViaUi(page, 'arif');
    await goToTab(page, 'Buat Inspeksi');
    await selectPlant(page, PLANT_SEARCH_PLACEHOLDER, 'Electrical dan Instrument');
    await page.getByPlaceholder('Contoh: Kabel terbuka').fill('E2E lifecycle: panel tanpa label');
    await page.locator('#panel-form').getByRole('button', { name: 'Tambah' }).click();
    await page.getByTestId('inspection-date').fill(new Date().toISOString().slice(0, 10));
    await page.getByRole('button', { name: 'Simpan Draft' }).click();
    await expect(page.locator('#toastMessage')).toContainText('berhasil disimpan', { timeout: 15_000 });
    const id = (await page.locator('#toastText').textContent()).match(/INS-\d+/)[0];
    expect((await fetchAs(arif, id)).status).toBe('draft');

    // 2. Pemilik melihat tombol Edit/Ajukan/Hapus di baris draft-nya; ubah lalu ajukan dari form.
    await goToTab(page, 'Inspeksi');
    const row = inspeksiRow(page, id);
    await expect(row.getByTestId('row-edit-btn')).toBeVisible();
    await expect(row.getByTestId('row-submit-btn')).toBeVisible();
    await expect(row.getByTestId('row-delete-draft-btn')).toBeVisible();
    await row.getByTestId('row-edit-btn').click();
    await expect(page.locator('#panel-form')).toHaveClass(/active/);
    await expect(page.locator('#inspeksiFormTitle')).toHaveText(`Edit Draft ${id}`);
    await expect(page.locator('#temuanListContainer')).toContainText('E2E lifecycle: panel tanpa label');
    await page.locator('#formKeteranganLokasi').fill('E2E lifecycle: diperbarui sebelum diajukan');
    await page.getByRole('button', { name: 'Simpan & Ajukan' }).click();
    await expect(page.locator('#toastMessage')).toContainText('diajukan ke Koordinator K3L', { timeout: 15_000 });

    const submitted = await fetchAs(arif, id);
    expect(submitted.status).toBe('in_review');
    expect(submitted.currentApprovalStage).toBe('koordinator_k3l');
    expect(submitted.keteranganLokasi).toBe('E2E lifecycle: diperbarui sebelum diajukan');
    expect(submitted.approvalHistory).toHaveLength(0);

    // 3. Koordinator menyetujui (lewat API), Manajer menolak lewat modal penolakan di UI.
    await approveViaApi(await apiLogin('dewi'), id, 'koordinator_k3l');
    const managerPage = await browser.newPage();
    await loginViaUi(managerPage, 'andi');
    await goToTab(managerPage, 'Inspeksi');
    await inspeksiRow(managerPage, id).getByTestId('row-approve-btn').click();
    await managerPage.locator('#approvalContent').getByRole('button', { name: /Tolak/ }).click();
    const rejectModal = managerPage.locator('#rejectModal');
    await rejectModal.getByLabel(/Alasan penolakan/).fill('Lampirkan foto label panel yang sudah dipasang');
    await rejectModal.getByRole('button', { name: 'Tolak Inspeksi' }).click();
    await expect(managerPage.locator('#toastMessage')).toContainText('menolak inspeksi');
    await managerPage.close();

    const rejected = await fetchAs(arif, id);
    expect(rejected.status).toBe('revision_required');
    expect(rejected.currentApprovalStage).toBe('manajer');

    // 4. Pemilik merevisi: alasan penolakan tampil, temuan ditambah, ajukan ulang.
    await goToTab(page, 'Dashboard');
    await goToTab(page, 'Inspeksi');
    await expect(inspeksiRow(page, id).getByTestId('row-edit-btn')).toHaveText(/Revisi/);
    await inspeksiRow(page, id).getByTestId('row-edit-btn').click();
    await expect(page.locator('#inspeksiFormTitle')).toHaveText(`Revisi ${id}`);
    await expect(page.locator('#revisionNotice')).toContainText('Lampirkan foto label panel yang sudah dipasang');
    await page.getByPlaceholder('Contoh: Kabel terbuka').fill('E2E lifecycle: label panel dipasang');
    await page.locator('#panel-form').getByRole('button', { name: 'Tambah' }).click();
    await page.getByRole('button', { name: 'Simpan & Ajukan Ulang' }).click();
    await expect(page.locator('#toastMessage')).toContainText('diajukan ulang ke Manajer Bagian', { timeout: 15_000 });

    const resubmitted = await fetchAs(arif, id);
    expect(resubmitted.status).toBe('in_review');
    expect(resubmitted.currentApprovalStage).toBe('manajer');
    expect(resubmitted.temuan.map((finding) => finding.deskripsi)).toEqual([
        'E2E lifecycle: panel tanpa label', 'E2E lifecycle: label panel dipasang',
    ]);
    expect(resubmitted.approvalHistory.map((entry) => [entry.stage, entry.decision])).toEqual([
        ['koordinator_k3l', 'approved'], ['manajer', 'rejected'],
    ]);
});

test('Safety Officer lain hanya melihat: tanpa tombol ubah/ajukan/hapus, tanpa form progres perbaikan; draft orang lain tidak tampil', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inReview = await createInspectionFixture(arif);
    const draft = await createInspectionFixture(arif, {}, { submit: false });

    await loginViaUi(page, 'tulus');
    await goToTab(page, 'Inspeksi');
    const row = inspeksiRow(page, inReview.id);
    await expect(row).toBeVisible();
    await expect(row.getByTestId('row-edit-btn')).toHaveCount(0);
    await expect(row.getByTestId('row-submit-btn')).toHaveCount(0);
    await expect(row.getByTestId('row-delete-draft-btn')).toHaveCount(0);
    await expect(inspeksiRow(page, draft.id)).toHaveCount(0);

    await goToTab(page, 'Dashboard');
    await page.locator('#inspeksiTableBody').getByRole('row', { name: inReview.id })
        .locator('[data-action="openPerbaikanModal"]').click();
    await expect(page.locator('#perbaikanModal')).toHaveClass(/show/);
    await expect(page.getByTestId('perbaikan-view-only')).toBeVisible();
    await expect(page.locator('#modalContent').getByRole('button', { name: /Tambah Progres/ })).toHaveCount(0);
});

test('pemilik menghapus draft-nya lewat UI', async ({ page }) => {
    const arif = await apiLogin('arif');
    const draft = await createInspectionFixture(arif, {}, { submit: false });

    await loginViaUi(page, 'arif');
    await goToTab(page, 'Inspeksi');
    page.once('dialog', (dialog) => dialog.accept());
    await inspeksiRow(page, draft.id).getByTestId('row-delete-draft-btn').click();
    await expect(page.locator('#toastMessage')).toContainText(`Draft ${draft.id} dihapus`);
    await expect(inspeksiRow(page, draft.id)).toHaveCount(0);

    const res = await arif.context.get(`${API}/inspections/${draft.id}`);
    expect(res.status()).toBe(404);
});
