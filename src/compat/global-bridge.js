/* global-bridge.js — jembatan kompatibilitas SEMENTARA (Phase 2 -> Phase 9).

   Aplikasi masih memakai atribut onclick="..." dan onsubmit="..." di HTML.
   Atribut tersebut dievaluasi pada scope global, sedangkan ES module punya
   scope sendiri. Tanpa jembatan ini setiap tombol inline akan mati dengan
   ReferenceError.

   Berkas ini sengaja dibuat terpisah dan mudah dihapus: begitu Phase 9
   mengganti seluruh inline handler dengan event delegation, hapus berkas ini
   beserta pemanggilannya di src/main.js. */

/* Seluruh permukaan global yang dibutuhkan atribut inline saat ini.
   Diturunkan dari pemindaian index.html, bukan ditulis manual. */
export const INLINE_HANDLER_NAMES = [
    'approveStage',
    'cetakPDF',
    'changeCalendarMonth',
    'editJadwal',
    'exportTemuanPerItem',
    'handleLogin',
    'hapusJadwal',
    'hapusTemuan',
    'logout',
    'openApprovalModal',
    'openDetailModal',
    'openJadwalModal',
    'openLightbox',
    'openPerbaikanModal',
    'rejectStage',
    'setRealisasiHariIni',
    'showDayEvents',
    'switchTab',
    'tambahPerbaikanCustom',
];

/**
 * Menaikkan fungsi yang diekspor legacy-app.js ke window, lalu memastikan
 * SELURUH nama pada INLINE_HANDLER_NAMES benar-benar tersedia.
 *
 * Pemeriksaan terakhir itu penting: mode gagal yang paling berbahaya pada
 * refactoring ini adalah tombol yang mati diam-diam. Lebih baik berteriak di
 * console saat memuat daripada baru ketahuan saat pengguna mengklik.
 */
export function installGlobalBridge(legacyApi) {
    for (const [name, value] of Object.entries(legacyApi)) {
        if (typeof value === 'function') window[name] = value;
    }

    const missing = INLINE_HANDLER_NAMES.filter(n => typeof window[n] !== 'function');
    if (missing.length > 0) {
        console.error(
            '[global-bridge] Handler inline tidak tersedia di window: ' + missing.join(', ') +
            '. Tombol yang memakainya tidak akan berfungsi.'
        );
    }
    return missing;
}
