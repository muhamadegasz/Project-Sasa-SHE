/* excel-exporter.js — satu-satunya modul yang menyentuh SheetJS (XLSX).
 *
 * Ini lapisan INFRASTRUKTUR, bukan service. Ia boleh berurusan dengan library
 * pihak ketiga dan mekanisme unduh berkas; service tidak.
 *
 * Kalau kelak SheetJS diganti, hanya berkas ini yang perlu disentuh.
 *
 * ---------------------------------------------------------------------------
 * KEAMANAN — spreadsheet formula injection (temuan S-04)
 *
 * Teks bebas dari pengguna (deskripsi temuan, keterangan lokasi, nama PIC,
 * tindakan perbaikan) masuk ke sel Excel. Nilai yang diawali = + - atau @
 * akan DIEVALUASI Excel sebagai formula saat berkasnya dibuka, termasuk
 * =HYPERLINK dan pemanggilan DDE. Yang terdampak bukan pengguna aplikasi ini,
 * melainkan siapa pun yang membuka berkas hasil ekspornya.
 *
 * Mitigasi: sisipkan tanda kutip tunggal di depan nilai semacam itu. Excel
 * memperlakukannya sebagai penanda teks dan tidak menampilkannya, sehingga
 * "=1+1" tersimpan sebagai "'=1+1" dan tampil sebagai teks "=1+1".
 *
 * Disetujui pemilik project — lihat docs/DECISIONS.md K-4.
 * ---------------------------------------------------------------------------
 */

import { getProgress, getRepairStatus, countFindings } from '../domain/inspection-rules.js';
import { formatApprovalStatus } from '../shared/labels.js';

/** Karakter pembuka yang membuat Excel memperlakukan sel sebagai formula. */
const FORMULA_TRIGGERS = ['=', '+', '-', '@'];

/**
 * Menetralkan satu nilai sel.
 *
 * Angka dibiarkan apa adanya — hanya string yang dapat memicu formula.
 */
export function sanitizeCell(value) {
    if (typeof value !== 'string' || value.length === 0) return value;
    return FORMULA_TRIGGERS.includes(value[0]) ? `'${value}` : value;
}

/** Menetralkan seluruh nilai pada sekumpulan baris. */
function sanitizeRows(rows) {
    return rows.map((row) => {
        const safe = {};
        for (const [key, value] of Object.entries(row)) {
            safe[key] = sanitizeCell(value);
        }
        return safe;
    });
}

/** Stempel tanggal untuk nama berkas, format YYYY-MM-DD. */
function todayStamp() {
    return new Date().toISOString().slice(0, 10);
}

/** Membangun workbook satu sheet dari baris yang sudah dinetralkan. */
function buildWorkbook(rows, sheetName, columnWidths) {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(sanitizeRows(rows));
    if (columnWidths) sheet['!cols'] = columnWidths;
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    return workbook;
}

/** Lebar kolom untuk kedua laporan temuan (11 kolom). */
const FINDING_COLUMN_WIDTHS = [
    { wch: 5 }, { wch: 12 }, { wch: 25 }, { wch: 20 }, { wch: 15 },
    { wch: 15 }, { wch: 35 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
    { wch: 25 },
];

/** Satu baris laporan temuan. */
function toFindingRow(inspection, finding, number) {
    return {
        'No': number,
        'ID Inspeksi': inspection.id,
        'Lokasi / Plant': inspection.lokasi,
        'Keterangan Lokasi': inspection.keteranganLokasi || '-',
        'Tanggal Inspeksi': inspection.tanggal,
        'Safety Officer': inspection.petugas,
        'Deskripsi Temuan': finding.deskripsi,
        'Kategori': finding.kategori,
        'Status Inspeksi': inspection.status,
        'Due Date Plant': inspection.dueDate || '-',
        'Status Pengesahan': formatApprovalStatus(inspection),
    };
}

/** Satu baris ringkasan inspeksi. */
function toInspectionRow(inspection) {
    return {
        'ID': inspection.id,
        'Lokasi / Plant': inspection.lokasi,
        'Keterangan Lokasi': inspection.keteranganLokasi || '-',
        'Tanggal': inspection.tanggal,
        'Safety Officer': inspection.petugas,
        'Jumlah Temuan': countFindings(inspection),
        'Daftar Temuan': inspection.temuan
            ? inspection.temuan.map((t) => `${t.deskripsi} (${t.kategori})`).join('; ')
            : '-',
        'Due Date Plant': inspection.dueDate || '-',
        'Status': inspection.status,
        'Progres Perbaikan': `${getProgress(inspection)}%`,
        'Status Perbaikan': getRepairStatus(inspection),
        'Status Pengesahan': formatApprovalStatus(inspection),
    };
}

/**
 * Mengekspor temuan satu inspeksi.
 * @returns {{count: number, filename: string}}
 */
export function exportFindingsOf(inspection) {
    const rows = inspection.temuan.map((finding, index) =>
        toFindingRow(inspection, finding, index + 1));
    const filename = `Temuan_${inspection.id}_${todayStamp()}.xlsx`;
    XLSX.writeFile(buildWorkbook(rows, 'Temuan', FINDING_COLUMN_WIDTHS), filename);
    return { count: rows.length, filename };
}

/**
 * Mengekspor seluruh temuan dari semua inspeksi, satu baris per temuan.
 * @returns {{count: number, filename: string}}
 */
export function exportAllFindings(inspections) {
    const rows = [];
    inspections.forEach((inspection) => {
        if (!inspection.temuan) return;
        inspection.temuan.forEach((finding) => {
            rows.push(toFindingRow(inspection, finding, rows.length + 1));
        });
    });
    const filename = `Semua_Temuan_${todayStamp()}.xlsx`;
    XLSX.writeFile(buildWorkbook(rows, 'Semua Temuan', FINDING_COLUMN_WIDTHS), filename);
    return { count: rows.length, filename };
}

/**
 * Mengekspor ringkasan inspeksi ke berkas dengan nama yang ditentukan.
 * @returns {{count: number, filename: string}}
 */
export function exportInspections(inspections, filename) {
    const rows = inspections.map(toInspectionRow);
    XLSX.writeFile(buildWorkbook(rows, 'Inspeksi'), filename);
    return { count: rows.length, filename };
}

/**
 * Menyiapkan berkas ringkasan inspeksi untuk diunggah ke Google Sheets.
 *
 * Meski namanya "sync", tidak ada sambungan ke Google Sheets — berkas .xlsx
 * dibuat lalu diunduh, dan pengguna yang mengunggahnya sendiri. Perilaku ini
 * memang begitu sejak awal; lihat docs/KNOWN-ISSUES.md D-5.
 *
 * Memakai Blob dan elemen <a> sementara, bukan XLSX.writeFile, supaya nama
 * berkasnya dapat ditentukan sendiri. Menyentuh DOM di sini dapat diterima:
 * ini lapisan infrastruktur, dan mengunduh berkas memang butuh DOM.
 *
 * @returns {{count: number, filename: string}}
 */
export function downloadInspectionsWorkbook(inspections) {
    const rows = inspections.map(toInspectionRow);
    const workbook = buildWorkbook(rows, 'Inspeksi K3');
    const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([output], { type: 'application/octet-stream' });
    const filename = `Inspeksi_K3_${todayStamp()}.xlsx`;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    return { count: rows.length, filename };
}
