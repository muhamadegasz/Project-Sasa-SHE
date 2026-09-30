/* finding-category.spec.js — kategori temuan di form Buat / Revisi Inspeksi.
 *
 * Tanpa kategori bawaan (wajib dipilih); "Lainnya" memunculkan field
 * "Kategori lainnya" yang wajib diisi, tersimpan TERPISAH (kategori tetap
 * "Lainnya", penjelasan di kategoriLainnya), tampil "Lainnya · …" di daftar,
 * dan bertahan di mode edit/revisi. Aturan server diuji di API test.
 */

import { API } from './support/env.js';
import { test, expect } from './support/test.js';
import { loginViaUi, goToTab, selectPlant, allInspeksiRow } from './support/ui.js';
import { apiLogin, approveViaApi, createInspectionFixture } from './support/api.js';

const PLANT_SEARCH_PLACEHOLDER = 'Cari plant... (ketik nama plant)';

async function fetchAs(session, id) {
    const res = await session.context.get(`${API}/inspections/${id}`);
    expect(res.status()).toBe(200);
    return res.json();
}

const categoryOf = (inspection) => inspection.temuan.map(({ deskripsi, kategori, kategoriLainnya }) => [deskripsi, kategori, kategoriLainnya]);

test('buat: tanpa kategori bawaan; "Lainnya" memunculkan field wajib; kategori baku menyembunyikan & mengosongkannya; tersimpan terpisah', async ({ page }) => {
    const arif = await apiLogin('arif');
    await loginViaUi(page, 'arif');
    await goToTab(page, 'Buat Inspeksi');
    const category = page.locator('#kategoriInput');
    const otherGroup = page.locator('#kategoriLainnyaGroup');
    const other = page.locator('#kategoriLainnyaInput');
    const description = page.getByPlaceholder('Contoh: Kabel terbuka');
    const add = page.locator('#panel-form').getByRole('button', { name: 'Tambah' });
    const rows = page.getByTestId('finding-row');

    // 1–2. Default bukan "Kecelakaan": belum ada pilihan, dan kategori wajib dipilih.
    await expect(category).toHaveValue('');
    await expect(category.locator('option:checked')).toHaveText('Pilih kategori...');
    await expect(otherGroup).toBeHidden();
    await description.fill('Tangga darurat terhalang');
    await add.click();
    await expect(page.locator('#toastMessage')).toContainText('Pilih kategori temuan');
    await expect(rows).toHaveCount(0);

    // 3. Kategori baku: tanpa field tambahan; baris menampilkan kategorinya saja.
    await category.selectOption('Kecelakaan');
    await expect(otherGroup).toBeHidden();
    await add.click();
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0).getByTestId('finding-category')).toHaveText('Kecelakaan');
    await expect(category, 'kembali ke "Pilih kategori..." untuk temuan berikutnya').toHaveValue('');

    // 4. "Lainnya": field muncul (label, placeholder, maks. 100); kosong / whitespace ditolak.
    await description.fill('Kursi kerja tidak ergonomis');
    await category.selectOption('Lainnya');
    await expect(otherGroup).toBeVisible();
    await expect(otherGroup.locator('label')).toHaveText(/^Kategori lainnya\s*\*$/);
    await expect(other).toHaveAttribute('placeholder', 'Masukkan kategori temuan...');
    await expect(other).toHaveAttribute('maxlength', '100');
    await add.click();
    await expect(page.locator('#toastMessage')).toContainText('isi kategori lainnya');
    await other.fill('    ');
    await add.click();
    await expect(page.locator('#toastMessage')).toContainText('isi kategori lainnya');
    await expect(rows).toHaveCount(1);

    // 5. Berganti ke kategori baku: field hilang DAN kosong — tidak terkirim sebagai kategori custom.
    await other.fill('Ergonomi');
    await category.selectOption('Kesehatan');
    await expect(otherGroup).toBeHidden();
    await expect(other).toHaveValue('');
    await category.selectOption('Lainnya');
    await expect(other).toHaveValue('');

    // 6. Nilai valid: baris "Lainnya · Ergonomi"; tersimpan terpisah dari kategori.
    await other.fill('  Ergonomi  ');
    await add.click();
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1).getByTestId('finding-category')).toHaveText('Lainnya · Ergonomi');
    await expect(otherGroup).toBeHidden();

    await selectPlant(page, PLANT_SEARCH_PLACEHOLDER, 'Electrical dan Instrument');
    await page.getByTestId('inspection-date').fill(new Date().toISOString().slice(0, 10));
    await page.getByRole('button', { name: 'Simpan Draft' }).click();
    await expect(page.locator('#toastMessage')).toContainText('berhasil disimpan', { timeout: 15_000 });
    const id = (await page.locator('#toastText').textContent()).match(/INS-\d+/)[0];
    expect(categoryOf(await fetchAs(arif, id))).toEqual([
        ['Tangga darurat terhalang', 'Kecelakaan', null],
        ['Kursi kerja tidak ergonomis', 'Lainnya', 'Ergonomi'],
    ]);

    // 8. Edit: temuan "Lainnya" tampil lengkap dengan penjelasannya; simpan ulang tidak mengubahnya.
    await (await allInspeksiRow(page, id)).getByTestId('row-edit-btn').click();
    await expect(page.locator('#inspeksiFormTitle')).toHaveText(`Edit Draft ${id}`);
    await expect(rows.getByTestId('finding-category')).toHaveText(['Kecelakaan', 'Lainnya · Ergonomi']);
    await expect(category).toHaveValue('');
    await expect(otherGroup).toBeHidden();
    await page.getByRole('button', { name: 'Simpan Draft' }).click();
    await expect(page.locator('#toastMessage')).toContainText('berhasil disimpan', { timeout: 15_000 });
    expect(categoryOf(await fetchAs(arif, id))[1]).toEqual(['Kursi kerja tidak ergonomis', 'Lainnya', 'Ergonomi']);
    await arif.context.dispose();
});

