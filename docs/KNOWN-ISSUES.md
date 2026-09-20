# Known Issues — SHE Sasa (Sistem Informasi K3)

Hasil audit arsitektur Phase 1, tercatat **sebelum** refactoring dimulai.
Tujuan dokumen ini: memisahkan "perilaku yang memang begitu" dari "perilaku yang rusak",
supaya aturan *preserve behavior* selama refactoring punya acuan yang jujur.

Tanggal audit: 2026-09-19
Baseline commit: `4734b5c` · Nomor baris disegarkan setelah Phase 9.

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
| Lokasi | Definisi: `src/presentation/components/lightbox.js:22`. Pendaftaran aksi: `src/legacy-app.js:720`. Titik panggil (`data-action="openLightbox"`): `src/legacy-app.js:269` (dead code `renderGallery`), `src/presentation/views/detail-modal.view.js:30`, `src/presentation/views/perbaikan-modal.view.js:39` |

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
| Status | **FIX** — Phase 10 (lifecycle) |
| Lokasi | `src/legacy-app.js:172` (submit `#loginForm`), `src/legacy-app.js:216`, `src/legacy-app.js:690` |

Tiga jalur memicu submit untuk satu penekanan Enter:
1. `document.getElementById('loginForm').addEventListener('submit', handleLogin)` (baris 172) — submit implisit browser saat Enter ditekan di dalam form. Sebelum Phase 9 ini `onsubmit="handleLogin(event)"` inline; perilakunya sama persis, cuma cara pemasangannya yang berubah.
2. listener `keydown` pada `document` (baris 216 di `src/legacy-app.js`) yang memanggil `form.dispatchEvent(new Event('submit'))`
3. listener `keydown` pada `#loginPassword` (baris 690 di `src/legacy-app.js`) yang melakukan hal yang sama

Akibatnya `setTimeout(initApp, 300)` terjadwal 2–3 kali, yang langsung memicu D-3.
Login lewat klik tombol "Masuk" hanya memanggil sekali.

---

## D-3 — `initApp()` tidak idempotent: crash pada pemanggilan kedua

| | |
|---|---|
| Severity | HIGH |
| Status | **FIX** — Phase 10 (lifecycle) |
| Lokasi | `src/presentation/views/charts.view.js:107` (`initCharts`), bandingkan `src/presentation/views/charts.view.js:30` (`renderTemuanPlantChart`) — keduanya dipindah dari `legacy-app.js` pada Phase 8 |

`renderTemuanPlantChart()` sudah benar (`destroy()` sebelum `new Chart()`), tetapi
`initCharts()` membuat `perbaikanChart` **tanpa** destroy.

Chart.js 4.4.0 (versi yang di-pin) memiliki guard eksplisit di constructor:

```js
constructor(t,e){ … const o=Dn(n); if(o) throw new Error("Canvas is already in use…") }
```

Pemanggilan kedua melempar exception dan **membatalkan sisa `initApp()`**, sehingga
`refreshAll()`, `updateClock()`, dan kedua `setInterval()` tidak pernah dijalankan pada run itu.

Pemicu: D-2 (login via Enter) dan logout → login ulang.
Efek samping tambahan: `initPlantSelect()` dan `setupSearch()` memasang listener berulang
sebelum exception terjadi.

---

## D-4 — Badge notifikasi permanen bernilai 0

| | |
|---|---|
| Severity | LOW |
| Status | **DITUNDA** — butuh aturan bisnis |
| Lokasi | `src/presentation/views/tables.view.js:129` (`renderJadwalTable`), `src/presentation/views/tables.view.js:20` (`updateNotifBadge`) — dipindah dari `legacy-app.js` pada Phase 8 |

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
| Status | **FIX (sebagian)** — Phase 11 |
| Lokasi | `src/legacy-app.js:623` (`syncToGoogleSheets`), `src/legacy-app.js:637` (relabel di blok `finally`) |

Dua hal berbeda:

1. **Akan diperbaiki.** Label awal tombol adalah "Sync", tetapi blok `finally` mengembalikannya
   menjadi "Sync Google Sheets". Setelah klik pertama, label ketiga tombol berubah permanen.
2. **Tidak diubah.** Fungsi `syncToGoogleSheets()` tidak menghubungi Google Sheets sama sekali —
   ia membuat file `.xlsx` dan mengunduhnya. Ini memang perilaku yang dirancang (tidak ada backend).
   Penamaan yang menyesatkan dicatat di sini, tetapi mengubah nama/fungsinya adalah keputusan
   produk, bukan refactoring.

---

## D-6 — `colspan` empty-state tidak sesuai jumlah kolom

| | |
|---|---|
| Severity | LOW (kosmetik) |
| Status | **FIX** — Phase 11 |
| Lokasi | `src/presentation/views/tables.view.js:37` — dipindah dari `legacy-app.js` pada Phase 8 |

Baris "Tidak ada data ditemukan" memakai `colspan="10"`, sedangkan tabel Dashboard punya
7 kolom dan tabel Inspeksi punya 9 kolom.

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
- **Dead code** yang akan dihapus pada Phase 11: `renderGallery()` di `src/legacy-app.js:259` (didefinisikan, tidak dipakai),
  `<audio id="alertSound">` di `index.html:405` (tidak pernah disentuh), field `lat`/`lng` (tidak pernah dirender).
