# Verification Checklist — Refactoring SHE Sasa

Kontrak verifikasi untuk setiap fase refactoring. Aturannya sederhana:
**sebuah fase belum selesai sampai seluruh checklist di bawah lulus.**

Baseline commit: `4734b5c` · Disusun pada Phase 0.

---

## Cara menjalankan aplikasi

| Fase | Cara buka | Alasan |
|---|---|---|
| Phase 0 – 1 | `file:///C:/laragon/www/Project-Sasa-SHE/index.html` **atau** via Laragon | Masih `<script>` classic |
| **Phase 2 dan seterusnya** | **Wajib** `http://localhost/Project-Sasa-SHE/` (Laragon) | ES modules diblokir CORS pada `file://` |

Kredensial demo: `sasapolkesma` / `sasapolkesma`.

> Mulai Phase 2, membuka `index.html` dengan double-click **tidak akan bekerja**.
> Ini konsekuensi yang disengaja dari migrasi ke ES modules, bukan regresi.

---

## Aturan pengisian

1. Jalankan checklist ini **lengkap** di akhir setiap fase — bukan hanya bagian yang disentuh.
   Coupling tersembunyi (lihat A-2 pada laporan audit: render dipicu lewat synthetic `input` event)
   membuat perubahan di satu tempat dapat mematikan fitur yang tampaknya tidak berhubungan.
2. **Console browser harus bersih.** Tidak boleh ada `ReferenceError`, `TypeError`, atau
   `Canvas is already in use`. Satu error = fase gagal.
3. Item bertanda 🔴 adalah jalur yang pernah rusak atau berisiko tinggi — periksa ekstra teliti.
4. Item bertanda 🧪 tidak dapat diuji dengan data demo saja dan **wajib** disiapkan manual
   (lihat `KNOWN-ISSUES.md` D-7).
5. Catat hasil per fase di bagian "Log Hasil" di bawah.

---

## A. Static checks (dijalankan dari root project)

| # | Perintah | Hasil yang diharapkan |
|---|---|---|
| A-1 | Syntax check ESM: salin tiap berkas `src/**` ke `*.mjs` lalu `node --check` (node memperlakukan `.js` sebagai CommonJS, sehingga `export` akan salah dilaporkan sebagai error) | Tidak ada syntax error |
| A-2 | Cari `onclick=` di `index.html` dan `src/` | **0** hasil sejak Phase 9 selesai |
| A-3 | Cari `document.` / `window.` / `innerHTML` di `src/domain/` | **0** hasil — domain harus bebas DOM |
| A-4 | Cari `showToast` / `innerHTML` di `src/services/` | **0** hasil — service tidak menyentuh UI |
| A-5 | Cari `new Chart` di `src/` | Hanya di `presentation/views/charts.view.js` |
| A-6 | Cari `XLSX.` di `src/` | Hanya di `services/excel-exporter.js` |
| A-7 | Cari `html2pdf` di `src/` | Hanya di `services/pdf-exporter.js` |
| A-8 | DevTools → tab Network | Semua file `src/` dan `assets/css/` status 200, tidak ada 404 |

---

## B. Authentication

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| B-1 | Login `sasapolkesma` / `sasapolkesma` via **klik tombol Masuk** | Masuk ke dashboard, toast "Selamat datang" |
| B-2 | Login dengan password salah | Pesan error merah muncul, hilang sendiri setelah ±3 detik, field password dikosongkan dan di-fokus |
| B-3 | Login dengan username salah | Sama seperti B-2 |
| B-4 | 🔴 Login dengan menekan **Enter** di field password | Masuk ke dashboard. Console bersih. `handleLogin` dieksekusi **sekali** (D-2) |
| B-5 | Tekan Enter di field username | Fokus berpindah ke field password |
| B-6 | Klik logout → konfirmasi OK | Kembali ke halaman login, field dikosongkan, toast "Anda telah keluar" |
| B-7 | Klik logout → Cancel | Tetap di aplikasi, tidak ada perubahan |
| B-8 | 🔴 Logout lalu login ulang **3 kali berturut-turut** | Dashboard tampil utuh setiap kali, chart tetap muncul, console bersih — khususnya tanpa `Canvas is already in use` (D-3) |
| B-9 | Setelah B-8, buka panel Jadwal dan ketik di search | Hasil benar, tidak ada render ganda / listener berlipat |

---

