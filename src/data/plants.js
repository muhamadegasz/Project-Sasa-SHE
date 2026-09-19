/* plants.js — daftar plant (unit kerja) yang diinspeksi.
 *
 * Data statis, bukan demo: daftar ini mencerminkan unit kerja sungguhan.
 * Akses lewat src/repositories/plant-repository.js, bukan mengimpor
 * array ini langsung.
 *
 * Catatan: id 13 memang tidak ada pada data asli — jangan "diperbaiki"
 * dengan menomori ulang, karena id dipakai sebagai referensi di data
 * inspeksi dan jadwal.
 */

export const PLANT_LIST = [
    { id: 1, name: 'Electrical dan Instrument', code: 'E&I' },
    { id: 2, name: 'Engineering TD', code: 'ENG-TD' },
    { id: 3, name: 'Fermentation', code: 'FERM' },
    { id: 4, name: 'HRGA', code: 'HRGA' },
    { id: 5, name: 'PMR 1 dan DCL', code: 'PMR1-DCL' },
    { id: 6, name: 'PMR 2', code: 'PMR2' },
    { id: 7, name: 'Isolasi dan LF', code: 'ISOLASI-LF' },
    { id: 8, name: 'IT', code: 'IT' },
    { id: 9, name: 'Logistic', code: 'LOG' },
    { id: 10, name: 'Packing', code: 'PACK' },
    { id: 11, name: 'Polycello dan TMP', code: 'POLY-TMP' },
    { id: 12, name: 'QC & QA', code: 'QC-QA' },
    { id: 14, name: 'SHE, WT, IPAL', code: 'SHE-WT-IPAL' },
    { id: 15, name: 'TMM', code: 'TMM' },
    { id: 16, name: 'UTILITY', code: 'UTIL' }
];
