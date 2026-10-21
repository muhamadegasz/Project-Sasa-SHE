/* inspection-service.js — siklus hidup inspeksi milik Safety Officer:
 * buat draft, ubah (draft/revisi), ajukan (pertama/ulang), hapus draft.
 *
 * Tidak menyentuh DOM. Pemanggil mengumpulkan isian form, service yang
 * memvalidasi dan membentuk datanya. Siapa boleh melakukan apa diputuskan
 * domain/inspection-policy.js; transisi status oleh domain/workflow-rules.js.
 *
 * Phase 17.3B: membuat inspeksi menghasilkan DRAFT (tidak lagi langsung
 * diajukan seperti penghubung sementara Phase 17.2). Status, tahap, dan
 * pemilik TIDAK pernah diambil dari isian — hanya dari transisi dan sesi.
 */

import * as inspectionRepository from '#repositories/inspection-repository.js';
import * as plantRepository from '#repositories/plant-repository.js';
import * as scheduleRepository from '#repositories/schedule-repository.js';
import { submittedState } from '../domain/workflow-rules.js';
import { SCHEDULE_CONFLICT, checkScheduleLink } from '../domain/schedule-rules.js';
import { buildInitialAction, checkFindingCategory } from '../domain/inspection-rules.js';
import {
    canDelete, canDeleteDraft, canEdit, canRevise, canSubmit, canView, isOwningOfficer,
} from '../domain/inspection-policy.js';
import { FINDING_CATEGORY_OTHER, ROLE } from '../config/constants.js';
import { INSPECTION_STATUS } from '../domain/statuses.js';
import { formatDate } from '../shared/date.js';
import { ACCESS_ERROR, fail, ok } from './result.js';

export const INSPECTION_ERROR = {
    // NOT_FOUND (404) / FORBIDDEN (403): lihat ACCESS_ERROR di result.js.
    ...ACCESS_ERROR,
    PLANT_REQUIRED: 'PLANT_REQUIRED',
    PLANT_NOT_FOUND: 'PLANT_NOT_FOUND',
    FINDINGS_REQUIRED: 'FINDINGS_REQUIRED',
    DATE_REQUIRED: 'DATE_REQUIRED',
    // Kategori temuan (domain/inspection-rules.js checkFindingCategory).
    FINDING_CATEGORY_REQUIRED: 'FINDING_CATEGORY_REQUIRED',
    FINDING_CATEGORY_INVALID: 'FINDING_CATEGORY_INVALID',
    FINDING_OTHER_CATEGORY_REQUIRED: 'FINDING_OTHER_CATEGORY_REQUIRED',
    FINDING_OTHER_CATEGORY_INVALID: 'FINDING_OTHER_CATEGORY_INVALID',
    FINDING_OTHER_CATEGORY_TOO_LONG: 'FINDING_OTHER_CATEGORY_TOO_LONG',
    // Pemilik, tapi status inspeksi tidak mengizinkan aksi itu.
    NOT_EDITABLE: 'NOT_EDITABLE',
    NOT_SUBMITTABLE: 'NOT_SUBMITTABLE',
    NOT_DELETABLE: 'NOT_DELETABLE',
    // Status berubah di antara pemeriksaan dan penyimpanan (mis. dua pengajuan bersamaan).
    STATE_CHANGED: 'STATE_CHANGED',
    // Jadwal yang ditautkan (migrasi 008, domain/schedule-rules.js checkScheduleLink).
    // Wajib untuk laporan baru: setiap laporan berasal dari jadwal inspeksi.
    SCHEDULE_REQUIRED: 'SCHEDULE_REQUIRED',
    SCHEDULE_NOT_FOUND: 'SCHEDULE_NOT_FOUND',
    SCHEDULE_NOT_ASSIGNED: 'SCHEDULE_NOT_ASSIGNED',
    SCHEDULE_PLANT_MISMATCH: 'SCHEDULE_PLANT_MISMATCH',
    SCHEDULE_ALREADY_LINKED: 'SCHEDULE_ALREADY_LINKED',
    SCHEDULE_ALREADY_REALIZED: 'SCHEDULE_ALREADY_REALIZED',
    // Jadwal berubah di antara pemeriksaan dan transaksi pengajuan — tidak ada yang tersimpan.
    SCHEDULE_UNAVAILABLE: 'SCHEDULE_UNAVAILABLE',
};

