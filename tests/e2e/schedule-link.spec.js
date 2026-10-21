/* schedule-link.spec.js — migrasi 008: laporan inspeksi tertaut ke jadwalnya.
 *
 * Lewat UI sungguhan: Safety Officer memilih jadwalnya sendiri di form Buat
 * Inspeksi (plant mengikuti jadwal), draft TIDAK menandai jadwal, pengajuan
 * menandai jadwal Terlaksana dan Penjadwalan menunjuk laporannya — status
 * pengesahan laporan tetap terpisah. Revisi mempertahankan jadwalnya.
 * Jadwal WAJIB untuk laporan baru. Penjaga server (jadwal orang lain, plant, ganda, transaksi) diuji di
 * server/test/api.test.js dan test/unit/schedule-link.test.js.
 */

import { API } from './support/env.js';
import { test, expect } from './support/test.js';
import { loginViaUi, goToTab, allInspeksiRow } from './support/ui.js';
import { apiLogin, approveViaApi } from './support/api.js';

async function createScheduleFor(admin, officer, overrides = {}) {
    const res = await admin.context.post('/api/schedules', {
        headers: { 'X-CSRF-Token': admin.csrfToken },
        data: { plantId: 9, officerUserId: officer.user.id, tahun: 2026, tanggalJadwal: '2026-12-01', periode: 4, minggu: 1, ...overrides },
    });
    expect(res.status(), await res.text()).toBe(201);
    return (await res.json()).schedule;
}
const fetchJson = async (session, path) => (await session.context.get(`${API}${path}`)).json();
const scheduleById = async (session, id) => (await fetchJson(session, '/schedules')).find((schedule) => schedule.id === id);
const today = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

async function addFinding(page, text) {
    await page.getByPlaceholder('Contoh: Kabel terbuka').fill(text);
    await page.locator('#kategoriInput').selectOption('Kelistrikan');
    await page.locator('#panel-form').getByRole('button', { name: 'Tambah' }).click();
}

test('SO memilih jadwalnya di Buat Inspeksi (plant mengikuti & terkunci) -> diajukan -> jadwal Terlaksana dan menunjuk laporannya; pengesahan tetap terpisah', async ({ page }) => {
    const admin = await apiLogin('admin');
    const arif = await apiLogin('arif');
    const tulus = await apiLogin('tulus');
    const mine = await createScheduleFor(admin, arif);
    const others = await createScheduleFor(admin, tulus);

    await loginViaUi(page, 'arif');
    await goToTab(page, 'Buat Inspeksi');
    const select = page.getByTestId('inspection-schedule');
    await expect(select.locator(`option[value="${mine.id}"]`)).toHaveCount(1);
    await expect(select.locator(`option[value="${others.id}"]`), 'jadwal SO lain tidak ditawarkan').toHaveCount(0);
    await expect(select).toHaveValue('');
    await expect(page.locator('#plantSearchInput')).toBeEnabled();

    // Jadwal wajib: label bertanda wajib (bukan "opsional"); tanpa jadwal laporan tidak tersimpan.
    await expect(page.locator('label[for="formJadwal"]')).toHaveText(/^Jadwal Inspeksi\s*\*$/);
    await expect(select.locator('option:checked')).toHaveText('Pilih jadwal...');
    await addFinding(page, 'E2E jadwal: rak tanpa label beban');
    await page.getByTestId('inspection-date').fill(today());
    await page.getByRole('button', { name: 'Simpan Draft' }).click();
    await expect(page.locator('#toastMessage')).toContainText('Pilih jadwal inspeksi terlebih dahulu');
    await expect(page.locator('#panel-form')).toHaveClass(/active/);

    await select.selectOption(mine.id);
    await expect(page.locator('#selectedPlant')).toHaveValue('9');
    await expect(page.locator('#plantSearchInput')).toHaveValue('Logistic');
    await expect(page.locator('#plantSearchInput'), 'plant mengikuti jadwal').toBeDisabled();
    await page.getByRole('button', { name: 'Simpan & Ajukan' }).click();
    await expect(page.locator('#toastMessage')).toContainText(`Jadwal ${mine.id} tercatat Terlaksana`, { timeout: 15_000 });
    const id = (await page.locator('#toastText').textContent()).match(/INS-\d+/)[0];

    const inspection = await fetchJson(arif, `/inspections/${id}`);
    expect([inspection.scheduleId, inspection.status, inspection.currentApprovalStage]).toEqual([mine.id, 'in_review', 'koordinator_k3l']);
    expect(await scheduleById(arif, mine.id)).toMatchObject({ status: 'selesai', tanggalRealisasi: today(), inspectionId: id });

    // Penjadwalan: Selesai + tautan ke laporan; tanpa Edit. Detail laporan menyebut jadwalnya, status pengesahannya sendiri.
    await goToTab(page, 'Penjadwalan');
    await page.locator('#searchJadwalInput').fill(mine.id);
    await expect(page.locator('#searchJadwalCount')).toHaveText(/^1 dari \d+$/);
    const row = page.locator('#jadwalTableBody tr').first();
    await expect(row).toContainText('Selesai');
    await expect(row.locator('[data-action="editJadwal"]')).toHaveCount(0);
    await row.getByTestId('schedule-report-btn').click();
    const detail = page.locator('#detailModal');
    await expect(detail).toHaveClass(/show/);
    await expect(detail.getByTestId('detail-schedule')).toContainText(mine.id);
    await expect(detail).toContainText('Dalam Review');
    await page.keyboard.press('Escape');

    // Jadwal yang sudah dipakai tidak ditawarkan lagi.
    await goToTab(page, 'Buat Inspeksi');
    await expect(select.locator(`option[value="${mine.id}"]`)).toHaveCount(0);
    for (const session of [admin, arif, tulus]) await session.context.dispose();
});

