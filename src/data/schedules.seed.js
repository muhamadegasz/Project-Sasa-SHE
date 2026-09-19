/* schedules.seed.js — pembangkit data jadwal demo.
 *
 * Dipindahkan apa adanya dari legacy-app.js. Perilakunya TIDAK diubah,
 * termasuk dua keanehan yang sudah didokumentasikan sebagai D-7:
 *
 *   1. Komentar "Setiap plant punya 2 jadwal" tidak akurat. Iterasi kedua
 *      selalu tersaring `if (diffDays > 35) continue`, sehingga hasilnya
 *      6 plant x 1 jadwal, bukan 12.
 *   2. Cabang `isRealisasi` mensyaratkan diffDays < 0, padahal seluruh
 *      tanggal yang lolos filter berada 15-22 hari ke depan. Cabang itu
 *      tidak pernah tercapai, sehingga tanggalRealisasi selalu null.
 *
 * Akibatnya Math.random() tidak pernah mengubah hasil: keluarannya
 * deterministik. Lihat docs/KNOWN-ISSUES.md D-7.
 */

import { SAFETY_OFFICERS } from './officers.js';

export function generateWeeklySchedule() {
    const today = new Date();
    const currentYear = today.getFullYear();
    
    const schedules = [];
    let idCounter = 1;

    // Hanya 6 plant yang aktif
    const activePlants = [
        { id: 1, name: 'Electrical dan Instrument', code: 'E&I' },
        { id: 3, name: 'Fermentation', code: 'FERM' },
        { id: 6, name: 'PMR 2', code: 'PMR2' },
        { id: 9, name: 'Logistic', code: 'LOG' },
        { id: 14, name: 'SHE, WT, IPAL', code: 'SHE-WT-IPAL' },
        { id: 16, name: 'UTILITY', code: 'UTIL' }
    ];

    const officers = SAFETY_OFFICERS;

    activePlants.forEach((plant, plantIndex) => {
        // Setiap plant punya 2 jadwal
        for (let i = 0; i < 2; i++) {
            // Jadwal di hari Senin, dengan interval 2-3 minggu
            const weekOffset = (i * 3) + (plantIndex % 2) + 1;
            const date = new Date(today);
            date.setDate(date.getDate() + (weekOffset * 7) + (1 - date.getDay() + 7) % 7 + 7);
            
            const diffDays = (date - today) / (1000 * 60 * 60 * 24);
            if (diffDays > 35 || diffDays < -7) continue;
            
            const officerIndex = (plant.id + i) % officers.length;
            
            const isRealisasi = Math.random() < 0.3 && diffDays < 0;
            const realisasiDate = isRealisasi ? new Date(date) : null;
            if (realisasiDate) {
                realisasiDate.setDate(realisasiDate.getDate() + Math.floor(Math.random() * 3) + 1);
            }
            
            const month = date.getMonth();
            let periode = 1;
            if (month >= 3 && month <= 5) periode = 2;
            else if (month >= 6 && month <= 8) periode = 3;
            else if (month >= 9 && month <= 11) periode = 4;
            
            schedules.push({
                id: `SCH-${String(idCounter++).padStart(3, '0')}`,
                plantId: plant.id,
                plantName: plant.name,
                periode: periode,
                tahun: currentYear,
                minggu: i + 1,
                tanggalJadwal: date.toISOString().split('T')[0],
                tanggalRealisasi: realisasiDate ? realisasiDate.toISOString().split('T')[0] : null,
                officer: officers[officerIndex],
                status: isRealisasi ? 'selesai' : 'aktif'
            });
        }
    });

    return schedules;
}
