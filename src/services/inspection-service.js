/* inspection-service.js — pembuatan inspeksi baru.
 *
 * Tidak menyentuh DOM. Pemanggil mengumpulkan isian form, service yang
 * memvalidasi dan membentuk datanya.
 */

import * as inspectionRepository from '#repositories/inspection-repository.js';
import * as plantRepository from '#repositories/plant-repository.js';
import { submittedState } from '../domain/workflow-rules.js';
import { ACTION_STATUS, INSPECTION_STATUS } from '../domain/statuses.js';
import { formatDate } from '../shared/date.js';
import { fail, ok } from './result.js';

export const INSPECTION_ERROR = {
    PLANT_REQUIRED: 'PLANT_REQUIRED',
    PLANT_NOT_FOUND: 'PLANT_NOT_FOUND',
    FINDINGS_REQUIRED: 'FINDINGS_REQUIRED',
    DATE_REQUIRED: 'DATE_REQUIRED',
};

/**
 * Membuat inspeksi baru dari isian form.
 *
 * Urutan validasi dipertahankan persis seperti kode lama — plant dulu, lalu
 * temuan, lalu tanggal — karena pesan yang muncul pertama kali ikut berubah
 * bila urutannya digeser.
 *
 * Setiap temuan otomatis melahirkan satu tindakan perbaikan berstatus open,
 * sehingga daftar perbaikan tidak pernah kosong untuk inspeksi yang punya
 * temuan.
 *
 * Phase 17.2: status TIDAK lagi diambil dari isian form (input.status
 * diabaikan) — hanya transisi alur kerja yang boleh mengubahnya. Inspeksi
 * dibangun sebagai DRAFT lalu langsung melewati transisi submit (DRAFT ->
 * IN_REVIEW, tahap Koordinator K3L): form saat ini belum punya pilihan
 * "simpan sebagai draft", jadi menyimpan = mengajukan, sama seperti sebelumnya.
 * Phase 17.3 memisahkan keduanya. Safety Officer tidak lagi menjadi tahap
 * pengesahan — riwayat pengesahan inspeksi baru kosong.
 *
 * Sejak Phase 12: async, karena repository backend adalah query MySQL
 * sungguhan. Id tidak lagi dihitung di sini — inspectionRepository.add()
 * yang menentukannya (nextId() di in-memory, AUTO_INCREMENT di MySQL) dan
 * mengembalikan objek lengkap.
 *
 * @returns ok({ inspection }) atau fail(INSPECTION_ERROR.*)
 */
export async function create(input) {
    if (!input.plantId) return fail(INSPECTION_ERROR.PLANT_REQUIRED);

    const findings = input.temuan || [];
    if (findings.length === 0) return fail(INSPECTION_ERROR.FINDINGS_REQUIRED);

    if (!input.tanggal) return fail(INSPECTION_ERROR.DATE_REQUIRED);

    const plant = await plantRepository.findById(input.plantId);
    if (!plant) return fail(INSPECTION_ERROR.PLANT_NOT_FOUND);

    const today = new Date().toLocaleDateString('id-ID');
    const submitted = submittedState({ status: INSPECTION_STATUS.DRAFT, currentApprovalStage: null });

    const inspection = await inspectionRepository.add({
        lokasi: plant.name,
        plantId: parseInt(input.plantId, 10),
        keteranganLokasi: input.keteranganLokasi || '-',
        tanggal: formatDate(input.tanggal),
        petugas: input.petugas,
        // Opsional: hanya diisi oleh route handler backend (req.user.id), yang
        // memaksanya di luar input pengguna (lihat docs/ROADMAP-PHASE12.md,
        // Keamanan). Frontend in-memory (belum ada auth sampai Phase 13/14)
        // tidak pernah mengirim ini — repository in-memory mengabaikannya.
        petugasUserId: input.petugasUserId,
        status: submitted.status,
        currentApprovalStage: submitted.currentApprovalStage,
        submittedAt: new Date().toISOString(),
        dueDate: formatDate(input.dueDate),
        fotoDekat: input.fotoDekat || [],
        fotoJauh: input.fotoJauh || [],
        approvalHistory: [],
        temuan: findings,
        perbaikan: findings.map((finding, index) => ({
            tgl: today,
            action: `Temuan ${index + 1}: ${finding.deskripsi}`,
            status: ACTION_STATUS.OPEN,
            pic: input.petugas,
            foto: [],
        })),
    });

    return ok({ inspection });
}