test('draft bertautan jadwal tidak menandai Terlaksana; revisi menampilkan jadwal yang terkunci dan mempertahankannya saat diajukan ulang', async ({ page }) => {
    const admin = await apiLogin('admin');
    const arif = await apiLogin('arif');
    const schedule = await createScheduleFor(admin, arif, { tanggalJadwal: '2026-12-08', minggu: 2 });

    await loginViaUi(page, 'arif');
    await goToTab(page, 'Buat Inspeksi');
    await page.getByTestId('inspection-schedule').selectOption(schedule.id);
    await addFinding(page, 'E2E jadwal: draft');
    await page.getByTestId('inspection-date').fill(today());
    await page.getByRole('button', { name: 'Simpan Draft' }).click();
    await expect(page.locator('#toastMessage')).toContainText('berhasil disimpan', { timeout: 15_000 });
    const id = (await page.locator('#toastText').textContent()).match(/INS-\d+/)[0];
    expect((await fetchJson(arif, `/inspections/${id}`)).scheduleId).toBe(schedule.id);
    expect(await scheduleById(arif, schedule.id)).toMatchObject({ status: 'aktif', tanggalRealisasi: null, inspectionId: null });

    // Edit draft: jadwalnya tetap terpilih dan masih bisa diganti (tidak terkunci).
    await (await allInspeksiRow(page, id)).getByTestId('row-edit-btn').click();
    await expect(page.getByTestId('inspection-schedule')).toHaveValue(schedule.id);
    await expect(page.getByTestId('inspection-schedule')).toBeEnabled();
    await page.getByRole('button', { name: 'Simpan & Ajukan' }).click();
    await expect(page.locator('#toastMessage')).toContainText(`Jadwal ${schedule.id} tercatat Terlaksana`, { timeout: 15_000 });

    // Ditolak Manajer -> revisi: jadwal tampil terkunci; diajukan ulang tetap jadwal yang sama.
    await approveViaApi(await apiLogin('rina'), id, 'koordinator_k3l'); // Koordinator plant 9
    const andi = await apiLogin('andi');
    const reject = await andi.context.post(`/api/inspections/${id}/reject`, {
        headers: { 'X-CSRF-Token': andi.csrfToken }, data: { stageId: 'manajer', reason: 'Lengkapi foto area' },
    });
    expect(reject.status(), await reject.text()).toBe(200);
    const realizedOn = (await scheduleById(arif, schedule.id)).tanggalRealisasi;

    await page.reload();
    await expect(page.getByTestId('user-name')).toBeVisible();
    await (await allInspeksiRow(page, id)).getByTestId('row-edit-btn').click();
    await expect(page.locator('#inspeksiFormTitle')).toHaveText(`Revisi ${id}`);
    await expect(page.getByTestId('inspection-schedule')).toHaveValue(schedule.id);
    await expect(page.getByTestId('inspection-schedule')).toBeDisabled();
    await expect(page.locator('#plantSearchInput')).toBeDisabled();
    await page.getByRole('button', { name: 'Simpan & Ajukan Ulang' }).click();
    await expect(page.locator('#toastMessage')).toContainText('diajukan ulang ke Manajer Bagian', { timeout: 15_000 });

    const resubmitted = await fetchJson(arif, `/inspections/${id}`);
    expect([resubmitted.scheduleId, resubmitted.currentApprovalStage]).toEqual([schedule.id, 'manajer']);
    expect(await scheduleById(arif, schedule.id)).toMatchObject({ status: 'selesai', tanggalRealisasi: realizedOn, inspectionId: id });
    for (const session of [admin, arif, andi]) await session.context.dispose();
});
