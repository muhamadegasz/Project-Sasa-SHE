/* schedule-service.js — pembuatan, perubahan, dan penghapusan jadwal.
 *
 * Tidak menyentuh DOM. Dipakai di browser (umpan balik cepat) DAN di server
 * (otoritatif) lewat #repositories/.
 *
 * Migrasi 008: petugas jadwal adalah AKUN Safety Officer aktif
 * (officerUserId, divalidasi di sini; namanya disalin dari akun), dan
 * "Terlaksana" (tanggal realisasi + status selesai) hanya diisi sistem saat
 * laporan inspeksi yang tertaut diajukan — tidak lagi dari isian form.
 * Jadwal yang sudah Terlaksana tidak bisa diubah atau dihapus.
 */

import * as scheduleRepository from '#repositories/schedule-repository.js';
import * as plantRepository from '#repositories/plant-repository.js';
import { SCHEDULE_STATE } from '../domain/statuses.js';
import { isRealized } from '../domain/schedule-rules.js';
import { fail, ok } from './result.js';

export const SCHEDULE_ERROR = {
    PLANT_REQUIRED: 'PLANT_REQUIRED',
    OFFICER_REQUIRED: 'OFFICER_REQUIRED',
    // Bukan akun Safety Officer aktif.
    OFFICER_INVALID: 'OFFICER_INVALID',
    YEAR_REQUIRED: 'YEAR_REQUIRED',
    DATE_REQUIRED: 'DATE_REQUIRED',
    // Sudah Terlaksana / sudah tertaut laporan yang diajukan: tidak bisa diubah/dihapus.
    SCHEDULE_REALIZED: 'SCHEDULE_REALIZED',
    SCHEDULE_LINKED: 'SCHEDULE_LINKED',
};

const EARLIEST_YEAR = 2020;

/**
 * Menyimpan jadwal: membuat baru bila `id` kosong, memperbarui bila terisi.
 *
 * Urutan validasi dipertahankan seperti kode lama: plant, officer, tahun,
 * tanggal.
 *
 * Catatan perilaku yang dipertahankan: bila `id` terisi tetapi jadwalnya tidak
 * ditemukan, hasilnya tetap ok dengan `schedule: null`. Kode lama juga tidak
 * memunculkan pesan apa pun pada kasus itu — modal tetap tertutup dan tampilan
 * tetap di-refresh. Kasus ini tidak terjangkau lewat UI, karena id selalu
 * datang dari baris yang memang ada.
 *
 * Sejak Phase 12: async. Id pada jalur create tidak lagi dihitung di sini —
 * scheduleRepository.add() yang menentukannya, sama seperti inspection-service.js.
 * Jalur update memanggil scheduleRepository.update() setelah Object.assign,
 * supaya perubahan benar-benar tersimpan pada repository backend (MySQL) —
 * lihat catatan di src/repositories/schedule-repository.js.
 *
 * @returns ok({ schedule, created }) atau fail(SCHEDULE_ERROR.*)
 */
export async function save(input) {
    if (!input.plantId) return fail(SCHEDULE_ERROR.PLANT_REQUIRED);

    if (input.officerUserId === undefined || input.officerUserId === null || input.officerUserId === '') {
        return fail(SCHEDULE_ERROR.OFFICER_REQUIRED);
    }

    if (!input.tahun || input.tahun < EARLIEST_YEAR) return fail(SCHEDULE_ERROR.YEAR_REQUIRED);
    if (!input.tanggalJadwal) return fail(SCHEDULE_ERROR.DATE_REQUIRED);

    // Petugas = akun Safety Officer aktif; namanya dari akun, bukan dari isian.
    const officer = await scheduleRepository.findAssignableOfficer(input.officerUserId);
    if (!officer) return fail(SCHEDULE_ERROR.OFFICER_INVALID);

    const plant = await plantRepository.findById(input.plantId);
    const fields = {
        plantId: parseInt(input.plantId, 10),
        plantName: plant ? plant.name : '',
        periode: input.periode,
        tahun: input.tahun,
        tanggalJadwal: input.tanggalJadwal,
        officer: officer.displayName,
        officerUserId: Number(officer.id),
        minggu: input.minggu,
    };

    if (input.id) {
        const existing = await scheduleRepository.findById(input.id);
        if (!existing) return ok({ schedule: null, created: false });
        if (isRealized(existing)) return fail(SCHEDULE_ERROR.SCHEDULE_REALIZED);

        Object.assign(existing, fields);
        await scheduleRepository.update(input.id, fields);
        return ok({ schedule: existing, created: false });
    }

    const schedule = await scheduleRepository.add({
        ...fields,
        tanggalRealisasi: null,
        status: SCHEDULE_STATE.AKTIF,
    });
    return ok({ schedule, created: true });
}

/**
 * Menghapus jadwal. Jadwal yang sudah Terlaksana atau tertaut laporan yang
 * sudah diajukan tidak bisa dihapus (bukti pelaksanaan); tautan draft dilepas
 * database (ON DELETE SET NULL).
 *
 * Konfirmasi pengguna adalah urusan pemanggil.
 *
 * @returns ok({ removed }) — removed bernilai false bila id tidak ditemukan.
 */
export async function remove(id) {
    const existing = await scheduleRepository.findById(id);
    if (existing && existing.inspectionId) return fail(SCHEDULE_ERROR.SCHEDULE_LINKED, { inspectionId: existing.inspectionId });
    if (existing && isRealized(existing)) return fail(SCHEDULE_ERROR.SCHEDULE_REALIZED);
    return ok({ removed: await scheduleRepository.remove(id) });
}

/** Akun Safety Officer aktif yang bisa ditugaskan (pilihan petugas di form jadwal). */
export async function assignableOfficers() {
    return ok({ officers: await scheduleRepository.listAssignableOfficers() });
}
