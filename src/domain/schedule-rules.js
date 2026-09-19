/* schedule-rules.js — aturan bisnis seputar jadwal inspeksi.
 *
 * Catatan format tanggal: jadwal memakai ISO "YYYY-MM-DD", berbeda dari data
 * inspeksi yang memakai lokal "D/M/YYYY". Karena itu overdue jadwal dihitung
 * di sini, bukan memakai isOverdue() di shared/date.js yang hanya mengerti
 * format lokal. Menyatukan kedua format adalah pekerjaan tersendiri.
 *
 * Seluruh fungsi murni dan tidak mengenal DOM.
 */

import { SCHEDULE_STATE } from './statuses.js';

/** Apakah jadwal sudah terlaksana. */
export function isRealized(schedule) {
    return Boolean(schedule && schedule.tanggalRealisasi);
}

/**
 * Apakah jadwal terlewat: tanggalnya sudah lewat tetapi belum terlaksana.
 *
 * Jadwal tanpa tanggal tidak pernah dianggap terlewat.
 */
export function isOverdue(schedule) {
    if (!schedule || !schedule.tanggalJadwal) return false;
    if (isRealized(schedule)) return false;
    return new Date(schedule.tanggalJadwal) < new Date();
}

/**
 * Keadaan sebuah jadwal.
 *
 * Urutan pemeriksaan penting: sudah terlaksana menang atas terlewat, sehingga
 * jadwal yang dikerjakan terlambat tetap tampil sebagai selesai.
 */
export function getState(schedule) {
    if (isRealized(schedule)) return SCHEDULE_STATE.SELESAI;
    if (isOverdue(schedule)) return SCHEDULE_STATE.TERLAMBAT;
    return SCHEDULE_STATE.AKTIF;
}

/**
 * Apakah jadwal termasuk hitungan "Jadwal Aktif" di dashboard.
 *
 * Memeriksa field status DAN ketiadaan tanggal realisasi, persis seperti
 * sebelumnya. Keduanya memang tumpang tindih — field `status` sudah menyimpan
 * 'selesai' ketika realisasi terisi — tetapi pemeriksaan ganda ini
 * dipertahankan supaya angkanya tidak bergeser.
 */
export function isActive(schedule) {
    return schedule.status === SCHEDULE_STATE.AKTIF && !isRealized(schedule);
}

/** Jumlah jadwal yang masih aktif. */
export function countActive(schedules) {
    return schedules.filter(isActive).length;
}
