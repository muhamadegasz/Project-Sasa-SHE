/* support/ui.js — Phase 14.1-E: helper login/navigasi lewat UI sungguhan,
 * dipakai berulang di seluruh spec supaya locator strategy-nya satu tempat.
 */

import { expect } from '@playwright/test';

/**
 * Login lewat form sungguhan (bukan API) — dipakai tiap kali sebuah test butuh browser dalam keadaan sudah login. Password seed = username (server/db/seed.js).
 * Label "Username" dicocokkan persis: panel Admin juga punya label "Username *" dan "…ketik username: …" (tersembunyi, tapi tetap di DOM).
 */
export async function loginViaUi(page, username) {
    await page.goto('/');
    await page.getByLabel('Username', { exact: true }).fill(username);
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
 * Baris sebuah inspeksi di tabel Semua Data Inspeksi (tab Inspeksi). Tabel itu
 * berhalaman & dicari di server, jadi inspeksinya DICARI dulu — baris yang
 * dituju selalu ada di halaman tampil, berapa pun data uji lain yang dibuat
 * worker paralel. Menunggu "1 hasil" supaya tabel sudah dirender ulang dari
 * hasil pencarian (bukan baris dari daftar sebelumnya).
 */
export async function allInspeksiRow(page, inspectionId) {
    await goToTab(page, 'Inspeksi');
    await page.locator('#searchAllInspeksiInput').fill(inspectionId);
    await expect(page.locator('#searchAllInspeksiCount')).toHaveText('1 hasil');
    const row = page.locator('#allInspeksiTable').getByRole('row', { name: inspectionId });
    await expect(row).toHaveCount(1);
    return row;
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
export async function selectPlant(page, searchPlaceholder, plantName, dropdownSelector = '#plantDropdown') {
    const input = page.getByPlaceholder(searchPlaceholder, { exact: true });
    const dropdown = page.locator(dropdownSelector);

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

/**
 * Release: notifikasi benar-benar TERLIHAT — berisi `text`, tampil (.show),
 * DAN menjadi elemen teratas di posisinya. Memeriksa isi DOM saja tidak
 * cukup: sebelumnya toast di halaman login tertutup halaman login (z-index).
 */
export async function expectToastOnTop(page, text) {
    const toast = page.locator('#toastMessage');
    await expect(toast).toContainText(text);
    await expect(toast).toHaveClass(/show/);
    await expect.poll(() => toast.evaluate((element) => {
        // .toast-msg memakai pointer-events: none, dan elementFromPoint()
        // melewati elemen seperti itu — diaktifkan sesaat hanya untuk uji-tumpuk.
        const previous = element.style.pointerEvents;
        element.style.pointerEvents = 'auto';
        const rect = element.getBoundingClientRect();
        const topmost = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        element.style.pointerEvents = previous;
        return element.contains(topmost);
    }), { message: 'toast harus berada paling atas, tidak tertutup halaman login' }).toBe(true);
}
