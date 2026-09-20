/* schedule-service.js — pembuatan, perubahan, dan penghapusan jadwal.
 *
 * Tidak menyentuh DOM.
 */

import * as scheduleRepository from '#repositories/schedule-repository.js';
import * as plantRepository from '#repositories/plant-repository.js';
import { SCHEDULE_STATE } from '../domain/statuses.js';
import { fail, ok } from './result.js';

export const SCHEDULE_ERROR = {
    PLANT_REQUIRED: 'PLANT_REQUIRED',
    OFFICER_REQUIRED: 'OFFICER_REQUIRED',
    YEAR_REQUIRED: 'YEAR_REQUIRED',
    DATE_REQUIRED: 'DATE_REQUIRED',
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

    const officer = String(input.officer || '').trim();
    if (!officer) return fail(SCHEDULE_ERROR.OFFICER_REQUIRED);

    if (!input.tahun || input.tahun < EARLIEST_YEAR) return fail(SCHEDULE_ERROR.YEAR_REQUIRED);
    if (!input.tanggalJadwal) return fail(SCHEDULE_ERROR.DATE_REQUIRED);

    const plant = await plantRepository.findById(input.plantId);
    const fields = {
        plantId: parseInt(input.plantId, 10),
        plantName: plant ? plant.name : '',
        periode: input.periode,
        tahun: input.tahun,
        tanggalJadwal: input.tanggalJadwal,
        tanggalRealisasi: input.tanggalRealisasi || null,
        officer,
        // Opsional, sama seperti petugasUserId di inspection-service.js —
        // hanya diisi route handler backend dari req.user, diabaikan
        // repository in-memory.
        officerUserId: input.officerUserId,
        minggu: input.minggu,
    };

    if (input.id) {
        const existing = await scheduleRepository.findById(input.id);
        if (!existing) return ok({ schedule: null, created: false });

        Object.assign(existing, fields);
        await scheduleRepository.update(input.id, fields);
        return ok({ schedule: existing, created: false });
    }

    const schedule = await scheduleRepository.add({
        ...fields,
        status: SCHEDULE_STATE.AKTIF,
    });
    return ok({ schedule, created: true });
}

/**
 * Menghapus jadwal.
 *
 * Konfirmasi pengguna adalah urusan pemanggil.
 *
 * @returns ok({ removed }) — removed bernilai false bila id tidak ditemukan.
 */
export async function remove(id) {
    return ok({ removed: await scheduleRepository.remove(id) });
}
