/* officers.js — daftar Safety Officer untuk data demo.
 *
 * Sebelumnya array yang sama ditulis dua kali di legacy-app.js
 * (getRandomOfficer dan generateWeeklySchedule).
 */

export const SAFETY_OFFICERS = ['Arif', 'Tulus', 'Mustofa', 'Melka'];

/**
 * Memilih satu nama officer secara acak.
 *
 * Dipakai sebagai nilai bawaan form ketika pengguna tidak mengisi nama.
 * Ini perilaku demo — pada sistem sungguhan, PIC diambil dari pengguna
 * yang sedang login.
 */
export function getRandomOfficer() {
    return SAFETY_OFFICERS[Math.floor(Math.random() * SAFETY_OFFICERS.length)];
}