## C. Penjadwalan & Kalender

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| C-1 | Buka panel Penjadwalan | Tabel berisi **6 baris** jadwal (lihat D-7), 8 kolom |
| C-2 | Ketik nama plant di search jadwal | Baris terfilter, teks cocok ter-highlight, counter "N dari 6" muncul |
| C-3 | Klik tombol × pada search | Search kosong, seluruh 6 baris kembali |
| C-4 | Klik "Tambah" → isi plant, minggu, periode, tahun, tanggal, officer → Simpan | Toast sukses, baris baru muncul, modal tertutup |
| C-5 | Simpan tanpa memilih plant | Toast "Silakan pilih Plant", data tidak tersimpan |
| C-6 | Simpan tanpa officer / tanpa tanggal | Toast peringatan yang sesuai untuk masing-masing |
| C-7 | 🧪 Buat jadwal dengan **tanggal lampau**, realisasi kosong | Kolom Status menampilkan `⚠️ Overdue`, badge OVERDUE muncul di kolom tanggal |
| C-8 | 🧪 Edit jadwal itu → klik "Set Hari Ini" pada Tanggal Realisasi → Simpan | Kolom Status berubah jadi `✅ Selesai`, kolom Tanggal Realisasi terisi |
| C-9 | Klik edit pada sebuah baris | Modal terbuka dengan **seluruh** field terisi sesuai data, termasuk plant terpilih |
| C-10 | Klik hapus → OK | Baris hilang, toast konfirmasi |
| C-11 | Klik hapus → Cancel | Baris tetap ada |
| C-12 | Dashboard: navigasi kalender maju/mundur satu bulan | Nama bulan & tahun berubah benar, grid tanggal sesuai |
| C-13 | Navigasi melewati Desember → Januari, dan Januari → Desember | Tahun ikut bertambah/berkurang |
| C-14 | Klik tanggal yang punya titik event | Modal "Detail Jadwal" terbuka berisi plant, periode, minggu, officer |
| C-15 | 🧪 Setelah C-7/C-8, cek warna dot kalender | Dot `overdue` (merah) dan `completed` (hijau) muncul — bukan hanya `scheduled` |
| C-16 | Klik tanggal tanpa event | Tidak ada modal; toast "Tidak ada jadwal pada tanggal ini" |

---

## D. Dashboard

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| D-1 | Amati 4 kartu statistik | Total Inspeksi, Total Temuan, Jadwal Aktif, Selesai Perbaikan konsisten dengan isi tabel |
| D-2 | Chart "Temuan per Plant" | Chart bar tampil, label plant terbaca, tinggi bar sesuai jumlah temuan |
| D-3 | Chart "Status Perbaikan" | Doughnut tampil dengan 3 segmen: Closed / On Progress / Open |
| D-4 | Tambah tindakan perbaikan (G-4) lalu kembali ke Dashboard | Kedua chart **dan** statistik ter-update |
| D-5 | Klik "Kelola" di header kalender | Pindah ke panel Penjadwalan, tab aktif ikut berubah |
| D-6 | Klik setiap tab navigasi bergantian | Panel yang benar tampil, tab aktif ter-highlight, search direset |
| D-7 | Header aplikasi | Hanya berisi logo, lonceng notifikasi, dan profil pengguna. Badge jam, "Online", dan tanggal sudah **dihapus** (K-6) — ketiganya tidak boleh muncul |

---

## E. Inspeksi

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| E-1 | Tabel "Inspeksi Terbaru" di Dashboard | 7 kolom; progress bar dan label status per baris |
| E-2 | Panel Inspeksi → "Semua Data Inspeksi" | 9 kolom termasuk Keterangan Lokasi dan Pengesahan |
| E-3 | Search Dashboard (id, lokasi, petugas, status, dueDate) | Filter benar untuk kelima field, highlight muncul |
| E-4 | Search panel Inspeksi (termasuk keteranganLokasi) | Filter benar, counter akurat |
| E-5 | Ketik kata yang tidak ada | Baris "Tidak ada data ditemukan", counter "0 dari N" |
| E-6 | 🔴 Perhatikan lebar baris empty-state | `colspan` sesuai jumlah kolom tabel (D-6) |
| E-7 | Klik tombol mata (detail) | Modal detail lengkap: ID, status, lokasi, keterangan, tanggal, officer, due date, temuan, foto, pengesahan |
| E-8 | Inspeksi dengan due date lampau | Badge merah "OVERDUE" tampil |
| E-9 | Cek progress bar | Persentase = (tindakan closed / total tindakan) × 100, warna sesuai status |

---

## F. Approval / Pengesahan

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| F-1 | Buka modal pengesahan pada inspeksi yang baru dibuat | Tahap 1 sudah disetujui, tahap 2 "Menunggu Persetujuan", tahap 3–4 "Belum mencapai tahap ini" |
| F-2 | Tombol Setujui/Tolak | Hanya muncul pada tahap saat ini |
| F-3 | Setujui tahap 2 | Toast konfirmasi, tahap 2 jadi "✅ Disetujui", tahap 3 jadi tahap aktif, modal ter-render ulang |
| F-4 | Setujui tahap 3 lalu tahap 4 | Setelah tahap 4: toast "Semua tahap pengesahan telah disetujui", status inspeksi jadi `selesai` |
| F-5 | Kolom Pengesahan di tabel Inspeksi | Menampilkan `1/4` … `3/4`, lalu `✅ Lengkap` setelah 4/4 |
| F-6 | Tolak sebuah tahap → OK | Toast penolakan, status inspeksi jadi `tinjau` |
| F-7 | Tolak → Cancel | Tidak ada perubahan apa pun |
| F-8 | Setujui tahap yang sudah disetujui | Toast "Tahap ini sudah disetujui!" |
| F-9 | Urutan tahap | Tidak ada cara menyetujui tahap N sebelum tahap N−1 disetujui |

