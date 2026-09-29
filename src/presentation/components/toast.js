/* toast.js — notifikasi kecil yang muncul sebentar di pojok kanan bawah.
 *
 * Dipindah apa adanya dari legacy-app.js (Phase 7). Dipakai di hampir
 * seluruh alur (approval, jadwal, perbaikan, ekspor, login/logout) untuk
 * memberi umpan balik non-blocking. Satu-satunya sistem toast di aplikasi.
 *
 * Tampilan: ikon status kecil, judul, deskripsi opsional, tombol tutup.
 * Pemanggil lama cukup mengirim satu kalimat berprefiks emoji ("✅ …",
 * "⚠️ Gagal …") — toastContent() menurunkan jenis dan judulnya dari situ,
 * emoji tidak ditampilkan. Pemanggil baru boleh memberi { variant, description }
 * secara eksplisit.
 *
 * Elemen DOM baru diambil saat dipakai, supaya toastContent() bisa diuji di
 * Node tanpa DOM.
 */

export const TOAST_VARIANT = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info',
};

const ICONS = {
    [TOAST_VARIANT.SUCCESS]: 'fa-circle-check',
    [TOAST_VARIANT.ERROR]: 'fa-circle-exclamation',
    [TOAST_VARIANT.WARNING]: 'fa-triangle-exclamation',
    [TOAST_VARIANT.INFO]: 'fa-circle-info',
};

const AUTO_HIDE_MS = 5000;

// Emoji/simbol di awal pesan (termasuk variation selector & ZWJ) beserta spasinya.
const LEADING_SYMBOLS = /^(?:[\p{Extended_Pictographic}\u{FE0F}\u{200D}]\s*)+/u;

function inferVariant(symbols, title) {
    if (/[✅🎉]/u.test(symbols)) return TOAST_VARIANT.SUCCESS;
    if (/[❌⛔]/u.test(symbols)) return TOAST_VARIANT.ERROR;
    // "⚠️ Gagal …" adalah kegagalan sungguhan (simpan/ekspor/PDF), bukan sekadar peringatan isian.
    if (/⚠/u.test(symbols)) return /^Gagal\b/.test(title) ? TOAST_VARIANT.ERROR : TOAST_VARIANT.WARNING;
    return TOAST_VARIANT.INFO;
}

/**
 * Kalimat pertama menjadi judul, sisanya deskripsi. Pesan yang memuat teks
 * isian pengguna dalam tanda kutip (mis. `Temuan "…" ditambahkan`) tidak
 * dipecah — titik di dalam kutipan bukan akhir kalimat pesan.
 */
function splitFirstSentence(text) {
    if (text.includes('"')) return { title: text, description: '' };
    const match = text.match(/^(.+?[.!?])\s+(\S[\s\S]*)$/);
    return match ? { title: match[1], description: match[2] } : { title: text, description: '' };
}

/**
 * Isi toast dari satu pesan: { variant, title, description }. Murni.
 * `options.variant` / `options.description` mengalahkan hasil turunan.
 */
export function toastContent(message, options = {}) {
    const raw = String(message ?? '').trim();
    const symbols = (raw.match(LEADING_SYMBOLS) || [''])[0];
    let title = raw.slice(symbols.length).trim();
    let description = options.description ? String(options.description) : '';
    // Hanya dibagi untuk tampilan: judul + deskripsi tetap sama persis dengan
    // pesan aslinya (tanpa emoji), termasuk tanda bacanya.
    if (!description) ({ title, description } = splitFirstSentence(title));
    const variant = Object.values(TOAST_VARIANT).includes(options.variant)
        ? options.variant
        : inferVariant(symbols, title);
    return { variant, title, description };
}

let hideTimer = null;

export function hideToast() {
    clearTimeout(hideTimer);
    document.getElementById('toastMessage').classList.remove('show');
}

/**
 * Menampilkan toast. `message` bisa kalimat lama berprefiks emoji; `options`
 * opsional: { variant: 'success'|'error'|'warning'|'info', description }.
 * Hilang sendiri setelah 5 detik (seperti sebelumnya) atau lewat tombol tutup.
 */
export function showToast(message, options = {}) {
    const toast = document.getElementById('toastMessage');
    const { variant, title, description } = toastContent(message, options);

    toast.dataset.variant = variant;
    toast.querySelector('.toast-icon').className = `toast-icon fas ${ICONS[variant]}`;
    document.getElementById('toastText').textContent = title;
    const descriptionElement = document.getElementById('toastDescription');
    descriptionElement.textContent = description;
    descriptionElement.hidden = !description;

    toast.classList.add('show');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideToast, AUTO_HIDE_MS);
}

if (typeof document !== 'undefined') {
    document.getElementById('toastClose')?.addEventListener('click', hideToast);
}
