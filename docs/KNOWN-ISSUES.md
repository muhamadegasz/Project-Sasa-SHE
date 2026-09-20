# Known Issues — SHE Sasa (Sistem Informasi K3)

Hasil audit arsitektur Phase 1, tercatat **sebelum** refactoring dimulai.
Tujuan dokumen ini: memisahkan "perilaku yang memang begitu" dari "perilaku yang rusak",
supaya aturan *preserve behavior* selama refactoring punya acuan yang jujur.

Tanggal audit: 2026-09-19
Baseline commit: `4734b5c` · Nomor baris disegarkan setelah Phase 11.

Status:
- **FIX** — akan diperbaiki selama refactoring (fase disebutkan)
- **DITUNDA** — butuh keputusan bisnis dari pemilik project
- **CATATAN** — bukan defect, tapi perlu diketahui

---

## D-1 — Lightbox tidak dapat dibuka sama sekali

| | |
|---|---|
| Severity | HIGH |
| Status | **SELESAI** — diperbaiki pada Phase 3 (jsArg). Phase 7 memindahkan `openLightbox`/`closeLightbox`/`navigateLightbox` ke `presentation/components/lightbox.js`. Phase 9 menuntaskan rekomendasi "Perbaikan" di bawah: atribut `onclick` inline diganti `data-action="openLightbox" data-images="..." data-index="..."` + event delegation lewat `presentation/controllers/action-dispatcher.js`. |
| Lokasi | Definisi: `src/presentation/components/lightbox.js:22`. Pendaftaran aksi: `src/legacy-app.js:702`. Titik panggil (`data-action="openLightbox"`): `src/presentation/views/detail-modal.view.js:30`, `src/presentation/views/perbaikan-modal.view.js:39` |

Markup dibangun dengan `onclick="openLightbox(${JSON.stringify(images)}, ${idx})"`.
`JSON.stringify` menghasilkan tanda kutip ganda, sedangkan atribut juga memakai kutip ganda,
sehingga atribut tertutup lebih awal.

**Terverifikasi** dengan mem-parse markup hasil generate memakai engine HTML sungguhan (MSHTML):

```
input : <div class="gallery-item" onclick="openLightbox(["foto.jpg"], 0)" title="Klik untuk preview">
hasil : onclick   = 'openLightbox(['        <-- terpotong, SyntaxError saat diklik
        title     = 'Klik untuk preview'
        class     = 'gallery-item'
        'foto.jpg],' = ''                   <-- atribut sampah
        '0)'         = ''                   <-- atribut sampah
```

Dampak: fitur Gallery/Lightbox **tidak berfungsi sama sekali** di detail modal maupun modal
perbaikan. Ini juga temuan keamanan S-03 (HTML attribute injection): nama file yang mengandung
`"` dapat keluar dari atribut.

Perbaikan: hentikan pengiriman data lewat atribut `onclick`; pakai `data-*` + event delegation,
dan escape seluruh nilai atribut. **Diterapkan pada Phase 9** — lihat docs/DECISIONS.md K-13.

---

## D-2 — Login via Enter memanggil `handleLogin` 2–3 kali

| | |
|---|---|
| Severity | MEDIUM |
| Status | **SELESAI** — Phase 10 |
| Lokasi | `src/legacy-app.js:172` (satu-satunya listener submit yang tersisa), `src/legacy-app.js:674` (`#loginUsername`, kini dengan `preventDefault()`) |

Dulu tiga jalur memicu submit untuk satu penekanan Enter: submit implisit form (native
browser), listener `keydown` pada `document` yang men-dispatch submit manual, dan listener
`keydown` khusus pada `#loginPassword` yang melakukan hal yang sama. Ketiganya menjalankan
`handleLogin` untuk satu penekanan Enter yang sama, menjadwalkan `setTimeout(initApp, 300)`
2-3 kali, yang memicu D-3.

**Perbaikan:** kedua listener `keydown` yang men-dispatch submit manual dihapus — submit
form native saja sudah cukup, keduanya murni duplikat. Listener `keydown` pada
`#loginUsername` (yang memindahkan fokus ke `#loginPassword`, bukan submit) dipertahankan
tapi diberi `event.preventDefault()`, supaya Enter di situ **hanya** memindahkan fokus, tidak
ikut submit form dengan password yang mungkin masih kosong. Hasil akhir: tepat satu jalur
submit (`addEventListener('submit', handleLogin)`), untuk Enter di field mana pun.

Diuji lewat `test-lifecycle.mjs`: dispatch `keydown` Enter ke `document` dan ke
`#loginPassword` dipastikan tidak lagi memicu dispatch `submit` tambahan; Enter di
`#loginUsername` dipastikan memanggil `preventDefault()` dan memindahkan fokus tanpa ikut
submit.

---

## D-3 — `initApp()` tidak idempotent: crash pada pemanggilan kedua

