# Keputusan Refactoring

Catatan keputusan yang diambil pemilik project selama refactoring, beserta konsekuensinya.
Dokumen ini adalah acuan ketika muncul pertanyaan "kenapa dulu dibuat begini".

---

## K-1 — Penanganan defect D-1 s/d D-7

**Tanggal:** 2026-09-19 · **Status:** disetujui

Defect yang **diperbaiki** selama refactoring:

| Defect | Fase perbaikan |
|---|---|
| D-1 — lightbox tidak dapat dibuka | Phase 3 (escaping) + Phase 7 (komponen) |
| D-2 — login via Enter memanggil handler 2–3× | Phase 10 |
| D-3 — `initApp()` crash pada pemanggilan kedua | Phase 10 |
| D-5 — label tombol Sync berubah setelah klik | Phase 11 |
| D-6 — `colspan` empty-state salah | Phase 11 |

Yang **ditunda**: D-4 (badge notifikasi selalu 0) — bukan defect melainkan fitur belum selesai.
Menentukan apa yang dihitung sebagai notifikasi adalah keputusan bisnis, bukan refactoring.
Struktur `updateNotifBadge(count)` dipertahankan apa adanya sampai aturannya ditetapkan.

Yang **tidak diubah**: D-7 (generator jadwal) dan fakta bahwa `syncToGoogleSheets()` tidak
benar-benar menghubungi Google Sheets — keduanya perilaku yang dirancang, bukan kerusakan.

**Alasan:** brief refactoring mencantumkan "Gallery/lightbox" sebagai fitur yang wajib tetap
tersedia, padahal fitur itu saat ini mati total. Mempertahankan perilaku yang rusak bukanlah
*preserve behavior* yang bermakna.

---

## K-2 — ES Modules dan cara akses aplikasi

**Tanggal:** 2026-09-19 · **Status:** disetujui

Mulai Phase 2, aplikasi dimuat sebagai ES module (`<script type="module">`) dan **hanya dapat
dibuka melalui HTTP**, tidak lagi dengan double-click `index.html` (`file://` diblokir CORS).

Akses pengembangan: `http://localhost/Project-Sasa-SHE/` via Laragon.

**Konsekuensi yang diterima:** membuka berkas langsung dari Windows Explorer tidak lagi bekerja.

---

## K-3 — Penamaan folder project

**Tanggal:** 2026-09-19 · **Status:** ditunda, bukan bagian dari refactoring

Folder project akan diganti namanya menjadi **huruf kecil semua** agar aman sebagai URL path
saat online. Nama yang disebut pemilik project: `project-sasa-hse`.

**Perlu dikonfirmasi sebelum dikerjakan:** judul aplikasi saat ini adalah "SHE Sasa"
(Safety, Health & Environment) — lihat `index.html` baris 6 dan teks logo di header.
Nama folder yang diminta memakai **HSE**, bukan SHE. Salah satu dari keduanya perlu diluruskan
supaya penamaan konsisten antara URL, judul, dan branding di UI.

**Kenapa tidak dikerjakan sekarang:** mengganti nama folder mengubah path working directory
dan lokasi repo git di tengah pekerjaan. Ini langkah deploy tersendiri, dikerjakan setelah
refactoring selesai. Yang perlu diubah saat itu: nama folder, virtual host Laragon, dan
remote git bila ada.

---

## K-4 — Mitigasi spreadsheet formula injection (S-04)

**Tanggal:** 2026-09-19 · **Status:** disetujui · **Fase:** 6

Nilai sel Excel yang berasal dari input pengguna dan diawali `=`, `+`, `-`, atau `@`
akan diberi prefix tanda kutip tunggal (`'`) sebelum ditulis ke file.

**Konsekuensi yang diterima:** isi file hasil ekspor berubah untuk nilai-nilai tersebut.
Contoh: temuan berbunyi `=1+1` akan tersimpan sebagai `'=1+1` dan ditampilkan Excel
sebagai teks `=1+1`, bukan dievaluasi sebagai formula.

Berlaku untuk keempat jalur ekspor: `exportTemuanPerItem`, `exportAllTemuan`,
`exportToExcel`, dan `syncToGoogleSheets`. Diuji lewat `VERIFICATION.md` item K-7.

---

## K-5 — Strategi pemisahan CSS: kontigu, bukan semantik

**Tanggal:** 2026-09-19 · **Status:** diputuskan saat Phase 1 · **Fase:** 1

