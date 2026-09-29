/* schedule-rules.js — aturan bisnis seputar jadwal inspeksi.
 *
 * Catatan format tanggal: jadwal memakai ISO "YYYY-MM-DD", berbeda dari data
 * inspeksi yang memakai lokal "D/M/YYYY". Karena itu overdue jadwal dihitung
 * di sini, bukan memakai isOverdue() di shared/date.js yang hanya mengerti
 * format lokal. Menyatukan kedua format adalah pekerjaan tersendiri.
 *
 * Seluruh fungsi murni dan tidak mengenal DOM.
 */

import { ROLE } from '../config/constants.js';
import { SCHEDULE_STATE } from './statuses.js';

/**
 * Role yang boleh membuat dan mengubah jadwal. Satu sumber untuk penjaga route
 * POST/PUT /api/schedules (otoritatif) dan tombol Tambah/Edit di UI —
 * sebelumnya UI menawarkan kedua tombol ke semua role, lalu server menolak 403.
 */
export const SCHEDULE_EDITOR_ROLES = [ROLE.SAFETY_OFFICER, ROLE.ADMIN];

/** Apakah pengguna boleh membuat/mengubah jadwal. */
export function canManageSchedules(user) {
    return Boolean(user) && SCHEDULE_EDITOR_ROLES.includes(user.role);
}

/** Apakah jadwal sudah terlaksana. */
export function isRealized(schedule) {
    return Boolean(schedule && schedule.tanggalRealisasi);
}

/**
 * Apakah jadwal terlewat: tanggalnya sudah lewat tetapi belum terlaksana.
 *
 * Jadwal tanpa tanggal tidak pernah dianggap terlewat. `now` hanya untuk
 * pengujian; bawaannya saat ini.
 */
export function isOverdue(schedule, now = new Date()) {
    if (!schedule || !schedule.tanggalJadwal) return false;
    if (isRealized(schedule)) return false;
    return new Date(schedule.tanggalJadwal) < now;
}

/**
 * Keadaan sebuah jadwal.
 *
 * Urutan pemeriksaan penting: sudah terlaksana menang atas terlewat, sehingga
 * jadwal yang dikerjakan terlambat tetap tampil sebagai selesai.
 */
export function getState(schedule, now = new Date()) {
    if (isRealized(schedule)) return SCHEDULE_STATE.SELESAI;
    if (isOverdue(schedule, now)) return SCHEDULE_STATE.TERLAMBAT;
    return SCHEDULE_STATE.AKTIF;
}

/** Keadaan satu tanggal kalender yang memuat jadwal selesai DAN yang belum. */
export const CALENDAR_MIXED = 'campuran';

/**
 * Kunci tanggal "YYYY-MM-DD" langsung dari teks tanggal jadwal, tanpa
 * new Date(): "2026-10-12" diparse sebagai tengah malam UTC, sehingga di zona
 * waktu negatif getDate() jatuh sehari lebih awal.
 */
export function scheduleDateKey(value) {
    return String(value).slice(0, 10);
}

/**
 * Jumlah jadwal per tanggal kalender, per keadaan — aturan keadaannya sama
 * dengan tabel Penjadwalan (getState): tanggal jadwal dihitung aktif /
 * terlambat / selesai; tanggal realisasi (bila berbeda dari tanggal jadwal)
 * dihitung selesai. Satu jadwal dihitung sekali per tanggal.
 *
 * @returns {{ [dateKey: string]: { aktif: number, terlambat: number, selesai: number } }}
 */
export function calendarDays(schedules, now = new Date()) {
    const days = {};
    const add = (key, state) => {
        days[key] ||= { [SCHEDULE_STATE.AKTIF]: 0, [SCHEDULE_STATE.TERLAMBAT]: 0, [SCHEDULE_STATE.SELESAI]: 0 };
        days[key][state]++;
    };
    for (const schedule of schedules) {
        const scheduledKey = schedule.tanggalJadwal ? scheduleDateKey(schedule.tanggalJadwal) : null;
        if (scheduledKey) add(scheduledKey, getState(schedule, now));
        if (isRealized(schedule)) {
            const realizedKey = scheduleDateKey(schedule.tanggalRealisasi);
            if (realizedKey !== scheduledKey) add(realizedKey, SCHEDULE_STATE.SELESAI);
        }
    }
    return days;
}

/**
 * Keadaan satu tanggal dari hitungan calendarDays(): 'campuran' bila ada
 * yang selesai sekaligus yang belum; selain itu terlambat > aktif > selesai.
 */
export function calendarDayState(counts) {
    const pending = counts[SCHEDULE_STATE.AKTIF] + counts[SCHEDULE_STATE.TERLAMBAT];
    if (counts[SCHEDULE_STATE.SELESAI] > 0 && pending > 0) return CALENDAR_MIXED;
    if (counts[SCHEDULE_STATE.TERLAMBAT] > 0) return SCHEDULE_STATE.TERLAMBAT;
    if (counts[SCHEDULE_STATE.AKTIF] > 0) return SCHEDULE_STATE.AKTIF;
    return SCHEDULE_STATE.SELESAI;
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
