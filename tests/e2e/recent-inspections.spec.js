/* recent-inspections.spec.js — tabel "Inspeksi Terbaru" (Dashboard).
 *
 * Kolom final ID/Lokasi/Temuan/Due Date/Status/Aksi (tanpa Sync & Progres),
 * status alur kerja + tahap yang ditunggu, Overdue di Due Date, aksi sesuai
 * status, pagination & pencarian di server, Export XLSX, responsif.
 *
 * Spec lain berjalan paralel dan terus membuat inspeksi, jadi pagination diuji
 * lewat pencarian server atas due date unik milik spec ini — totalnya pasti.
 */

import { test, expect } from './support/test.js';
import { loginViaUi } from './support/ui.js';
import { apiLogin, approveViaApi, createInspectionFixture } from './support/api.js';

const recentRows = (page) => page.locator('#inspeksiTableBody tr');
const summary = (page) => page.getByTestId('recent-pagination-summary');

/** Pencarian di server; menunggu tabel benar-benar menampilkan hasilnya. */
async function searchRecent(page, text, expectedSummary) {
    await page.locator('#searchInspeksiInput').fill(text);
    if (expectedSummary) await expect(summary(page)).toHaveText(expectedSummary);
}

async function rejectViaApi(session, inspectionId, stageId, reason) {
    const res = await session.context.post(`/api/inspections/${inspectionId}/reject`, {
        headers: { 'X-CSRF-Token': session.csrfToken }, data: { stageId, reason },
    });
    expect(res.status(), await res.text()).toBe(200);
}

async function createMany(session, count, overrides) {
    const ids = [];
    for (let index = 0; index < count; index++) ids.push((await createInspectionFixture(session, overrides)).id);
    return ids.sort((a, b) => Number(b.slice(4)) - Number(a.slice(4))); // id terbaru dulu, sama dengan server
}

