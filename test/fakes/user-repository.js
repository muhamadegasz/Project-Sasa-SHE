/* Fake user repository — Phase 18.
 *
 * Test double untuk #repositories/user-repository.js, dipakai lewat kondisi
 * "test" di package.json "imports" (lihat test/fakes/plant-repository.js).
 * Bukan salinan repository produksi: tidak ada hashing — password yang
 * "tersimpan" dicatat apa adanya di __passwords() supaya test bisa
 * memastikan password diganti/tidak diganti.
 */

let users = [];
let passwords = new Map();
let nextId = 1;
let openInspectionCounts = new Map();

function toPublic(row) {
    if (!row) return undefined;
    const { id, username, displayName, role, plantId, isActive } = row;
    return { id, username, displayName, role, plantId, isActive };
}

/** Menyetel data user awal. */
export function __seed(rows) {
    users = rows.map((row) => ({ plantId: null, isActive: true, ...row }));
    passwords = new Map();
    nextId = Math.max(0, ...users.map((user) => user.id)) + 1;
    openInspectionCounts = new Map();
}

/** Password terakhir yang disimpan per id user (bukan hash — fake). */
export function __passwords() {
    return passwords;
}

/** Jumlah draft/revisi milik user yang akan dilaporkan countOpenOwnedInspections(). */
export function __setOpenInspections(userId, total) {
    openInspectionCounts.set(Number(userId), total);
}

export async function getAll() {
    return users.map(toPublic);
}

export async function findById(id) {
    return toPublic(users.find((user) => Number(user.id) === Number(id)));
}

export async function create({ username, displayName, role, plantId, password }) {
    if (users.some((user) => user.username === username)) return null;
    const user = { id: nextId++, username, displayName, role, plantId, isActive: true };
    users.push(user);
    passwords.set(user.id, password);
    return toPublic(user);
}

export async function update(id, { displayName, role, plantId, password }) {
    const user = users.find((row) => Number(row.id) === Number(id));
    if (!user) return undefined;
    Object.assign(user, { displayName, role, plantId });
    if (password !== null) passwords.set(user.id, password);
    return toPublic(user);
}

export async function setActive(id, isActive) {
    const user = users.find((row) => Number(row.id) === Number(id));
    if (!user) return undefined;
    user.isActive = isActive;
    return toPublic(user);
}

export async function countOpenOwnedInspections(id) {
    return openInspectionCounts.get(Number(id)) || 0;
}

export async function remove(id) {
    const before = users.length;
    users = users.filter((user) => Number(user.id) !== Number(id));
    return users.length < before;
}
