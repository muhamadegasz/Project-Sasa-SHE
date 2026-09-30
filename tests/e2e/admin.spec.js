/* admin.spec.js — Phase 18: panel Admin (pengelolaan akun), hapus inspeksi
 * oleh Admin, dan gating navigasi per role.
 *
 * Setiap aksi dilakukan lewat UI sungguhan lalu dibuktikan lewat API (sisi
 * server). Akun uji dibuat baru dengan username unik (password = username,
 * supaya apiLogin() berlaku) — akun seed tidak pernah diubah.
 *
 * Tabel akun berhalaman (10 per halaman) dan test berjalan paralel, jadi
 * jumlah seluruh akun tidak tetap: setiap test mencari akunnya sendiri lewat
 * kotak pencarian, bukan mengandalkan akun itu ada di halaman 1.
 */

import { test, expect } from './support/test.js';
import { loginViaUi, goToTab, allInspeksiRow } from './support/ui.js';
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
const userRows = (page) => page.locator('#usersTableBody [data-testid="user-row"]');
const usersSummary = (page) => page.getByTestId('users-pagination-summary');
const usersPagination = (page) => page.locator('#usersPagination');
const deleteDialog = (page) => page.locator('#deleteUserModal');

async function searchUsers(page, query) {
    await page.locator('#searchUsersInput').fill(query);
}

/** Akun Safety Officer lewat API (password = username); `active: false` langsung dinonaktifkan. */
async function createUserViaApi(adminSession, username, { active = true } = {}) {
    const headers = { 'X-CSRF-Token': adminSession.csrfToken };
    const res = await adminSession.context.post('/api/users', { headers, data: { username, displayName: `Uji ${username}`, role: 'safety_officer', password: username } });
    expect(res.status(), await res.text()).toBe(201);
    const { user } = await res.json();
    if (!active) {
        const off = await adminSession.context.put(`/api/users/${user.id}/active`, { headers, data: { isActive: false } });
        expect(off.status(), await off.text()).toBe(200);
    }
    return user;
}

/**
 * Logout lalu login akun lain DI HALAMAN YANG SAMA (tanpa reload — beda dari
 * loginViaUi yang memulai dengan page.goto): DOM, tab aktif, dan panel tetap
 * yang lama, persis seperti pengguna sungguhan yang berganti akun.
 */
async function switchAccountWithoutReload(page, username) {
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByTestId('user-name')).not.toBeVisible();
    await page.getByLabel('Username', { exact: true }).fill(username);
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

