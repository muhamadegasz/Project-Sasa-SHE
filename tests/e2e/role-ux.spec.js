/* role-ux.spec.js — perapihan UX lintas role (tampilan saja; server tetap
 * otoritatif): kembali ke daftar Inspeksi setelah form, hierarki tombol form,
 * aksi & kolom sesuai kewenangan (Kelola kalender, kolom Aksi Penjadwalan;
 * fitur Sync dihapus), dan pagination pola Inspeksi Terbaru di tab Inspeksi &
 * Penjadwalan (jadwal terbaru di atas).
 */

import { API } from './support/env.js';
import { test, expect } from './support/test.js';
import { loginViaUi, goToTab, allInspeksiRow } from './support/ui.js';
import { apiLogin, approveViaApi, createInspectionFixture } from './support/api.js';

test('form inspeksi: satu primary (Simpan & Ajukan), secondary (Simpan Draft), tertiary (Batal); Batal kembali ke daftar Inspeksi', async ({ page }) => {
    const arif = await apiLogin('arif');
    const draft = await createInspectionFixture(arif, {}, { submit: false });

    await loginViaUi(page, 'arif');
    await (await allInspeksiRow(page, draft.id)).getByTestId('row-edit-btn').click();
    await expect(page.locator('#panel-form')).toHaveClass(/active/);
    const actions = page.locator('#panel-form .form-actions button:visible');
    await expect(actions).toHaveText([/Simpan & Ajukan/, /Simpan Draft/, 'Batal']);
    await expect(actions.nth(0)).toHaveClass(/^btn-submit$/);
    await expect(actions.nth(1)).toHaveClass(/btn-secondary/);
    await expect(actions.nth(2)).toHaveClass(/btn-text/);

    // Pencarian daftar tetap (konteks daftar dipertahankan) setelah kembali.
    await page.locator('#batalEditInspeksi').click();
    await expect(page.locator('#panel-inspeksi')).toHaveClass(/active/);
    await expect(page.locator('#searchAllInspeksiInput')).toHaveValue(draft.id);
    await expect(page.locator('#allInspeksiTable').getByRole('row', { name: draft.id })).toHaveCount(1);
    expect((await (await arif.context.get(`${API}/inspections/${draft.id}`)).json()).status, 'Batal tidak menyimpan apa pun').toBe('draft');
    await arif.context.dispose();
});

test('Manajer: tanpa "Kelola" di kalender, tanpa Sync, tanpa kolom Aksi jadwal; tab Inspeksi berhalaman di server tanpa membocorkan data di luar cakupannya', async ({ page }) => {
    const arif = await apiLogin('arif');
    const atManager = await createInspectionFixture(arif);
    await approveViaApi(await apiLogin('dewi'), atManager.id, 'koordinator_k3l');
    const atCoordinator = await createInspectionFixture(arif);
    const andi = await apiLogin('andi');

    await loginViaUi(page, 'andi');
    await expect(page.getByTestId('calendar-manage-btn')).toBeHidden();
    await goToTab(page, 'Inspeksi');
    await expect(page.getByRole('button', { name: /Sync/ }), 'fitur Sync dihapus').toHaveCount(0);

    // Pagination pola Inspeksi Terbaru. Setiap baris yang tampil memang dalam
    // cakupan Manajer menurut server (tidak ada yang bocor lewat halaman mana pun).
    const summary = page.getByTestId('all-pagination-summary');
    await expect(summary).toHaveText(/^Menampilkan 1–(\d+) dari (\d+) inspeksi$/);
    const [, shown, total] = (await summary.textContent()).match(/1–(\d+) dari (\d+)/).map(Number);
    const ids = await page.locator('#allInspeksiTable tr td:first-child').allTextContents();
    expect(ids).toHaveLength(shown);
    expect(shown).toBeLessThanOrEqual(10);
    for (const id of ids) expect((await andi.context.get(`${API}/inspections/${id.trim()}`)).status(), id).toBe(200);
    if (total > 10) {
        const nav = page.locator('#allInspeksiPagination');
        await nav.getByRole('button', { name: /Berikutnya/ }).click();
        await expect(nav.locator('[aria-current="page"]')).toHaveText('2');
        await expect(summary).toHaveText(/^Menampilkan 11–\d+ dari \d+ inspeksi$/);
    }

    // Pencarian di server: inspeksi tahap Manajer ditemukan dengan tombol Pengesahan;
    // inspeksi yang masih di tahap Koordinator tidak muncul di halaman/pencarian mana pun.
    const row = await allInspeksiRow(page, atManager.id);
    await expect(row.getByTestId('row-approve-btn')).toBeVisible();
    await page.locator('#searchAllInspeksiInput').fill(atCoordinator.id);
    await expect(page.locator('#searchAllInspeksiCount')).toHaveText('0 hasil');
    await expect(page.locator('#allInspeksiTable')).toContainText('Tidak ada data ditemukan');

    await goToTab(page, 'Penjadwalan');
    await expect(page.locator('#jadwalAksiHeader')).toBeHidden();
    for (const session of [arif, andi]) await session.context.dispose();
});

