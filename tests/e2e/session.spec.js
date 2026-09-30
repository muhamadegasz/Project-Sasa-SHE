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

import { API } from './support/env.js';
import { test, expect } from './support/test.js';
import { loginViaUi, expectToastOnTop } from './support/ui.js';

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
    const me = await page.request.get(`${API}/auth/me`);
    const { csrfToken } = await me.json();
    await page.request.post(`${API}/auth/logout`, {
        headers: { 'X-CSRF-Token': csrfToken },
    });

    await page.reload();

    await expect(page.getByTestId('user-name')).not.toBeVisible();
    await expect(page.getByLabel('Username', { exact: true })).toBeFocused();
});

// Phase 17.4C: GET /api/auth/me saat membuka halaman login tanpa sesi memang
// 401 — itu bukan sesi yang berakhir, jadi tidak boleh ada pesan "Sesi berakhir".
test('kunjungan baru tanpa sesi: halaman login bersih, tanpa pesan palsu "Sesi berakhir"', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));

    const [me] = await Promise.all([
        page.waitForResponse((res) => res.url().endsWith('/api/auth/me')),
        page.goto('/'),
    ]);
    expect(me.status()).toBe(401);
    // #authLoading baru disembunyikan setelah restoreSession() selesai (legacy-app.js,
    // DOMContentLoaded) — saat itu penanganan 401-nya pasti sudah berjalan.
    await expect(page.locator('#authLoading')).toHaveClass(/hidden/);
    await expect(page.getByLabel('Username', { exact: true })).toBeFocused();

    await expect(page.locator('#toastMessage')).not.toHaveClass(/show/);
    await expect(page.locator('#toastMessage')).not.toContainText('Sesi berakhir');
    expect(pageErrors).toEqual([]);
});

test('sesi yang berakhir DI TENGAH pemakaian (tanpa reload): permintaan berikutnya -> pesan "Sesi berakhir" dan kembali ke halaman login', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    await loginViaUi(page, 'arif');
    // Tunggu pemuatan awal (initApp() berjalan ~300ms setelah login) selesai,
    // supaya 401 berikutnya berasal dari klik di bawah, bukan dari pemuatan itu.
    await expect(page.locator('#statTotalInspeksi')).not.toHaveText('0', { timeout: 10_000 });
    await page.waitForLoadState('networkidle');
    const detailButton = page.locator('#inspeksiTableBody').getByTestId('row-detail-btn').first();
    await expect(detailButton).toBeVisible();

    // Sesi dihancurkan di server (cookie browser tetap ada), seperti sesi yang kedaluwarsa.
    const { csrfToken } = await (await page.request.get(`${API}/auth/me`)).json();
    await page.request.post(`${API}/auth/logout`, { headers: { 'X-CSRF-Token': csrfToken } });

    const [expired] = await Promise.all([
        page.waitForResponse((res) => /\/api\/inspections\/INS-\d+$/.test(res.url())),
        detailButton.click(),
    ]);
    expect(expired.status()).toBe(401);
    // Release: pesan itu juga harus TERLIHAT di atas halaman login (dulu tertutup, z-index).
    await expectToastOnTop(page, 'Sesi berakhir, silakan login kembali');
    await expect(page.getByTestId('user-name')).not.toBeVisible();
    await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
    expect(pageErrors).toEqual([]);
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

/**
 * Mencatat opasitas #loginPage TEPAT saat #authLoading disembunyikan — dari
 * MutationObserver yang dipasang sebelum dokumen dimuat, dijalankan sebelum
 * frame berikutnya dilukis. Mengukur sesudahnya tidak cukup: transisi 0.6s
 * sudah berjalan dan kilasannya terlewat.
 */
function recordLoginOpacityWhenAuthKnown() {
    window.__authReady = null;
    const observer = new MutationObserver(() => {
        const loading = document.getElementById('authLoading');
        const login = document.getElementById('loginPage');
        if (!loading || !login || window.__authReady || !loading.classList.contains('hidden')) return;
        window.__authReady = {
            loginOpacity: getComputedStyle(login).opacity,
            mainApp: getComputedStyle(document.getElementById('mainApp')).display,
        };
        observer.disconnect();
    });
    observer.observe(document, { attributes: true, subtree: true, attributeFilter: ['class'] });
}

test('reload dengan sesi yang masih berlaku: kartu login sudah tidak terlihat saat overlay pemuatan hilang (tanpa kilasan login di atas dashboard)', async ({ page }) => {
    await loginViaUi(page, 'arif');
    await page.addInitScript(recordLoginOpacityWhenAuthKnown);

    await page.reload();
    await expect(page.getByTestId('user-name')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__authReady)).not.toBeNull();
    const atAuthReady = await page.evaluate(() => window.__authReady);
    expect(atAuthReady.mainApp, 'sesi dipulihkan: dashboard tampil').toBe('block');
    expect(atAuthReady.loginOpacity, 'kartu login tidak terlihat saat dashboard muncul').toBe('0');
});

test('kunjungan baru tanpa sesi: halaman login tetap muncul penuh setelah overlay pemuatan hilang', async ({ page }) => {
    await page.addInitScript(recordLoginOpacityWhenAuthKnown);
    await page.goto('/');
    await expect(page.locator('#authLoading')).toHaveClass(/hidden/);
    await expect(page.locator('#loginPage')).toHaveCSS('opacity', '1');
    await expect(page.locator('#loginPage')).toHaveCSS('pointer-events', 'auto');
    await expect(page.getByLabel('Username', { exact: true })).toBeFocused();
    expect((await page.evaluate(() => window.__authReady)).mainApp).toBe('none');
});
