/* labels.js — teks yang dilihat pengguna, diturunkan dari nilai domain.
 *
 * Kenapa di shared/ dan bukan di domain/: ini label, bukan aturan. Domain
 * menjawab "berapa tahap yang sudah disetujui"; berkas ini menjawab
 * "bagaimana menuliskannya".
 *
 * Kenapa bukan di presentation/: label yang sama dipakai tampilan layar DAN
 * isi sel Excel. Menaruhnya di salah satunya akan membuat yang lain mengimpor
 * ke arah yang salah.
 *
 * Berkas ini hanya bergantung pada domain/ — arah ke dalam, sesuai aturan
 * dependency. Tidak mengenal DOM.
 */

import { countApproved, isFullyApproved, totalStages } from '../domain/approval-rules.js';
import { ACTION_STATUS, INSPECTION_STATUS, REPAIR_STATUS } from '../domain/statuses.js';
import { ROLE } from '../config/constants.js';

const ROLE_LABELS = {
    [ROLE.SAFETY_OFFICER]: 'Safety Officer',
    [ROLE.KOORDINATOR_K3L]: 'Koordinator K3L',
    [ROLE.MANAJER_BAGIAN]: 'Manajer Bagian',
    [ROLE.KETUA_P2K3]: 'Ketua P2K3',
    [ROLE.ADMIN]: 'Admin',
};

/** Label role pengguna (Phase 18) — tabel dan formulir pengelolaan akun. */
export function formatRole(role) {
    return ROLE_LABELS[role] || role;
}

const INSPECTION_STATUS_LABELS = {
    [INSPECTION_STATUS.DRAFT]: 'Draft',
    [INSPECTION_STATUS.IN_REVIEW]: 'Dalam Review',
    [INSPECTION_STATUS.REVISION_REQUIRED]: 'Perlu Revisi',
    [INSPECTION_STATUS.COMPLETED]: 'Selesai',
};

/** Label status alur kerja inspeksi (Phase 17.2) — dipakai tabel, modal, PDF, dan Excel. */
export function formatInspectionStatus(status) {
    return INSPECTION_STATUS_LABELS[status] || status;
}

/**
 * Ringkasan pengesahan: "✅ Lengkap (3/3)" atau "2/3".
 *
 * Dipakai di tabel inspeksi, modal perbaikan, dan ketiga jalur ekspor Excel.
 */
export function formatApprovalStatus(inspection) {
    if (isFullyApproved(inspection)) {
        return `✅ Lengkap (${totalStages()}/${totalStages()})`;
    }
    return `${countApproved(inspection)}/${totalStages()}`;
}

/* Phase 16.2 (U-03): sebelumnya nilai status yang sama ditulis dengan tiga
 * kosakata berbeda — modal perbaikan "Closed/On Progress/Open", PDF
 * "Selesai/Progres/Pending", tabel dashboard "Selesai/Perbaikan/Tinjau".
 * Satu sumber di sini; nilai enum-nya sendiri (juga dipakai sebagai nama CSS
 * class, lihat domain/statuses.js) tidak berubah. */

const ACTION_STATUS_LABELS = {
    [ACTION_STATUS.CLOSED]: '✅ Selesai',
    [ACTION_STATUS.ON_PROGRESS]: '🔄 Progres',
    [ACTION_STATUS.OPEN]: '⏳ Menunggu',
};

/** Label status SATU tindakan perbaikan (timeline modal, pilihan status, PDF, chart). */
export function formatActionStatus(status) {
    return ACTION_STATUS_LABELS[status] || status;
}

// OPEN (belum ada tindakan sama sekali) sengaja berlabel sama dengan TINJAU:
// begitulah tabel dashboard selama ini menampilkannya, dan fase ini hanya
// menyeragamkan label, tidak menambah istilah baru.
const REPAIR_STATUS_LABELS = {
    [REPAIR_STATUS.SELESAI]: '✅ Selesai',
    [REPAIR_STATUS.PERBAIKAN]: '🔄 Perbaikan',
    [REPAIR_STATUS.TINJAU]: '⏳ Tinjau',
    [REPAIR_STATUS.OPEN]: '⏳ Tinjau',
};

/** Label status perbaikan SEBUAH INSPEKSI (hasil getRepairStatus()). */
export function formatRepairStatus(status) {
    return REPAIR_STATUS_LABELS[status] || status;
}
