/* auth.spec.js — Phase 14.1-G: AUTH #1-3.
 *
 * Catatan locator: status "sudah logout" diperiksa lewat getByTestId('user-name')
 * (turunan #mainApp, display:none/block sungguhan), BUKAN lewat tombol "Masuk"
 * di dalam #loginPage — #loginPage disembunyikan lewat opacity:0 (transisi
 * fade), yang tidak dianggap "tidak visible" oleh Playwright toBeVisible().
 * Mengecek tombol "Masuk" tetap aman di test PERTAMA di bawah karena #loginPage
 * di situ memang TIDAK PERNAH disembunyikan sama sekali (login gagal).
 *
 * Catatan timeout: assertion #statTotalInspeksi diberi timeout lebih panjang
 * dari default (10s) — angka ini baru terisi setelah initApp() (tertunda
 * 300ms sejak login) selesai memuat beberapa endpoint; di bawah worker
 * paralel yang berbagi satu backend, rantai itu kadang melewati 5 detik
 * default. Lihat catatan sejenis di inspection.spec.js (Phase 14.1-I).
 */

import { test, expect } from '@playwright/test';
import { loginViaUi } from './support/ui.js';

test('login dengan password salah tetap di halaman login, field password dikosongkan', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Username').fill('arif');
    await page.getByLabel('Password').fill('password-salah');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByTestId('user-name')).not.toBeVisible();
    await expect(page.getByLabel('Password')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Masuk' })).toBeVisible();
});

test('login dengan kredensial benar masuk ke dashboard dengan identitas yang benar', async ({ page }) => {
    await loginViaUi(page, 'arif');

    await expect(page.getByTestId('user-name')).toHaveText('Arif');
    // Data sungguhan dari MySQL lewat backend (bukan 0/NaN sisa in-memory) —
    // bukti dashboard benar-benar memuat lewat API, bukan cangkang kosong.
    await expect(page.locator('#statTotalInspeksi')).not.toHaveText('0', { timeout: 10_000 });
});

test('logout benar-benar menghapus sesi di server (bukan cuma redirect di UI)', async ({ page }) => {
    await loginViaUi(page, 'dewi');

    const beforeLogout = await page.request.get('http://project-sasa-she.test:3001/api/inspections');
    expect(beforeLogout.ok()).toBe(true);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Logout' }).click();

    await expect(page.getByTestId('user-name')).not.toBeVisible();

    const afterLogout = await page.request.get('http://project-sasa-she.test:3001/api/inspections');
    expect(afterLogout.status()).toBe(401);
});
