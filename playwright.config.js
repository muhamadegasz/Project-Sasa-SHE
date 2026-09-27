/* playwright.config.js — Phase 14.1-C.
 *
 * Menggantikan .e2e-phase14.mjs (skrip ad hoc, dijalankan sekali lalu
 * dihapus — lihat docs/DECISIONS.md K-21) sebagai suite E2E permanen,
 * memakai @playwright/test sungguhan (bukan chromium.launch() manual).
 *
 * Prasyarat menjalankan `npm run test:e2e` (TIDAK diotomatisasi oleh
 * config ini — keduanya proses/layanan di luar kendali Node/npm):
 *   1. MySQL (Laragon) berjalan.
 *   2. Backend berjalan terpisah: `npm run server` (port 3001).
 *   3. Frontend disajikan lewat vhost Laragon di http://project-sasa-she.test
 *      (bukan file:// atau live-server lain — CORS_ORIGIN backend dipatok
 *      ke origin ini, lihat server/app.js).
 *
 * globalSetup (./tests/e2e/global-setup.js) me-reseed database SEKALI di
 * awal seluruh run test (persis seperti before() di server/test/api.test.js)
 * — itulah yang membuat suite ini bisa diulang tanpa persiapan manual
 * (Phase 14.1-H/K): setiap `npm run test:e2e` mulai dari state yang sama,
 * dan setiap test yang butuh data miliknya sendiri membuatnya sendiri lewat
 * API dengan tag unik (tests/e2e/support/api.js) — bukan bergantung pada
 * "apa pun yang kebetulan ada di database".
 */

import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

// Phase 17.4B.1: E2E TIDAK memakai backend/database pengembangan. .env.test
// (DB_NAME=she_sasa_test, E2E_API_PORT) dimuat ke process.env di sini, jadi
// backend uji (webServer), globalSetup (seed), dan worker (support/env.js)
// memakai database uji. Kredensial DB tetap dari .env (dotenv tidak menimpa).
const testEnv = dotenv.parse(readFileSync(new URL('./.env.test', import.meta.url)));
Object.assign(process.env, testEnv);

export default defineConfig({
    testDir: './tests/e2e',
    globalSetup: './tests/e2e/global-setup.js',

    // Backend uji sendiri di port E2E_API_PORT, terhubung ke she_sasa_test.
    // migrate lebih dulu (membuat database uji bila belum ada; idempoten) —
    // webServer dijalankan Playwright SEBELUM globalSetup (seed). Backend
    // pengembangan di :3001 (she_sasa) tidak disentuh. Tidak memakai ulang
    // server lain: port yang sudah terpakai menggagalkan run, bukan diam-diam
    // terhubung ke backend yang salah.
    webServer: {
        command: 'node server/db/migrate.js && node --conditions=server server/listen.js',
        url: `http://project-sasa-she.test:${testEnv.E2E_API_PORT}/api/auth/me`,
        env: { DB_NAME: testEnv.DB_NAME, PORT: testEnv.E2E_API_PORT },
        reuseExistingServer: false,
        timeout: 60_000,
        stdout: 'ignore',
        stderr: 'pipe',
    },

    // Setiap test membuat fixture datanya sendiri lewat API (id/tag unik) —
    // tidak ada state yang dibagi antar file, jadi aman dijalankan paralel.
    // Paralelisme juga berguna sebagai bukti isolasi: state yang bocor
    // antar test akan muncul sebagai flakiness di sini, bukan tersembunyi
    // oleh eksekusi berurutan.
    fullyParallel: true,

    // Dibatasi eksplisit (bukan dibiarkan otomatis = jumlah core, bisa 4-8+
    // di mesin ini): satu proses backend + satu instance MySQL dev dipakai
    // bersama oleh SELURUH worker. Diverifikasi langsung — pada worker
    // default (auto), login/dashboard-load tercepat sekalipun sesekali
    // melewati batas waktu default 5s murni karena kontensi CPU (bukan bug;
    // hilang total begitu dibatasi ke 2). Ini kalibrasi kapasitas mesin dev,
    // bukan retries — tidak ada kegagalan yang disembunyikan, hanya beban
    // paralel yang disesuaikan dengan sumber daya yang sungguhan tersedia.
    workers: 2,

    // Retries HANYA menyembunyikan flakiness, bukan memperbaikinya (lihat
    // instruksi Phase 14.1-I) — sengaja 0 di sini. Bila nanti CI butuh
    // retries, alasannya harus didokumentasikan di tempat CI itu dikonfigurasi,
    // bukan diam-diam ditambahkan di sini.
    retries: 0,

    // Default 30 detik per test cukup untuk alur UI+network di aplikasi ini
    // (dikonfirmasi lewat run manual) — dibuat eksplisit, bukan cuma
    // mengandalkan default Playwright yang bisa berubah antar versi.
    timeout: 30_000,

    reporter: [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ],

    use: {
        baseURL: 'http://project-sasa-she.test',
        // 'retain-on-failure' menyimpan trace untuk test yang GAGAL tanpa
        // butuh retry (retries:0 di atas) — beda dari 'on-first-retry' yang
        // tidak akan pernah terpicu selama retries tetap 0.
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },

    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
});
