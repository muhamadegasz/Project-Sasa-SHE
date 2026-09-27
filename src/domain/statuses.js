/* statuses.js — nilai status yang dipakai di seluruh domain.
 *
 * PENTING: nilai-nilai di bawah BUKAN sekadar label internal. Ia dipakai
 * sebagai nama CSS class pada markup, misalnya:
 *
 *     <span class="status-badge selesai">
 *     <div class="progress-fill selesai_perbaikan">
 *     <span class="status-mini on-progress">
 *
 * Mengubah salah satu nilainya akan mematikan style-nya secara diam-diam.
 * Bila kelak ingin diganti, CSS di assets/css/ harus ikut diganti.
 *
 * Berkas ini tidak mengenal DOM dan tidak punya dependency.
 */

/**
 * Status alur kerja sebuah inspeksi (Phase 17.2) — sama dengan ENUM
 * inspections.status. Tidak ada status SUBMITTED: mengajukan langsung
 * menjadi IN_REVIEW. Transisinya ada di domain/workflow-rules.js.
 *
 * Status lama (proses/selesai/tinjau) tidak lagi dipakai kode; datanya
 * tetap tersimpan di kolom inspections.legacy_status (migrasi 003).
 */
export const INSPECTION_STATUS = {
    DRAFT: 'draft',
    IN_REVIEW: 'in_review',
    REVISION_REQUIRED: 'revision_required',
    COMPLETED: 'completed',
};

/** Keputusan satu attempt pengesahan — sama dengan ENUM approvals.decision. */
export const APPROVAL_DECISION = {
    APPROVED: 'approved',
    REJECTED: 'rejected',
};

/** Cara tanda tangan dibuat; keduanya disimpan sebagai gambar — sama dengan ENUM approvals.signature_method. */
export const SIGNATURE_METHOD = {
    UPLOAD: 'upload',
    CANVAS: 'canvas',
};

/**
 * Status satu tindakan perbaikan di dalam timeline — siklus hidupnya SENDIRI.
 * Tidak pernah menentukan INSPECTION_STATUS (Phase 17.2 memutus keterkaitan
 * itu; sebelumnya corrective-action-service menimpa status inspeksi).
 */
export const ACTION_STATUS = {
    CLOSED: 'closed',
    ON_PROGRESS: 'on-progress',
    OPEN: 'open',
};

/**
 * Status perbaikan sebuah inspeksi, diturunkan dari seluruh tindakannya.
 *
 * OPEN dipakai khusus untuk kasus "belum ada tindakan sama sekali" — berbeda
 * dari TINJAU yang berarti ada tindakan tetapi belum satu pun dikerjakan.
 */
export const REPAIR_STATUS = {
    SELESAI: 'selesai_perbaikan',
    PERBAIKAN: 'perbaikan',
    TINJAU: 'tinjau',
    OPEN: 'open',
};

/** Keadaan sebuah jadwal inspeksi. */
export const SCHEDULE_STATE = {
    SELESAI: 'selesai',
    TERLAMBAT: 'terlambat',
    AKTIF: 'aktif',
};