---

## G. Perbaikan / Corrective Action

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| G-1 | Panel Perbaikan | 9 kolom; hanya inspeksi yang punya tindakan perbaikan yang tampil |
| G-2 | Search perbaikan (id, lokasi, petugas, dueDate) | Filter dan highlight benar |
| G-3 | Buka modal perbaikan | Info box (ID, lokasi, due date, status, pengesahan, progres) + timeline tindakan |
| G-4 | Tambah progres: tindakan + status + PIC + minimal 1 foto → "Tambah Progres" | Toast sukses, timeline bertambah, progress bar & statistik ter-update, modal ter-render ulang |
| G-5 | Tambah progres tanpa deskripsi tindakan | Toast "Masukkan deskripsi tindakan", tidak tersimpan |
| G-6 | 🔴 Tambah progres tanpa foto | Toast "Wajib upload foto sebagai bukti progres!" — aturan ini **harus** dipertahankan |
| G-7 | Pilih file foto | Label "N file dipilih" ter-update |
| G-8 | Set seluruh tindakan menjadi `closed` | Progres 100%, status inspeksi jadi `selesai`, status perbaikan `Closed` |

---

## H. Form Buat Inspeksi

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| H-1 | Ketik di pencarian plant | Dropdown muncul, terfilter berdasarkan nama **dan** kode plant, teks cocok ter-highlight |
| H-2 | Ketik kata yang tidak cocok | "Tidak ada plant ditemukan" |
| H-3 | 🔴 Tekan **Enter** saat dropdown terbuka | Item pertama terpilih |
| H-4 | 🔴 Tekan **Escape** | Dropdown tertutup, input kehilangan fokus |
| H-5 | 🔴 Klik di luar dropdown | Dropdown tertutup |
| H-6 | Pilih plant | Tampil "✓ Nama Plant (KODE)", tombol clear (×) muncul |
| H-7 | 🔴 Klik tombol clear | Pilihan dikosongkan, input kosong dan di-fokus |
| H-8 | Tambah temuan (deskripsi + kategori) | Masuk ke daftar, counter "N temuan ditambahkan" ter-update |
| H-9 | Tekan Enter di field deskripsi temuan | Sama dengan klik tombol "Tambah" |
| H-10 | Tambah temuan tanpa deskripsi | Toast peringatan |
| H-11 | Hapus temuan dari daftar | Baris hilang, counter turun |
| H-12 | Simpan tanpa memilih plant | Toast peringatan, input plant diberi border merah ±3 detik |
| H-13 | Simpan tanpa temuan | Toast "Tambahkan minimal 1 temuan!" |
| H-14 | Simpan lengkap | Toast sukses; inspeksi baru muncul di **baris teratas**; tahap 1 otomatis disetujui; satu tindakan perbaikan `open` dibuat per temuan; form direset; tombol menampilkan spinner ±1 detik |
| H-15 | 🔴 Ulangi H-1..H-7 pada pemilih plant di **modal Jadwal** | Perilaku identik dengan form inspeksi (dua instance komponen yang sama) |

---

## I. Export

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| I-1 | Dashboard → "Export XLSX" | File `Inspeksi_K3.xlsx` terunduh; 12 kolom; berisi semua inspeksi |
| I-2 | Panel Inspeksi → "Export Semua Temuan" | File `Semua_Temuan_YYYY-MM-DD.xlsx`; satu baris per temuan; 11 kolom |
| I-3 | Tombol Excel pada satu baris inspeksi | File `Temuan_INS-nnn_YYYY-MM-DD.xlsx` berisi hanya temuan inspeksi itu |
| I-4 | Buka file hasil export | Lebar kolom sesuai; "Status Pengesahan" menampilkan `n/4` atau `✅ Lengkap (4/4)` |
| I-5 | Klik "Sync" | File `.xlsx` terunduh, toast "File Excel siap!" |
| I-6 | 🔴 Setelah klik Sync, perhatikan label tombol | Label tetap "Sync" — tidak berubah jadi "Sync Google Sheets" (D-5) |
| I-7 | Tombol PDF pada inspeksi yang **belum** 4/4 | Tombol disabled; jika dipaksa, toast "belum disetujui semua tahap" |
| I-8 | Tombol PDF pada inspeksi yang sudah 4/4 | Toast "Sedang membuat PDF", file `Laporan_Inspeksi_INS-nnn_YYYY-MM-DD.pdf` terunduh |
| I-9 | Buka PDF | Header, info inspeksi, tabel temuan, tabel perbaikan, 4 blok tanda tangan, stempel "DISETUJUI" tampil |

