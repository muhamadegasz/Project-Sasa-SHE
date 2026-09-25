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
 *
 * Sejak Phase 14: handler yang terdaftar sering memanggil backend lewat
 * fetch (lihat src/infrastructure/api-client.js). Tanpa penangkap di sini,
 * error yang dilempar handler async (sesi kedaluwarsa, backend mati, dst)
 * jadi unhandled promise rejection — diam-diam gagal tanpa umpan balik apa
 * pun ke pengguna. 401 sengaja dilewati di sini: api-client.js sudah memicu
 * notifySessionExpired() (session.js) untuk kasus itu, jadi pesannya sudah
 * ditangani di sana, bukan di sini.
 */

import { ApiError } from '../../infrastructure/api-client.js';
import { showToast } from '../components/toast.js';
import { reportError } from '../../shared/errors.js';

const actions = new Map();

/**
 * Mendaftarkan satu handler aksi.
 *
 * @param {string} name nilai atribut data-action yang dicocokkan
 * @param {(el: HTMLElement, event: Event) => void|Promise<void>} handler
 *   menerima elemen yang diklik (baca data-*-nya sendiri) dan event asli.
 *   Boleh async (beberapa handler sejak Phase 12 memanggil service yang
 *   menyimpan ke backend) — nilai kembaliannya diteruskan oleh listener di
 *   bawah, browser mengabaikannya begitu saja pada listener klik biasa.
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

        return Promise.resolve(handler(el, event)).catch((error) => {
            if (error instanceof ApiError && error.status === 401) return;
            showToast(reportError(`aksi "${el.dataset.action}"`, error, '⚠️ Terjadi kesalahan. Coba ulangi beberapa saat lagi.'));
        });
    });
}