CSS dipecah menjadi 16 berkas ber-prefix angka di `assets/css/`, mengikuti **urutan asli**
di dalam `index.html`, bukan dikelompokkan ulang secara semantik menjadi
`base / layout / components / pages` seperti rencana awal.

### Alasan

Audit menemukan selektor top-level yang didefinisikan **dua kali tanpa scope**, sehingga
tampilan saat ini bergantung pada urutan sumber:

| Selektor | Definisi 1 | Definisi 2 | Konflik |
|---|---|---|---|
| `.form-group` | blok LOGIN | blok MAIN APP | `margin-bottom: 20px` vs `1rem` |
| `.form-group label` | blok LOGIN | blok MAIN APP | ukuran & warna font |
| `.perbaikan-timeline .perbaikan-item` dan 13 turunannya | blok MAIN APP | blok PERBAIKAN MODAL | padding, warna, ukuran |

Karena tidak ada yang di-scope, aturan blok LOGIN ikut mengenai form di aplikasi utama dan
sebaliknya. Yang berlaku sekarang selalu definisi **terakhir**. Contoh konkret: form login
sebenarnya memakai `margin-bottom: 1rem`, bukan `20px` seperti yang tertulis di blok login.

Pengelompokan semantik akan menempatkan style login di berkas yang dimuat **setelah**
komponen, sehingga urutannya terbalik dan tampilan form login berubah. Itu regresi visual —
tepat hal yang dilarang oleh aturan *preserve behavior*.

### Yang menjamin keamanannya

Pemotongan dilakukan **kontigu**: setiap berkas adalah potongan baris berurutan dari CSS asli,
tanpa ada satu aturan pun yang berpindah posisi. Diverifikasi dengan menggabungkan kembali
ke-16 berkas sesuai urutan `<link>` dan membandingkannya dengan blok `<style>` asli:

```
byte asli  : 55634
byte hasil : 55634
ROUND-TRIP IDENTIK (byte-for-byte)
```

### Konsekuensi

- **Prefix angka wajib dipertahankan.** Ia bukan hiasan, melainkan penanda ketergantungan
  urutan. Menukar urutan `<link>` akan mengubah tampilan.
- Isi berkas belum sepenuhnya rapi secara tematik. `10-detail.css` dan `13-perbaikan-modal.css`
  masih memuat definisi `.perbaikan-timeline` yang tumpang tindih.
- **Pembersihan duplikasi ditunda.** Menggabungkan definisi ganda dan memberi scope yang benar
  (misalnya `.login-page .form-group`) adalah perubahan yang *terlihat* dan pantas dikerjakan
  sebagai langkah tersendiri dengan verifikasi visual, bukan diselundupkan ke dalam ekstraksi.
- 16 permintaan HTTP untuk CSS. Tidak menjadi masalah di lingkungan lokal maupun HTTP/2;
  jika kelak mengganggu, penggabungan adalah urusan build, bukan struktur sumber.

---

## K-6 — Badge jam, status "Online", dan tanggal dihapus dari header

**Tanggal:** 2026-09-19 · **Status:** diminta pemilik project · **Fase:** dikerjakan bersamaan Phase 2

Ketiga badge informasi dihapus dari header aplikasi:

- badge jam berjalan (`#currentTime`)
- badge indikator "● Online"
- badge tanggal (`#currentDate`, contoh: "Sabtu, 19 September 2026")

Header kini hanya berisi logo, lonceng notifikasi, dan profil pengguna.

**Ini perubahan UI yang disengaja, bukan refactoring.** Dicatat di sini supaya tidak
disalahartikan sebagai regresi saat membandingkan dengan baseline Phase 0.

### Yang ikut berubah

| Berkas | Perubahan | Alasan |
|---|---|---|
| `index.html` | 3 baris `<span class="header-badge">` dihapus | permintaan |
| `src/legacy-app.js` | fungsi `updateClock()` dihapus seluruhnya, beserta pemanggilan dan `setInterval`-nya di `initApp()` | `#currentTime` dan `#currentDate` sudah tidak ada; menyentuhnya akan melempar `TypeError` dan **mematikan `initApp()` di tengah jalan**, sehingga dashboard tidak termuat sama sekali |
| `assets/css/03-layout.css` | `.header-badge .dot`, `.header-badge .clock`, `.header-badge .clock i`, `@keyframes pulse` dihapus | menjadi mati setelah badge-nya hilang |

Yang **tidak** disentuh dan tetap dipakai:

