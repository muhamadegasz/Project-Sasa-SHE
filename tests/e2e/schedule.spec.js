/* schedule.spec.js — Penjadwalan: tambah & edit (termasuk Tanggal Realisasi)
 * lewat UI sungguhan, tombol hanya untuk role yang diizinkan server, dan
 * toast (desain baru) untuk berhasil/gagal.
 *
 * Akar masalah yang diuji: tombol Tambah/Edit dulu tampil untuk semua role,
 * padahal server hanya mengizinkan Safety Officer & Admin (403 untuk lainnya),
 * dan 403 itu disamarkan menjadi "Coba ulangi beberapa saat lagi".
 */

import { API } from './support/env.js';
import { test, expect } from './support/test.js';
import { loginViaUi, goToTab, selectPlant, expectToastOnTop } from './support/ui.js';
import { apiLogin } from './support/api.js';

const JADWAL_PLANT_PLACEHOLDER = 'Cari plant...';

async function createScheduleFixture(session, overrides = {}) {
    const res = await session.context.post('/api/schedules', {
        headers: { 'X-CSRF-Token': session.csrfToken },
        data: { plantId: 9, officer: 'Arif', tahun: 2026, tanggalJadwal: '2026-10-05', periode: 4, minggu: 1, tanggalRealisasi: '', ...overrides },
    });
    expect(res.status(), await res.text()).toBe(201);
    return (await res.json()).schedule;
}

async function fetchSchedule(session, id) {
    const res = await session.context.get('/api/schedules');
    expect(res.ok()).toBe(true);
    return (await res.json()).find((schedule) => schedule.id === id);
}

async function expectToast(page, { variant, title, description }) {
    const toast = page.locator('#toastMessage');
    await expect(toast).toHaveClass(/show/);
    await expect(toast).toHaveAttribute('data-variant', variant);
    await expect(page.locator('#toastText')).toHaveText(title);
    if (description) await expect(page.locator('#toastDescription')).toContainText(description);
    await expect(toast, 'tanpa emoji sebagai ikon utama').not.toContainText(/[✅⚠❌⛔🎉]/u);
}

async function openAddScheduleModal(page) {
    await goToTab(page, 'Penjadwalan');
    await page.getByTestId('schedule-add-btn').click();
    await expect(page.locator('#jadwalModal')).toHaveClass(/show/);
    await selectPlant(page, JADWAL_PLANT_PLACEHOLDER, 'Logistic', '#plantDropdownJadwal');
    await expect(page.locator('#selectedPlantJadwal')).toHaveValue('9');
}

test('Safety Officer menambah jadwal lewat UI: toast berhasil, modal tertutup, tersimpan di server', async ({ page }) => {
    const arif = await apiLogin('arif');
    await loginViaUi(page, 'arif');
    await openAddScheduleModal(page);
    await page.locator('#jadwalMinggu').selectOption('3');
    await page.locator('#jadwalPeriode').selectOption('2');
    await page.locator('#jadwalTanggal').fill('2026-10-12');
    await page.locator('#submitJadwal').click();

    await expectToast(page, { variant: 'success', title: 'Jadwal berhasil disimpan', description: 'berhasil ditambahkan' });
    await expect(page.locator('#jadwalModal')).not.toHaveClass(/show/);
    const id = (await page.locator('#toastDescription').textContent()).match(/SCH-\d+/)[0];

    const stored = await fetchSchedule(arif, id);
    expect(stored).toMatchObject({ plantId: 9, minggu: 3, periode: 2, tahun: 2026, tanggalJadwal: '2026-10-12', tanggalRealisasi: null });
    await expect(page.locator(`[data-action="editJadwal"][data-id="${id}"]`)).toBeVisible();
    await arif.context.dispose();
});

test('Edit jadwal: Tanggal Realisasi tersimpan — tetap ada setelah reload, status Selesai', async ({ page }) => {
    const arif = await apiLogin('arif');
    const schedule = await createScheduleFixture(arif);

    await loginViaUi(page, 'arif');
    await goToTab(page, 'Penjadwalan');
    await page.locator(`[data-action="editJadwal"][data-id="${schedule.id}"]`).click();
    await expect(page.locator('#jadwalModal')).toHaveClass(/show/);
    await expect(page.locator('#jadwalTanggal')).toHaveValue('2026-10-05');
    await page.locator('#jadwalRealisasi').fill('2026-09-25');
    await page.locator('#submitJadwal').click();
    await expectToast(page, { variant: 'success', title: 'Jadwal berhasil disimpan', description: `Perubahan jadwal ${schedule.id} berhasil disimpan` });

    expect(await fetchSchedule(arif, schedule.id)).toMatchObject({ tanggalJadwal: '2026-10-05', tanggalRealisasi: '2026-09-25', plantId: 9 });

    await page.reload();
    await expect(page.getByTestId('user-name')).toBeVisible();
    await goToTab(page, 'Penjadwalan');
    const row = page.locator('#jadwalTableBody tr', { has: page.locator(`[data-id="${schedule.id}"]`) });
    await expect(row).toContainText('Selesai');
    await row.locator('[data-action="editJadwal"]').click();
    await expect(page.locator('#jadwalRealisasi')).toHaveValue('2026-09-25');
    await arif.context.dispose();
});