const SCHEDULE_LINK_ERROR = {
    NOT_FOUND: INSPECTION_ERROR.SCHEDULE_NOT_FOUND,
    NOT_ASSIGNED: INSPECTION_ERROR.SCHEDULE_NOT_ASSIGNED,
    PLANT_MISMATCH: INSPECTION_ERROR.SCHEDULE_PLANT_MISMATCH,
    ALREADY_LINKED: INSPECTION_ERROR.SCHEDULE_ALREADY_LINKED,
    ALREADY_REALIZED: INSPECTION_ERROR.SCHEDULE_ALREADY_REALIZED,
};

/**
 * Id jadwal dari isian, atau null bila kosong. Laporan baru WAJIB bertautan
 * jadwal (SCHEDULE_REQUIRED); null hanya tersisa pada inspeksi lama dari
 * sebelum migrasi 008, yang tetap bisa direvisi & diajukan ulang.
 */
function scheduleIdFrom(input) {
    const value = input.scheduleId;
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed === '' ? null : trimmed;
}

/**
 * Jadwal yang akan ditautkan: dimuat dari repository (data server — id dari
 * isian hanya kunci pencarian), lalu diperiksa checkScheduleLink(): ditugaskan
 * ke petugas inspeksi ini, plant sama, belum tertaut laporan lain, belum
 * Terlaksana. Tautan draft lain yang memakai jadwal yang sama ditolak kunci
 * UNIQUE di database (SCHEDULE_CONFLICT dari repository).
 *
 * @returns {{ scheduleId: string | null }} atau {{ failure }}
 */
async function checkSchedule(scheduleId, link) {
    if (!scheduleId) return { scheduleId: null };
    const schedule = await scheduleRepository.findById(scheduleId);
    const checked = checkScheduleLink(schedule, link);
    if (checked.error) return { failure: fail(SCHEDULE_LINK_ERROR[checked.error]) };
    return { scheduleId: checked.value.id };
}

/**
 * Aturan isi yang SAMA untuk simpan draft, simpan revisi, dan pengajuan:
 * plant wajib & ada, minimal satu temuan, tanggal wajib. Ini aturan yang
 * sudah ada sebelum Phase 17.3B — tidak ada field wajib baru. Urutannya
 * dipertahankan (plant, temuan, tanggal) karena pesan pertama ikut bergeser
 * bila urutannya diubah.
 *
 * @returns {{ plant }} atau {{ failure }}
 */
async function checkContent({ plantId, temuan, tanggal }) {
    if (!plantId) return { failure: fail(INSPECTION_ERROR.PLANT_REQUIRED) };
    if (!temuan || temuan.length === 0) return { failure: fail(INSPECTION_ERROR.FINDINGS_REQUIRED) };
    if (!tanggal) return { failure: fail(INSPECTION_ERROR.DATE_REQUIRED) };

    const plant = await plantRepository.findById(plantId);
    if (!plant) return { failure: fail(INSPECTION_ERROR.PLANT_NOT_FOUND) };
    return { plant };
}

/** Kode domain checkFindingCategory -> kode service (juga dipakai form untuk pesan yang sama). */
export const FINDING_CATEGORY_ERROR = {
    CATEGORY_REQUIRED: INSPECTION_ERROR.FINDING_CATEGORY_REQUIRED,
    CATEGORY_INVALID: INSPECTION_ERROR.FINDING_CATEGORY_INVALID,
    OTHER_REQUIRED: INSPECTION_ERROR.FINDING_OTHER_CATEGORY_REQUIRED,
    OTHER_INVALID: INSPECTION_ERROR.FINDING_OTHER_CATEGORY_INVALID,
    OTHER_TOO_LONG: INSPECTION_ERROR.FINDING_OTHER_CATEGORY_TOO_LONG,
};

/**
 * Kategori setiap temuan dari isian (buat/ubah — BUKAN saat mengajukan data
 * yang sudah tersimpan). Hasilnya temuan yang dinormalkan: `kategoriLainnya`
 * di-trim, dan null untuk kategori selain "Lainnya".
 *
 * Data lama: temuan "Lainnya" yang tersimpan sebelum migrasi 006 tidak punya
 * penjelasan. Temuan seperti itu yang dikirim kembali TANPA perubahan (id yang
 * sama, tetap "Lainnya", tanpa penjelasan) diterima apa adanya — merevisi
 * inspeksi lama tidak dipaksa mengisi penjelasan untuk temuan yang tidak
 * disentuh. Temuan baru, atau yang kategorinya diubah, selalu mengikuti aturan.
 *
 * @param {object[]} temuan isian
 * @param {object[]} [stored] temuan yang sudah tersimpan (mode ubah)
 * @returns {{ temuan: object[] }} atau {{ failure }}
 */
