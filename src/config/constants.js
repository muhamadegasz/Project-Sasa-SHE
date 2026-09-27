/* constants.js — nilai tetap yang menjadi acuan aturan bisnis.
 *
 * APPROVAL_STAGE/ROLE adalah kontrak data, bukan sekadar daftar tampilan:
 * nilainya sama persis dengan ENUM di database (approvals.stage,
 * inspections.current_approval_stage, users.role — lihat migrasi 003).
 * Mengubah nilai di sini tanpa migrasi akan memutus data yang sudah ada.
 */

/** Role pengguna — sama dengan ENUM users.role. */
export const ROLE = {
    SAFETY_OFFICER: 'safety_officer',
    KOORDINATOR_K3L: 'koordinator_k3l',
    MANAJER_BAGIAN: 'manajer_bagian',
    KETUA_P2K3: 'ketua_p2k3',
    ADMIN: 'admin',
};

/** Kode tahap pengesahan — sama dengan ENUM approvals.stage. */
export const APPROVAL_STAGE = {
    KOORDINATOR_K3L: 'koordinator_k3l',
    MANAJER: 'manajer',
    KETUA_P2K3: 'ketua_p2k3',
};

/**
 * Tiga tahap pengesahan, berurutan (Phase 17.2). Safety Officer BUKAN tahap
 * pengesahan — ia pembuat/pengaju/perevisi inspeksi. `role` adalah satu-
 * satunya role yang boleh memutuskan tahap itu (lihat domain/inspection-policy.js).
 */
export const APPROVAL_STAGES = [
    { id: APPROVAL_STAGE.KOORDINATOR_K3L, role: ROLE.KOORDINATOR_K3L, name: 'Koord. K3L Bagian', title: 'Koordinator K3L Bagian', order: 1 },
    { id: APPROVAL_STAGE.MANAJER, role: ROLE.MANAJER_BAGIAN, name: 'Manajer Bagian', title: 'Manajer Bagian', order: 2 },
    { id: APPROVAL_STAGE.KETUA_P2K3, role: ROLE.KETUA_P2K3, name: 'Ketua P2K3', title: 'Ketua P2K3', order: 3 },
];

/** Periode triwulanan, dipakai pada penjadwalan inspeksi. */
export const PERIODE_LIST = [
    { id: 1, name: 'Periode 1', months: 'Jan - Mar' },
    { id: 2, name: 'Periode 2', months: 'Apr - Jun' },
    { id: 3, name: 'Periode 3', months: 'Jul - Sep' },
    { id: 4, name: 'Periode 4', months: 'Okt - Des' }
];