test('revisi: temuan "Lainnya" tampil dengan penjelasannya dan dipertahankan sampai diajukan ulang', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif, {
        temuan: [{ deskripsi: 'Pencahayaan gudang kurang', kategori: 'Lainnya', kategoriLainnya: 'Pencahayaan' }],
    });
    await approveViaApi(await apiLogin('dewi'), inspection.id, 'koordinator_k3l');
    const andi = await apiLogin('andi');
    const reject = await andi.context.post(`/api/inspections/${inspection.id}/reject`, {
        headers: { 'X-CSRF-Token': andi.csrfToken }, data: { stageId: 'manajer', reason: 'Lengkapi foto area' },
    });
    expect(reject.status(), await reject.text()).toBe(200);

    await loginViaUi(page, 'arif');
    await (await allInspeksiRow(page, inspection.id)).getByTestId('row-edit-btn').click();
    await expect(page.locator('#inspeksiFormTitle')).toHaveText(`Revisi ${inspection.id}`);
    await expect(page.getByTestId('finding-category')).toHaveText(['Lainnya · Pencahayaan']);

    // Temuan tambahan "Lainnya" saat revisi juga wajib dijelaskan.
    await page.getByPlaceholder('Contoh: Kabel terbuka').fill('Rak tanpa label beban');
    await page.locator('#kategoriInput').selectOption('Lainnya');
    await page.locator('#kategoriLainnyaInput').fill('Penyimpanan');
    await page.locator('#panel-form').getByRole('button', { name: 'Tambah' }).click();
    await page.getByRole('button', { name: 'Simpan & Ajukan Ulang' }).click();
    await expect(page.locator('#toastMessage')).toContainText('diajukan ulang ke Manajer Bagian', { timeout: 15_000 });

    const resubmitted = await fetchAs(arif, inspection.id);
    expect([resubmitted.status, resubmitted.currentApprovalStage]).toEqual(['in_review', 'manajer']);
    expect(categoryOf(resubmitted)).toEqual([
        ['Pencahayaan gudang kurang', 'Lainnya', 'Pencahayaan'],
        ['Rak tanpa label beban', 'Lainnya', 'Penyimpanan'],
    ]);
    await arif.context.dispose();
    await andi.context.dispose();
});
