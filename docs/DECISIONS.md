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
- **Efek visual border merah pada input plant tetap di pemanggil**, lewat
  `plantSelectForm.markInvalid()` (Phase 7 memindahkan helper ini ke dalam komponen
  plant-select — lihat K-11). Itu murni tampilan.

---

## K-11 — Cakupan Phase 7 (`presentation/components/`)

**Tanggal:** 2026-09-20 · **Status:** disetujui

### Yang diekstrak, dan kenapa

Lima komponen dipindah ke `src/presentation/components/`, masing-masing karena alasan
konkret, bukan sekadar "biar rapi":

| Komponen | Alasan |
|---|---|
| `plant-select.js` | ~100 baris logika diduplikasi **persis** dua kali (form inspeksi & form jadwal) di `initPlantSelect()`. Ditemukan JUGA duplikasi tersembunyi: tiga tempat lain (`openJadwalModal`, `submitJadwal`, `submitInspeksi`) menset/mereset pilihan plant secara manual dengan menyalin ulang efek `select()`/`clear()`. Semua disatukan lewat factory `createPlantSelect()`. |
| `modal.js` | Pola tutup-modal (tombol close + klik di luar kotak) disalin identik 5 kali (approval, calendar, detail, jadwal, perbaikan). Disatukan lewat `bindModalClose()`. |
| `lightbox.js` | Sudah berdiri sendiri sejak semula (tidak menyentuh state lain), sehingga aman dipindah sebagai unit utuh. |
| `toast.js` | Sama — berdiri sendiri, dipakai luas. |
| `search-box.js` | `setupSearch()` sudah berupa factory sejak semula dan dipakai 4 kali — tidak ada duplikasi untuk dihilangkan, dipindah semata agar sejajar dengan komponen presentasi lain. |

### Yang SENGAJA tidak diekstrak

Kalender (`renderCalendar`/`changeCalendarMonth`), seluruh table renderer, chart init, dan
isi modal (approval/perbaikan/detail) **tetap** di `legacy-app.js`. Masing-masing dipakai
**sekali** dan terikat erat pada data aplikasi (repository, domain rules) — memindahkannya
ke `components/` tidak menghilangkan duplikasi apa pun, hanya memindah kode tanpa manfaat,
sekaligus melanggar arahan "jangan over-engineer". Ini pekerjaan Phase 8 (view), yang memang
boleh terikat pada data aplikasi — beda tanggung jawab dari Phase 7 (component, harus reusable).

### Simplifikasi kecil yang ikut terjadi saat memindah (perilaku tidak berubah)

- **Status "ada pilihan" kini dibaca dari `hiddenInput.value === ''`**, menggantikan variabel
  modul `selectedPlant`/`selectedPlantJadwal` yang lama. Keduanya invariant-nya identik: hanya
  berubah lewat `select()`/`clear()`. Tidak ada tempat lain yang pernah membaca variabel lama
  itu sebagai objek (`selectedPlant.nama` dkk. tidak pernah dipakai) — hanya diperiksa
  truthy/falsy dan `.value` hidden input-nya. Diverifikasi dengan grep sebelum diubah.
- **Template SVG placeholder lightbox** (dipakai `openLightbox` maupun navigasi) yang tadinya
  disalin dua kali disatukan jadi `placeholderSvg()`. Keluarannya byte-identik untuk input yang
  sama; ini murni penghilang duplikasi literal, bukan perubahan perilaku.
- **`clear()` pada plant-select tidak lagi memanggil `.focus()` sendiri** — dulu `clearPlant()`
  memanggil `input.focus()` di dalam dirinya. Fokus dipindah ke listener tombol clear
  (`clearBtn.addEventListener('click', () => { clear(); input.focus(); })`), supaya `clear()`
  bisa dipakai ulang di `openJadwalModal`/`submitJadwal`/`submitInspeksi` tanpa mencuri fokus di
  situasi yang dulu tidak pernah memanggil `.focus()`. Hasil akhir: perilaku tombol clear itu
  sendiri sama persis; yang berubah hanya bahwa reset-tanpa-lewat-tombol tidak lagi (secara
  tidak sengaja) ikut memindah fokus — dan memang dulu tidak pernah begitu.

### Verifikasi

234 assertion lama (domain, shared, services, XSS, CRUD, bridge) tetap lulus **tanpa
mengubah satu pun file uji** — bukti bahwa pemindahan ini murni struktural. Ditambah 44
assertion baru (`test-components.mjs`) yang menguji kelima komponen secara langsung: klik
tombol clear plant-select, klik overlay vs klik di dalam kotak modal, navigasi lightbox lewat
listener asli (bukan memanggil fungsi internal secara langsung), keydown Escape/Arrow, dan
wiring search-box. Total: **278 assertion, 0 gagal**.

---

## K-12 — Cakupan Phase 8 (`presentation/views/`)

**Tanggal:** 2026-09-20 · **Status:** disetujui

### Batas view vs controller

Aturan yang dipakai untuk memutuskan apa yang pindah ke `views/` dan apa yang tetap di
`legacy-app.js`: **view merender data yang sudah ada** (baca repository, tampilkan HTML);
**controller membaca form dan mengubah state** (baca input pengguna, panggil service,
`refreshAll()`, tampilkan toast). Modal read-only (approval, detail) adalah view murni.
Modal berisi form (jadwal, perbaikan) dipecah: bagian tampilan pindah, bagian yang membaca
input/memanggil service tetap.