| | |
|---|---|
| Severity | HIGH |
| Status | **SELESAI** — Phase 10 |
| Lokasi | `src/presentation/views/charts.view.js:107` (`initCharts`, destroy sebelum re-create), `src/legacy-app.js:627` (`appInitialized`, penjaga setup sekali-jalan) |

`renderTemuanPlantChart()` sudah benar (`destroy()` sebelum `new Chart()`), tetapi
`initCharts()` membuat `perbaikanChart` **tanpa** destroy. Chart.js 4.4.0 (versi yang di-pin)
memiliki guard eksplisit di constructor yang melempar `"Canvas is already in use…"` pada
pemanggilan kedua, membatalkan sisa `initApp()` untuk run itu.

**Perbaikan, dua lapis:**
1. `initCharts()` sekarang men-destroy `perbaikanChart` yang lama (jika ada) sebelum membuat
   yang baru — menyamakan pola dengan `renderTemuanPlantChart()`. Ini sendiri sudah cukup
   membuat `initApp()` tidak lagi crash pada pemanggilan kedua.
2. **Tapi** menghilangkan crash saja tidak cukup — `initPlantSelect()`, `setupSearch()` (4×),
   dan `setInterval()` di dalam `initApp()` MEMASANG listener/timer baru setiap kali dipanggil.
   Sebelum fix ini, efek itu sudah terjadi diam-diam pada setiap pemanggilan kedua (bagian ini
   dieksekusi SEBELUM titik crash di kode lama) — cuma tidak terlihat karena `refreshAll()`
   dan `setInterval()` di baris-baris setelahnya tidak sempat berjalan. Begitu crash-nya
   ditutup tanpa mengatasi ini, aplikasi tidak lagi error tapi diam-diam menumpuk listener dan
   timer duplikat setiap kali pengguna logout lalu login lagi. Ditangani dengan penjaga
   `appInitialized`: bagian yang memasang listener/timer hanya berjalan pada panggilan
   pertama; bagian yang menyegarkan tampilan (form default, chart, tabel) tetap berjalan di
   setiap login.

Diuji lewat `test-lifecycle.mjs` dengan simulasi login → logout → login (dua kali berturut):
tidak ada exception, chart di-destroy sebelum dibuat ulang, dan jumlah listener pada
`#searchInspeksiInput`/`#plantSearchInput` serta jumlah pemanggilan `setInterval` **tidak
bertambah** setelah login kedua/ketiga.

---

## D-4 — Badge notifikasi permanen bernilai 0

| | |
|---|---|
| Severity | LOW |
| Status | **DITUNDA** — butuh aturan bisnis |
| Lokasi | `src/presentation/views/tables.view.js:130` (`renderJadwalTable`), `src/presentation/views/tables.view.js:20` (`updateNotifBadge`) — dipindah dari `legacy-app.js` pada Phase 8 |

`notifCount` diinisialisasi `0` di `renderJadwalTable()` dan **tidak pernah di-increment**,
lalu diteruskan ke `updateNotifBadge()`.

Ini bukan defect melainkan fitur yang belum selesai: belum ada definisi apa yang dihitung
sebagai notifikasi. Memperbaikinya = menambah business rule baru, bukan refactoring.

**Perlu keputusan pemilik project** sebelum dikerjakan. Kandidat aturan:
jadwal yang overdue, approval yang menunggu giliran, perbaikan yang lewat due date,
atau kombinasinya.

Selama refactoring: struktur `updateNotifBadge(count)` dipertahankan apa adanya.

---

## D-5 — Tombol "Sync" berubah label & tidak benar-benar sync

| | |
|---|---|
| Severity | LOW |
| Status | **SELESAI (sebagian)** — Phase 11 |
| Lokasi | `src/legacy-app.js:588` (`syncToGoogleSheets`), `src/legacy-app.js:602` (relabel di blok `finally`) |

Dua hal berbeda:

1. **Diperbaiki.** Label awal tombol adalah "Sync", tetapi blok `finally` mengembalikannya
   menjadi "Sync Google Sheets" — label berubah permanen setelah klik pertama. `finally` sekarang
   mengembalikan label persis ke "Sync", sama seperti markup awal di `index.html`.
2. **Tidak diubah (disengaja).** Fungsi `syncToGoogleSheets()` tidak menghubungi Google Sheets
   sama sekali — ia membuat file `.xlsx` dan mengunduhnya. Ini memang perilaku yang dirancang
   (tidak ada backend). Penamaan yang menyesatkan dicatat di sini, tetapi mengubah nama/fungsinya
   adalah keputusan produk, bukan refactoring.

Diuji lewat `test-cosmetic.mjs`: klik tombol Sync, pastikan label akhir persis "Sync" (bukan
"Sync Google Sheets") dan tombol tidak lagi `disabled`.

---