test('role tanpa izin (Manajer): tidak ada tombol Tambah/Edit; server tetap menolak 403', async ({ page }) => {
    const arif = await apiLogin('arif');
    const schedule = await createScheduleFixture(arif);

    await loginViaUi(page, 'andi');
    await goToTab(page, 'Penjadwalan');
    await expect(page.locator('#jadwalTableBody')).toContainText('Logistic');
    await expect(page.getByTestId('schedule-add-btn')).toBeHidden();
    await expect(page.locator('#jadwalTableBody [data-action="editJadwal"]')).toHaveCount(0);

    // Pemeriksaan di browser bukan otorisasi: kirim langsung dengan sesi andi.
    const { csrfToken } = await (await page.request.get(`${API}/auth/me`)).json();
    const put = await page.request.put(`${API}/schedules/${schedule.id}`, {
        headers: { 'X-CSRF-Token': csrfToken },
        data: { plantId: 9, officer: 'Arif', tahun: 2026, tanggalJadwal: '2026-10-05', periode: 4, minggu: 1, tanggalRealisasi: '2026-09-25' },
    });
    expect(put.status()).toBe(403);
    expect((await fetchSchedule(arif, schedule.id)).tanggalRealisasi).toBeNull();
    await arif.context.dispose();
});

test('simpan gagal: toast error dengan alasan sebenarnya (403 / server), modal tetap terbuka, toast bisa ditutup', async ({ page }) => {
    await loginViaUi(page, 'arif');
    await openAddScheduleModal(page);

    // Jawaban server dipaksa lewat intersepsi — hanya POST penyimpanan jadwal.
    let reply = { status: 403, body: { error: 'FORBIDDEN', message: 'Role tidak diizinkan' } };
    await page.route('**/api/schedules', (route) => (route.request().method() === 'POST'
        ? route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) })
        : route.continue()));

    await page.locator('#submitJadwal').click();
    await expectToast(page, { variant: 'error', title: 'Gagal menyimpan jadwal', description: 'Hanya Safety Officer dan Administrator yang dapat menambah atau mengubah jadwal' });
    await expect(page.locator('#toastMessage')).not.toContainText('Coba ulangi');
    await expect(page.locator('#jadwalModal'), 'isian tidak hilang').toHaveClass(/show/);
    await expectToastOnTop(page, 'Gagal menyimpan jadwal'); // di atas overlay modal

    await page.getByRole('button', { name: 'Tutup notifikasi' }).click();
    await expect(page.locator('#toastMessage')).not.toHaveClass(/show/);

    reply = { status: 500, body: { error: 'INTERNAL_ERROR' } };
    await page.locator('#submitJadwal').click();
    await expectToast(page, { variant: 'error', title: 'Gagal menyimpan jadwal', description: 'Server tidak dapat dihubungi atau sedang bermasalah' });
});

test('toast responsif: 375/390 tetap di dalam layar dengan margin aman; 1280/1440 kanan bawah, ringkas', async ({ page }) => {
    await loginViaUi(page, 'arif');
    await openAddScheduleModal(page);

    for (const [width, height] of [[375, 667], [390, 844], [1280, 800], [1440, 900]]) {
        await page.setViewportSize({ width, height });
        await page.locator('[data-action="setRealisasiHariIni"]').click();
        await expectToast(page, { variant: 'info', title: 'Tanggal realisasi diisi hari ini' });
        await expect.poll(() => page.locator('#toastMessage').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
        const box = await page.locator('#toastMessage').evaluate((el) => {
            const rect = el.getBoundingClientRect();
            return { left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, pageOverflow: document.documentElement.scrollWidth > window.innerWidth };
        });
        expect(box.pageOverflow, `${width}px: tanpa scroll horizontal`).toBe(false);
        expect(box.left, `${width}px: margin kiri`).toBeGreaterThanOrEqual(12);
        expect(width - box.right, `${width}px: margin kanan`).toBeGreaterThanOrEqual(12);
        expect(height - box.bottom, `${width}px: margin bawah`).toBeGreaterThanOrEqual(12);
        if (width >= 1280) {
            expect(box.width, `${width}px: ringkas`).toBeLessThanOrEqual(380);
            expect(width - box.right, `${width}px: menempel kanan`).toBeLessThanOrEqual(32);
        }
        await page.getByRole('button', { name: 'Tutup notifikasi' }).click();
        await expect(page.locator('#toastMessage')).not.toHaveClass(/show/);
    }
});
