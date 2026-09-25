/* session.spec.js — Phase 14.1-G: SESSION #4-5, REGRESSION #14.
 *
 * Catatan locator: #loginPage disembunyikan lewat opacity:0 + pointer-events:
 * none (transisi fade, assets/css/02-login.css), BUKAN display:none — jadi
 * Playwright toBeVisible() TIDAK bisa dipakai untuk memastikan halaman login
 * benar-benar tersembunyi (opacity:0 masih dihitung "visible" oleh Playwright,
 * ini perilaku terdokumentasi resmi, bukan bug). #mainApp sebaliknya memakai
 * display:none/block sungguhan (assets/css/03-layout.css) — jadi status login
 * di sini selalu diperiksa lewat getByTestId('user-name') (turunan #mainApp),
 * bukan lewat tombol "Masuk" di dalam #loginPage.
 */

import { test, expect } from '@playwright/test';
import { loginViaUi } from './support/ui.js';

test('sesi tetap ada setelah reload halaman (dipulihkan lewat GET /api/auth/me)', async ({ page }) => {
    await loginViaUi(page, 'andi');

    await page.reload();

    await expect(page.getByTestId('user-name')).toBeVisible();
    await expect(page.getByTestId('user-name')).toHaveText('Andi');
});

test('sesi yang tidak valid/hilang mengembalikan pengguna ke halaman login setelah reload', async ({ page }) => {
    await loginViaUi(page, 'hadi');

    // Mensimulasikan sesi yang sudah tidak valid (habis/dihapus) tanpa
    // menunggu 8 jam sungguhan: sesi dihancurkan LANGSUNG DI SERVER lewat
    // panggilan API (page.request berbagi cookie jar dengan browser), bukan
    // lewat context().clearCookies() — cookie browser TETAP ada (persis
    // kondisi sesi "kedaluwarsa/dihapus" sungguhan, bukan "belum pernah
    // login"), dan ini menghindari race non-deterministik pada penghapusan
    // cookie browser yang sempat teramati flaky di run paralel.
    const me = await page.request.get('http://project-sasa-she.test:3001/api/auth/me');
    const { csrfToken } = await me.json();
    await page.request.post('http://project-sasa-she.test:3001/api/auth/logout', {
        headers: { 'X-CSRF-Token': csrfToken },
    });

    await page.reload();

    await expect(page.getByTestId('user-name')).not.toBeVisible();
    await expect(page.getByLabel('Username')).toBeFocused();
});

test('regresi D-3: login-logout-login berulang tiga kali tidak melempar error JS (Chart.js/listener tidak rusak)', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));

    for (let i = 0; i < 3; i++) {
        await loginViaUi(page, 'melka');
        // Timeout diperpanjang (10s): lihat catatan di auth.spec.js/Phase 14.1-I.
        await expect(page.locator('#statTotalInspeksi')).not.toHaveText('0', { timeout: 10_000 });

        page.once('dialog', (dialog) => dialog.accept());
        await page.getByRole('button', { name: 'Logout' }).click();
        await expect(page.getByTestId('user-name')).not.toBeVisible();
    }

    expect(pageErrors, `error JS tidak terduga selama siklus login-logout: ${pageErrors.join(' | ')}`).toEqual([]);
});