- `.header-badge` dan `.header-badge i` — masih dipakai lonceng notifikasi
- `.dot` di `09-calendar.css` — selektor berbeda (legenda kalender)
- `@keyframes pulse-dot` di `11-lightbox.css` — berbeda dari `pulse`, masih dipakai lonceng

### Konsekuensi

Satu dari dua `setInterval` di `initApp()` hilang. Yang tersisa hanya interval 10 detik
untuk menyegarkan tabel jadwal dan kalender.

Item **D-7** pada `VERIFICATION.md` ("Jam di header berdetak tiap detik") tidak berlaku lagi
dan sudah diganti menjadi pemeriksaan bahwa ketiga badge tersebut **tidak** muncul.

Catatan: status "Online" memang hanya hiasan — tidak pernah terhubung ke pemeriksaan
konektivitas apa pun. Menghapusnya justru menghilangkan indikator yang menyesatkan.

---

## K-7 — Batas escaping: apa yang di-escape dan apa yang tidak

**Tanggal:** 2026-09-19 · **Status:** diputuskan saat Phase 3 · **Fase:** 3

Escaping diterapkan **bertarget**, bukan menyeluruh membabi buta. Dari 267 interpolasi di
`legacy-app.js`, 73 dibungkus `escapeHtml()`, 10 dikonversi ke `highlight()`, dan 17 argumen
handler inline disandikan `jsArg()`.

### Yang di-escape

Setiap nilai data yang berakhir di `innerHTML`: deskripsi temuan, keterangan lokasi, nama
Safety Officer, PIC, tindakan perbaikan, nama plant, kode plant, nama file foto, tanggal,
status, dan seluruh data pengesahan.

### Yang sengaja TIDAK di-escape

| Kategori | Alasan |
|---|---|
| Potongan HTML buatan program (`progressBar`, `overdueBadge`, `exportBtn`, `pdfBtn`, `timelineHtml`) | memang markup, bukan data |
| Label status konstanta (`statusText`, `statusMap[...]`) | nilai literal di dalam kode |
| Angka (`progress`, `jmlTemuan`, `stage.order`, `idx`) | tidak dapat membawa markup |
| String untuk `showToast()` dan `confirm()` | masuk lewat `textContent`, bukan HTML |
| **Sel Excel** pada keempat jalur ekspor | meng-escape sel spreadsheet akan memunculkan `&amp;` di dalam file hasil ekspor — salah konteks |
| Nama file PDF/XLSX | bukan konteks HTML |

Perbedaan konteks inilah alasan escaping dikerjakan per baris dengan asersi jumlah kecocokan,
bukan dengan cari-ganti global: ekspresi yang sama (`t.deskripsi`) muncul baik di template
HTML maupun di sel Excel, dan perlakuannya harus berbeda.

### Kenapa highlight() menggantikan ternary

Pola lama `q ? highlightText(x, q) : x` punya dua lubang: hasil highlight tidak di-escape,
**dan** cabang "tanpa query" mengembalikan data mentah. `highlight(x, q)` menangani keduanya —
tanpa query ia mengembalikan teks yang di-escape.

Urutannya juga dibalik: teks dipecah dulu berdasarkan query, baru tiap potongan di-escape.
Meng-escape lebih dulu akan membuat query dapat mencocokkan bagian dari entity (misalnya
"amp" di dalam `&amp;`) dan menghasilkan markup rusak.

### Modul yang TIDAK dibuat

Rencana Phase 3 menyebut `src/shared/dom.js`. Tidak dibuat — belum ada konsumennya. Helper
DOM baru masuk akal pada Phase 7 dan 9 saat komponen dan controller dibentuk. Membuatnya
sekarang berarti abstraksi tanpa manfaat.

---

## K-8 — Repository mengembalikan array hidup, bukan salinan

**Tanggal:** 2026-09-19 · **Status:** diputuskan saat Phase 4 · **Fase:** 4

`getAll()` pada `inspection-repository.js` dan `schedule-repository.js` mengembalikan array
yang sesungguhnya, bukan salinannya. Abstraksinya bocor, dan itu diterima untuk sekarang.

### Alasan

Kode pemanggil masih memutasi objek inspeksi secara langsung di banyak tempat:

```js
item.approvals[stageId] = { approved: true, ... };   // approveStage
item.perbaikan.push({ ... });                         // tambahPerbaikanCustom
item.status = 'selesai';                              // beberapa tempat
```