test('kolom final tanpa Sync & Progres; status + tahap yang ditunggu; Overdue di Due Date; aksi sesuai status; Export XLSX tetap jalan', async ({ page }) => {
    const arif = await apiLogin('arif');
    const dewi = await apiLogin('dewi');
    const andi = await apiLogin('andi');
    const hadi = await apiLogin('hadi');
    const inReview = await createInspectionFixture(arif);
    const atManager = await createInspectionFixture(arif);
    await approveViaApi(dewi, atManager.id, 'koordinator_k3l');
    const revision = await createInspectionFixture(arif);
    await rejectViaApi(dewi, revision.id, 'koordinator_k3l', 'Lengkapi foto');
    const completed = await createInspectionFixture(arif);
    for (const [session, stage] of [[dewi, 'koordinator_k3l'], [andi, 'manajer'], [hadi, 'ketua_p2k3']]) await approveViaApi(session, completed.id, stage);
    const draft = await createInspectionFixture(arif, {}, { submit: false });
    const overdue = await createInspectionFixture(arif, { dueDate: '2020-01-15' });

    await loginViaUi(page, 'arif');
    const wrap = page.locator('#panel-dashboard .table-wrap', { has: page.locator('#inspeksiTableBody') });
    await expect(wrap.locator('thead th')).toHaveText(['ID', 'Lokasi', 'Temuan', 'Due Date', 'Status', 'Aksi']);
    await expect(wrap.getByRole('button', { name: /Sync/ })).toHaveCount(0);
    await expect(page.locator('#syncToSheets')).toHaveCount(0);
    await expect(recentRows(page).first().locator('td')).toHaveCount(6);
    await expect(page.locator('#inspeksiTableBody .progress-wrapper, #inspeksiTableBody .progress-fill')).toHaveCount(0);
    expect(await page.locator('#inspeksiTableBody').innerText(), 'tanpa persentase progres').not.toMatch(/\d+\s*%/);

    for (const [label, inspection, status, detail, actions] of [
        // arif = Safety Officer, bukan tahap pengesahan: tombol Pengesahan tidak pernah tampil untuknya.
        ['in review', inReview, 'Dalam Review', 'Menunggu Koordinator K3L Bagian', { approval: 0, pdf: 0 }],
        ['tahap Manajer', atManager, 'Dalam Review', 'Menunggu Manajer Bagian', { approval: 0, pdf: 0 }],
        ['revisi', revision, 'Perlu Revisi', 'Menunggu revisi Safety Officer', { approval: 0, pdf: 0 }],
        ['selesai', completed, 'Selesai', null, { approval: 0, pdf: 1 }],
        ['draft', draft, 'Draft', null, { approval: 0, pdf: 0 }],
    ]) {
        await searchRecent(page, inspection.id, 'Menampilkan 1–1 dari 1 inspeksi');
        const row = recentRows(page).first();
        await expect(row.locator('td').first(), label).toHaveText(inspection.id);
        await expect(row.getByTestId('recent-status'), label).toHaveText(status);
        await expect(row.getByTestId('temuan-count'), `${label}: jumlah temuan eksplisit`).toHaveText('1 temuan');
        if (detail) await expect(row.getByTestId('recent-status-detail'), label).toHaveText(detail);
        else await expect(row.getByTestId('recent-status-detail'), label).toHaveCount(0);
        await expect(row.getByTestId('row-detail-btn'), `${label}: detail`).toHaveCount(1);
        await expect(row.getByTestId('recent-approval-btn'), `${label}: pengesahan`).toHaveCount(actions.approval);
        await expect(row.locator('[data-action="cetakPDF"]'), `${label}: PDF hanya bila selesai`).toHaveCount(actions.pdf);
        await expect(row.locator('.btn-pdf[disabled]'), `${label}: tanpa tombol PDF nonaktif`).toHaveCount(0);
    }

    // Overdue = indikator pada Due Date, bukan status alur kerja.
    await searchRecent(page, overdue.id, 'Menampilkan 1–1 dari 1 inspeksi');
    const overdueRow = recentRows(page).first();
    await expect(overdueRow.locator('td').nth(3)).toContainText('15/1/2020');
    const indicator = overdueRow.locator('td').nth(3).getByTestId('overdue-indicator');
    await expect(indicator).toHaveAttribute('title', 'Overdue — melewati due date');
    await expect(indicator).toHaveAttribute('aria-label', 'Overdue — melewati due date');
    await expect(indicator.locator('i.fa-circle-exclamation')).toBeVisible();
    await expect(overdueRow.locator('td').nth(3), 'tanpa badge besar').not.toContainText('OVERDUE');
    await expect(overdueRow.getByTestId('recent-status')).toHaveText('Dalam Review');
    await expect(overdueRow.locator('td').nth(4)).not.toContainText(/overdue/i);

    // Aksi tetap bekerja: detail terbuka dari baris hasil pencarian.
    await overdueRow.getByTestId('row-detail-btn').click();
    await expect(page.locator('#detailModal')).toHaveClass(/show/);
    await page.locator('#closeDetailModal').click();

    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportSpreadsheet').click()]);
    expect(download.suggestedFilename()).toBe('Inspeksi_K3.xlsx');
    for (const session of [arif, dewi, andi, hadi]) await session.context.dispose();
});

