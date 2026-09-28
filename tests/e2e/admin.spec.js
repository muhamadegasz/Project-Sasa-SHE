/* admin.spec.js — Phase 18: panel Admin (pengelolaan akun), hapus inspeksi
 * oleh Admin, dan gating navigasi per role.
 *
 * Setiap aksi dilakukan lewat UI sungguhan lalu dibuktikan lewat API (sisi
 * server). Akun uji dibuat baru dengan username unik (password = username,
 * supaya apiLogin() berlaku) — akun seed tidak pernah diubah.
 */

import { test, expect } from './support/test.js';
import { loginViaUi, goToTab } from './support/ui.js';
import { apiLogin, createInspectionFixture } from './support/api.js';

const uniqueUsername = (prefix) => `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

async function fetchUsers(adminSession) {
    const res = await adminSession.context.get('/api/users');
    expect(res.status()).toBe(200);
    return res.json();
}

const nav = (page, name) => page.locator('#navTabs .nav-tab', { hasText: name });

async function openAdminPanel(page) {
    await nav(page, 'Admin').click();
    await expect(page.locator('#panel-admin')).toHaveClass(/active/);
    await expect(page.locator('#usersTableBody [data-testid="user-row"]').first()).toBeVisible();
}

const userRow = (page, username) => page.locator(`#usersTableBody [data-testid="user-row"][data-username="${username}"]`);

/**
 * Logout lalu login akun lain DI HALAMAN YANG SAMA (tanpa reload — beda dari
 * loginViaUi yang memulai dengan page.goto): DOM, tab aktif, dan panel tetap
 * yang lama, persis seperti pengguna sungguhan yang berganti akun.
 */
async function switchAccountWithoutReload(page, username) {
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByTestId('user-name')).not.toBeVisible();
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(username);
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.getByTestId('user-name')).toBeVisible();
}

test('gating navigasi: tab Admin hanya untuk Admin, "Buat Inspeksi" hanya untuk Safety Officer; berganti akun di halaman yang sama menutup tab Admin', async ({ page }) => {
    await loginViaUi(page, 'admin');
    await expect(nav(page, 'Admin')).toBeVisible();
    await expect(nav(page, 'Buat Inspeksi')).toBeHidden();
    await openAdminPanel(page);

    // Admin keluar dengan tab Admin masih aktif; Safety Officer masuk di halaman yang sama.
    await switchAccountWithoutReload(page, 'arif');
    await expect(nav(page, 'Buat Inspeksi')).toBeVisible();
    await expect(nav(page, 'Admin')).toBeHidden();
    await expect(page.locator('#panel-admin')).not.toHaveClass(/active/);
    await expect(page.locator('#panel-dashboard')).toHaveClass(/active/);

    for (const username of ['dewi', 'andi', 'hadi']) {
        await switchAccountWithoutReload(page, username);
        await expect(nav(page, 'Admin'), username).toBeHidden();
        await expect(nav(page, 'Buat Inspeksi'), username).toBeHidden();
        await expect(nav(page, 'Dashboard'), username).toBeVisible();
    }
});