test('Safety Officer: "Kelola" tetap ada, tanpa Sync; Penjadwalan dengan kolom Aksi, jadwal terbaru di atas, berhalaman (pencarian atas seluruh jadwal)', async ({ page }) => {
    const arif = await apiLogin('arif');
    const schedules = async () => (await arif.context.get(`${API}/schedules`)).json();
    // Data uji lebih dari satu halaman (seed hanya beberapa jadwal).
    for (let count = (await schedules()).length; count <= 12; count++) {
        const res = await arif.context.post(`${API}/schedules`, {
            headers: { 'X-CSRF-Token': arif.csrfToken },
            data: { plantId: 9, officer: 'Arif', tahun: 2026, tanggalJadwal: '2026-11-02', periode: 4, minggu: 1, tanggalRealisasi: '' },
        });
        expect(res.status(), await res.text()).toBe(201);
    }
    const all = await schedules();

    await loginViaUi(page, 'arif');
    await expect(page.getByTestId('calendar-manage-btn')).toBeVisible();
    await goToTab(page, 'Inspeksi');
    await expect(page.locator('#panel-inspeksi').getByRole('button', { name: /Export Semua Temuan/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sync/ }), 'fitur Sync dihapus').toHaveCount(0);

    await goToTab(page, 'Penjadwalan');
    await expect(page.locator('#jadwalAksiHeader')).toBeVisible();
    expect(all.length, 'data uji: lebih dari satu halaman jadwal').toBeGreaterThan(10);
    const rows = page.locator('#jadwalTableBody tr');
    await expect(rows).toHaveCount(10);
    await expect(rows.first().getByTestId('schedule-edit-btn')).toBeVisible();
    const summary = page.getByTestId('jadwal-pagination-summary');
    await expect(summary).toHaveText(/^Menampilkan 1–10 dari \d+ jadwal$/);

    // Terbaru di atas: nomor jadwal menurun di dalam halaman dan antarhalaman
    // (tanpa bergantung pada jadwal yang dibuat worker lain di saat yang sama).
    const numbers = async () => (await rows.locator('[data-testid="schedule-edit-btn"]').evaluateAll(
        (buttons) => buttons.map((button) => Number(button.dataset.id.replace(/\D/g, '')))));
    const firstPage = await numbers();
    expect(firstPage).toEqual([...firstPage].sort((a, b) => b - a));
    expect(firstPage[0], 'jadwal terbaru di baris pertama').toBeGreaterThanOrEqual(Math.max(...all.map((s) => Number(s.id.replace(/\D/g, '')))));
    const nav = page.locator('#jadwalPagination');
    await nav.getByRole('button', { name: /Berikutnya/ }).click();
    await expect(nav.locator('[aria-current="page"]')).toHaveText('2');
    const secondPage = await numbers();
    expect(secondPage).toEqual([...secondPage].sort((a, b) => b - a));
    expect(secondPage[0]).toBeLessThanOrEqual(firstPage[firstPage.length - 1]);

    // Pencarian atas SELURUH jadwal (bukan hanya halaman tampil) kembali ke halaman 1.
    const oldest = all[0];
    await page.locator('#searchJadwalInput').fill(oldest.id);
    await expect(summary).toHaveText('Menampilkan 1–1 dari 1 jadwal');
    await expect(rows.first().getByTestId('schedule-edit-btn')).toHaveAttribute('data-id', oldest.id);
    await arif.context.dispose();
});
