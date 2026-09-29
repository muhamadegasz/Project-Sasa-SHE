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

import { API } from './support/env.js';
import { test, expect } from './support/test.js';
import { loginViaUi } from './support/ui.js';

test('login dengan password salah tetap di halaman login, field password dikosongkan', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Username').fill('arif');
    await page.getByLabel('Password').fill('password-salah');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByTestId('user-name')).not.toBeVisible();
    await expect(page.getByLabel('Password')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Masuk' })).toBeVisible();
    // Phase 17.4C: 401 kredensial salah bukan sesi yang kedaluwarsa.
    await expect(page.locator('#toastMessage')).not.toContainText('Sesi berakhir');
});

// Release: halaman login tidak boleh membocorkan akun/password uji (SECURITY.md S-01).
test('halaman login tidak menampilkan petunjuk akun atau password', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Masuk' })).toBeVisible();
    const loginText = await page.locator('#loginPage').innerText();
    expect(loginText).not.toMatch(/akun uji|password sama|arif\s*\/\s*arif/i);
    expect(await page.content()).not.toContain('seed.js');
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

    const beforeLogout = await page.request.get(`${API}/inspections`);
    expect(beforeLogout.ok()).toBe(true);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Logout' }).click();

    await expect(page.getByTestId('user-name')).not.toBeVisible();

    const afterLogout = await page.request.get(`${API}/inspections`);
    expect(afterLogout.status()).toBe(401);
});

test('navbar memakai logo perusahaan (aset lokal) — termuat dan tidak gepeng', async ({ page }) => {
    await loginViaUi(page, 'arif');
    const logo = page.getByTestId('navbar-logo');
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
    const info = await logo.evaluate((img) => {
        const rect = img.getBoundingClientRect();
        return { src: img.src, rendered: rect.width / rect.height, natural: img.naturalWidth / img.naturalHeight };
    });
    expect(info.src).toMatch(/\/src\/asset\/company_logo\.png$/);
    expect(Math.abs(info.rendered - info.natural) / info.natural).toBeLessThan(0.03);
});

// Header: nama + role pengguna login (dari sesi, bukan username); lonceng notifikasi yang tidak berfungsi sudah dihapus.
for (const [username, name, role] of [
    ['arif', 'Arif', 'Safety Officer'],
    ['andi', 'Andi', 'Manajer Bagian'],
    ['hadi', 'Hadi', 'Ketua P2K3'],
    ['admin', 'Administrator', 'Administrator'],
]) {
    test(`header: ${username} melihat nama dan role "${role}", tanpa plant`, async ({ page }) => {
        await loginViaUi(page, username);
        await expect(page.getByTestId('user-name')).toHaveText(name);
        await expect(page.getByTestId('user-role')).toHaveText(role);
        await expect(page.locator('#notifContainer, .notif-bell')).toHaveCount(0);
    });
}

async function assignedPlantName(page) {
    const { user } = await (await page.request.get(`${API}/auth/me`)).json();
    const plants = await (await page.request.get(`${API}/plants`)).json();
    const plant = plants.find((row) => String(row.id) === String(user.plantId));
    expect(plant, 'Koordinator punya plant yang ditugaskan').toBeTruthy();
    return plant.name;
}

test('header: Koordinator K3L melihat role + nama plant cakupannya', async ({ page }) => {
    await loginViaUi(page, 'dewi');
    const plantName = await assignedPlantName(page);
    await expect(page.getByTestId('user-name')).toHaveText('Dewi');
    await expect(page.getByTestId('user-role')).toHaveText(`Koordinator K3L · ${plantName}`);
    await expect(page.getByTestId('user-role')).toHaveAttribute('title', `Koordinator K3L · ${plantName}`);
});

test('header responsif: nama + role tetap terbaca, tanpa luapan horizontal di 375/390/1280/1440px', async ({ page }) => {
    await loginViaUi(page, 'dewi'); // teks role terpanjang: Koordinator K3L + nama plant
    const plantName = await assignedPlantName(page);
    await expect(page.getByTestId('user-role')).toHaveText(`Koordinator K3L · ${plantName}`);

    for (const width of [375, 390, 1280, 1440]) {
        await page.setViewportSize({ width, height: 800 });
        await expect(page.getByTestId('user-name')).toBeVisible();
        await expect(page.getByTestId('user-role')).toBeVisible();
        const layout = await page.evaluate(() => {
            const role = document.querySelector('[data-testid="user-role"]');
            const name = document.querySelector('[data-testid="user-name"]');
            const context = document.createElement('canvas').getContext('2d');
            context.font = getComputedStyle(role).font;
            return {
                pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
                userRight: document.querySelector('[data-testid="header-user"]').getBoundingClientRect().right,
                logoutRight: document.querySelector('[data-action="logout"]').getBoundingClientRect().right,
                // Label role ("Koordinator K3L") selalu utuh; yang boleh terpotong hanya nama plant.
                roleLabelFits: role.clientWidth >= context.measureText('Koordinator K3L').width,
                roleTruncated: role.scrollWidth > role.clientWidth,
                nameTruncated: name.scrollWidth > name.clientWidth,
            };
        });
        expect(layout.pageOverflow, `${width}px: tanpa scroll horizontal`).toBe(false);
        expect(layout.userRight, `${width}px: identitas di dalam layar`).toBeLessThanOrEqual(width);
        expect(layout.logoutRight, `${width}px: tombol keluar di dalam layar`).toBeLessThanOrEqual(width);
        expect(layout.roleLabelFits, `${width}px: label role utuh`).toBe(true);
        expect(layout.nameTruncated, `${width}px: nama utuh`).toBe(false);
        if (width >= 1280) expect(layout.roleTruncated, `${width}px: role + plant utuh`).toBe(false);
    }

    // Tombol keluar tetap tombol logout yang sama (data-action="logout").
    await page.setViewportSize({ width: 390, height: 800 });
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByTestId('user-name')).not.toBeVisible();
});
