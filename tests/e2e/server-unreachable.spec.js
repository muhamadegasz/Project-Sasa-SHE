/* server-unreachable.spec.js — release: server autentikasi tidak terjangkau
 * dibedakan dari "tidak ada sesi" (401).
 *
 * Server mati disimulasikan per halaman lewat page.route(...).abort('connectionrefused')
 * — browser melihat kegagalan yang sama dengan server yang benar-benar mati
 * (fetch melempar TypeError), tanpa mematikan backend uji bersama yang dipakai
 * worker lain.
 *
 *   200  -> dashboard, tanpa pesan
 *   401  -> halaman login bersih, tanpa pesan (Phase 17.4C)
 *   tidak terjangkau / 5xx -> halaman login + pesan server tidak terjangkau;
 *        cookie sesi tidak disentuh, bukan "Sesi berakhir"
 */

import { test, expect } from './support/test.js';
import { loginViaUi, expectToastOnTop } from './support/ui.js';

const RESTORE_MESSAGE = 'Server tidak dapat dihubungi. Sesi Anda belum tentu berakhir. Muat ulang setelah server aktif kembali.';
const LOGIN_MESSAGE = 'Server tidak dapat dihubungi. Silakan coba lagi setelah server aktif.';

async function waitForAuthKnown(page) {
    await expect(page.locator('#authLoading')).toHaveClass(/hidden/);
}

test('sesi berlaku + server menjawab 200: dashboard, tanpa pesan galat', async ({ page }) => {
    await loginViaUi(page, 'arif');
    await page.reload();
    await waitForAuthKnown(page);
    await expect(page.getByTestId('user-name')).toHaveText('Arif');
    await expect(page.locator('#toastMessage')).not.toHaveClass(/show/);
});

test('tanpa sesi (401): halaman login bersih — tanpa "Sesi berakhir" dan tanpa pesan server', async ({ page }) => {
    await page.goto('/');
    await waitForAuthKnown(page);
    await expect(page.getByLabel('Username')).toBeFocused();
    await expect(page.locator('#toastMessage')).not.toHaveClass(/show/);
    await expect(page.locator('#toastMessage')).not.toContainText('Sesi berakhir');
    await expect(page.locator('#toastMessage')).not.toContainText('Server tidak dapat dihubungi');
});

test('sesi berlaku tapi server tidak terjangkau saat reload: dashboard tetap tersembunyi, halaman login + pesan jelas; cookie sesi utuh, bukan "Sesi berakhir"', async ({ page, context }) => {
    await loginViaUi(page, 'arif');
    const apiCalls = [];
    await page.route('**/api/**', (route) => {
        apiCalls.push(new URL(route.request().url()).pathname);
        return route.abort('connectionrefused');
    });

    await page.reload();
    await waitForAuthKnown(page);
    await expect(page.locator('#mainApp')).toBeHidden();
    await expect(page.locator('#loginPage')).toHaveCSS('opacity', '1');
    await expect(page.getByLabel('Username')).toBeFocused();
    await expectToastOnTop(page, RESTORE_MESSAGE);
    await expect(page.locator('#toastMessage')).not.toContainText('Sesi berakhir');
    expect(apiCalls, 'hanya pemeriksaan sesi — tidak ada data yang diminta').toEqual(['/api/auth/me']);
    expect((await context.cookies()).some((cookie) => cookie.name === 'she_sasa.sid'), 'server mati bukan logout: cookie tidak disentuh').toBe(true);

    // Server aktif kembali: sesi yang sama pulih tanpa login ulang.
    await page.unroute('**/api/**');
    await page.reload();
    await waitForAuthKnown(page);
    await expect(page.getByTestId('user-name')).toHaveText('Arif');
});

test('server menjawab 5xx saat pemulihan sesi: diperlakukan sebagai tidak terjangkau, bukan logout', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"INTERNAL"}' }));
    await page.goto('/');
    await waitForAuthKnown(page);
    await expect(page.locator('#mainApp')).toBeHidden();
    await expectToastOnTop(page, RESTORE_MESSAGE);
});

test('login dengan password salah: tetap senyap seperti sebelumnya (tanpa pesan apa pun)', async ({ page }) => {
    await page.goto('/');
    await waitForAuthKnown(page);
    await page.getByLabel('Username').fill('arif');
    await page.getByLabel('Password').fill('password-salah');
    const [response] = await Promise.all([
        page.waitForResponse((res) => res.url().endsWith('/api/auth/login')),
        page.getByRole('button', { name: 'Masuk' }).click(),
    ]);
    expect(response.status()).toBe(401);
    await expect(page.getByLabel('Password')).toHaveValue('');
    await expect(page.locator('#toastMessage')).not.toHaveClass(/show/);
});

test('login saat server tidak terjangkau: pesan jelas (tanpa galat mentah), tetap di halaman login', async ({ page }) => {
    await page.goto('/');
    await waitForAuthKnown(page);
    await page.route('**/api/auth/login', (route) => route.abort('connectionrefused'));
    await page.getByLabel('Username').fill('arif');
    await page.getByLabel('Password').fill('arif');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expectToastOnTop(page, LOGIN_MESSAGE);
    await expect(page.locator('#toastMessage')).not.toContainText(/fetch|TypeError|ERR_/i);
    await expect(page.getByLabel('Password')).toHaveValue('');
    await expect(page.getByTestId('user-name')).not.toBeVisible();
});