test('Admin mengelola akun lewat UI: buat Koordinator (plant wajib), ubah role -> plant dilepas, nonaktifkan, hapus permanen dengan konfirmasi ketik ulang', async ({ page }) => {
    const admin = await apiLogin('admin');
    const username = uniqueUsername('koor');

    await loginViaUi(page, 'admin');
    await openAdminPanel(page);
    // Akun sendiri tidak punya tombol nonaktifkan/hapus.
    await expect(userRow(page, 'admin').getByTestId('user-deactivate-btn')).toHaveCount(0);
    await expect(userRow(page, 'admin').getByTestId('user-delete-btn')).toHaveCount(0);

    // Buat Koordinator: plant hanya muncul untuk role Koordinator, dan wajib.
    await page.getByTestId('add-user-btn').click();
    const modal = page.locator('#userModal');
    await expect(modal).toHaveClass(/show/);
    await expect(modal.getByLabel('Plant Koordinator')).toBeHidden();
    await modal.getByLabel('ID Login').fill(username);
    await modal.getByLabel('Nama Tampilan').fill('Koordinator Uji');
    await modal.getByLabel('Role').selectOption('koordinator_k3l');
    await expect(modal.getByLabel('Plant Koordinator')).toBeVisible();
    await modal.getByLabel('Kata Sandi').fill(username);
    await modal.getByRole('button', { name: 'Simpan Pengguna' }).click();
    await expect(page.locator('#toastMessage')).toContainText('Plant');
    await expect(modal).toHaveClass(/show/);

    await modal.getByLabel('Plant Koordinator').selectOption('9');
    await modal.getByRole('button', { name: 'Simpan Pengguna' }).click();
    await expect(page.locator('#toastMessage')).toContainText(`Pengguna ${username} dibuat`);
    await expect(modal).not.toHaveClass(/show/);
    await expect(userRow(page, username)).toContainText('Koordinator K3L');
    await expect(userRow(page, username)).toContainText('Logistic');
    let saved = (await fetchUsers(admin)).find((user) => user.username === username);
    expect(saved).toMatchObject({ displayName: 'Koordinator Uji', role: 'koordinator_k3l', plantId: 9, isActive: true });
    await (await apiLogin(username)).context.dispose(); // akun baru bisa login

    // Ubah role menjadi Manajer: plant otomatis dilepas.
    await userRow(page, username).getByTestId('user-edit-btn').click();
    await expect(modal.getByLabel('ID Login')).toBeDisabled();
    await expect(modal.getByLabel('Plant Koordinator')).toHaveValue('9');
    await modal.getByLabel('Role').selectOption('manajer_bagian');
    await expect(modal.getByLabel('Plant Koordinator')).toBeHidden();
    await modal.getByRole('button', { name: 'Simpan Pengguna' }).click();
    await expect(page.locator('#toastMessage')).toContainText(`Pengguna ${username} diperbarui`);
    saved = (await fetchUsers(admin)).find((user) => user.username === username);
    expect(saved).toMatchObject({ role: 'manajer_bagian', plantId: null });

    // Nonaktifkan: tidak bisa login lagi.
    page.once('dialog', (dialog) => dialog.accept());
    await userRow(page, username).getByTestId('user-deactivate-btn').click();
    // Badge status, bukan teks baris: tombol "Nonaktifkan" sendiri sudah mengandung "Nonaktif".
    await expect(page.locator('#toastMessage')).toContainText(`Akun ${username} dinonaktifkan`);
    await expect(userRow(page, username).locator('.status-badge')).toHaveText('Nonaktif');
    await expect(apiLogin(username)).rejects.toThrow(/401/);

    // Hapus permanen: username salah -> tidak terhapus; benar -> terhapus.
    page.once('dialog', (dialog) => dialog.accept('salah'));
    await userRow(page, username).getByTestId('user-delete-btn').click();
    await expect(page.locator('#toastMessage')).toContainText('tidak cocok');
    expect((await fetchUsers(admin)).some((user) => user.username === username)).toBe(true);

    page.once('dialog', (dialog) => {
        expect(dialog.type()).toBe('prompt');
        return dialog.accept(username);
    });
    await userRow(page, username).getByTestId('user-delete-btn').click();
    await expect(page.locator('#toastMessage')).toContainText(`Akun ${username} dihapus permanen`);
    await expect(userRow(page, username)).toHaveCount(0);
    expect((await fetchUsers(admin)).some((user) => user.username === username)).toBe(false);
    await admin.context.dispose();
});

test('Admin menghapus inspeksi non-draft lewat UI (konfirmasi eksplisit); Safety Officer tidak melihat tombolnya; tombol hapus jadwal hanya untuk Admin', async ({ page, browser }) => {
    const arif = await apiLogin('arif');
    const admin = await apiLogin('admin');
    const inspection = await createInspectionFixture(arif);

    // Safety Officer pemilik: tidak ada tombol hapus Admin, tidak ada tombol hapus jadwal.
    await loginViaUi(page, 'arif');
    await goToTab(page, 'Inspeksi');
    const officerRow = page.locator('#allInspeksiTable').getByRole('row', { name: inspection.id });
    await expect(officerRow).toBeVisible();
    await expect(officerRow.getByTestId('row-admin-delete-btn')).toHaveCount(0);
    await goToTab(page, 'Penjadwalan');
    await expect(page.locator('#jadwalTableBody tr').first()).toBeVisible();
    await expect(page.locator('#jadwalTableBody').getByTestId('schedule-delete-btn')).toHaveCount(0);

    // Admin: batal -> tetap ada; konfirmasi -> terhapus.
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByTestId('user-name')).not.toBeVisible();
    await loginViaUi(page, 'admin');
    await goToTab(page, 'Penjadwalan');
    await expect(page.locator('#jadwalTableBody').getByTestId('schedule-delete-btn').first()).toBeVisible();
    await goToTab(page, 'Inspeksi');
    const adminRow = page.locator('#allInspeksiTable').getByRole('row', { name: inspection.id });
    const deleteButton = adminRow.getByTestId('row-admin-delete-btn');

    page.once('dialog', (dialog) => dialog.dismiss());
    await deleteButton.click();
    expect((await admin.context.get(`/api/inspections/${inspection.id}`)).status()).toBe(200);

    page.once('dialog', (dialog) => {
        expect(dialog.message()).toContain('tidak bisa dibatalkan');
        return dialog.accept();
    });
    await deleteButton.click();
    await expect(page.locator('#toastMessage')).toContainText(`Inspeksi ${inspection.id} dihapus`);
    await expect(adminRow).toHaveCount(0);
    expect((await admin.context.get(`/api/inspections/${inspection.id}`)).status()).toBe(404);
    expect((await arif.context.get(`/api/inspections/${inspection.id}`)).status()).toBe(404);

    await arif.context.dispose();
    await admin.context.dispose();
});
