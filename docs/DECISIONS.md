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
