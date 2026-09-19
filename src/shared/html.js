/* html.js — utilitas keamanan untuk membangun HTML dari data.
 *
 * Aplikasi ini membangun markup lewat template literal lalu menyuntikkannya
 * dengan innerHTML. Pola itu aman HANYA jika setiap nilai yang berasal dari
 * pengguna di-escape lebih dulu. Semua fungsi di berkas ini ada untuk itu.
 *
 * Aturan pakai:
 *   - Nilai data (nama, deskripsi, nama file, tanggal)  -> escapeHtml()
 *   - Nilai data yang perlu di-highlight hasil pencarian -> highlight()
 *   - Argumen untuk atribut on* inline                   -> jsArg()
 *   - Teks yang masuk ke data URI SVG                    -> svgText()
 *   - Potongan HTML yang memang sengaja dibangun         -> biarkan apa adanya
 *
 * Berkas ini tidak mengenal DOM dan tidak punya dependency.
 */

const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

/**
 * Meng-escape nilai apa pun agar aman ditempatkan sebagai teks HTML maupun
 * sebagai isi atribut ber-kutip (tunggal atau ganda).
 *
 * null dan undefined menjadi string kosong, bukan tulisan "null"/"undefined".
 */
export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** Meng-escape karakter yang bermakna khusus di dalam pola RegExp. */
export function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Mengembalikan HTML yang aman dengan setiap kecocokan `query` dibungkus
 * <span class="...">.
 *
 * Teks dipecah lebih dulu, baru tiap potongan di-escape. Urutan ini penting:
 * meng-escape lebih dulu lalu mencari akan membuat query bisa mencocokkan
 * bagian dari entity (misal "amp" di dalam "&amp;") dan menghasilkan markup
 * yang rusak.
 *
 * Tanpa query, hasilnya adalah teks yang di-escape — sehingga fungsi ini aman
 * dipakai sebagai pengganti langsung dari interpolasi biasa.
 */
export function highlight(text, query, className = 'highlight') {
    const source = text === null || text === undefined ? '' : String(text);
    if (!query) return escapeHtml(source);

    const pattern = new RegExp('(' + escapeRegExp(query) + ')', 'gi');
    // split() dengan grup penangkap menaruh bagian yang cocok di indeks ganjil.
    return source
        .split(pattern)
        .map((part, index) =>
            index % 2 === 1
                ? '<span class="' + className + '">' + escapeHtml(part) + '</span>'
                : escapeHtml(part)
        )
        .join('');
}

/**
 * Menyandikan sebuah nilai JavaScript agar aman dipakai sebagai argumen di
 * dalam atribut event inline, misalnya onclick="lakukan(...)".
 *
 * Cara kerjanya: parser HTML men-decode entity pada nilai atribut LEBIH DULU,
 * baru hasilnya dikompilasi sebagai JavaScript. Jadi JSON.stringify(['a.jpg'])
 * yang di-escape menjadi [&quot;a.jpg&quot;] akan sampai ke mesin JS sebagai
 * ["a.jpg"] — batas atribut tetap utuh dan nilainya tetap terkurung di dalam
 * string literal.
 *
 * Tanpa ini, tanda kutip dari JSON menutup atribut lebih awal dan handler-nya
 * mati. Itulah penyebab defect D-1.
 *
 * Ini solusi sementara. Phase 9 mengganti seluruh atribut on* dengan event
 * delegation, dan saat itu fungsi ini tidak diperlukan lagi.
 */
export function jsArg(value) {
    return escapeHtml(JSON.stringify(value));
}

/**
 * Menyandikan teks agar aman disisipkan ke dalam data URI SVG.
 *
 * Dua lapis: escape dulu sebagai XML (SVG adalah XML), lalu percent-encode
 * supaya valid sebagai URI. Tanpa ini, nama file yang mengandung & atau #
 * akan merusak data URI-nya.
 */
export function svgText(value) {
    return encodeURIComponent(escapeHtml(value));
}