---

## J. Komponen UI

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| J-1 | Buka setiap modal (Jadwal, Detail, Perbaikan, Approval, Kalender) | Semua terbuka dengan benar |
| J-2 | Tutup setiap modal via tombol × | Tertutup |
| J-3 | Tutup setiap modal via klik backdrop | Tertutup |
| J-4 | 🔴 Detail modal → klik thumbnail foto | **Lightbox terbuka** (D-1 — rusak saat ini, harus berfungsi setelah Phase 7) |
| J-5 | 🔴 Modal perbaikan → klik thumbnail foto pada timeline | Lightbox terbuka |
| J-6 | Lightbox: tombol next / prev | Berpindah antar foto, counter "n dari N" ter-update |
| J-7 | Lightbox: panah kiri/kanan keyboard | Sama dengan J-6 |
| J-8 | Lightbox: tombol Escape | Tertutup, scroll halaman kembali normal |
| J-9 | Lightbox: klik backdrop | Tertutup |
| J-10 | Lightbox dengan 1 foto saja | Tombol next/prev disembunyikan |
| J-11 | Picu beberapa toast berurutan | Hanya satu toast tampil, timer di-reset, menghilang setelah 5 detik |
| J-12 | Ubah lebar browser ke ±768px dan ±480px | Layout tetap terbaca, tabel dapat di-scroll, nav tidak rusak |

---

## K. Regression test keamanan (berlaku setelah Phase 3)

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| K-1 | Buat temuan berdeskripsi `<img src=x onerror=alert(1)>` | Tampil sebagai **teks literal** di tabel, detail modal, dan PDF. Tidak ada alert |
| K-2 | Isi Keterangan Lokasi dengan `"><script>alert(1)</script>` | Tampil sebagai teks literal, markup tidak rusak |
| K-3 | Isi PIC perbaikan dengan `<b>tebal</b>` | Tampil sebagai teks literal, bukan huruf tebal |
| K-4 | Isi nama Safety Officer jadwal dengan tanda kutip ganda | Tabel jadwal tetap utuh, tidak ada atribut rusak |
| K-5 | Cari dengan query `<b>` di search | Highlight bekerja, tidak ada HTML ter-render |
| K-6 | Upload foto dengan nama file mengandung tanda kutip ganda, lalu buka lightbox | Lightbox tetap berfungsi (terkait D-1 / S-03) |
| K-7 | Buat temuan berisi `=1+1`, export XLSX, buka di Excel | Sel tidak dievaluasi sebagai formula (berlaku setelah mitigasi S-04 disetujui) |

---

## L. Lifecycle (berlaku penuh setelah Phase 10)

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| L-1 | Login → logout → login, ulangi 3× | Tidak ada error di console |
| L-2 | Setelah L-1, ketik satu karakter di search | Render terjadi **sekali**, bukan berlipat (cek dengan `console.count` atau breakpoint) |
| L-3 | Setelah logout, amati jam di header | Interval dihentikan saat logout, timer tidak menumpuk |
| L-4 | Setelah login ulang, amati chart | Kedua chart tampil normal (chart lama sudah di-destroy) |
| L-5 | Biarkan aplikasi terbuka >30 detik | Refresh berkala tabel jadwal + kalender berjalan tepat sekali per 10 detik |

---

## Log Hasil

Isi dengan `OK` / `GAGAL` / `n/a` per kelompok.

| Fase | Tanggal | A | B | C | D | E | F | G | H | I | J | K | L | Catatan |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Phase 0 — baseline | | n/a | | | | | | | | | | n/a | n/a | J-4/J-5 diharapkan **GAGAL** (D-1); B-8 diharapkan **GAGAL** (D-3) |
| Phase 1 — CSS | | | | | | | | | | | | | | |
| Phase 2 — ES modules | | | | | | | | | | | | | | |
| Phase 3 — shared + escaping | | | | | | | | | | | | | | |
| Phase 4 — data + repository | | | | | | | | | | | | | | |
| Phase 5 — domain | | | | | | | | | | | | | | |
| Phase 6 — services | | | | | | | | | | | | | | |
| Phase 7 — components | | | | | | | | | | | | | | |
| Phase 8 — presenters + views | | | | | | | | | | | | | | |
| Phase 9 — controllers | | | | | | | | | | | | | | |
| Phase 10 — lifecycle | | | | | | | | | | | | | | |
| Phase 11 — cleanup | | | | | | | | | | | | | | |
