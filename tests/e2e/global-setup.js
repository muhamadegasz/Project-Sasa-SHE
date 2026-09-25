/* global-setup.js — Phase 14.1-H: membuat suite E2E deterministik dan
 * repeatable tanpa persiapan manual.
 *
 * Dijalankan SEKALI oleh Playwright sebelum seluruh test dimulai (bukan per
 * file/per test) — mereseed database persis dengan cara yang sama seperti
 * before() di server/test/api.test.js. Setelah ini, setiap test yang butuh
 * datanya sendiri membuatnya lewat API dengan tag unik (lihat support/api.js)
 * — globalSetup ini HANYA menjamin titik awal yang bersih, bukan fixture
 * per-test.
 */

import { execFileSync } from 'node:child_process';

export default function globalSetup() {
    execFileSync(process.execPath, ['server/db/seed.js'], { cwd: process.cwd(), stdio: 'inherit' });
}
