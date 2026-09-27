/* env.js — Phase 17.4B.1: alamat backend UJI untuk E2E.
 *
 * Satu-satunya tempat test E2E mengetahui alamat API. Port berasal dari
 * .env.test (E2E_API_PORT, dimuat playwright.config.js), yaitu backend uji yang
 * dijalankan Playwright (webServer) dengan database she_sasa_test — BUKAN
 * backend pengembangan di :3001. Tanpa port -> gagal, tidak pernah jatuh
 * diam-diam ke backend pengembangan.
 */

const port = process.env.E2E_API_PORT;
if (!port) {
    throw new Error('E2E_API_PORT tidak terisi — jalankan E2E lewat "npm run test:e2e" (playwright.config.js memuat .env.test).');
}

export const API_ORIGIN = `http://project-sasa-she.test:${port}`;
export const API = `${API_ORIGIN}/api`;
