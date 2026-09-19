/* demo-auth.js — login DEMO. BUKAN authentication.
 *
 * ============================ PERINGATAN =============================
 * Kredensial di bawah ada di dalam kode frontend, sehingga dapat dibaca
 * siapa pun yang membuka DevTools atau melihat source. Memindahkannya ke
 * berkas terpisah, file .env frontend, atau meng-hash-nya TIDAK membuatnya
 * aman — semua itu tetap dikirim ke browser.
 *
 * Lebih jauh lagi: login ini hanya menukar CSS class. Seluruh data dan
 * fungsi aplikasi tetap dapat diakses tanpa login dengan menghapus class
 * .hidden lewat DevTools. Tidak ada satu pun batas keamanan di sini.
 *
 * Ini dapat diterima HANYA karena aplikasi masih prototipe tanpa backend
 * dan tanpa data sungguhan.
 *
 * Untuk produksi, authentication WAJIB dilakukan di sisi server: kredensial
 * diverifikasi backend, sesi dipegang lewat cookie HttpOnly, dan setiap
 * endpoint data memeriksa otorisasi sendiri. Sampai itu ada, jangan memuat
 * data K3 sungguhan ke aplikasi ini.
 *
 * Lihat docs/SECURITY.md temuan S-01.
 * =====================================================================
 */

/** Kredensial demo. Sengaja diberi nama DEMO_ agar tidak disangka nyata. */
export const DEMO_CREDENTIALS = {
    username: 'sasapolkesma',
    password: 'sasapolkesma',
};

/** Nama yang ditampilkan setelah login demo berhasil. */
export const DEMO_DISPLAY_NAME = 'Safety Officer';

/**
 * Mencocokkan kredensial demo.
 *
 * Perbandingan string biasa, tanpa perlindungan timing — dan memang tidak
 * perlu, karena nilai pembandingnya sudah terbuka di dalam bundle.
 */
export function isValidDemoLogin(username, password) {
    return username === DEMO_CREDENTIALS.username
        && password === DEMO_CREDENTIALS.password;
}
