/* support/ui.js — Phase 14.1-E: helper login/navigasi lewat UI sungguhan,
 * dipakai berulang di seluruh spec supaya locator strategy-nya satu tempat.
 */

import { expect } from '@playwright/test';

/** Login lewat form sungguhan (bukan API) — dipakai tiap kali sebuah test butuh browser dalam keadaan sudah login. Password seed = username (server/db/seed.js). */
export async function loginViaUi(page, username) {
    await page.goto('/');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(username);
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.getByTestId('user-name')).toBeVisible();
}

/**
 * Pindah tab navigasi lewat teks tombolnya.
 *
 * getByRole('button', {name}) TIDAK dipakai di sini: setiap tombol nav
 * diawali ikon FontAwesome (`<i class="fas fa-..."></i> Nama`), dan Chromium
 * ikut menghitung konten CSS ::before ikon itu ke dalam NAMA AKSESIBEL tombol
 * — diverifikasi langsung (exact:true -> 0 kecocokan walau teksnya benar;
 * bahkan regex berjangkar `^\s*Nama$` juga gagal karena bukan cuma spasi yang
 * mendahului teksnya). getByText() beroperasi pada textContent DOM asli
 * (bukan nama aksesibel), yang tidak ikut memuat konten ::before ikon —
 * exact:true di sini bekerja normal dan tetap presisi ("Inspeksi" tidak ikut
 * mencocokkan "Buat Inspeksi").
 */
export async function goToTab(page, tabName) {
    await page.getByText(tabName, { exact: true }).click();
}

/**
 * Cari dan pilih sebuah plant lewat kotak pencarian ber-placeholder tertentu.
 *
 * `renderDropdown()` (plant-select.js) menandai dropdown "show" SEKETIKA saat
 * event input terpicu, TAPI mengisi kontennya secara async (menunggu
 * plantRepository.search() — pencarian plant PERTAMA di suatu halaman
 * memicu fetch jaringan sungguhan sebelum cache-nya terisi). Menunggu
 * eksplisit sampai dropdown BERISI nama plant (bukan cuma mengandalkan
 * retry bawaan click()) menghilangkan sebagian besar kasus race ini — tapi
 * secara empiris masih terjadi sesekali (~1 dari puluhan run) bahwa dropdown
 * tertutup lagi tepat di antara assertion lulus dan klik benar-benar
 * dieksekusi (penyebab pastinya belum terlacak sampai ke akar — kemungkinan
 * event 'input'/'focus' plant-select.js terpicu ganda oleh urutan fill()
 * Playwright pada kondisi tertentu). Mengulang ketik-lalu-klik hingga 3 kali
 * adalah penanganan SEMPIT untuk satu interaksi UI yang dipahami perilakunya
 * (dropdown terbuka lagi begitu diketik ulang), BUKAN retries generik yang
 * menyembunyikan kegagalan test — lihat instruksi Phase 14.1-I.
 */
export async function selectPlant(page, searchPlaceholder, plantName) {
    const input = page.getByPlaceholder(searchPlaceholder);
    const dropdown = page.locator('#plantDropdown');

    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
        await input.fill(''); // memaksa event 'input' baru walau teks sebelumnya sama
        await input.fill(plantName);
        await expect(dropdown).toContainText(plantName);
        try {
            await dropdown.getByText(plantName, { exact: false }).click({ timeout: 5_000 });
            return;
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError;
}
