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

import * as scheduleFake from './schedule-repository.js';
import { SCHEDULE_CONFLICT } from '../../src/domain/schedule-rules.js';

let inspections = [];
let storedSignatures = [];
/** Migrasi 008: pengajuan berikutnya melempar error (meniru kegagalan database di tengah transaksi). */
let __failNextSubmit = false;
export function __failSubmitOnce() {
    __failNextSubmit = true;
}
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
    __failNextSubmit = false;
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

/** Penjaga yang sama dengan kunci UNIQUE inspections.schedule_id (migrasi 008). */
function scheduleTaken(scheduleId, exceptInspectionId = null) {
    return Boolean(scheduleId) && inspections.some((row) => row.scheduleId === scheduleId && row.id !== exceptInspectionId);
}

export async function add(inspection) {
    if (scheduleTaken(inspection.scheduleId)) return SCHEDULE_CONFLICT;
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
    if (scheduleTaken(fields.scheduleId, inspectionId)) return SCHEDULE_CONFLICT;
    const existingIds = new Set((inspection.temuan || []).map((finding) => finding.id));
    const temuan = fields.temuan.map((finding, index) => {
        if (existingIds.has(finding.id)) return { ...finding };
        const created = { deskripsi: finding.deskripsi, kategori: finding.kategori, kategoriLainnya: finding.kategoriLainnya ?? null, id: nextFindingId++ };
        if (options.initialActionsForNewFindings) {
            inspection.perbaikan.push({ findingId: created.id, action: `Temuan ${index + 1}: ${finding.deskripsi}`, status: 'open', pic: options.pic, foto: [] });
        }
        return created;
    });
    Object.assign(inspection, {
        plantId: fields.plantId, scheduleId: fields.scheduleId ?? null, keteranganLokasi: fields.keteranganLokasi, tanggal: fields.tanggal, dueDate: fields.dueDate, temuan,
        fotoDekat: [...(inspection.fotoDekat || []), ...fields.fotoDekat],
        fotoJauh: [...(inspection.fotoJauh || []), ...fields.fotoJauh],
    });
    return true;
}

export async function submit(inspectionId, expectedStatus, nextState, initialActions, scheduleCompletion = null) {
    const inspection = inspections.find((row) => row.id === inspectionId);
    if (!inspection || inspection.status !== expectedStatus) return false;
    if (__failNextSubmit) {
        __failNextSubmit = false;
        throw new Error('simulasi kegagalan database');
    }
    // UPDATE bersyarat yang sama dengan versi MySQL; gagal -> tidak ada yang berubah.
    let schedule = null;
    if (scheduleCompletion) {
        schedule = await scheduleFake.findById(scheduleCompletion.scheduleId);
        const completable = schedule && inspection.scheduleId === schedule.id && !schedule.tanggalRealisasi
            && Number(schedule.officerUserId) === Number(scheduleCompletion.officerUserId)
            && Number(schedule.plantId) === Number(scheduleCompletion.plantId);
        if (!completable) return SCHEDULE_CONFLICT;
    }
    inspection.status = nextState.status;
    inspection.currentApprovalStage = nextState.currentApprovalStage;
    inspection.submittedAt = inspection.submittedAt || new Date().toISOString();
    inspection.perbaikan = [...(inspection.perbaikan || []), ...initialActions.map((action) => ({ ...action, foto: [] }))];
    // inspectionId di jadwal = tautan yang sudah diajukan (versi MySQL: LEFT JOIN non-draft).
    if (schedule) Object.assign(schedule, { status: 'selesai', tanggalRealisasi: new Date().toISOString().slice(0, 10), inspectionId: inspection.id });
    return true;
}

export async function removeDraft(inspectionId) {
    const index = inspections.findIndex((row) => row.id === inspectionId && row.status === 'draft');
    if (index === -1) return false;
    inspections.splice(index, 1);
    return true;
}

/** Phase 18: penjaga yang sama dengan versi MySQL — hanya inspeksi non-draft. */
export async function removeAsAdmin(inspectionId) {
    const index = inspections.findIndex((row) => row.id === inspectionId && row.status !== 'draft');
    if (index === -1) return false;
    const schedule = inspections[index].scheduleId ? await scheduleFake.findById(inspections[index].scheduleId) : null;
    if (schedule) Object.assign(schedule, { status: 'aktif', tanggalRealisasi: null, inspectionId: null });
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

/** Release: penjaga yang sama dengan versi MySQL (status lama, pemilik, belum COMPLETED). */
export async function updateCorrectiveActionStatus(inspectionId, actionId, fromStatus, toStatus, ownerId) {
    const inspection = inspections.find((row) => row.id === inspectionId);
    if (!inspection || inspection.status === 'completed' || Number(inspection.petugasUserId) !== Number(ownerId)) return false;
    const action = (inspection.perbaikan || []).find((item) => String(item.id) === String(actionId));
    if (!action || action.status !== fromStatus) return false;
    action.status = toStatus;
    return true;
}

export async function addCorrectiveAction(inspectionId, action) {
    const inspection = inspections.find((row) => row.id === inspectionId);
    if (!inspection) return;
    inspection.perbaikan = inspection.perbaikan || [];
    if (!inspection.perbaikan.includes(action)) inspection.perbaikan.push(action);
}
