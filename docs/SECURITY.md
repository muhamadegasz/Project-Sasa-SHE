# Temuan Keamanan — SHE Sasa

Hasil audit Phase 1, dengan status penanganannya per fase.
Severity memakai skala CRITICAL / HIGH / MEDIUM / LOW.

| ID | Severity | Temuan | Status |
|---|---|---|---|
| S-01 | CRITICAL | Kredensial hard-coded di client, ditampilkan pula di UI login | **TERBUKA** — dipisahkan ke `config/demo-auth.js` pada Phase 4 dengan peringatan eksplisit, tetapi **tetap tidak aman**. Hanya backend yang dapat menutupnya. |
| S-02 | HIGH | DOM XSS: data pengguna disisipkan mentah ke `innerHTML` | **DITANGANI** — Phase 3 |
| S-03 | HIGH | HTML attribute injection lewat argumen `onclick` dan `title` | **DITANGANI** — Phase 3 |
| S-04 | HIGH | Spreadsheet formula injection pada ekspor XLSX | **DITANGANI** — Phase 6 |
| S-05 | MEDIUM | Empat resource CDN tanpa Subresource Integrity | **TERBUKA** |
| S-06 | MEDIUM | Pipeline PDF menyuntik HTML pengguna tak ter-escape | **DITANGANI** — Phase 3 |
| S-07 | MEDIUM | Tidak ada otorisasi pada approval — siapa pun dapat menyetujui 4 tahap | **TERBUKA** — butuh keputusan bisnis |
| S-08 | MEDIUM | SheetJS 0.20.1 terdampak CVE-2024-22363 (ReDoS) | **TERBUKA** — eksploitabilitas rendah, aplikasi hanya menulis |
| S-09 | LOW | Pesan error internal dibocorkan ke pengguna lewat toast | **DITANGANI** — Phase 3 |
| S-10 | LOW | `console.log` membocorkan bentuk internal saat login | **TERBUKA** — Phase 11 |
| S-11 | LOW | Aksi destruktif hanya dijaga `confirm()`, tanpa audit trail | **TERBUKA** — butuh keputusan bisnis |

---

## Yang ditangani pada Phase 3

### S-02 — DOM XSS

Seluruh nilai data yang masuk ke `innerHTML` kini melewati `escapeHtml()` atau `highlight()` dari `src/shared/html.js`. Yang dicakup: deskripsi temuan, keterangan lokasi, nama Safety Officer, PIC, deskripsi tindakan perbaikan, nama plant, nama file foto, data pengesahan, serta seluruh isi modal dan baris tabel.

`highlight()` menggantikan `highlightText()` dan `highlightTextPlant()`. Versi lama punya dua masalah: hasil highlight tidak di-escape, **dan** cabang "tanpa query" mengembalikan teks mentah. Versi baru memecah teks lebih dulu, baru meng-escape tiap potongan — urutan ini penting, karena meng-escape lebih dulu membuat query bisa mencocokkan bagian dari entity.

Yang sengaja **tidak** di-escape: potongan HTML yang memang dibangun program (progress bar,
badge overdue, tombol), label status yang berupa konstanta, angka, dan **sel Excel** —
meng-escape sel spreadsheet justru akan memunculkan `&amp;` di dalam file hasil ekspor.

### S-03 — HTML attribute injection

Argumen pada atribut `on*` kini disandikan `jsArg()`, yang meng-escape hasil
`JSON.stringify`. Parser HTML men-decode entity sebelum mengompilasi JavaScript, sehingga
`[&quot;a.jpg&quot;]` sampai ke mesin JS sebagai `["a.jpg"]` dengan batas atribut tetap utuh.

Ini sekaligus memperbaiki **D-1**: lightbox sebelumnya mati total karena tanda kutip dari
JSON menutup atribut lebih awal.

Teks yang masuk ke data URI SVG memakai `svgText()` — escape XML lalu percent-encode.

### S-06 — HTML tak ter-escape di pipeline PDF

`cetakPDF()` membangun `#pdfContent.innerHTML` dari data inspeksi. Seluruh interpolasi
datanya kini di-escape, sehingga markup yang disuntik tidak lagi masuk ke html2canvas.

### S-09 — Kebocoran pesan error

`reportError()` di `src/shared/errors.js` mencatat error lengkap ke console dan
mengembalikan kalimat yang sudah ditentukan untuk pengguna. Dua lokasi yang sebelumnya
menampilkan `error.message` mentah kini memakainya.

---

## Verifikasi

