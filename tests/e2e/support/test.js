/* test.js — Phase 17.4B.1: `test` Playwright yang mengarahkan frontend ke
 * backend UJI.
 *
 * Frontend (disajikan Apache) secara bawaan memanggil backend pengembangan
 * (:3001, database she_sasa). Setiap konteks browser di E2E diberi init
 * script yang mengisi __SHE_SASA_API_BASE__ sebelum modul apa pun dimuat —
 * src/infrastructure/api-client.js lalu memakai backend uji (support/env.js).
 * Spec memakai `test` dari berkas ini, dan newIsolatedPage() sebagai
 * pengganti browser.newPage() untuk halaman tambahan.
 */

import { test as base, expect } from '@playwright/test';
import { API } from './env.js';

async function pointAtTestBackend(context) {
    await context.addInitScript((apiBase) => { globalThis.__SHE_SASA_API_BASE__ = apiBase; }, API);
}

export const test = base.extend({
    context: async ({ context }, use) => {
        await pointAtTestBackend(context);
        await use(context);
    },
});

/** Halaman baru di konteks browser terpisah (sesi login sendiri), juga terarah ke backend uji. */
export async function newIsolatedPage(browser) {
    const context = await browser.newContext();
    await pointAtTestBackend(context);
    return context.newPage();
}

export { expect };
