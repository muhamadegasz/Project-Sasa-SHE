/* action-dispatcher.js — event delegation untuk elemen ber-atribut data-action.
 *
 * Menggantikan atribut onclick="..." inline (dipakai sejak Phase 2 lewat
 * src/compat/global-bridge.js, dihapus pada Phase 9). Elemen yang bisa diklik
 * memakai `data-action="namaAksi"` plus data-* lain sesuai kebutuhan
 * handler-nya (data-id, data-stage, dst) — bukan lagi kode JS di atribut HTML.
 *
 * Modul ini generik, tidak tahu apa pun tentang aplikasi: legacy-app.js yang
 * mendaftarkan setiap handler lewat registerAction(), lalu memanggil
 * initActionDispatcher() sekali saat startup.
 */

const actions = new Map();

/**
 * Mendaftarkan satu handler aksi.
 *
 * @param {string} name nilai atribut data-action yang dicocokkan
 * @param {(el: HTMLElement, event: Event) => void} handler menerima elemen
 *   yang diklik (baca data-*-nya sendiri) dan event asli
 */
export function registerAction(name, handler) {
    actions.set(name, handler);
}

/**
 * Memasang satu listener klik yang didelegasikan ke `document`. Karena
 * delegasi, elemen yang dibuat belakangan (lewat innerHTML = ...) otomatis
 * ikut tercakup tanpa perlu dipasangi listener satu per satu.
 *
 * Panggil sekali saat startup.
 */
export function initActionDispatcher() {
    document.addEventListener('click', function(event) {
        const el = event.target.closest('[data-action]');
        if (!el) return;

        const handler = actions.get(el.dataset.action);
        if (!handler) return;

        handler(el, event);
    });
}