Dua berkas uji dijalankan di Node:

- **35 unit test** untuk `escapeHtml`, `highlight`, `jsArg`, `svgText`, dan util tanggal —
  termasuk payload `<img src=x onerror=alert(1)>`, `"><script>`, query berisi metakarakter
  regex, dan nama file bertanda kutip.
- **22 uji regresi end-to-end** yang menjalankan aplikasi di atas DOM tiruan: login →
  `initApp()` → menyuntikkan payload lewat form "Tambah Progres" → memeriksa HTML yang
  dihasilkan tabel inspeksi, tabel perbaikan, modal perbaikan, modal detail, dan modal
  pengesahan. Termasuk mem-parse ulang argumen `openLightbox` setelah decode entity untuk
  membuktikan atributnya tidak pecah.

Keduanya harus tetap lulus setiap kali renderer disentuh. Berkas uji ada di scratchpad sesi;
bila ingin dipertahankan sebagai bagian project, pindahkan ke `tests/`.

---

## Catatan yang tidak berubah

Client-side validation di aplikasi ini adalah **UX validation**, bukan batas keamanan.
Selama belum ada backend, tidak ada satu pun aturan di sini yang tidak dapat dilewati
pengguna lewat DevTools. Escaping yang ditambahkan pada Phase 3 melindungi dari data
berbahaya yang **ditampilkan kembali**, bukan dari pengguna yang memanipulasi aplikasinya
sendiri.

---

## Catatan Phase 4 — S-01 dipisahkan, bukan diperbaiki

Kredensial demo dipindahkan dari `legacy-app.js` ke `src/config/demo-auth.js`, diberi nama
`DEMO_CREDENTIALS`, dan berkasnya dibuka dengan peringatan panjang.

**Ini tidak membuatnya lebih aman satu langkah pun.** Berkas itu tetap dikirim ke browser dan
tetap dapat dibaca siapa pun. Yang berubah hanya dua hal, dan keduanya soal kejelasan:

1. Concern authentication tidak lagi bercampur dengan logika aplikasi.
2. Siapa pun yang membuka berkas itu langsung tahu bahwa ini bukan authentication.

Login aplikasi ini masih hanya menukar CSS class. Seluruh data dan fungsi tetap dapat diakses
tanpa login dengan menghapus class `.hidden` lewat DevTools. Jangan memuat data K3 sungguhan
ke aplikasi ini sampai ada backend yang memverifikasi kredensial dan memeriksa otorisasi di
setiap endpoint.

---

## Yang ditangani pada Phase 6

### S-04 — Spreadsheet formula injection

`src/infrastructure/excel-exporter.js` menetralkan setiap nilai sel bertipe string yang
diawali `=`, `+`, `-`, atau `@` dengan menyisipkan tanda kutip tunggal di depannya. Excel
memperlakukannya sebagai penanda teks dan tidak menampilkannya, sehingga `=1+1` tersimpan
sebagai `'=1+1` dan tampil sebagai teks.

Berlaku otomatis untuk **keempat** jalur ekspor, karena semuanya kini melewati satu fungsi
pembangun workbook: ekspor temuan per inspeksi, ekspor semua temuan, ekspor ringkasan
inspeksi, dan tombol Sync.

Angka tidak disentuh — hanya string yang dapat memicu formula. Tanda `=` di tengah nilai juga
tidak disentuh, karena Excel hanya mengevaluasi yang berada di awal sel.

**Yang berubah dan terlihat:** nilai `-` yang dipakai sebagai penanda kosong kini tersimpan
sebagai `'-`. Excel tetap menampilkannya sebagai `-`. Disetujui pemilik project (DECISIONS K-4).

Diuji: 19 assertion, termasuk `=HYPERLINK`, dan verifikasi bahwa deskripsi temuan, kategori,
nama Safety Officer, serta keterangan lokasi benar-benar ternetralkan pada baris yang
dikirim ke SheetJS — bukan hanya fungsi sanitasinya yang diuji terpisah.

### Isolasi library

Setelah Phase 6, setiap library pihak ketiga hanya disentuh satu berkas:

| Library | Satu-satunya pemakai |
|---|---|
| SheetJS (`XLSX`) | `src/infrastructure/excel-exporter.js` |
| html2pdf | `src/infrastructure/pdf-exporter.js` |
| Chart.js | `src/legacy-app.js` — pindah ke `charts.view.js` pada Phase 8 |

Kalau kelak SheetJS diganti karena CVE-2024-22363 (S-08), hanya satu berkas yang perlu
disentuh.