function checkFindings(temuan, stored = []) {
    const legacyOtherIds = new Set(stored
        .filter((finding) => finding.kategori === FINDING_CATEGORY_OTHER && !finding.kategoriLainnya)
        .map((finding) => Number(finding.id)));
    const normalized = [];
    for (const finding of temuan) {
        const unchangedLegacy = finding.id != null && legacyOtherIds.has(Number(finding.id))
            && finding.kategori === FINDING_CATEGORY_OTHER
            && (finding.kategoriLainnya === undefined || finding.kategoriLainnya === null || finding.kategoriLainnya === '');
        if (unchangedLegacy) {
            normalized.push({ ...finding, kategoriLainnya: null });
            continue;
        }
        const checked = checkFindingCategory(finding);
        if (checked.error) return { failure: fail(FINDING_CATEGORY_ERROR[checked.error]) };
        normalized.push({ ...finding, ...checked.value });
    }
    return { temuan: normalized };
}

/**
 * Memuat inspeksi untuk aksi pemilik. Tidak terlihat -> NOT_FOUND (identik
 * dengan id yang tidak ada); terlihat tapi bukan Safety Officer pemiliknya
 * -> FORBIDDEN; pemilik tapi `isAllowed` menolak karena status -> `stateError`.
 */
async function loadForOwner(inspectionId, actor, isAllowed, stateError) {
    const inspection = await inspectionRepository.findById(inspectionId);
    if (!inspection || !canView(actor, inspection)) return { failure: fail(INSPECTION_ERROR.NOT_FOUND) };
    if (!isOwningOfficer(actor, inspection)) return { failure: fail(INSPECTION_ERROR.FORBIDDEN) };
    if (!isAllowed(actor, inspection)) return { failure: fail(stateError, { status: inspection.status }) };
    return { inspection };
}

/**
 * Membuat inspeksi baru sebagai DRAFT milik Safety Officer yang login.
 * Tanpa tahap pengesahan, tanpa waktu pengajuan, tanpa riwayat, dan tanpa
 * tindakan perbaikan — tindakan awal per temuan dibuat saat pengajuan
 * pertama (lihat submit()).
 *
 * `petugas`/`petugasUserId` diisi route handler dari sesi (req.user), bukan
 * dari body permintaan.
 *
 * @returns ok({ inspection }) atau fail(INSPECTION_ERROR.*)
 */
export async function create(input) {
    const { plant, failure } = await checkContent(input);
    if (failure) return failure;
    const findings = checkFindings(input.temuan);
    if (findings.failure) return findings.failure;
    if (!scheduleIdFrom(input)) return fail(INSPECTION_ERROR.SCHEDULE_REQUIRED);
    const schedule = await checkSchedule(scheduleIdFrom(input), {
        officerUserId: input.petugasUserId, officerName: input.petugas, plantId: input.plantId,
    });
    if (schedule.failure) return schedule.failure;

    const inspection = await inspectionRepository.add({
        lokasi: plant.name,
        plantId: parseInt(input.plantId, 10),
        scheduleId: schedule.scheduleId,
        keteranganLokasi: input.keteranganLokasi || '-',
        tanggal: formatDate(input.tanggal),
        petugas: input.petugas,
        petugasUserId: input.petugasUserId,
        status: INSPECTION_STATUS.DRAFT,
        currentApprovalStage: null,
        submittedAt: null,
        dueDate: formatDate(input.dueDate),
        fotoDekat: input.fotoDekat || [],
        fotoJauh: input.fotoJauh || [],
        approvalHistory: [],
        temuan: findings.temuan,
        perbaikan: [],
    });
    if (inspection === SCHEDULE_CONFLICT) return fail(INSPECTION_ERROR.SCHEDULE_ALREADY_LINKED);

    return ok({ inspection });
}

