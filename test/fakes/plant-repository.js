/* Fake plant repository — Phase 14.1-A.
 *
 * Test double untuk #repositories/plant-repository.js, dipakai lewat kondisi
 * "test" di package.json "imports" (mekanisme yang sama seperti "server" vs
 * "default" sejak Phase 12 — lihat docs/ROADMAP-PHASE12.md K-18). Bukan
 * salinan repository produksi: hanya findById(), satu-satunya method yang
 * dipanggil src/services/*.js pada plant repository.
 */

let plants = [];

/** Menyetel data plant untuk satu test/berkas test. Dipanggil dari beforeEach. */
export function __seed(rows) {
    plants = rows.map((row) => ({ ...row }));
}

/** Mengosongkan data — dipanggil di akhir test bila diperlukan. */
export function __reset() {
    plants = [];
}

export async function findById(id) {
    return plants.find((plant) => String(plant.id) === String(id));
}