| Pindah ke `presentation/views/` (view) | Tetap di `legacy-app.js` (controller, Phase 9) |
|---|---|
| `calendar.view.js` — kalender + modal detail hari | `approveStage`/`rejectStage` — panggil service, `refreshAll()`, buka ulang modal |
| `approval.view.js` — tahap pengesahan + isi modal approval | `editJadwal`/`hapusJadwal`/listener `submitJadwal` — baca form, panggil service |
| `detail-modal.view.js` — isi modal detail (read-only) | `tambahPerbaikanCustom` — baca form, panggil service, buka ulang modal |
| `perbaikan-modal.view.js` — timeline + **markup** form tambah progres | listener `submitInspeksi`, `tambahTemuanBtn` — baca form, panggil service |
| `tables.view.js` — 4 tabel + badge notifikasi | `cetakPDF` — validasi + panggil `pdfExporter` (tapi markup laporannya sendiri di `pdf-report.view.js`) |
| `charts.view.js` — **satu-satunya** pemakai Chart.js sekarang | export/sync — panggil `excelExporter` |
| `pdf-report.view.js` — markup laporan (fungsi murni, tanpa DOM) | `initApp`, `refreshAll`, navigasi tab |

Chart.js sekarang terisolasi sama seperti SheetJS dan html2pdf sejak Phase 6 — lihat
docs/SECURITY.md bagian "Isolasi library".

### Enkapsulasi tambahan yang ikut terjadi (perilaku tidak berubah)

- **`perbaikanChart` tidak lagi diekspor.** Sebelumnya `refreshAll()` di `legacy-app.js`
  membaca variabel modul `perbaikanChart` secara langsung (`if (perbaikanChart) {...}`).
  Sekarang `charts.view.js` mengekspor `updatePerbaikanChart()` yang menghitung ulang data
  dan memanggil `.update()` sendiri — instance chart-nya sendiri tidak pernah keluar dari
  berkas itu. `countRepairStatuses()` (dulu dipakai dua fungsi berbeda di dua tempat) ikut
  pindah seluruhnya ke `charts.view.js` sebagai helper privat, karena satu-satunya
  pemakainya sekarang (`initCharts`, `updatePerbaikanChart`) ada di berkas yang sama.
- **`openDetailModal`/`openPerbaikanModal` berubah dari `window.X = function` menjadi
  `export function` + masuk daftar ekspor bridge di `legacy-app.js`.** Sebelumnya keduanya
  memasang diri langsung ke `window` di tempat deklarasi (pola yang sama seperti
  `openJadwalModal`/`hapusJadwal`/dll yang tetap di `legacy-app.js`). Setelah pindah berkas,
  pola itu tidak lagi cocok — cara yang benar untuk fungsi yang tinggal di
  `presentation/views/` adalah ekspor biasa lalu diimpor balik oleh `legacy-app.js` untuk
  didaftarkan ke bridge (pola yang sama seperti `openLightbox` sejak Phase 7). Hasil akhir
  di `window` sama persis; caranya sampai ke sana yang berbeda.
- **`renderDashboardJadwal()` dihapus.** Fungsi ini hanya berisi satu baris
  (`renderCalendar();`) dan hanya dipanggil dari satu tempat (`refreshAll`). Setelah
  `renderCalendar` diimpor langsung, wrapper itu tidak lagi menambah kejelasan apa pun —
  `refreshAll()` sekarang memanggil `renderCalendar()` langsung.
- **`collectMonthEvents()` diekstrak** dari dalam `renderCalendar()` di `calendar.view.js`
  sebagai fungsi bernama terpisah. Logikanya sama persis, byte-for-byte — ini murni supaya
  fungsi utamanya lebih pendek, bukan perubahan perilaku.

### Yang SENGAJA tidak diseragamkan

Fungsi "buka modal" (`openApprovalModal`, `openDetailModal`, `openPerbaikanModal`,
`openJadwalModal`) TIDAK dipaksa memakai satu bentuk signature/return value yang sama.
Masing-masing punya kebutuhan populate-content yang berbeda (approval & detail hanya baca,
perbaikan & jadwal juga menyiapkan form). Memaksakan bentuk seragam di sini adalah
abstraksi yang tidak diminta siapa pun — persis yang diperingatkan di instruksi awal
("jangan over-engineer").

### Verifikasi

278 assertion Phase 0-7 tetap lulus **tanpa mengubah satu pun file uji** — bukti pemindahan
ini murni struktural. Ditambah 35 assertion baru (`test-views.mjs`) yang menguji lewat login
sungguhan + `initApp()`: kalender berganti bulan, modal approval menampilkan tombol yang
tepat sesuai tahap yang aktif (diuji dengan INS-001 yang 4/4 disetujui vs INS-002 yang
tahap 2-nya masih menunggu), isolasi Chart.js (grep `new Chart(` di `legacy-app.js` harus
kosong), dan `buildInspectionReportHtml()` diuji langsung sebagai fungsi murni dengan
payload yang sengaja memuat XSS, tiga status perbaikan sekaligus, dan kasus kosong.
Total: **313 assertion, 0 gagal**.

---

## K-13 — Phase 9: event delegation menggantikan onclick inline

**Tanggal:** 2026-09-20 · **Status:** disetujui

### Mekanisme

Satu modul generik baru, `src/presentation/controllers/action-dispatcher.js`:
`registerAction(nama, handler)` mendaftarkan handler; `initActionDispatcher()` memasang
**satu** listener klik terdelegasi ke `document`. Elemen yang bisa diklik memakai
`data-action="namaAksi"` plus `data-*` lain sesuai kebutuhan handler-nya — menggantikan
`onclick="namaAksi(${jsArg(...)})"` di 27 titik across 8 berkas, plus `onsubmit="handleLogin(event)"`
pada `#loginForm` (diganti `addEventListener('submit', handleLogin)` langsung, bukan lewat
dispatcher — submit bukan click, dan hanya ada satu form login).

Modul dispatcher-nya sendiri tidak tahu apa pun soal aplikasi; seluruh pendaftaran 18 aksi
ada di satu blok di ujung `legacy-app.js`, menggantikan blok `export {}` lama yang dipakai
`installGlobalBridge`. `src/compat/global-bridge.js` dan pemanggilannya di `main.js` dihapus
sepenuhnya — `main.js` sekarang hanya `import './legacy-app.js';`.

### Jebakan tipe data yang ditemukan (dan sengaja diuji)

`HTMLElement.dataset` **selalu** mengembalikan string, apa pun isi atribut HTML-nya. Tiga
handler mengharapkan tipe lain, dan tanpa konversi eksplisit keduanya gagal *diam-diam*
(tidak melempar error, cuma salah hasil):

