/* inspection.spec.js — Phase 14.1-G: INSPECTION #6-8, REGRESSION #15.
 * Phase 15: tes upload foto sungguhan ditambah di sini juga (bukan file
 * baru) — sama-sama alur form "Buat Inspeksi".
 *
 * Catatan timeout: assertion toast "berhasil disimpan" diberi timeout lebih
 * panjang dari default (15s, bukan 5s) — submit sungguhan menempuh INSERT
 * transaksional (findings+corrective_actions+approvals) LALU refreshAll()
 * (beberapa GET susulan), dan di bawah worker paralel yang berbagi satu pool
 * MySQL (connectionLimit:10) + satu proses backend, rantai ini terbukti bisa
 * melewati 5 detik di run nyata — bukan indikasi UI macet, murni waktu tempuh
 * kerja sungguhan di bawah beban uji paralel. Lihat Phase 14.1-I.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { loginViaUi, goToTab, selectPlant } from './support/ui.js';

const PLANT_SEARCH_PLACEHOLDER = 'Cari plant... (ketik nama plant)';
const FIXTURE_JPEG = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'e2e-foto-bukti.jpg');

test('safety officer bisa membuat inspeksi baru lewat form (pilih plant, tambah temuan, submit)', async ({ page }) => {
    await loginViaUi(page, 'arif');
    await goToTab(page, 'Buat Inspeksi');

    await selectPlant(page, PLANT_SEARCH_PLACEHOLDER, 'Electrical dan Instrument');

    await page.getByPlaceholder('Contoh: Kabel terbuka').fill('E2E: kabel terkelupas di panel utama');
    await page.locator('#panel-form').getByRole('button', { name: 'Tambah' }).click();
    await expect(page.locator('#temuanListContainer')).toContainText('E2E: kabel terkelupas di panel utama');

    await page.getByTestId('inspection-date').fill(new Date().toISOString().slice(0, 10));
    await page.getByRole('button', { name: 'Simpan Inspeksi' }).click();

    await expect(page.locator('#toastMessage')).toContainText('berhasil disimpan', { timeout: 15_000 });
    const toastText = await page.locator('#toastText').textContent();
    const newId = toastText.match(/INS-\d+/)?.[0];
    expect(newId, `toast tidak memuat id inspeksi baru: "${toastText}"`).toBeTruthy();
});

test('identitas petugas yang dipakai adalah user yang sedang login, bukan input bebas', async ({ page }) => {
    await loginViaUi(page, 'arif');
    await goToTab(page, 'Buat Inspeksi');

    const petugasField = page.getByTestId('inspection-officer-display');
    await expect(petugasField).toHaveValue('Arif');
    await expect(petugasField).toHaveAttribute('readonly', '');

    await selectPlant(page, PLANT_SEARCH_PLACEHOLDER, 'UTILITY');
    await page.getByPlaceholder('Contoh: Kabel terbuka').fill('E2E: verifikasi identitas petugas');
    await page.locator('#panel-form').getByRole('button', { name: 'Tambah' }).click();
    await page.getByTestId('inspection-date').fill(new Date().toISOString().slice(0, 10));
    await page.getByRole('button', { name: 'Simpan Inspeksi' }).click();

    await expect(page.locator('#toastMessage')).toContainText('berhasil disimpan', { timeout: 15_000 });
    const toastText = await page.locator('#toastText').textContent();
    const newId = toastText.match(/INS-\d+/)?.[0];
    expect(newId, `toast tidak memuat id inspeksi baru: "${toastText}"`).toBeTruthy();

    // Bukti sisi server, bukan cuma tampilan: field readonly bisa saja benar di
    // UI tapi diabaikan backend. GET langsung membuktikan petugas TERSIMPAN
    // sebagai identitas login, bukan apa pun yang mungkin dikirim klien.
    const res = await page.request.get(`http://project-sasa-she.test:3001/api/inspections/${newId}`);
    expect(res.ok()).toBe(true);
    const inspection = await res.json();
    expect(inspection.petugas).toBe('Arif');
});

test('inspeksi tanpa plant dipilih ditolak dengan pesan validasi, tidak tersimpan', async ({ page }) => {
    await loginViaUi(page, 'arif');
    await goToTab(page, 'Buat Inspeksi');

    await page.getByPlaceholder('Contoh: Kabel terbuka').fill('E2E: seharusnya ditolak');
    await page.locator('#panel-form').getByRole('button', { name: 'Tambah' }).click();
    await page.getByTestId('inspection-date').fill(new Date().toISOString().slice(0, 10));

    await page.getByRole('button', { name: 'Simpan Inspeksi' }).click();

    await expect(page.locator('#toastMessage')).toContainText('pilih Lokasi / Plant');
    // Tidak berpindah ke dashboard/tab lain, dan tidak ada toast sukses menyusul.
    await expect(page.locator('#panel-form')).toHaveClass(/active/);
});

test('foto sungguhan yang diunggah bisa dilihat kembali lewat lightbox (bukan placeholder) — Phase 15', async ({ page }) => {
    await loginViaUi(page, 'arif');
    await goToTab(page, 'Buat Inspeksi');

    await selectPlant(page, PLANT_SEARCH_PLACEHOLDER, 'Packing');
    await page.getByPlaceholder('Contoh: Kabel terbuka').fill('E2E: verifikasi upload foto sungguhan');
    await page.locator('#panel-form').getByRole('button', { name: 'Tambah' }).click();
    await page.getByTestId('inspection-date').fill(new Date().toISOString().slice(0, 10));
    await page.locator('#fotoDekat').setInputFiles(FIXTURE_JPEG);

    await page.getByRole('button', { name: 'Simpan Inspeksi' }).click();
    await expect(page.locator('#toastMessage')).toContainText('berhasil disimpan', { timeout: 15_000 });
    const toastText = await page.locator('#toastText').textContent();
    const newId = toastText.match(/INS-\d+/)?.[0];
    expect(newId, `toast tidak memuat id inspeksi baru: "${toastText}"`).toBeTruthy();

    await goToTab(page, 'Dashboard');
    const row = page.locator('#inspeksiTableBody').getByRole('row', { name: newId });
    await row.getByTestId('row-detail-btn').click();

    await page.getByText('e2e-foto-bukti.jpg', { exact: true }).click();

    // Bukti end-to-end bahwa ini foto sungguhan, bukan placeholder SVG
    // lama (data:image/svg+xml) — src menunjuk endpoint API sungguhan, dan
    // permintaan langsung ke URL itu mengembalikan byte gambar sungguhan
    // (bukan 404/500), dengan Content-Type gambar yang benar.
    const lightboxImage = page.locator('#lightboxImage');
    await expect(lightboxImage).toBeVisible();
    const src = await lightboxImage.getAttribute('src');
    expect(src).toMatch(/\/api\/inspections\/photos\/\d+\/file$/);
    await expect(page.locator('#lightboxFileName')).toHaveText('e2e-foto-bukti.jpg');

    const fileRes = await page.request.get(src);
    expect(fileRes.ok(), `GET ${src} gagal: HTTP ${fileRes.status()}`).toBe(true);
    expect(fileRes.headers()['content-type']).toMatch(/^image\//);
});

test('kegagalan API (500) saat submit menampilkan pesan aman, bukan detail error mentah', async ({ page }) => {
    await loginViaUi(page, 'arif');
    await goToTab(page, 'Buat Inspeksi');

    await page.route('**/api/inspections', async (route) => {
        if (route.request().method() === 'POST') {
            await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'INTERNAL_ERROR' }) });
        } else {
            await route.continue();
        }
    });

    await selectPlant(page, PLANT_SEARCH_PLACEHOLDER, 'Logistic');
    await page.getByPlaceholder('Contoh: Kabel terbuka').fill('E2E: simulasi kegagalan backend');
    await page.locator('#panel-form').getByRole('button', { name: 'Tambah' }).click();
    await page.getByTestId('inspection-date').fill(new Date().toISOString().slice(0, 10));
    await page.getByRole('button', { name: 'Simpan Inspeksi' }).click();

    const toast = page.locator('#toastMessage');
    await expect(toast).toContainText('Gagal menyimpan inspeksi');
    await expect(toast).not.toContainText('INTERNAL_ERROR');
    await expect(toast).not.toContainText('{"error"');
});