Mengembalikan salinan dangkal tetap membuat mutasi objek berhasil (referensinya sama), tetapi
menambah alokasi pada setiap render tanpa memberi jaminan apa pun. Mengembalikan salinan dalam
akan **mematahkan** mutasi tersebut secara diam-diam — perubahan hilang tanpa error. Itu
regresi yang mahal, dan tidak ada gunanya diambil pada fase yang tujuannya memindahkan
kepemilikan state.

### Yang sudah diperoleh meski begitu

- `let inspeksiData` dan `let jadwalData` tidak ada lagi; koleksinya punya pemilik tunggal.
- Penggantian binding pada hapus jadwal (`jadwalData = jadwalData.filter(...)`) kini terjadi
  di dalam satu modul, bukan pada variabel global yang dipegang banyak tempat.
- Penerbitan id terpusat di `nextId()`.
- Ada seam yang jelas untuk diganti implementasi API.

### Kapan diperketat

Sebelum repository in-memory diganti versi API. Prasyaratnya: ketiga mutasi di atas lebih dulu
dipindahkan menjadi method eksplisit (`approveStage`, `addCorrectiveAction`, `updateStatus`)
pada Phase 6. Setelah itu `getAll()` dapat mengembalikan salinan tanpa memutus apa pun.

### Hal lain yang diputuskan di fase ini

- **`plantRepository.findById()` membandingkan sebagai string.** Kode lama tidak konsisten —
  dua tempat memakai `===` (id berupa angka dari data) dan dua tempat memakai `==` (id berupa
  string dari nilai `<input type="hidden">`). `String(a) === String(b)` mencakup keduanya tanpa
  mengubah hasil untuk kasus mana pun.
- **Data seed inspeksi dibungkus fungsi** (`createInspectionSeed()`), bukan konstanta modul,
  supaya `getDateOffset()` dihitung saat repository diinisialisasi, bukan saat modul di-parse.
- **Skema id yang cacat tidak diperbaiki.** `SCH-nnn` diturunkan dari jumlah data, sehingga
  menghapus lalu menambah jadwal dapat menghasilkan id kembar. Perilaku ini sudah ada sebelum
  refactoring; memperbaikinya adalah perubahan yang terlihat dan pantas dikerjakan terpisah.
- **Konstanta status tidak dibuat.** Rencana sempat menyebutnya, tetapi mengganti literal
  `'closed'`/`'selesai'`/`'tinjau'` di seluruh kode adalah pekerjaan domain — masuk Phase 5,
  bukan diselundupkan ke fase pemindahan data.

---

## K-9 — Batas domain: aturan masuk, label tidak

**Tanggal:** 2026-09-19 · **Status:** diputuskan saat Phase 5 · **Fase:** 5

### Yang dipindahkan ke `src/domain/`

Fungsi murni tanpa DOM, tanpa toast, tanpa mutasi: perhitungan progres, penurunan status
perbaikan, urutan tahap pengesahan, pembuatan record approval, serta overdue dan keaktifan
jadwal. Semuanya kini dapat diuji tanpa browser — 59 unit test.

Duplikasi yang hilang:

| Sebelumnya | Sekarang |
|---|---|
| `allApproved` ditulis ulang di **5 tempat** | `isFullyApproved()` |
| `approvedCount` di 2 tempat | `countApproved()` |
| Hitungan status untuk chart di 2 tempat, dengan format berbeda | `countRepairStatuses()` |
| Urutan tahap ditulis **dua cara berbeda** — `order - 1` di `approveStage`, `index - 1` di `renderApprovalStages` | `isPreviousStageApproved()` |

Poin terakhir yang paling berarti. Kedua bentuk itu kebetulan setara pada data sekarang, tetapi
menyimpan risiko: menyisipkan satu tahap dengan `order` yang tidak berurutan akan membuat
keduanya menghasilkan jawaban berbeda — dan tampilan tidak akan cocok lagi dengan apa yang
benar-benar diizinkan.

### Yang sengaja TETAP di luar domain

**Label dan warna adalah presentasi, bukan aturan bisnis.** Kelima `statusMap` belum digabung,
dan itu bukan kelalaian:

| Lokasi | `'closed'` dipetakan ke |
|---|---|
| `cetakPDF` | `✅ Selesai` |
| `openPerbaikanModal` | `✅ Closed` |

Nilai yang sama, label berbeda. Menggabungkannya akan **mengubah teks yang terlihat pengguna**
di salah satu tempat. Hanya dua map yang benar-benar identik (`renderPerbaikanTable` dan
`statusPerbaikanMap` di `openPerbaikanModal`); keduanya baru digabung pada Phase 8 saat
presenter dibentuk, bersama pemetaan warna di template PDF.