| Handler | Kenapa harus `Number(...)` |
|---|---|
| `changeCalendarMonth(delta)` | `currentCalendarMonth += delta` — kalau `delta` string `"-1"`, `+=` pada number+string jadi **penggabungan string** (`5 + "-1"` = `"5-1"`), bukan pengurangan. Bulan yang tampil rusak, bukan error. |
| `approveStage`/`rejectStage`/`findStage` | `APPROVAL_STAGES.find(s => s.id === stageId)` memakai `===`. `2 !== "2"`, jadi tahap tidak pernah ketemu — approve/reject diam-diam tidak melakukan apa pun. |
| `openLightbox(images, index)` | `currentLightboxIndex + direction` di `navigateLightbox` — index string membuat navigasi berikutnya salah lewat masalah yang sama seperti `changeCalendarMonth`. |
| `hapusTemuan(index)` | `Array.prototype.splice` sebenarnya mentoleransi string (ToIntegerOrInfinity), jadi ini tidak benar-benar bug — tapi tetap dikonversi untuk konsistensi tipe dengan pemanggilan langsung yang lama. |

Setiap `registerAction(...)` untuk keempatnya membungkus pemanggilan dengan `Number(el.dataset.X)`.
`openLightbox` juga perlu `JSON.parse(...)` untuk array gambar — mekanisme decode-lalu-parse
yang sama yang membuktikan perbaikan D-1 dulu (lihat KNOWN-ISSUES.md), sekarang lewat
`data-images` bukan argumen `onclick`.

### `data-id` tidak lagi butuh `jsArg`

Titik panggil yang dulu memakai `onclick="handler(${jsArg(item.id)})"` sekarang cukup
`data-id="${escapeHtml(item.id)}"` — `jsArg` (JSON.stringify + escape) hanya diperlukan saat
nilainya harus jadi **argumen JS** di dalam atribut. Nilai yang duduk di `data-*` biasa cukup
di-escape sebagai teks atribut. `jsArg` sekarang hanya dipakai untuk `data-images` (satu-satunya
nilai berbentuk array).

### Sembilan fungsi kembali jadi scope module, bukan lagi `window.X`

`approveStage`, `cetakPDF`, `editJadwal`, `exportTemuanPerItem`, `hapusJadwal`, `hapusTemuan`,
`openJadwalModal`, `rejectStage`, `tambahPerbaikanCustom` dulu memasang diri langsung
(`window.X = function`) karena itulah satu-satunya cara atribut `onclick` (scope global) bisa
menemukannya. Tanpa `onclick`, tidak ada alasan lagi menaruhnya di `window` — semuanya jadi
`function X() {}` biasa, dipanggil dari `registerAction()` atau langsung antar fungsi.

`window.showToast` **sengaja tidak diubah** — itu bukan bagian jembatan onclick (tidak pernah
ada di `INLINE_HANDLER_NAMES`), sudah jadi properti `window` sejak sebelum refactoring dimulai.
Mengubahnya di luar lingkup Phase 9.

### Ekspor legacy-app.js berubah tujuan, bukan hilang

19 fungsi yang dulu diekspor untuk `installGlobalBridge` **tetap** diekspor — tapi sekarang
alasannya murni supaya berkas uji (`scratchpad/test-*.mjs`) bisa mengimpornya langsung
(`import { approveStage } from '.../legacy-app.js'`), bukan lagi untuk jembatan window. Runtime
aplikasi sendiri tidak pernah membaca ekspor ini — ia memanggil fungsi-fungsi itu langsung
antar sesama kode di `legacy-app.js`, atau lewat pendaftaran aksi.

### Dampak pada metodologi pengujian

Seluruh test yang sebelumnya memanggil `window.handleLogin(...)`, `window.editJadwal(...)`, dst.
**tidak bisa lagi begitu** — itu justru properti yang sengaja dihapus. Diganti dua pola:

1. **Impor langsung** (`legacyApp.editJadwal(...)`) untuk menguji logika handler-nya — dipakai
   di sebagian besar test lama yang cuma perlu memicu suatu aksi.
2. **Klik sungguhan lewat dispatcher** (`document.dispatchEvent({type:'click', target: el})`,
   dengan `el.dataset` diisi manual meniru apa yang seharusnya datang dari HTML) — dipakai
   khusus untuk membuktikan jebakan tipe data di atas benar-benar tertangani, karena hanya
   jalur ini yang melewati `registerAction()`nya sungguhan, bukan memanggil fungsi aslinya
   langsung (yang akan lolos meski konversi Number-nya lupa ditulis).
3. `handleLogin` diuji lewat `document.getElementById('loginForm').dispatchEvent({type:'submit',...})`
   — membuktikan `addEventListener('submit', handleLogin)` yang menggantikan
   `onsubmit="handleLogin(event)"` benar-benar terpasang.
4. Modul dispatcher sendiri (`action-dispatcher.js`) diuji terisolasi di `test-dispatcher.mjs`
   (9 assertion): registrasi, klik cocok, klik tanpa `data-action`, `data-action` tak
   dikenal, dan penimpaan pendaftaran dengan nama sama.

### Verifikasi

Tidak ada satu pun assertion behavior lama yang berubah maknanya — semua 313 assertion Phase
0-8 tetap ditulis ulang memakai pola baru (bukan dihapus), plus 3 assertion baru di
`test-views.mjs` (klik sungguhan `changeCalendarMonth` dan `approveStage` lewat dispatcher)
dan 9 assertion baru di `test-dispatcher.mjs`. Total: **325 assertion, 0 gagal**. Diverifikasi
juga: 0 `onclick=`/`onsubmit="handleLogin` tersisa di `src/`+`index.html`, `src/compat/`
terhapus, 18 nama `data-action` di markup persis cocok 1:1 dengan 18 `registerAction(...)`
(dihitung lewat grep, bukan dibaca manual).

---

## K-14 — Phase 10: D-2 (submit Enter berlipat) dan D-3 (initApp tidak idempotent)

