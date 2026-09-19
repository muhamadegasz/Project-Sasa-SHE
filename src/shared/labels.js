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

/**
 * Ringkasan pengesahan: "✅ Lengkap (4/4)" atau "2/4".
 *
 * Dipakai di tabel inspeksi, modal perbaikan, dan ketiga jalur ekspor Excel.
 */
export function formatApprovalStatus(inspection) {
    if (isFullyApproved(inspection)) {
        return `✅ Lengkap (${totalStages()}/${totalStages()})`;
    }
    return `${countApproved(inspection)}/${totalStages()}`;
}