/**
 * Mengubah isi inspeksi milik sendiri: draft (DRAFT) atau revisi setelah
 * ditolak (REVISION_REQUIRED). Status dan tahap TIDAK berubah di sini —
 * menyimpan revisi bukan mengajukan ulang.
 *
 * Temuan dikirim utuh: yang membawa `id` miliknya diperbarui, yang tanpa
 * `id` ditambahkan, yang tidak disebut dihapus. Foto hanya bisa DITAMBAH
 * (menghapus foto satu per satu memang belum pernah ada). Temuan baru pada
 * revisi ikut mendapat tindakan awal, sama seperti saat pengajuan pertama;
 * temuan yang dihapus saat revisi tidak menghapus tindakan perbaikannya
 * (bukti tidak pernah dihapus).
 *
 * @returns ok({ inspection }) atau fail(INSPECTION_ERROR.*)
 */
export async function update(inspectionId, input, actor) {
    const { inspection, failure } = await loadForOwner(
        inspectionId, actor,
        (user, item) => canEdit(user, item) || canRevise(user, item),
        INSPECTION_ERROR.NOT_EDITABLE,
    );
    if (failure) return failure;
    // Ditetapkan sebelum await berikutnya — lihat catatan yang sama di submit().
    const fromStatus = inspection.status;

    const content = await checkContent(input);
    if (content.failure) return content.failure;
    const findings = checkFindings(input.temuan, inspection.temuan || []);
    if (findings.failure) return findings.failure;
    // Jadwal hanya bisa dipilih/diganti selama DRAFT (wajib terisi). Revisi
    // mempertahankan tautan aslinya (isian diabaikan), tapi tetap diperiksa —
    // mis. plant tidak boleh diubah menjauh dari plant jadwalnya.
    const requestedScheduleId = fromStatus === INSPECTION_STATUS.DRAFT ? scheduleIdFrom(input) : inspection.scheduleId || null;
    if (fromStatus === INSPECTION_STATUS.DRAFT && !requestedScheduleId) return fail(INSPECTION_ERROR.SCHEDULE_REQUIRED);
    const schedule = await checkSchedule(requestedScheduleId, {
        officerUserId: inspection.petugasUserId, officerName: inspection.petugas, plantId: input.plantId, inspectionId: inspection.id,
    });
    if (schedule.failure) return schedule.failure;

    const saved = await inspectionRepository.update(inspection.id, {
        plantId: parseInt(input.plantId, 10),
        scheduleId: schedule.scheduleId,
        keteranganLokasi: input.keteranganLokasi || '-',
        tanggal: formatDate(input.tanggal),
        dueDate: formatDate(input.dueDate),
        temuan: findings.temuan,
        fotoDekat: input.fotoDekat || [],
        fotoJauh: input.fotoJauh || [],
    }, {
        expectedStatus: fromStatus,
        ownerId: inspection.petugasUserId,
        // Hanya inspeksi yang pernah diajukan (revisi) yang sudah punya tindakan awal.
        initialActionsForNewFindings: fromStatus === INSPECTION_STATUS.REVISION_REQUIRED,
        pic: inspection.petugas,
    });
    if (saved === SCHEDULE_CONFLICT) return fail(INSPECTION_ERROR.SCHEDULE_ALREADY_LINKED);
    if (!saved) return fail(INSPECTION_ERROR.STATE_CHANGED);

    return ok({ inspection: await inspectionRepository.findById(inspection.id) });
}

/**
 * Mengajukan draft (DRAFT -> IN_REVIEW di tahap Koordinator K3L) atau
 * mengajukan ulang revisi (REVISION_REQUIRED -> IN_REVIEW di tahap YANG
 * MENOLAKNYA). Pengajuan adalah peristiwa siklus hidup, BUKAN keputusan
 * pengesahan: tidak ada entri riwayat pengesahan yang dibuat.
 *
 * Isi divalidasi ulang dengan aturan yang sama seperti saat disimpan.
 * Pengajuan pertama membuat satu tindakan perbaikan awal per temuan.
 * Waktu pengajuan (submitted_at) mencatat pengajuan PERTAMA.
 *
 * @returns ok({ inspection, resubmitted }) atau fail(INSPECTION_ERROR.*)
 */
