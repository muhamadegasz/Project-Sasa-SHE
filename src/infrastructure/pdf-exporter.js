/* pdf-exporter.js — satu-satunya modul yang menyentuh html2pdf.
 *
 * Lapisan INFRASTRUKTUR. Ia menerima elemen yang sudah berisi markup laporan,
 * lalu mengubahnya menjadi berkas PDF. Menyusun markup-nya bukan urusan
 * berkas ini — itu pekerjaan presentation (Phase 8).
 *
 * Kalau kelak html2pdf diganti, hanya berkas ini yang perlu disentuh.
 */

/** Opsi html2pdf yang dipakai seluruh laporan. Nilainya dipertahankan apa adanya. */
function buildOptions(element, filename) {
    return {
        margin: [0.5, 0.5, 0.5, 0.5],
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            letterRendering: true,
            scrollY: 0,
            windowHeight: element.scrollHeight,
        },
        jsPDF: {
            unit: 'in',
            format: 'a4',
            orientation: 'portrait',
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    };
}

/** Nama berkas laporan untuk sebuah inspeksi. */
export function reportFilename(inspectionId) {
    return `Laporan_Inspeksi_${inspectionId}_${new Date().toISOString().slice(0, 10)}.pdf`;
}

/**
 * Mengubah isi sebuah elemen menjadi PDF lalu mengunduhnya.
 *
 * @param {HTMLElement} element elemen yang sudah berisi markup laporan
 * @param {string} filename
 * @returns {Promise<void>} selesai ketika berkas tersimpan; ditolak bila gagal
 */
export function savePdf(element, filename) {
    return html2pdf().set(buildOptions(element, filename)).from(element).save();
}