**Tanggal:** 2026-09-20 · **Status:** disetujui (bagian dari K-1, dieksekusi di Phase 10)

### D-2: dihapus, bukan diganti

Dua dari tiga jalur submit adalah duplikat murni dari perilaku native browser (form HTML
submit sendiri saat Enter ditekan di input teks) — tidak butuh JS sama sekali. Perbaikannya
karena itu adalah **penghapusan**, bukan penambahan logika dedup/debounce. Satu-satunya
listener `keydown` yang punya tujuan asli (memindahkan fokus username → password)
dipertahankan, hanya ditambah `event.preventDefault()` supaya tidak lagi *juga* ikut submit
form dengan password kosong.

### D-3: dua lapis, bukan satu

Awalnya deskripsi defect ini terlihat seperti "chart crash" saja — cukup tambah
`perbaikanChart.destroy()` sebelum `new Chart()`, seperti yang sudah dilakukan
`renderTemuanPlantChart()`. Itu memang **perlu**, tapi tidak **cukup**: dokumentasi audit awal
(KNOWN-ISSUES.md) sendiri mencatat "efek samping tambahan" — `initPlantSelect()` dan
`setupSearch()` memasang listener berulang **sebelum** titik crash lama, yang berarti
duplikasi listener itu sudah terjadi hari ini setiap kali `initApp()` terpanggil dua kali,
independen dari chart crash-nya.

Menutup crash tanpa menutup ini akan menukar bug yang **berisik** (exception, mudah
ketahuan) dengan bug yang **diam** (listener dan `setInterval` menumpuk tanpa batas setiap
logout/login, memperlambat aplikasi secara halus, susah dilacak). Karena D-3 secara eksplisit
disetujui untuk diperbaiki (K-1), dan "initApp tidak idempotent" adalah judul defect-nya
sendiri, menutup separuh masalah dan membiarkan separuh lain aktif bukan perbaikan yang
jujur terhadap judul itu.

**Solusi:** satu flag module-level `appInitialized` di `legacy-app.js`. Bagian `initApp()`
yang memasang listener/timer (initPlantSelect, 4× setupSearch, setInterval) hanya berjalan
saat `appInitialized` masih `false`; bagian yang menyegarkan tampilan (reset field form,
`renderTemuanList`, `initCharts`, `refreshAll`) tetap berjalan di setiap login — supaya
logout lalu login lagi tetap menghasilkan dashboard yang benar-benar segar, bukan cuma
"tidak crash".

Ini **bukan** state-machine lifecycle umum (tidak ada `teardown()`/`destroy()` untuk
`initApp`) — elemen DOM aplikasi memang tidak pernah dibongkar saat logout (hanya
class CSS `.hidden`/`.visible` yang berganti), jadi listener yang terpasang sekali tetap
valid selamanya untuk elemen yang sama. Satu flag boolean sudah cukup; membangun mekanisme
lifecycle penuh (register/unregister eksplisit) untuk masalah yang sebenarnya "pasang
sekali, pakai selamanya" akan jadi abstraksi yang tidak diminta.

### Verifikasi

`test-lifecycle.mjs` (baru, 17 assertion) mensimulasikan login → logout → login → logout →
login (dua kali ulang, bukan cuma sekali, supaya bukan kebetulan). Diverifikasi: tidak ada
exception pada login kedua/ketiga, `perbaikanChart.destroy()` benar-benar terpanggil sebelum
instance baru, dan — ini yang paling penting — **jumlah** listener `input` pada
`#searchInspeksiInput`/`#plantSearchInput` serta jumlah pemanggilan `setInterval` **tidak
bertambah** setelah login kedua/ketiga (bukan cuma "tidak error", tapi benar-benar terbukti
tidak menumpuk). D-2 diuji terpisah: dispatch `keydown` Enter ke `document` dan
`#loginPassword` dipastikan tidak lagi memicu dispatch `submit` tambahan.

Seluruh 325 assertion Phase 0-9 tetap lulus tanpa perubahan. Total: **342 assertion, 0
gagal**.

---

## K-15 — Notifikasi login (toast sukses & pesan error) dihapus atas permintaan pengguna

**Tanggal:** 2026-09-20 · **Status:** disetujui, dieksekusi langsung (di luar penomoran phase —
perubahan perilaku eksplisit, bukan refactor struktural)

**Permintaan:** hapus toast "✅ Selamat datang, Safety Officer!" yang muncul setelah login
berhasil, dan hapus kotak pesan merah "⚠️ Username atau password salah!" yang muncul di
`#loginError` saat login gagal.

**Implementasi — dihapus sampai akar, bukan disembunyikan lewat CSS:**
- `handleLogin()` (`src/legacy-app.js`): baris `showToast(...)` pada jalur sukses dihapus;
  pada jalur gagal, seluruh blok `errorMessage.textContent/classList.add('show')` +
  `setTimeout(... classList.remove('show'), 3000)` dihapus. Variabel `errorMessage` (dan
  `classList.remove('show')` pada jalur sukses) ikut dihapus karena jadi tidak terpakai.
  Perilaku yang **dipertahankan**: field password dikosongkan dan di-fokus ulang saat login
  gagal — ini bukan "notifikasi", tapi UX standar supaya pengguna bisa langsung mencoba lagi.
- `index.html`: elemen `<div id="loginError" class="error-message">...</div>` dihapus —
  tidak ada lagi kode yang mengisi atau menampilkannya, jadi mempertahankan markup-nya
  (walau `display:none` secara default) adalah dead code.
- `assets/css/02-login.css`: aturan `.error-message`, `.error-message.show`, dan
  `@keyframes shake` dihapus — diverifikasi lebih dulu (grep) bahwa `.error-message` dan
  `shake` tidak dipakai elemen lain mana pun di proyek.

**Konsekuensi UX yang disadari:** pengguna yang salah memasukkan kredensial sekarang **tidak
mendapat umpan balik visual apa pun** selain field password yang mengosong dan
ter-fokus-ulang — ini adalah permintaan eksplisit pengguna, bukan defect yang terlewat.

