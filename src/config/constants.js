/* constants.js — nilai tetap yang menjadi acuan aturan bisnis.
 *
 * APPROVAL_STAGES adalah kontrak data, bukan sekadar daftar tampilan:
 * field `id` dipakai sebagai KUNCI di dalam objek `inspeksi.approvals`.
 * Mengubah id di sini akan mengubah bentuk data yang sudah ada.
 */

/** Empat tahap pengesahan, berurutan. `order` menentukan urutan persetujuan. */
export const APPROVAL_STAGES = [
    { id: 1, name: 'Safety Officer', title: 'Safety Officer', order: 1 },
    { id: 2, name: 'Koord. K3L Bagian', title: 'Koordinator K3L Bagian', order: 2 },
    { id: 3, name: 'Manajer Bagian', title: 'Manajer Bagian', order: 3 },
    { id: 4, name: 'Ketua P2K3', title: 'Ketua P2K3', order: 4 }
];

/** Periode triwulanan, dipakai pada penjadwalan inspeksi. */
export const PERIODE_LIST = [
    { id: 1, name: 'Periode 1', months: 'Jan - Mar' },
    { id: 2, name: 'Periode 2', months: 'Apr - Jun' },
    { id: 3, name: 'Periode 3', months: 'Jul - Sep' },
    { id: 4, name: 'Periode 4', months: 'Okt - Des' }
];