`getApprovalStatusText()` juga tetap di `legacy-app.js`. Angkanya kini datang dari domain
(`countApproved`, `totalStages`), tetapi perangkaian teksnya adalah presentasi.

### Literal status tidak diganti massal

`domain/statuses.js` mendefinisikan nilainya, dan modul domain memakainya. Literal yang tersisa
di `legacy-app.js` hampir semuanya adalah **kunci objek label** dan interpolasi CSS class —
mengubahnya jadi computed key hanya menambah kebisingan tanpa manfaat. Itu ikut hilang sendiri
ketika renderer pindah ke presenter.

Satu hal yang perlu diingat: nilai pada `statuses.js` **juga merupakan nama CSS class**
(`.status-badge.selesai`, `.progress-fill.selesai_perbaikan`). Mengubah nilainya akan
mematikan style secara diam-diam. Peringatan itu ditulis di berkasnya.

### `isOverdue` ada dua

`shared/date.js` mengerti format lokal `D/M/YYYY` yang dipakai data inspeksi.
`domain/schedule-rules.js` mengerti ISO `YYYY-MM-DD` yang dipakai jadwal. Keduanya sengaja
dibiarkan terpisah — menyatukan format tanggal adalah pekerjaan tersendiri yang mengubah data.

---

## K-10 — Service mengembalikan kode, bukan kalimat

**Tanggal:** 2026-09-19 · **Status:** diputuskan saat Phase 6 · **Fase:** 6

Service tidak menampilkan pesan dan tidak menyentuh DOM. Ia mengembalikan bentuk seragam
`{ ok, reason?, data? }` dari `src/services/result.js`, dengan `reason` berupa **kode**
seperti `PHOTO_REQUIRED`. Pemetaan kode ke kalimat ada di `legacy-app.js` pada objek
`PESAN_GAGAL`.

**Alasan:** service yang mengembalikan `'⚠️ Wajib upload foto sebagai bukti progres!'` akan
menyeret bahasa, emoji, dan gaya penulisan ke lapisan yang seharusnya tidak peduli soal itu.
Dengan kode, teks pesan dapat diubah — atau diterjemahkan — tanpa menyentuh satu pun aturan.

Seluruh kalimat dipertahankan **sama persis** dengan sebelum refactoring.

### `infrastructure/`, bukan `services/`

Rencana Phase 1 menaruh exporter di `services/`. Setelah dikerjakan, itu tempat yang salah:
exporter berurusan dengan library pihak ketiga dan mekanisme unduh berkas — termasuk
`document.createElement('a')` pada jalur Sync. Menaruhnya di `services/` akan melanggar aturan
yang baru saja ditegakkan di sana.

Karena itu dibuat `src/infrastructure/`, sesuai diagram arsitektur pada laporan audit:

- `services/` — murni, tanpa DOM, tanpa library
- `infrastructure/` — adaptor ke dunia luar, boleh menyentuh DOM dan library

### `shared/labels.js`

`getApprovalStatusText` dipakai tampilan layar **dan** isi sel Excel. Menaruhnya di
`presentation/` akan membuat `infrastructure/` mengimpor ke arah yang salah; menaruhnya di
`domain/` salah kategori, karena ini label, bukan aturan.

Solusinya `shared/labels.js`, yang hanya bergantung pada `domain/` — arah ke dalam, sesuai
aturan dependency. Nama berkasnya sengaja "labels", bukan "utils", supaya jelas isinya teks
untuk pengguna.

### Yang dipertahankan meski terlihat aneh

- **`confirm()` tetap di pemanggil.** `rejectStage` dan `hapusJadwal` bertanya lebih dulu, baru
  memanggil service. Konfirmasi adalah interaksi, bukan aturan bisnis.
- **Simpan jadwal dengan id tak dikenal mengembalikan `ok` dengan `schedule: null`.** Kode lama
  juga diam pada kasus itu — tidak ada pesan, modal tetap tertutup, tampilan tetap di-refresh.
  Mengubahnya menjadi error akan memunculkan pesan yang sebelumnya tidak pernah ada.
- **Urutan validasi tidak digeser.** Plant, lalu temuan, lalu tanggal. Menggesernya mengubah
  pesan mana yang muncul lebih dulu ketika beberapa field sekaligus kosong.
- **Efek visual border merah pada input plant tetap di pemanggil**, lewat helper
  `tandaiPlantBelumDipilih()`. Itu murni tampilan.
