/* perbaikan.spec.js — navigasi Perbaikan per role, halaman Perbaikan, dan
 * modal "Perbaikan & Progres" sebagai tampilan operasional.
 *
 * Menu Perbaikan: Safety Officer & Admin saja (data-roles, applyRoleGating —
 * aturan tampilan yang sama dengan "Buat Inspeksi"/"Admin"; server tetap
 * otoritatif). Tabel tanpa progress bar/persentase; status teks
 * Menunggu/Progres/Selesai. Modal: informasi inspeksi + tabel tindakan; aksi
 * status hanya untuk pemilik, pengguna lain hanya-baca. Siklus tindakan
 * perbaikan sendiri diuji di corrective-action.spec.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API } from './support/env.js';
import { test, expect } from './support/test.js';
import { loginViaUi, goToTab } from './support/ui.js';
import { apiLogin, createInspectionFixture } from './support/api.js';

const PHOTO = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'e2e-foto-bukti.jpg'));

/** Label tab navigasi yang tampil (atribut hidden dari applyRoleGating), urut. */
const visibleTabs = (page) => page.locator('#navTabs .nav-tab')
    .evaluateAll((tabs) => tabs.filter((tab) => !tab.hidden).map((tab) => tab.textContent.trim()));

async function switchAccountWithoutReload(page, username) {
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByTestId('user-name')).not.toBeVisible();
    await page.getByLabel('Username', { exact: true }).fill(username);
    await page.getByLabel('Password').fill(username);
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.getByTestId('user-name')).toBeVisible();
}

async function perbaikanRow(page, id) {
    await page.locator('#searchPerbaikanInput').fill(id);
    const row = page.locator('#perbaikanTableBody tr', { has: page.locator('td:first-child', { hasText: id }) });
    await expect(row).toHaveCount(1);
    return row;
}

const modal = (page) => page.locator('#perbaikanModal');

test('navigasi per role: Perbaikan hanya untuk Safety Officer & Admin; peninjau tidak; berganti akun menutup tab Perbaikan', async ({ page }) => {
    await loginViaUi(page, 'arif');
    expect(await visibleTabs(page)).toEqual(['Dashboard', 'Penjadwalan', 'Inspeksi', 'Perbaikan', 'Buat Inspeksi']);
    await goToTab(page, 'Perbaikan');
    await expect(page.locator('#panel-perbaikan')).toHaveClass(/active/);

    // Peninjau masuk di halaman yang sama saat tab Perbaikan masih aktif.
    for (const username of ['dewi', 'andi', 'hadi']) {
        await switchAccountWithoutReload(page, username);
        expect(await visibleTabs(page), username).toEqual(['Dashboard', 'Penjadwalan', 'Inspeksi']);
        await expect(page.locator('#navTabs .nav-tab[data-panel="perbaikan"]'), username).toBeHidden();
        await expect(page.locator('#panel-perbaikan'), username).not.toHaveClass(/active/);
        await expect(page.locator('#panel-dashboard'), username).toHaveClass(/active/);
    }

    await switchAccountWithoutReload(page, 'admin');
    expect(await visibleTabs(page)).toEqual(['Dashboard', 'Penjadwalan', 'Inspeksi', 'Perbaikan', 'Admin']);
});