test('pagination di server: 10 per halaman; Berikutnya / nomor / Sebelumnya; pencarian mencakup seluruh data dan kembali ke halaman 1', async ({ page }) => {
    const arif = await apiLogin('arif');
    const ids = await createMany(arif, 12, { dueDate: '2031-03-17' });

    await loginViaUi(page, 'arif');
    await expect(recentRows(page), 'default 10 per halaman').toHaveCount(10);

    await searchRecent(page, '17/3/2031', 'Menampilkan 1–10 dari 12 inspeksi');
    await expect(recentRows(page).locator('td:first-child')).toHaveText(ids.slice(0, 10));
    const nav = page.locator('#inspeksiPagination');
    await expect(nav.getByRole('button', { name: /Sebelumnya/ })).toBeDisabled();
    await expect(nav.locator('[aria-current="page"]')).toHaveText('1');

    await nav.getByRole('button', { name: /Berikutnya/ }).click();
    await expect(summary(page)).toHaveText('Menampilkan 11–12 dari 12 inspeksi');
    await expect(recentRows(page).locator('td:first-child')).toHaveText(ids.slice(10));
    await expect(nav.getByRole('button', { name: /Berikutnya/ })).toBeDisabled();
    await expect(nav.locator('[aria-current="page"]')).toHaveText('2');

    await nav.getByRole('button', { name: /Sebelumnya/ }).click();
    await expect(summary(page)).toHaveText('Menampilkan 1–10 dari 12 inspeksi');
    await nav.getByRole('button', { name: '2', exact: true }).click();
    await expect(summary(page)).toHaveText('Menampilkan 11–12 dari 12 inspeksi');

    // Pencarian baru kembali ke halaman 1 — dan menemukan data di luar halaman yang sedang tampil.
    const oldest = ids.at(-1);
    await searchRecent(page, oldest, 'Menampilkan 1–1 dari 1 inspeksi');
    await expect(recentRows(page).locator('td:first-child')).toHaveText([oldest]);
    await expect(page.locator('#searchInspeksiCount')).toHaveText('1 hasil');
    await searchRecent(page, 'tidak-ada-yang-cocok-xyz');
    await expect(recentRows(page)).toHaveText(['Tidak ada data ditemukan']);
    await expect(nav).toBeEmpty();

    await page.locator('#clearSearchInspeksi').click();
    await expect(summary(page)).toHaveText(/^Menampilkan 1–10 dari \d+ inspeksi$/);
    await expect(recentRows(page)).toHaveCount(10);
    await arif.context.dispose();
});

test('responsif: 375/390 tanpa luapan halaman, navigasi ringkas "1 / 2" tetap bisa dipakai; 1280/1440 header sejajar dengan data', async ({ page }) => {
    const arif = await apiLogin('arif');
    await createMany(arif, 11, { dueDate: '2031-04-18' });
    await loginViaUi(page, 'arif');
    await searchRecent(page, '18/4/2031', 'Menampilkan 1–10 dari 11 inspeksi');
    const nav = page.locator('#inspeksiPagination');

    for (const [width, height] of [[375, 667], [390, 844], [1280, 800], [1440, 900]]) {
        await page.setViewportSize({ width, height });
        const layout = await page.evaluate(() => {
            const nav = document.getElementById('inspeksiPagination').getBoundingClientRect();
            const headers = [...document.querySelectorAll('#panel-dashboard thead th')].filter((th) => th.closest('table').querySelector('#inspeksiTableBody'));
            const cells = [...document.querySelectorAll('#inspeksiTableBody tr:first-child td')];
            return {
                pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
                navInside: nav.left >= 0 && nav.right <= window.innerWidth,
                columns: [headers.length, cells.length],
                aligned: headers.every((th, index) => Math.abs(th.getBoundingClientRect().left - cells[index].getBoundingClientRect().left) < 1),
            };
        });
        expect(layout.pageOverflow, `${width}px: tanpa luapan horizontal halaman`).toBe(false);
        expect(layout.navInside, `${width}px: navigasi di dalam layar`).toBe(true);
        expect(layout.columns, `${width}px: jumlah kolom header = data`).toEqual([6, 6]);
        expect(layout.aligned, `${width}px: header sejajar dengan data`).toBe(true);
        if (width <= 480) {
            await expect(nav.locator('.pagination-compact')).toBeVisible();
            await expect(nav.locator('.pagination-pages')).toBeHidden();
        } else {
            await expect(nav.locator('.pagination-pages')).toBeVisible();
            await expect(nav.locator('.pagination-compact')).toBeHidden();
        }
    }

    await page.setViewportSize({ width: 375, height: 667 });
    await expect(nav.locator('.pagination-compact')).toHaveText('1 / 2');
    await nav.getByRole('button', { name: /Berikutnya/ }).click();
    await expect(summary(page)).toHaveText('Menampilkan 11–11 dari 11 inspeksi');
    await expect(nav.locator('.pagination-compact')).toHaveText('2 / 2');
    await arif.context.dispose();
});
