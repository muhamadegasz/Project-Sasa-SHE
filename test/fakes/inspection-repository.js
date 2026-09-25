/* Fake inspection repository — Phase 14.1-A.
 *
 * Test double untuk #repositories/inspection-repository.js. Mengimplementasikan
 * HANYA method yang benar-benar dipanggil src/services/{inspection,approval,
 * corrective-action}-service.js: getAll, count, findById, add, saveApproval,
 * setStatus, addCorrectiveAction. Bukan salinan server/repositories/ atau
 * src/repositories/ — tidak ada transaksi, tidak ada foto/DB, tidak ada fetch.
 *
 * findById() mengembalikan REFERENSI HIDUP ke objek di dalam array (persis
 * semantik src/repositories/inspection-repository.js versi in-memory lama,
 * yang approval-service.js/corrective-action-service.js memang dibangun untuk
 * mengandalkannya — keduanya memutasi objek yang dikembalikan findById()
 * SEKALIGUS memanggil saveApproval()/setStatus()/addCorrectiveAction() untuk
 * "benar-benar menyimpan". Fake ini menerapkan panggilan kedua itu juga, agar
 * tetap benar walau service diubah untuk berhenti memutasi langsung.
 */

let inspections = [];
let nextNumericId = 1;

function toDisplayId(numericId) {
    return `INS-${String(numericId).padStart(3, '0')}`;
}

/** Menyetel data inspeksi awal. id boleh diisi manual (mis. "INS-001"); nextId lanjut dari id tertinggi. */
export function __seed(rows) {
    inspections = rows.map((row) => ({
        ...row,
        approvals: { ...(row.approvals || {}) },
        temuan: [...(row.temuan || [])],
        perbaikan: [...(row.perbaikan || [])],
    }));
    const numericIds = inspections.map((row) => Number(String(row.id).replace(/\D/g, '')) || 0);
    nextNumericId = numericIds.length ? Math.max(...numericIds) + 1 : 1;
}

export function __reset() {
    inspections = [];
    nextNumericId = 1;
}

export async function getAll() {
    return inspections;
}

export async function count() {
    return inspections.length;
}

export async function findById(id) {
    return inspections.find((inspection) => inspection.id === id);
}

export async function add(inspection) {
    const created = { id: toDisplayId(nextNumericId++), ...inspection };
    inspections.unshift(created);
    return created;
}

export async function saveApproval(inspectionId, stageId, record) {
    const inspection = inspections.find((row) => row.id === inspectionId);
    if (!inspection) return;
    inspection.approvals = inspection.approvals || {};
    inspection.approvals[stageId] = record;
}

export async function setStatus(inspectionId, status) {
    const inspection = inspections.find((row) => row.id === inspectionId);
    if (inspection) inspection.status = status;
}

export async function addCorrectiveAction(inspectionId, action) {
    const inspection = inspections.find((row) => row.id === inspectionId);
    if (!inspection) return;
    inspection.perbaikan = inspection.perbaikan || [];
    if (!inspection.perbaikan.includes(action)) inspection.perbaikan.push(action);
}
