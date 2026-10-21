/* Fake schedule repository — Phase 14.1-A.
 *
 * Test double untuk #repositories/schedule-repository.js. Hanya method yang
 * dipanggil src/services/schedule-service.js: findById, add, update, remove,
 * plus akun petugas yang bisa ditugaskan (migrasi 008, __setOfficers).
 */

let schedules = [];
let nextNumericId = 1;
let officers = [];

function toDisplayId(numericId) {
    return `SCH-${String(numericId).padStart(3, '0')}`;
}

export function __seed(rows) {
    schedules = rows.map((row) => ({ ...row }));
    const numericIds = schedules.map((row) => Number(String(row.id).replace(/\D/g, '')) || 0);
    nextNumericId = numericIds.length ? Math.max(...numericIds) + 1 : 1;
}

export function __reset() {
    schedules = [];
    nextNumericId = 1;
    officers = [];
}

/** Akun Safety Officer aktif: [{ id, displayName }]. */
export function __setOfficers(rows) {
    officers = rows.map((row) => ({ ...row }));
}

export async function listAssignableOfficers() {
    return officers;
}

export async function findAssignableOfficer(id) {
    return officers.find((officer) => Number(officer.id) === Number(id));
}

export async function getAll() {
    return schedules;
}

export async function count() {
    return schedules.length;
}

export async function findById(id) {
    return schedules.find((schedule) => schedule.id === id);
}

export async function add(schedule) {
    const created = { id: toDisplayId(nextNumericId++), inspectionId: null, ...schedule };
    schedules.push(created);
    return created;
}

/** Penjaga yang sama dengan versi MySQL: jadwal Terlaksana tidak diubah. */
export async function update(id, patch) {
    const schedule = schedules.find((row) => row.id === id);
    if (schedule && !schedule.tanggalRealisasi) Object.assign(schedule, patch);
}

export async function remove(id) {
    const index = schedules.findIndex((row) => row.id === id);
    if (index === -1) return false;
    schedules.splice(index, 1);
    return true;
}

/**
 * Migrasi 008: laporan baru wajib bertautan jadwal — jadwal aktif untuk
 * petugas & plant ini (fixture test). @returns id jadwal ("SCH-nnn").
 */
export function __scheduleFor({ officerUserId, officer, plantId }) {
    const created = {
        id: toDisplayId(nextNumericId++), plantId: Number(plantId), plantName: '', periode: 4, tahun: 2026, minggu: 1,
        tanggalJadwal: '2026-10-26', tanggalRealisasi: null, officer, officerUserId, status: 'aktif', inspectionId: null,
    };
    schedules.push(created);
    return created.id;
}
