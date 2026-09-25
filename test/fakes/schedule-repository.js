/* Fake schedule repository — Phase 14.1-A.
 *
 * Test double untuk #repositories/schedule-repository.js. Hanya method yang
 * dipanggil src/services/schedule-service.js: findById, add, update, remove.
 */

let schedules = [];
let nextNumericId = 1;

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
    const created = { id: toDisplayId(nextNumericId++), ...schedule };
    schedules.push(created);
    return created;
}

export async function update(id, patch) {
    const schedule = schedules.find((row) => row.id === id);
    if (schedule) Object.assign(schedule, patch);
}

export async function remove(id) {
    const index = schedules.findIndex((row) => row.id === id);
    if (index === -1) return false;
    schedules.splice(index, 1);
    return true;
}
