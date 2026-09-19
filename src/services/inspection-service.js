/* inspection-service.js — pembuatan inspeksi baru.
 *
 * Tidak menyentuh DOM. Pemanggil mengumpulkan isian form, service yang
 * memvalidasi dan membentuk datanya.
 */

import * as inspectionRepository from '../repositories/inspection-repository.js';
import * as plantRepository from '../repositories/plant-repository.js';
import { buildInitialApprovals } from '../domain/approval-rules.js';
import { ACTION_STATUS } from '../domain/statuses.js';
import { formatDate } from '../shared/date.js';
import { fail, ok } from './result.js';

export const INSPECTION_ERROR = {
    PLANT_REQUIRED: 'PLANT_REQUIRED',
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
 * temuan. Tahap pengesahan pertama langsung disetujui atas nama petugas.
 *
 * @returns ok({ inspection }) atau fail(INSPECTION_ERROR.*)
 */
export function create(input) {
    if (!input.plantId) return fail(INSPECTION_ERROR.PLANT_REQUIRED);

    const findings = input.temuan || [];
    if (findings.length === 0) return fail(INSPECTION_ERROR.FINDINGS_REQUIRED);

    if (!input.tanggal) return fail(INSPECTION_ERROR.DATE_REQUIRED);

    const plant = plantRepository.findById(input.plantId);
    const today = new Date().toLocaleDateString('id-ID');

    const inspection = {
        id: inspectionRepository.nextId(),
        lokasi: plant ? plant.name : '',
        plantId: parseInt(input.plantId, 10),
        keteranganLokasi: input.keteranganLokasi || '-',
        // lat/lng tidak pernah dirender di mana pun. Dipertahankan agar bentuk
        // datanya sama dengan data demo; dihapus pada Phase 11.
        lat: -6.200000,
        lng: 106.816666,
        tanggal: formatDate(input.tanggal),
        petugas: input.petugas,
        status: input.status,
        dueDate: formatDate(input.dueDate),
        fotoDekat: input.fotoDekat && input.fotoDekat.length ? input.fotoDekat : ['-'],
        fotoJauh: input.fotoJauh && input.fotoJauh.length ? input.fotoJauh : ['-'],
        approvals: buildInitialApprovals(input.petugas),
        temuan: findings,
        perbaikan: findings.map((finding, index) => ({
            tgl: today,
            action: `Temuan ${index + 1}: ${finding.deskripsi}`,
            status: ACTION_STATUS.OPEN,
            pic: input.petugas,
            foto: [],
        })),
    };

    inspectionRepository.add(inspection);
    return ok({ inspection });
}