**Dampak ke test suite:** `test-crud.mjs` (skenario "login gagal") sebelumnya membaca
`byId('loginError').textContent` — mengasumsikan elemen itu masih ada. Perlu disesuaikan
karena elemen sudah tidak ada di stub DOM manapun; skenario diuji ulang lewat efek yang masih
ada (field password kosong + halaman login tetap tampil), bukan lewat teks error yang sudah
tidak ada.

---

## K-16 — Phase 11: D-5 (label tombol Sync), D-6 (colspan), dan penghapusan dead code

**Tanggal:** 2026-09-20 · **Status:** disetujui (bagian dari K-1, dieksekusi di Phase 11)

### D-5: hanya bagian label yang diperbaiki

Dua masalah berbeda di `syncToGoogleSheets()`, ditangani berbeda sesuai audit awal (lihat
KNOWN-ISSUES.md D-5): label tombol yang berubah permanen dari "Sync" menjadi "Sync Google
Sheets" setelah klik pertama **diperbaiki** — blok `finally` sekarang mengembalikan label
persis ke "Sync", sama seperti markup awal di `index.html`. Penamaan fungsi/toast yang
menyesatkan (fungsi ini sebenarnya mengunduh `.xlsx`, tidak menghubungi Google Sheets sama
sekali) **sengaja tidak diubah** — itu keputusan produk (menyangkut nama fitur yang terlihat
pengguna), bukan refactoring struktural, dan di luar mandat sesi ini.

### D-6: colspan dihitung dari parameter yang sudah ada, bukan tabel lookup baru

`renderInspeksiTable()` dipakai bersama oleh tabel Dashboard (7 kolom) dan tabel Inspeksi
lengkap (9 kolom) lewat parameter `isFull`, tapi baris empty-state-nya memakai `colspan="10"`
tetap — salah untuk kedua kasus. Perbaikannya memakai parameter `isFull` yang sudah ada
(`isFull ? 9 : 7`) alih-alih menghitung ulang lewat cara lain, karena parameter itu sudah
persis membedakan kedua varian tabel yang dimaksud. Tabel Jadwal dan tabel Perbaikan
menggunakan fungsi render terpisah dan colspan-nya sudah benar sejak awal — tidak disentuh.

### Dead code: dihapus setelah diverifikasi tanpa pemanggil, bukan diasumsikan

Ketiga item pada catatan Phase 1 (`renderGallery()`, `<audio id="alertSound">`, field
`lat`/`lng`) diverifikasi ulang lewat `grep` project-wide **sebelum** dihapus — bukan dihapus
hanya berdasarkan catatan audit lama, karena baris kode bisa saja sudah berubah sejak Phase 1:
- `renderGallery()` di `legacy-app.js`: nol pemanggil di seluruh proyek. Fungsi galeri yang
  sungguhan dipakai (`detail-modal.view.js`, `perbaikan-modal.view.js`) membangun markupnya
  sendiri secara independen sejak Phase 8 — bukan lewat fungsi ini. Import `jsArg` di
  `legacy-app.js` ikut dihapus karena jadi tidak terpakai (satu-satunya pemakainya adalah
  fungsi yang baru dihapus).
- `<audio id="alertSound">` di `index.html`: nol referensi JS di seluruh proyek.
- Field `lat`/`lng`: dihapus dari `src/data/inspections.seed.js` (6 inspeksi demo) dan
  `src/services/inspection-service.js` (pembuatan inspeksi baru). Komentar di
  `inspection-service.js` sendiri sudah menyatakan "dihapus pada Phase 11" sejak fase
  sebelumnya — konsisten dengan rencana ini, bukan keputusan baru.

### Verifikasi

`test-cosmetic.mjs` (baru, 10 assertion): klik tombol Sync dan cek label akhir persis "Sync";
render keempat tabel (Dashboard, Inspeksi lengkap, Jadwal, Perbaikan) dalam keadaan kosong dan
cek `colspan` cocok dengan jumlah kolom sungguhan masing-masing; buat inspeksi baru lewat
`inspectionService.create()` dan pastikan objeknya tidak punya field `lat`/`lng`.

Seluruh 342 assertion Phase 0-10 tetap lulus tanpa perubahan. Total: **352 assertion, 0
gagal**. Syntax check 40/40 modul, HTTP serving 57/57 berkas (bertambah dari 40 karena
verifikasi kali ini juga mencakup seluruh berkas `assets/css/*.css`, bukan hanya modul JS).

---

## K-18 — Phase 12: backend Node/Express/MySQL — tiga koreksi teknis terhadap
docs/ROADMAP-PHASE12.md

