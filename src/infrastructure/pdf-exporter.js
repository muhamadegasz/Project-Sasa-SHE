/* pdf-exporter.js — satu-satunya modul yang menyentuh html2pdf.
 *
 * Lapisan INFRASTRUKTUR. Ia menerima elemen yang sudah berisi markup laporan,
 * lalu mengubahnya menjadi berkas PDF. Menyusun markup-nya bukan urusan
 * berkas ini — itu pekerjaan presentation (Phase 8).
 *
 * Kalau kelak html2pdf diganti, hanya berkas ini yang perlu disentuh.
 *
 * Release — perbaikan PDF kosong: #pdfContent sengaja tersembunyi
 * (.pdf-content { display: none } di 11-lightbox.css), dan html2pdf menyalin
 * elemen BESERTA kelasnya; html2canvas mengukur salinan itu di halaman
 * (tinggi 0) sehingga PDF yang dihasilkan selama ini selalu kosong. Selain
 * itu seluruh tata letak laporan (.pdf-content …, 15-print.css) hanya berlaku
 * di @media print, padahal html2canvas merender sebagai layar. Sekarang isi
 * laporan dirender dari pembungkus sendiri (.pdf-render) dengan aturan cetak
 * yang sama, dipasang sementara selama render. html2pdf merender di dalam
 * lapisan miliknya yang opacity 0 — halaman pengguna tidak berubah.
 */

const RENDER_CLASS = 'pdf-render';

/**
 * Aturan `.pdf-content …` dari blok @media print (15-print.css), dipetakan ke
 * pembungkus render. Disalin dari stylesheet yang dimuat — bukan diduplikasi
 * di berkas CSS lain — jadi tata letak PDF tetap satu sumber.
 */
function reportRenderRules() {
    const rules = [];
    for (const sheet of document.styleSheets) {
        let cssRules;
        try { cssRules = sheet.cssRules; } catch { continue; } // stylesheet lintas asal (CDN) tidak bisa dibaca
        for (const rule of cssRules) {
            if (!(rule instanceof CSSMediaRule) || !rule.media.mediaText.includes('print')) continue;
            for (const inner of rule.cssRules) {
                if (inner.selectorText && inner.selectorText.includes('.pdf-content')) {
                    rules.push(inner.cssText.replaceAll('.pdf-content', `.${RENDER_CLASS}`));
                }
            }
        }
    }
    // Aturan cetak memosisikan laporan absolute (untuk kertas); di dalam
    // wadah html2pdf ia harus mengalir supaya tingginya terukur.
    rules.push(`.${RENDER_CLASS} { display: block !important; position: static !important; }`);
    return rules.join('\n');
}

/**
 * Opsi html2pdf yang dipakai seluruh laporan.
 *
 * pagebreak: HANYA aturan CSS (break-inside: avoid pada blok kecil yang tidak
 * boleh terbelah — lihat 15-print.css), bukan 'avoid-all'. 'avoid-all'
 * memberlakukan "jangan dibelah" pada SETIAP elemen, termasuk pembungkus besar:
 * html2pdf mendorong utuh ke halaman berikutnya setiap elemen yang melintasi
 * batas halaman dan tingginya <= 1 halaman — sehingga seluruh isi laporan
 * (.pdf-body) pindah ke halaman 2 meninggalkan halaman 1 berisi header saja, dan
 * footer terdorong sendirian ke halaman terakhir.
 */
function buildOptions(filename) {
    return {
        margin: [0.5, 0.5, 0.5, 0.5],
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            letterRendering: true,
            scrollY: 0,
        },
        jsPDF: {
            unit: 'in',
            format: 'a4',
            orientation: 'portrait',
        },
        pagebreak: { mode: ['css', 'legacy'] },
    };
}

/** Nama berkas laporan untuk sebuah inspeksi. */
export function reportFilename(inspectionId) {
    return `Laporan_Inspeksi_${inspectionId}_${new Date().toISOString().slice(0, 10)}.pdf`;
}

/**
 * Mengubah isi sebuah elemen menjadi PDF lalu mengunduhnya.
 *
 * @param {HTMLElement} element elemen yang sudah berisi markup laporan (boleh tersembunyi)
 * @param {string} filename
 * @returns {Promise<void>} selesai ketika berkas tersimpan; ditolak bila gagal
 */
export async function savePdf(element, filename) {
    const report = document.createElement('div');
    report.className = RENDER_CLASS;
    report.append(...element.cloneNode(true).childNodes);

    const style = document.createElement('style');
    style.textContent = reportRenderRules();
    document.head.appendChild(style);
    try {
        await html2pdf().set(buildOptions(filename)).from(report).save();
    } finally {
        style.remove();
    }
}