test('halaman Perbaikan: tabel operasional tanpa progress bar/persentase; status teks; modal pemilik: informasi + tabel tindakan, aksi status, foto lewat lightbox, tanpa pengesahan/emoji', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);

    await loginViaUi(page, 'arif');
    await goToTab(page, 'Perbaikan');
    const panel = page.locator('#panel-perbaikan');
    await expect(panel.locator('thead th')).toHaveText(['ID Inspeksi', 'Lokasi / Plant', 'Temuan', 'Due Date Plant', 'Tindakan Terakhir', 'PIC', 'Status', 'Aksi']);
    await expect(panel.locator('.btn-sync, #syncToSheets3'), 'tanpa Sync').toHaveCount(0);
    let row = await perbaikanRow(page, inspection.id);
    await expect(page.getByTestId('perbaikan-pagination-summary')).toHaveText('Menampilkan 1–1 dari 1 inspeksi');
    await expect(panel.locator('.progress-wrapper, .progress-fill, .progress-bar-container')).toHaveCount(0);
    expect(await panel.locator('tbody').innerText(), 'tanpa persentase progres').not.toMatch(/\d+\s*%/);
    await expect(row.getByTestId('repair-status')).toHaveText('Menunggu');
    await expect(row.getByTestId('repair-status-detail')).toHaveText('0 dari 1 tindakan selesai');
    await expect(row.locator('.status-badge')).toHaveCount(0);
    await expect(row.locator('[data-action="openDetailModal"]')).toHaveAttribute('title', 'Lihat detail');

    // Penghitung pencarian & pagination menghitung dataset Perbaikan yang sama
    // (inspeksi yang punya tindakan) — bukan seluruh inspeksi. Draft belum punya
    // tindakan: tidak masuk dataset, jadi tidak ditemukan dan tidak terhitung.
    const draft = await createInspectionFixture(arif, {}, { submit: false });
    const search = page.locator('#searchPerbaikanInput');
    const summary = page.getByTestId('perbaikan-pagination-summary');
    await expect.poll(async () => {
        await search.fill(draft.id);
        await expect(page.locator('#searchPerbaikanCount')).toHaveText(/^0 dari \d+$/);
        const searched = Number((await page.locator('#searchPerbaikanCount').textContent()).match(/dari (\d+)/)[1]);
        await search.fill('');
        await expect(summary).toHaveText(/dari \d+ inspeksi$/);
        const paginated = Number((await summary.textContent()).match(/dari (\d+) inspeksi/)[1]);
        return searched === paginated;
    }, { message: 'penyebut penghitung pencarian = total pagination Perbaikan' }).toBe(true);
    await search.fill(draft.id);
    await expect(panel.locator('tbody')).toContainText('Tidak ada data ditemukan');
    row = await perbaikanRow(page, inspection.id);

    // Modal: informasi inspeksi, lalu tabel tindakan.
    await row.getByTestId('perbaikan-open-btn').click();
    await expect(modal(page)).toHaveClass(/show/);
    const content = page.locator('#modalContent');
    await expect(content.getByTestId('perbaikan-summary').locator('dt')).toHaveText(['ID Inspeksi', 'Lokasi / Plant', 'Due Date', 'Status']);
    await expect(content.getByTestId('perbaikan-summary')).toContainText(inspection.id);
    await expect(content.locator('.progress-wrapper, .status-badge, [data-action="openApprovalModal"]')).toHaveCount(0);
    expect(await content.textContent()).not.toMatch(/[📷⚠️🔒]/u);
    await expect(content.locator('.perbaikan-actions-table thead th')).toHaveText(['Tanggal', 'Tindakan', 'PIC', 'Status', 'Foto', 'Aksi']);
    const item = content.getByTestId('perbaikan-item').first();
    await expect(item.locator('.status-mini')).toHaveText('Menunggu');
    await expect(item.getByTestId('action-status-btn')).toHaveText(['Tandai Progres', 'Tandai Selesai']);
    await expect(item.locator('td[data-label="Foto"]')).toHaveText('Belum ada foto');
    await expect(content.getByTestId('perbaikan-count')).toHaveText('1 tindakan, 0 selesai');
    await expect(content.getByRole('button', { name: 'Tambah Progres' })).toBeVisible();

    // Aksi status yang sudah ada tetap bekerja (maju saja).
    await item.locator('[data-status="on-progress"]').click();
    await expect(item.locator('.status-mini')).toHaveText('Progres');
    await expect(item.getByTestId('action-status-btn')).toHaveText(['Tandai Selesai']);
    await page.locator('#closePerbaikanModal').click();
    row = await perbaikanRow(page, inspection.id);
    await expect(row.getByTestId('repair-status')).toHaveText('Progres');

    // Tindakan berfoto: tautan "N foto" membuka lightbox dengan foto sungguhan.
    const added = await arif.context.post(`${API}/inspections/${inspection.id}/corrective-actions`, {
        headers: { 'X-CSRF-Token': arif.csrfToken },
        multipart: { action: 'Pasang pelindung kabel', status: 'closed', pic: 'Arif', photos: { name: 'bukti.jpg', mimeType: 'image/jpeg', buffer: PHOTO } },
    });
    expect(added.status(), await added.text()).toBe(201);
    await page.reload();
    await expect(page.getByTestId('user-name')).toBeVisible();
    await goToTab(page, 'Perbaikan');
    row = await perbaikanRow(page, inspection.id);
    await expect(row.getByTestId('repair-status-detail')).toHaveText('1 dari 2 tindakan selesai');
    await row.getByTestId('perbaikan-open-btn').click();
    const photos = page.locator('#modalContent').getByTestId('action-photos');
    await expect(photos).toHaveText('1 foto');
    await photos.click();
    await expect(page.locator('#lightboxOverlay')).toHaveClass(/show/);
    await expect(page.locator('#lightboxFileName')).toHaveText('bukti.jpg');
    await expect.poll(() => page.locator('#lightboxImage').evaluate((img) => img.complete && img.naturalWidth)).toBe(320);
    await arif.context.dispose();
});

test('"Perbaikan & Progres": peninjau tidak mendapat tombolnya; Admin (pemantauan) melihat modal hanya-baca — tanpa kolom/tombol aksi dan tanpa form tambah progres', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);
    await arif.context.dispose();

    const recentRow = async () => {
        await page.locator('#searchInspeksiInput').fill(inspection.id);
        const row = page.locator('#inspeksiTableBody tr').first();
        await expect(row.locator('td').first()).toHaveText(inspection.id);
        return row;
    };
    await loginViaUi(page, 'dewi');
    const reviewerRow = await recentRow();
    await expect(reviewerRow.getByTestId('row-detail-btn')).toBeVisible();
    await expect(reviewerRow.getByTestId('recent-perbaikan-btn')).toHaveCount(0);
    await switchAccountWithoutReload(page, 'admin');

    await (await recentRow()).getByTestId('recent-perbaikan-btn').click();
    await expect(modal(page)).toHaveClass(/show/);
    const content = page.locator('#modalContent');
    await expect(content.locator('.perbaikan-actions-table thead th')).toHaveText(['Tanggal', 'Tindakan', 'PIC', 'Status', 'Foto']);
    await expect(content.getByTestId('perbaikan-item')).toHaveCount(1);
    await expect(content.locator('[data-action]:not([data-action="openLightbox"])')).toHaveCount(0);
    await expect(content.getByTestId('perbaikan-view-only')).toHaveText('Hanya Safety Officer pemilik inspeksi ini yang dapat menambah progres perbaikan.');
});