test('Admin mengelola akun lewat UI: buat Koordinator (plant wajib), ubah role -> plant dilepas, nonaktifkan, hapus permanen lewat dialog ketik ulang username', async ({ page }) => {
    const admin = await apiLogin('admin');
    const username = uniqueUsername('koor');

    await loginViaUi(page, 'admin');
    await openAdminPanel(page);
    // Kolom pertama "Username": username login, bukan id database.
    await expect(page.locator('#panel-admin thead th')).toHaveText(['Username', 'Nama', 'Role', 'Plant', 'Status', 'Aksi']);
    await expect(page.locator('#panel-admin')).not.toContainText('ID Login');
    await searchUsers(page, 'admin');
    await expect(userRow(page, 'admin').locator('td').first()).toHaveText('admin');
    // Akun sendiri tidak punya tombol nonaktifkan/hapus.
    await expect(userRow(page, 'admin').getByTestId('user-edit-btn')).toBeVisible();
    await expect(userRow(page, 'admin').getByTestId('user-deactivate-btn')).toHaveCount(0);
    await expect(userRow(page, 'admin').getByTestId('user-delete-btn')).toHaveCount(0);

    // Buat Koordinator: plant hanya muncul untuk role Koordinator, dan wajib.
    await page.getByTestId('add-user-btn').click();
    const modal = page.locator('#userModal');
    await expect(modal).toHaveClass(/show/);
    await expect(modal.getByLabel('Plant Koordinator')).toBeHidden();
    await modal.getByLabel('Username').fill(username);
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
    // Pencarian "admin" dikosongkan; akun baru langsung terlihat di halaman 1.
    await expect(page.locator('#searchUsersInput')).toHaveValue('');
    await expect(userRow(page, username)).toBeVisible();
    // Langkah berikutnya lewat pencarian: test paralel lain bisa membuat akun yang lebih baru.
    await searchUsers(page, username);
    await expect(userRow(page, username)).toContainText('Koordinator K3L');
    await expect(userRow(page, username)).toContainText('Logistic');
    let saved = (await fetchUsers(admin)).find((user) => user.username === username);
    expect(saved).toMatchObject({ displayName: 'Koordinator Uji', role: 'koordinator_k3l', plantId: 9, isActive: true });
    await (await apiLogin(username)).context.dispose(); // akun baru bisa login

    // Ubah role menjadi Manajer: plant otomatis dilepas.
    await userRow(page, username).getByTestId('user-edit-btn').click();
    await expect(modal.getByLabel('Username')).toBeDisabled();
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

    // Hapus permanen lewat dialog: permanen dijelaskan; "Hapus Permanen" baru aktif bila username cocok persis.
    const dialog = deleteDialog(page);
    const confirmInput = dialog.getByLabel(/ketik username/);
    const confirmButton = dialog.getByRole('button', { name: 'Hapus Permanen' });
    await userRow(page, username).getByTestId('user-delete-btn').click();
    await expect(dialog).toHaveClass(/show/);
    await expect(dialog.getByRole('heading')).toContainText('Hapus pengguna');
    await expect(dialog).toContainText('Tindakan ini permanen dan tidak dapat dibatalkan.');
    await expect(dialog).toContainText(`Untuk melanjutkan, ketik username: ${username}`);
    await expect(confirmInput).toBeFocused();
    await expect(confirmButton).toBeDisabled();

    // Username salah ditolak: tombol tetap nonaktif, Enter pun tidak menghapus.
    for (const wrong of ['salah', username.toUpperCase(), `${username}x`, username.slice(0, -1)]) {
        await confirmInput.fill(wrong);
        await expect(confirmButton, wrong).toBeDisabled();
    }
    await confirmInput.press('Enter');
    await expect(dialog).toHaveClass(/show/);
    expect((await fetchUsers(admin)).some((user) => user.username === username)).toBe(true);

    // Batal menutup tanpa menghapus; dibuka lagi -> isian kosong.
    await dialog.getByRole('button', { name: 'Batal' }).click();
    await expect(dialog).not.toHaveClass(/show/);
    expect((await fetchUsers(admin)).some((user) => user.username === username)).toBe(true);
    await userRow(page, username).getByTestId('user-delete-btn').click();
    await expect(confirmInput).toHaveValue('');
    await expect(confirmButton).toBeDisabled();

    // Username benar (spasi di tepi diabaikan) -> terhapus dan hilang dari daftar.
    await confirmInput.fill(`  ${username}  `);
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();
    await expect(page.locator('#toastMessage')).toContainText(`Akun ${username} dihapus permanen`);
    await expect(dialog).not.toHaveClass(/show/);
    await expect(userRow(page, username)).toHaveCount(0);
    await expect(page.getByTestId('users-empty')).toHaveText('Tidak ada pengguna yang cocok dengan pencarian');
    expect((await fetchUsers(admin)).some((user) => user.username === username)).toBe(false);
    await admin.context.dispose();
});

test('buat pengguna: terbaru di atas; setelah berhasil pencarian dikosongkan, kembali ke halaman 1, akun baru langsung terlihat; ubah akun tidak memindahkan halaman', async ({ page }) => {
    const admin = await apiLogin('admin');
    const prefix = uniqueUsername('br');
    const names = Array.from({ length: 11 }, (_, index) => `${prefix}${String(index + 1).padStart(2, '0')}`);
    for (const name of names) await createUserViaApi(admin, name);
    const username = uniqueUsername('baru');

    await loginViaUi(page, 'admin');
    await openAdminPanel(page);

    // Terbaru dibuat di atas (id menurun), baru kemudian dibagi per halaman.
    await searchUsers(page, prefix);
    await expect(userRows(page).locator('td:first-child')).toHaveText([...names].reverse().slice(0, 10));
    await usersPagination(page).getByRole('button', { name: '2', exact: true }).click();
    await expect(usersSummary(page)).toHaveText('Menampilkan 11–11 dari 11 pengguna');
    await expect(userRows(page).locator('td:first-child')).toHaveText([names[0]]);

    // Ubah akun di halaman 2: pencarian dan halaman tetap.
    await userRow(page, names[0]).getByTestId('user-edit-btn').click();
    const modal = page.locator('#userModal');
    await modal.getByLabel('Nama Tampilan').fill('Nama Diubah');
    await modal.getByRole('button', { name: 'Simpan Pengguna' }).click();
    await expect(page.locator('#toastMessage')).toContainText(`Pengguna ${names[0]} diperbarui`);
    await expect(page.locator('#searchUsersInput')).toHaveValue(prefix);
    await expect(usersSummary(page)).toHaveText('Menampilkan 11–11 dari 11 pengguna');
    await expect(userRow(page, names[0])).toContainText('Nama Diubah');

    // Buat akun dari halaman 2 dengan pencarian aktif -> pencarian kosong, halaman 1, akun baru terlihat.
    await page.getByTestId('add-user-btn').click();
    await modal.getByLabel('Username').fill(username);
    await modal.getByLabel('Nama Tampilan').fill('Petugas Baru');
    await modal.getByLabel('Kata Sandi').fill(username);
    await modal.getByRole('button', { name: 'Simpan Pengguna' }).click();
    await expect(page.locator('#toastMessage')).toContainText(`Pengguna ${username} dibuat`);
    await expect(page.locator('#searchUsersInput')).toHaveValue('');
    await expect(page.locator('#searchUsersCount')).toHaveText('');
    await expect(usersSummary(page)).toHaveText(/^Menampilkan 1–10 dari \d+ pengguna$/);
    await expect(usersPagination(page).locator('[aria-current="page"]')).toHaveText('1');
    await expect(userRow(page, username)).toBeVisible();
    expect((await fetchUsers(admin)).find((user) => user.username === username)).toMatchObject({ role: 'safety_officer', isActive: true });
    await admin.context.dispose();
});