**Tanggal:** 2026-09-20 · **Status:** disetujui (K-1 lanjutan; koreksi #1 lewat konfirmasi
eksplisit pemilik project, #2 dan #3 ditemukan dan diperbaiki selama implementasi)

Rencana di `docs/ROADMAP-PHASE12.md` menjanjikan "services butuh nol perubahan". Janji itu
**tidak sepenuhnya bertahan** begitu diimplementasikan — tiga hal yang tidak terlihat saat
perencanaan (karena baru muncul ketika kode sungguhan ditulis dan diuji terhadap MySQL
sungguhan, bukan cuma dibaca) memaksa penyesuaian. Ketiganya didokumentasikan di sini secara
jujur, bukan disembunyikan di balik commit message.

### Koreksi #1 — approvals/temuan/perbaikan tetap tabel relasional terpisah, bukan kolom JSON

`approval-service.js`, `corrective-action-service.js`, dan `schedule-service.js` (jalur update)
semuanya mengambil objek lewat `findById()` lalu **memutasinya langsung** (`inspection.approvals[stageId]
= ...`, `inspection.perbaikan.push(...)`) — pola yang hanya bekerja karena "database" in-memory
memang sebuah objek JS yang bisa dimutasi lewat referensi. Skema MySQL yang sudah dibuat
menyimpan `approvals`/`findings`/`corrective_actions` sebagai TABEL TERPISAH dari `inspections`
(demi integritas relasional dan query langsung seperti "inspeksi yang menunggu approval role
X") — memutasi sebuah objek JS lokal tidak menyentuh tabel-tabel itu sama sekali.

Dua opsi diajukan ke pemilik project secara eksplisit lewat pertanyaan langsung: (a) pertahankan
tabel relasional, terima bahwa 3 service butuh perubahan nyata (bukan cuma sync→async) berupa
pemanggilan eksplisit `saveApproval()`/`setStatus()`/`addCorrectiveAction()` setelah mutasi; atau
(b) simpan `approvals`/`temuan`/`perbaikan` sebagai kolom JSON di tabel `inspections`, yang
mempertahankan pola mutate-in-place hampir apa adanya tapi kehilangan FK/index relasional.
**Dipilih (a).** Diterapkan sebagai: repository in-memory (`src/repositories/inspection-repository.js`,
`schedule-repository.js`) mendapat method baru yang **no-op** (`saveApproval`, `setStatus`,
`addCorrectiveAction`, `update`) — mutasi lewat referensi tetap jadi sumber kebenaran di
browser, method-method itu ada supaya kontraknya sama dengan versi backend, di mana isinya
query UPDATE/INSERT sungguhan.

### Koreksi #2 — services jadi async, plus `add()` menentukan id (bukan `nextId()` di pemanggil)

MySQL nyata berarti setiap panggilan repository adalah operasi async — kebalikan dari array
in-memory yang selalu langsung tersedia. `inspection-service.create()`, `approval-service.approve/reject()`,
`schedule-service.save/remove()`, `corrective-action-service.addAction()` semuanya jadi
`async function` dengan `await` di setiap pemanggilan repository. Ini merambat ke pemanggilnya:
6 titik di `src/legacy-app.js` (`approveStage`, `rejectStage`, `hapusJadwal`, listener
`submitJadwal`, `tambahPerbaikanCustom`, listener `submitInspeksi`) jadi `async function`/`await`,
dan `action-dispatcher.js` diberi satu baris `return handler(el, event)` supaya klik lewat
delegasi bisa di-`await` (browser mengabaikan return value listener klik, jadi ini aman).

Konsekuensi kedua: id (`INS-nnn`/`SCH-nnn`) tidak lagi dihitung terpisah oleh
`inspectionRepository.nextId()`/`scheduleRepository.nextId()` SEBELUM `add()` dipanggil — kedua
`add()` sekarang menentukan id SENDIRI (lewat `nextId()` internal di versi in-memory,
`AUTO_INCREMENT` MySQL di versi backend) dan mengembalikan objek lengkap. `nextId()` sendiri
dipertahankan (tidak dihapus) tapi tidak lagi dipanggil dari service — cukup langkah tambahan,
bukan penghapusan.

Seluruh 352 assertion frontend disesuaikan (tambah `await`, ubah `dispatchEvent`/`click()` pada
stub DOM di scratchpad supaya mengembalikan Promise) — tidak ada assertion yang dihapus atau
diperlunak, semuanya tetap lulus dengan makna yang sama.

### Koreksi #3 — repository backend butuh import map + Node `--conditions`, bukan sekadar folder terpisah

Rencana awal ("Backend TIDAK menimpa `src/repositories/*.js` — folder terpisah") ternyata
**tidak cukup** begitu diuji end-to-end. `src/services/*.js` meng-import repository lewat path
RELATIF TETAP (`'../repositories/inspection-repository.js'`) — resolusi modul JS selalu relatif
terhadap LOKASI FILE YANG MENG-IMPOR, bukan siapa yang meng-import file itu. Akibatnya, ketika
backend meng-import `src/services/inspection-service.js` apa adanya, import internal
service itu TETAP resolve ke `src/repositories/inspection-repository.js` (versi in-memory) —
bukan ke `server/repositories/` yang baru dibuat. Gejalanya menipu: `POST /api/inspections`
mengembalikan 201 dengan data lengkap yang terlihat benar (karena in-memory `add()` memang
valid dan mengembalikan objek utuh), tapi `GET /api/inspections/:id` sesudahnya 404 — karena
baris itu sungguhan tidak pernah masuk MySQL. Ditemukan lewat pembandingan langsung: query
`SELECT COUNT(*)` ke MySQL via pool yang SAMA menunjukkan baris tidak bertambah, padahal
response API menunjukkan data "berhasil".

**Solusi:** `src/services/*.js` diubah meng-import lewat *subpath import* Node
(`'#repositories/inspection-repository.js'`, bukan path relatif) — satu-satunya perubahan pada
kelima berkas services yang murni soal mekanisme resolusi modul, tanpa menyentuh logika bisnis
apa pun. `package.json` mendefinisikan `imports` dengan **kondisi kustom** `"server"`:
```json
"imports": {
  "#repositories/inspection-repository.js": {
    "server": "./server/repositories/inspection-repository.js",
    "default": "./src/repositories/inspection-repository.js"
  }
}
```
Backend dijalankan dengan flag `node --conditions=server` (lihat `package.json` scripts
`server`/`test:api`) sehingga specifier itu resolve ke MySQL. Tanpa flag itu — termasuk skrip
test frontend di scratchpad yang menjalankan `src/legacy-app.js` lewat Node biasa untuk
mensimulasikan browser — resolusinya tetap ke `default`, yaitu versi in-memory, PERSIS seperti
sebelum Phase 12. Percobaan pertama (hanya `package.json "imports"` tanpa kondisi) GAGAL karena
Node tidak bisa membedakan "proses Node yang berperan sebagai backend" dari "proses Node yang
menjalankan test frontend" — keduanya sama-sama proses Node biasa; baru dengan flag
`--conditions` keduanya bisa dibedakan.

Untuk BROWSER sungguhan (bukan Node), mekanismenya berbeda lagi: browser tidak mengenal
`package.json` sama sekali, jadi `index.html` diberi `<script type="importmap">` yang memetakan
specifier YANG SAMA ke `src/repositories/*.js` — demo browser Phase 12-13 tetap hidup tanpa
backend, sesuai rencana awal, hanya mekanismenya (import map, bukan "folder terpisah" saja)
yang berbeda dari yang direncanakan.

### Temuan tambahan selama implementasi (bukan koreksi rencana, tapi bug nyata yang ditemukan+diperbaiki)

`inspection-service.js` memformat tanggal lewat `formatDate()`/`toLocaleDateString('id-ID')` —
format lokal "D/M/YYYY" (lihat `shared/date.js`). Kolom `DATE` MySQL butuh ISO "YYYY-MM-DD".
Tanpa konversi, `corrective_actions.tgl` (dan `inspections.tanggal`/`due_date`) gagal di-insert.
Diperbaiki di `server/repositories/inspection-repository.js`: `toSqlDate()` (lokal → ISO) saat
menulis, `formatDate()` yang sudah ada (ISO → lokal) saat membaca — supaya bentuk data yang
dilihat domain/services/presentation tetap format lokal seperti sekarang, MySQL tetap dapat
format yang benar secara internal.

### Verifikasi

- Backend: `server/test/api.test.js` (supertest + `node --test`, 8 test) terhadap MySQL
  sungguhan (database `she_sasa`, di-reseed di awal lewat `server/db/seed.js`) — mencakup 401
  tanpa identitas, 403 role salah, alur penuh buat inspeksi → tolak lompat tahap (`PREVIOUS_STAGE_PENDING`)
  → approve berjenjang 2→3→4 oleh 3 akun berbeda (Dewi/Andi/Hadi) dengan identitas asli
  tersimpan (`approved_by_name` bukan lagi literal `'Approver'` — menutup S-07) → tambah
  tindakan perbaikan (foto wajib) → CRUD jadwal (hapus hanya admin).
- Frontend: seluruh 352 assertion Phase 0-11 (scratchpad) tetap lulus SETELAH disesuaikan untuk
  async (lihat Koreksi #2) — dijalankan TANPA flag `--conditions=server`, membuktikan resolusi
  default (in-memory) benar-benar tidak berubah untuk browser/pengujian frontend.
- Syntax check: seluruh `src/*.js` dan `server/*.js`.
- HTTP serving: `index.html`, seluruh `src/*.js`, `assets/*.css` tetap 200 lewat server statis
  dev — termasuk `<script type="importmap">` yang divalidasi JSON-nya valid.

## K-19: Bug ditemukan lewat manual testing Postman — `PLANT_NOT_FOUND` (post Phase 12)

Setelah Phase 12 selesai, user menguji API secara manual lewat Postman dan menemukan
`POST /api/inspections` dengan `plantId` yang tidak ada di database (mis. `99999`) menghasilkan
`500 Internal Server Error` polos, bukan error input yang jelas.

**Root cause:** `inspection-service.js` `create()` hanya memvalidasi `plantId` untuk "kosong/tidak
dikirim" (`!input.plantId`). `plantRepository.findById(input.plantId)` yang mengembalikan
`undefined` untuk id yang tidak ada TIDAK PERNAH dicek — kode lanjut sampai
`inspectionRepository.add()`, yang meng-`INSERT` dengan `plant_id` tidak valid, melanggar
`FOREIGN KEY (plant_id) REFERENCES plants(id)`. Exception MySQL itu tidak ditangkap di layer
manapun, jatuh ke error handler generik di `server/app.js` → 500.

**Fix:** tambah `INSPECTION_ERROR.PLANT_NOT_FOUND` dan satu pengecekan
`if (!plant) return fail(INSPECTION_ERROR.PLANT_NOT_FOUND);` tepat setelah plant di-lookup,
SEBELUM data apa pun sampai ke repository — di `src/services/inspection-service.js`, bukan di
route handler atau lewat blanket try/catch pada error database (validasi tetap spesifik untuk
input yang salah, bukan menutupi seluruh kelas error database). Karena file ini dipakai bersama
backend (MySQL) dan browser (in-memory), satu perbaikan ini otomatis menutup celah yang sama di
keduanya. Test baru ditambahkan di `server/test/api.test.js` untuk kasus ini.

**Catatan proses:** saat menyelidiki bug ini, ditemukan juga bahwa AUTO_INCREMENT MySQL tidak
pernah dipakai ulang walau sebuah INSERT di-rollback — sehingga inspeksi yang dibuat manual lewat
Postman lalu terhapus oleh reseed (`npm run db:seed`/`npm run test:api`, yang selalu TRUNCATE +
isi ulang) membuat `inspectionId` yang tersimpan di collection variable Postman jadi basi
(mengarah ke id yang tidak pernah ada di state database saat ini). Ini **bukan bug backend** —
`400 INSPECTION_NOT_FOUND` untuk id yang benar-benar tidak ada adalah perilaku yang benar. Folder
"04 - Approve & Reject" di collection Postman (`docs/postman/she-sasa-phase12.postman_collection.json`)
diberi catatan eksplisit soal ini: jalankan ulang request pembuatan inspeksi di folder 03 setiap
kali database baru saja di-reseed.

## K-20: Phase 13 — Auth sungguhan (bcrypt + express-session + CSRF), menutup S-01 dan S-07

Menggantikan `server/middleware/dev-auth.js` (header `X-Dev-User`, dihapus total) dengan login
sungguhan: password diverifikasi lewat bcrypt terhadap `users.password_hash`, identitas disimpan
di session (cookie HttpOnly), bukan lagi bisa dipalsukan lewat header apa pun. Sesuai
`docs/ROADMAP-PHASE12.md` Phase 13, dengan tiga penyesuaian teknis:

### Penyesuaian #1: session store MySQL ditulis sendiri, BUKAN paket `express-mysql-session`

Rencana awal menyebut "session store MySQL" tanpa menentukan implementasinya. Paket
`express-mysql-session` (pilihan paling umum) ternyata membawa salinan `mysql2` sendiri yang
independen dari `mysql2` proyek ini, dan versi yang ter-bundle itu kena dua advisory severity
**high**: `GHSA-3f6p-5ww8-9rcr` (downgrade auth plugin ke `mysql_clear_password`, bisa membocorkan
kredensial plaintext) dan `GHSA-rgwj-5xj2-c3m3` (decompression-bomb DoS lewat protokol MySQL
terkompresi) — dikonfirmasi lewat `npm audit` setelah instalasi (`npm ls mysql2` menunjukkan dua
versi berbeda hidup berdampingan di `node_modules`). Karena skema tabel sesi cuma tiga kolom
(`session_id`, `expires`, `data`), ditulis manual di `server/db/session-store.js` — kelas yang
extends `Store` dari `express-session` sendiri, memakai `pool` yang sama dipakai seluruh backend
(satu versi `mysql2` di seluruh proyek, nol dependency tambahan). Setelah uninstall
`express-mysql-session`, `npm audit` kembali bersih (0 vulnerabilities). Baris kedaluwarsa dihapus
malas (lazy, saat `get()` menemukannya) — sengaja tanpa job sapuan `setInterval`, supaya proses
Node (termasuk proses test) bisa keluar bersih tanpa timer menggantung.

### Penyesuaian #2: CSRF — synchronizer token pattern manual, bukan paket `csurf`

`csurf` (pilihan paling dikenal) sudah tidak dipelihara dan secara eksplisit dianggap tidak aman
oleh maintainer Express sendiri untuk pemakaian baru. Sebagai gantinya: `server/middleware/csrf.js`
menerbitkan token acak (`crypto.randomBytes`) sekali saat login, disimpan di
`req.session.csrfToken` DAN dikembalikan di body respons login (`csrfToken`). Klien wajib
mengirim balik lewat header `X-CSRF-Token` pada setiap `POST`/`PUT`/`DELETE`/`PATCH` — dicek sama
persis dengan yang tersimpan di sesi. `GET`/`HEAD`/`OPTIONS` dikecualikan (tidak mengubah state).
Endpoint `/api/auth/login` sendiri dikecualikan (belum ada sesi untuk menyimpan token sebelum
login berhasil) — diamankan lewat kombinasi password + `SameSite=Lax` pada cookie sesi.

### Penyesuaian #3: `src/config/demo-auth.js` TIDAK dihapus di fase ini (menyimpang dari teks rencana awal)

`docs/ROADMAP-PHASE12.md` Phase 13 menyebutkan berkas ini dihapus di fase ini. Setelah dicek, file
ini murni dipakai browser (`src/legacy-app.js`, toggle class CSS demo login) dan sama sekali
tidak terhubung ke backend — frontend belum memanggil API apa pun sampai Phase 14 ("Sambungkan
frontend ke API"). Menghapusnya sekarang akan mematahkan demo browser yang berdiri sendiri
sebelum Phase 14 sempat menggantikannya dengan login sungguhan lewat API — melanggar invarian
yang dijaga ketat sejak Phase 12 ("demo browser tidak boleh rusak di luar fasenya sendiri").
Keputusan: `src/config/demo-auth.js` **dibiarkan apa adanya**, dihapus nanti di Phase 14
bersamaan dengan `src/repositories/*.js` beralih dari in-memory ke `fetch()`. Yang dihapus di
fase ini hanya `server/middleware/dev-auth.js` (backend-only, tidak dipakai frontend sama sekali).

### Perubahan lain

- `approval-rules.buildApprovalRecord()` dan `approval-service.approve()`/`reject()` SUDAH
  menerima parameter `approver` sejak Phase 12 (lihat K-18) — tidak ada perubahan lagi di sini,
  sesuai rencana ("satu-satunya titik domain/services yang sengaja diubah", sudah selesai lebih
  awal dari jadwal).
- `server/middleware/dev-auth.js` dihapus. `server/middleware/session-auth.js` (baru) punya
  `requireRole()` dengan signature identik — seluruh route (`inspections`/`schedules`/`users`)
  hanya berganti satu baris import, logic role-nya tidak berubah.
- `server/routes/auth.routes.js` ditulis ulang: `POST /login` (bcrypt + `session.regenerate()`
  untuk mencegah session fixation), `POST /logout`, `GET /me` (dua yang terakhir butuh sesi
  aktif).
- `.env`/`.env.example`: `SESSION_SECRET` baru (wajib diisi, `express-session` menolak jalan
  tanpanya).
- `server/db/migrations/002_sessions.sql`: tabel `sessions`.

### Verifikasi

- Backend: `server/test/api.test.js` ditulis ulang total — pola `X-Dev-User` diganti `loginAs()`
  (supertest `request.agent()`, satu agent = satu sesi cookie, meniru satu tab browser per role).
  12 test lulus: 401 tanpa login, 401 username tidak dikenal, 401 password salah (jalur
  `bcrypt.compare` false), login sukses + `GET /me` konsisten, `403 CSRF_INVALID` tanpa header
  token, logout menghapus sesi (request berikutnya dengan cookie lama → 401), plus seluruh
  skenario role/approval/jadwal dari Phase 12 (termasuk kasus baru: approve dobel pada tahap yang
  sama → `400 ALREADY_APPROVED`, domain logic yang ternyata sudah menjaga ini sejak awal).
- Manual: alur login → CSRF ditolak tanpa token → CSRF diterima dengan token → logout → request
  dengan cookie lama ditolak, diverifikasi lewat curl end-to-end sebelum test otomatis ditulis.
- Frontend: seluruh 352 assertion tetap lulus tanpa perubahan apa pun pada `src/*.js` di fase ini
  (Phase 13 100% terbatas ke `server/`).
- `npm audit`: 0 vulnerabilities (setelah mengganti `express-mysql-session` dengan store sendiri).
- `docs/postman/she-sasa-phase12.postman_collection.json` ditulis ulang total: setiap folder
  diberi request "Login sebagai <role>" di awal (satu cookie jar Postman = satu sesi aktif,
  login sebagai role baru menggantikan sesi sebelumnya), header `X-CSRF-Token` otomatis dari
  variable `{{csrfToken}}` yang di-set tiap login.