## D-6 — `colspan` empty-state tidak sesuai jumlah kolom

| | |
|---|---|
| Severity | LOW (kosmetik) |
| Status | **SELESAI** — Phase 11 |
| Lokasi | `src/presentation/views/tables.view.js:36` — dipindah dari `legacy-app.js` pada Phase 8 |

Baris "Tidak ada data ditemukan" pada `renderInspeksiTable()` (dipakai bersama oleh tabel
Dashboard dan tabel Inspeksi lengkap) memakai `colspan="10"` tetap, padahal tabel Dashboard
punya 7 kolom dan tabel Inspeksi lengkap punya 9 kolom — keduanya salah, tidak ada yang
benar-benar 10 kolom.

**Perbaikan:** `colspan` dihitung dari parameter `isFull` yang sudah ada (`isFull ? 9 : 7`),
bukan angka tetap. Tabel Jadwal (`colspan="8"`) dan tabel Perbaikan (`colspan="9"`) sudah
benar sejak awal — tidak disentuh.

Diuji lewat `test-cosmetic.mjs`: render keempat tabel dalam keadaan kosong, cek atribut
`colspan` pada markup yang dihasilkan cocok dengan jumlah kolom sungguhan di setiap tabel.

---

## D-7 — Generator jadwal: 6 jadwal (bukan 12) dan satu cabang tidak pernah tercapai

| | |
|---|---|
| Severity | CATATAN |
| Status | **CATATAN** — tidak diubah, tapi wajib dipahami saat verifikasi |
| Lokasi | `src/data/schedules.seed.js:19`–`src/data/schedules.seed.js:79` |

Diuji dengan menjalankan `generateWeeklySchedule()` sebanyak 2000 kali di Node:

```
jumlah jadwal        : 6 – 6   (stabil, tidak bervariasi antar reload)
rentang diffDays     : 15.4 – 22.4 hari ke depan
jadwal dgn realisasi : 0
```

Dua konsekuensi:

1. Komentar `// Setiap plant punya 2 jadwal` tidak akurat. Iterasi kedua (`i = 1`) menghasilkan
   offset ≥ 28 hari dan **selalu** tersaring oleh `if (diffDays > 35) continue`. Hasil riil:
   6 plant × 1 jadwal.
2. `const isRealisasi = Math.random() < 0.3 && diffDays < 0` mensyaratkan tanggal di masa lalu,
   padahal seluruh tanggal yang lolos filter berada 15–22 hari **ke depan**. Cabang ini
   **tidak pernah tercapai**, sehingga `tanggalRealisasi` selalu `null` dan `status` selalu `'aktif'`.

**Dampak pada verifikasi (penting).** Dengan data demo saja, code path berikut tidak pernah
dieksekusi dan regresi di dalamnya tidak akan terdeteksi:

- Tabel Jadwal: status `✅ Selesai` dan badge `⚠️ Overdue`
- Kalender: dot `completed`, `mixed`, dan `overdue` (hanya `scheduled` yang muncul)
- `showDayEvents()`: cabang realisasi
- Statistik "Jadwal Aktif" selalu sama dengan total jadwal

Karena itu checklist verifikasi **wajib** menyertakan pembuatan jadwal manual dengan tanggal
lampau dan dengan tanggal realisasi terisi. Lihat `VERIFICATION.md` bagian C-7 dan C-8.

Efek positif: karena `Math.random()` tidak pernah mengubah hasil, data jadwal bersifat
deterministik, sehingga perbandingan baseline antar fase dapat diandalkan.

---

## Catatan tambahan yang tidak berstatus defect

- **Tidak ada persistence.** Tidak ada `localStorage`, `sessionStorage`, maupun `fetch`.
  Seluruh perubahan data hilang saat halaman di-reload. Ini perilaku yang dipertahankan.
- **Tanggal bersifat relatif.** `getDateOffset()` menghitung dari hari ini, sehingga nilai tanggal
  pada data demo berubah setiap hari. Saat membandingkan baseline antar hari, bandingkan
  *struktur dan status*, bukan string tanggal.
- **Dead code — dihapus pada Phase 11:** `renderGallery()` (dulu `src/legacy-app.js:242`, tidak
  pernah dipanggil — `data-action="openLightbox"` di detail/perbaikan modal sudah membangun
  markup galeri sendiri lewat `detail-modal.view.js`/`perbaikan-modal.view.js`), `<audio
  id="alertSound">` (dulu `index.html:401`, tidak pernah disentuh JS), field `lat`/`lng` pada
  objek inspeksi (dulu di `src/data/inspections.seed.js` dan `src/services/inspection-service.js`,
  tidak pernah dirender di mana pun). Diverifikasi lewat `grep` project-wide sebelum dihapus dan
  lewat `test-cosmetic.mjs` setelahnya (inspeksi baru tidak lagi membawa `lat`/`lng`).