test('hapus permanen: akun aktif tanpa tombol Hapus; akun nonaktif yang masih punya inspeksi belum selesai ditolak server dengan alasan di dialog; selain Admin ditolak API', async ({ page }) => {
    const admin = await apiLogin('admin');
    const active = await createUserViaApi(admin, uniqueUsername('aktif'));
    const owner = await createUserViaApi(admin, uniqueUsername('draf'));
    const ownerSession = await apiLogin(owner.username);
    await createInspectionFixture(ownerSession, {}, { submit: false }); // DRAFT milik akun ini
    await ownerSession.context.dispose();
    const off = await admin.context.put(`/api/users/${owner.id}/active`, { headers: { 'X-CSRF-Token': admin.csrfToken }, data: { isActive: false } });
    expect(off.status()).toBe(200);

    await loginViaUi(page, 'admin');
    await openAdminPanel(page);
    await expect(page.locator('#panel-admin .users-table-note')).toContainText('Hapus permanen hanya untuk akun yang sudah dinonaktifkan');

    // Akun aktif: harus dinonaktifkan dulu — tidak ada tombol Hapus.
    await searchUsers(page, active.username);
    await expect(userRow(page, active.username).getByTestId('user-deactivate-btn')).toBeVisible();
    await expect(userRow(page, active.username).getByTestId('user-delete-btn')).toHaveCount(0);

    // Akun nonaktif dengan DRAFT: tombol ada, tetapi server menolak; alasannya tampil di dialog.
    await searchUsers(page, owner.username);
    await userRow(page, owner.username).getByTestId('user-delete-btn').click();
    const dialog = deleteDialog(page);
    await dialog.getByLabel(/ketik username/).fill(owner.username);
    await dialog.getByRole('button', { name: 'Hapus Permanen' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Pengguna tidak dapat dihapus karena masih memiliki inspeksi yang belum selesai.');
    await expect(dialog).toHaveClass(/show/);
    expect((await fetchUsers(admin)).some((user) => user.username === owner.username)).toBe(true);
    await dialog.getByRole('button', { name: 'Batal' }).click();
    await expect(dialog).not.toHaveClass(/show/);
    await expect(userRow(page, owner.username)).toBeVisible();

    // Selain Admin: operasi akun ditolak server (403) — bukan sekadar menu yang disembunyikan.
    const arif = await apiLogin('arif');
    const headers = { 'X-CSRF-Token': arif.csrfToken };
    expect((await arif.context.get('/api/users')).status()).toBe(403);
    expect((await arif.context.delete(`/api/users/${owner.id}`, { headers })).status()).toBe(403);
    expect((await arif.context.put(`/api/users/${active.id}/active`, { headers, data: { isActive: false } })).status()).toBe(403);
    const after = await fetchUsers(admin);
    expect(after.find((user) => user.id === owner.id)).toBeTruthy();
    expect(after.find((user) => user.id === active.id).isActive).toBe(true);
    await arif.context.dispose();
    await admin.context.dispose();
});

test('pagination Manajemen Pengguna: cari dulu lalu dibagi per halaman; kata kunci berubah -> halaman 1; hapus di halaman terakhir -> halaman terakhir yang masih ada; hasil kosong jelas', async ({ page }) => {
    const admin = await apiLogin('admin');
    const prefix = uniqueUsername('pg');
    const created = [];
    for (let i = 1; i <= 11; i += 1) {
        created.push(await createUserViaApi(admin, `${prefix}${String(i).padStart(2, '0')}`, { active: i !== 1 }));
    }
    // Terbaru di atas: halaman 1 = …11 s.d. …02; akun pertama (…01, nonaktif) sendirian di halaman 2.
    const last = created[0];

    await loginViaUi(page, 'admin');
    await openAdminPanel(page);
    // Tanpa pencarian: seluruh akun (9 seed + 11 akun ini, ditambah akun test lain) dibagi per 10.
    await expect(usersSummary(page)).toHaveText(/^Menampilkan 1–10 dari \d+ pengguna$/);
    expect(Number((await usersSummary(page).textContent()).match(/dari (\d+)/)[1])).toBeGreaterThanOrEqual(20);
    await expect(userRows(page)).toHaveCount(10);

    // Pencarian atas seluruh akun, baru dibagi per halaman: jumlah = hasil pencarian.
    await searchUsers(page, prefix);
    await expect(page.locator('#searchUsersCount')).toHaveText(/^11 dari \d+$/);
    await expect(usersSummary(page)).toHaveText('Menampilkan 1–10 dari 11 pengguna');
    await expect(userRows(page)).toHaveCount(10);
    for (const cell of await userRows(page).locator('td:first-child').allTextContents()) expect(cell).toContain(prefix);

    await usersPagination(page).getByRole('button', { name: '2', exact: true }).click();
    await expect(usersSummary(page)).toHaveText('Menampilkan 11–11 dari 11 pengguna');
    await expect(userRows(page)).toHaveCount(1);
    await expect(userRow(page, last.username)).toBeVisible();

    // Kata kunci berubah (dikosongkan) -> kembali ke halaman 1, bukan tetap di halaman 2.
    await page.locator('#clearSearchUsers').click();
    await expect(usersSummary(page)).toHaveText(/^Menampilkan 1–10 dari \d+ pengguna$/);
    await searchUsers(page, prefix);
    await expect(usersSummary(page)).toHaveText('Menampilkan 1–10 dari 11 pengguna');

    // Hapus satu-satunya akun di halaman 2 -> halaman 2 tidak ada lagi -> halaman 1.
    await usersPagination(page).getByRole('button', { name: '2', exact: true }).click();
    await expect(usersSummary(page)).toHaveText('Menampilkan 11–11 dari 11 pengguna');
    await userRow(page, last.username).getByTestId('user-delete-btn').click();
    await deleteDialog(page).getByLabel(/ketik username/).fill(last.username);
    await deleteDialog(page).getByRole('button', { name: 'Hapus Permanen' }).click();
    await expect(page.locator('#toastMessage')).toContainText(`Akun ${last.username} dihapus permanen`);
    await expect(usersSummary(page)).toHaveText('Menampilkan 1–10 dari 10 pengguna');
    await expect(userRows(page)).toHaveCount(10);
    await expect(usersPagination(page).getByRole('button')).toHaveCount(0); // satu halaman: ringkasan saja
    expect((await fetchUsers(admin)).some((user) => user.username === last.username)).toBe(false);

    // Pencarian tanpa hasil: pesan jelas, tanpa navigasi halaman.
    await searchUsers(page, `${prefix}-tidak-ada`);
    await expect(page.getByTestId('users-empty')).toHaveText('Tidak ada pengguna yang cocok dengan pencarian');
    await expect(userRows(page)).toHaveCount(0);
    await expect(usersPagination(page)).toBeEmpty();
    await admin.context.dispose();
});

test('Admin menghapus inspeksi non-draft lewat UI (konfirmasi eksplisit); Safety Officer tidak melihat tombolnya; tombol hapus jadwal hanya untuk Admin', async ({ page, browser }) => {
    const arif = await apiLogin('arif');
    const admin = await apiLogin('admin');
    const inspection = await createInspectionFixture(arif);

    // Safety Officer pemilik: tidak ada tombol hapus Admin, tidak ada tombol hapus jadwal.
    await loginViaUi(page, 'arif');
    const officerRow = await allInspeksiRow(page, inspection.id);
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
    const adminRow = await allInspeksiRow(page, inspection.id);
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
