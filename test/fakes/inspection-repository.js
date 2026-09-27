/* Fake inspection repository — Phase 14.1-A.
 *
 * Test double untuk #repositories/inspection-repository.js. Mengimplementasikan
 * HANYA method yang benar-benar dipanggil src/services/{inspection,approval,
 * corrective-action}-service.js: getAll, count, findById, add, recordDecision,
 * addCorrectiveAction, dan (Phase 17.3B) update, submit, removeDraft — ketiganya
 * meniru penjaga status/pemilik versi MySQL. Bukan salinan server/repositories/ atau
 * src/repositories/ — tidak ada transaksi, tidak ada foto/DB, tidak ada fetch.
 *
 * findById() mengembalikan REFERENSI HIDUP ke objek di dalam array (persis
 * semantik src/repositories/inspection-repository.js versi in-memory lama,
 * yang approval-service.js/corrective-action-service.js memang dibangun untuk
 * mengandalkannya). Sejak Phase 17.2 approval-service.js tidak lagi memutasi
 * objek itu — perubahan hanya terjadi lewat recordDecision() di bawah, yang
 * meniru penjaga status/tahap versi MySQL (keputusan untuk tahap yang sudah
 * tidak berjalan ditolak dengan false).
 *
 * Phase 17.4A: tanda tangan yang "tersimpan" dicatat di storedSignatures
 * (pengganti berkas di disk) HANYA bila penjaga lolos — sama seperti versi
 * MySQL yang menulis berkas setelah UPDATE terjaga berhasil.
 */

let inspections = [];
let storedSignatures = [];
let nextNumericId = 1;
let nextFindingId = 1000;

function toDisplayId(numericId) {
    return `INS-${String(numericId).padStart(3, '0')}`;
}

/** Menyetel data inspeksi awal. id boleh diisi manual (mis. "INS-001"); nextId lanjut dari id tertinggi. */
export function __seed(rows) {
    inspections = rows.map((row) => ({
        ...row,
        approvalHistory: [...(row.approvalHistory || [])],
        temuan: [...(row.temuan || [])],
        perbaikan: [...(row.perbaikan || [])],
    }));
    storedSignatures = [];
    const numericIds = inspections.map((row) => Number(String(row.id).replace(/\D/g, '')) || 0);
    nextNumericId = numericIds.length ? Math.max(...numericIds) + 1 : 1;
}

/** Tanda tangan yang tersimpan lewat recordDecision(), urut waktu. */
export function __storedSignatures() {
    return storedSignatures;
}

export function __reset() {
    inspections = [];
    storedSignatures = [];
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
    const created = {
        id: toDisplayId(nextNumericId++),
        ...inspection,
        temuan: (inspection.temuan || []).map((finding) => ({ ...finding, id: nextFindingId++ })),
    };
    inspections.unshift(created);
    return created;
}

export async function update(inspectionId, fields, options) {
    const inspection = inspections.find((row) => row.id === inspectionId);
    if (!inspection || inspection.status !== options.expectedStatus || inspection.petugasUserId !== options.ownerId) return false;
    const existingIds = new Set((inspection.temuan || []).map((finding) => finding.id));
    const temuan = fields.temuan.map((finding, index) => {
        if (existingIds.has(finding.id)) return { ...finding };
        const created = { deskripsi: finding.deskripsi, kategori: finding.kategori, id: nextFindingId++ };
        if (options.initialActionsForNewFindings) {
            inspection.perbaikan.push({ findingId: created.id, action: `Temuan ${index + 1}: ${finding.deskripsi}`, status: 'open', pic: options.pic, foto: [] });
        }
        return created;
    });
    Object.assign(inspection, {
        plantId: fields.plantId, keteranganLokasi: fields.keteranganLokasi, tanggal: fields.tanggal, dueDate: fields.dueDate, temuan,
        fotoDekat: [...(inspection.fotoDekat || []), ...fields.fotoDekat],
        fotoJauh: [...(inspection.fotoJauh || []), ...fields.fotoJauh],
    });
    return true;
}

export async function submit(inspectionId, expectedStatus, nextState, initialActions) {
    const inspection = inspections.find((row) => row.id === inspectionId);
    if (!inspection || inspection.status !== expectedStatus) return false;
    inspection.status = nextState.status;
    inspection.currentApprovalStage = nextState.currentApprovalStage;
    inspection.submittedAt = inspection.submittedAt || new Date().toISOString();
    inspection.perbaikan = [...(inspection.perbaikan || []), ...initialActions.map((action) => ({ ...action, foto: [] }))];
    return true;
}

export async function removeDraft(inspectionId) {
    const index = inspections.findIndex((row) => row.id === inspectionId && row.status === 'draft');
    if (index === -1) return false;
    inspections.splice(index, 1);
    return true;
}

export async function recordDecision(inspectionId, decision, nextState, signature = null) {
    const inspection = inspections.find((row) => row.id === inspectionId);
    if (!inspection || inspection.status !== 'in_review' || inspection.currentApprovalStage !== decision.stage) {
        return false;
    }
    if (signature) {
        storedSignatures.push({ inspectionId, stage: decision.stage, attempt: decision.attempt, method: signature.method, mimeType: signature.mimeType, size: signature.size });
    }
    inspection.approvalHistory = [...(inspection.approvalHistory || []), { ...decision, hasSignature: Boolean(signature) }];
    inspection.status = nextState.status;
    inspection.currentApprovalStage = nextState.currentApprovalStage;
    return true;
}

export async function addCorrectiveAction(inspectionId, action) {
    const inspection = inspections.find((row) => row.id === inspectionId);
    if (!inspection) return;
    inspection.perbaikan = inspection.perbaikan || [];
    if (!inspection.perbaikan.includes(action)) inspection.perbaikan.push(action);
}