export async function submit(inspectionId, actor) {
    const { inspection, failure } = await loadForOwner(inspectionId, actor, canSubmit, INSPECTION_ERROR.NOT_SUBMITTABLE);
    if (failure) return failure;

    // Status awal dan transisinya ditetapkan SEGERA setelah dibaca, sebelum
    // await berikutnya — penjaga di repository memakai status INI, jadi
    // pengajuan lain yang selesai lebih dulu membuat yang ini STATE_CHANGED.
    const fromStatus = inspection.status;
    const nextState = submittedState(inspection);
    if (!nextState) return fail(INSPECTION_ERROR.NOT_SUBMITTABLE, { status: fromStatus });
    const isFirstSubmission = fromStatus === INSPECTION_STATUS.DRAFT;
    const initialActions = isFirstSubmission
        ? inspection.temuan.map((finding, index) => ({
            findingId: finding.id,
            ...buildInitialAction(finding, index + 1, inspection.petugas),
        }))
        : [];

    const content = await checkContent(inspection);
    if (content.failure) return content.failure;

    // Jadwal yang tertaut diperiksa ulang dengan data terbaru. Pengajuan
    // PERTAMA menandai jadwal Terlaksana di transaksi yang sama (repository:
    // UPDATE bersyarat — gagal = seluruh pengajuan dibatalkan). Pengajuan
    // ulang revisi tidak mengubah jadwal: tautannya sudah tersimpan sejak awal.
    if (isFirstSubmission && !inspection.scheduleId) return fail(INSPECTION_ERROR.SCHEDULE_REQUIRED);
    const schedule = await checkSchedule(inspection.scheduleId || null, {
        officerUserId: inspection.petugasUserId, officerName: inspection.petugas, plantId: inspection.plantId, inspectionId: inspection.id,
    });
    if (schedule.failure) return schedule.failure;
    const scheduleCompletion = isFirstSubmission && schedule.scheduleId
        ? { scheduleId: schedule.scheduleId, officerUserId: inspection.petugasUserId, plantId: inspection.plantId }
        : null;

    const saved = await inspectionRepository.submit(inspection.id, fromStatus, nextState, initialActions, scheduleCompletion);
    if (saved === SCHEDULE_CONFLICT) return fail(INSPECTION_ERROR.SCHEDULE_UNAVAILABLE);
    if (!saved) return fail(INSPECTION_ERROR.STATE_CHANGED);

    return ok({
        inspection: await inspectionRepository.findById(inspection.id),
        resubmitted: !isFirstSubmission,
        scheduleCompleted: Boolean(scheduleCompletion),
    });
}

/**
 * Menghapus draft milik sendiri (Safety Officer pemilik, hanya selama DRAFT).
 * Penghapusan oleh Admin: removeAsAdmin() di bawah.
 *
 * @returns ok({ removed: true }) atau fail(INSPECTION_ERROR.*)
 */
export async function removeDraft(inspectionId, actor) {
    const { inspection, failure } = await loadForOwner(inspectionId, actor, canDeleteDraft, INSPECTION_ERROR.NOT_DELETABLE);
    if (failure) return failure;

    const removed = await inspectionRepository.removeDraft(inspection.id);
    if (!removed) return fail(INSPECTION_ERROR.STATE_CHANGED);
    return ok({ removed: true });
}

/**
 * Phase 18: Admin menghapus inspeksi non-draft (sedang direview, perlu
 * revisi, atau selesai) beserta data turunannya — aturan
 * domain/inspection-policy.js canDelete, yang sudah ada sejak Phase 17.2.
 * Tanpa alasan wajib; konfirmasi di UI bukan pengaman — pemeriksaan ini yang
 * otoritatif. Draft tidak pernah terlihat oleh Admin -> NOT_FOUND, sama
 * dengan id yang tidak ada.
 *
 * @returns ok({ removed: true }) atau fail(INSPECTION_ERROR.*)
 */
export async function removeAsAdmin(inspectionId, actor) {
    const inspection = await inspectionRepository.findById(inspectionId);
    if (!inspection || !canView(actor, inspection)) return fail(INSPECTION_ERROR.NOT_FOUND);
    if (actor.role !== ROLE.ADMIN || !canDelete(actor, inspection)) return fail(INSPECTION_ERROR.FORBIDDEN);

    const removed = await inspectionRepository.removeAsAdmin(inspection.id);
    if (!removed) return fail(INSPECTION_ERROR.STATE_CHANGED);
    return ok({ removed: true });
}
