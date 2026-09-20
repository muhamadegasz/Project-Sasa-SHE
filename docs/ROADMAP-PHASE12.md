# Phase 12+ — Backend, Database, dan Role Sungguhan untuk SHE Sasa

> Dokumen perencanaan (bukan hasil implementasi). Ditulis pada 2026-09-20 lewat plan mode,
> disetujui oleh pemilik project. Requirement digali dari kode yang sudah direfactor sendiri
> (klien tidak mengirim spesifikasi tertulis) — lihat bagian Context.
>
> **Status: Phase 12 (scaffold backend + skema + seed data) SELESAI diimplementasikan**
> pada 2026-09-20. Tiga hal di rencana ini ternyata perlu dikoreksi begitu diimplementasikan
> dan diuji terhadap MySQL sungguhan (bukan cuma dibaca) — lihat `docs/DECISIONS.md` K-18 untuk
> rincian lengkap dan alasannya. Ringkas: (1) approvals/temuan/perbaikan TETAP tabel relasional
> terpisah seperti skema di bawah (dikonfirmasi eksplisit ke pemilik project — bukan kolom
> JSON), yang berarti 3 service (`approval-service.js`, `corrective-action-service.js`,
> `schedule-service.js`) butuh pemanggilan penyimpanan eksplisit, bukan sekadar mutate-in-place
> seperti sebelumnya; (2) seluruh service jadi `async` (konsekuensi tak terhindarkan dari MySQL
> sungguhan), merambat ke beberapa titik di `src/legacy-app.js`; (3) pemisahan repository
> browser vs backend butuh *import map* (`index.html`) + Node `--conditions=server`
> (`package.json`), bukan sekadar "folder terpisah" seperti yang dituliskan di bawah — path
> relatif tetap di dalam `src/services/*.js` tidak bisa diarahkan berbeda tanpa mekanisme itu.
> Skema database, permukaan API, dan matriks role di bawah **tidak berubah** dari yang
> disetujui — hanya *bagaimana* itu semua terhubung yang dikoreksi.
>
> **Status: Phase 13 (auth sungguhan: bcrypt + session + CSRF) SELESAI diimplementasikan**
> pada 2026-09-20, menutup S-01 dan S-07. `server/middleware/dev-auth.js` (header `X-Dev-User`)
> dihapus total. Tiga penyesuaian teknis terhadap rencana — lihat `docs/DECISIONS.md` K-20:
> (1) session store MySQL ditulis sendiri (`server/db/session-store.js`), BUKAN paket
> `express-mysql-session` — paket itu membawa `mysql2` versinya sendiri yang kena dua advisory
> *high severity*; (2) CSRF ditulis manual (synchronizer token, `server/middleware/csrf.js`),
> bukan paket `csurf` (sudah tidak dipelihara); (3) `src/config/demo-auth.js` **belum** dihapus —
> menyimpang dari teks rencana ini — karena masih dipakai demo browser yang berdiri sendiri
> sampai Phase 14 menyambungkannya ke API sungguhan; menghapusnya sekarang akan mematahkan demo
> sebelum waktunya. `approval-rules.buildApprovalRecord()`/`approval-service.approve()`/`reject()`
> sudah menerima `approver` sejak Phase 12 (K-18), jadi tidak ada perubahan lagi di titik itu.

## Context

Klien mengirim satu file HTML yang sudah kita refactor penuh (Phase 1-11) tanpa spesifikasi
requirement tertulis. Aplikasi saat ini 100% berjalan di browser: **tanpa persistence**
(reload = hilang semua data) dan **tanpa authentication sungguhan** — `src/config/demo-auth.js`
secara eksplisit didokumentasikan sebagai DEMO, bukan keamanan (docs/SECURITY.md S-01: "Untuk
produksi, authentication WAJIB dilakukan di sisi server").

Petunjuk requirement paling kuat justru sudah ada di dalam kode yang sudah kita audit sendiri:

- **4 tahap pengesahan** di `src/config/constants.js` (`APPROVAL_STAGES`) — Safety Officer,
  Koordinator K3L Bagian, Manajer Bagian, Ketua P2K3 — jelas mencerminkan 4 role organisasi
  sungguhan, bukan sekadar label UI.
- `src/domain/approval-rules.js` sendiri berkomentar bahwa tahap 2-4 disetujui atas nama
  literal `'Approver'` (bukan identitas sungguhan) dan itu "jelas merupakan kekurangan... butuh
  identitas pengguna yang sungguhan" (mengacu S-07: siapa pun yang login dapat menyetujui
  keempat tahap tanpa otorisasi apa pun).
- `src/data/officers.js` berkomentar: "pada sistem sungguhan, PIC diambil dari pengguna yang
  sedang login" — bukan diketik bebas seperti sekarang.
- `src/data/plants.js` (daftar 15 plant) eksplisit diberi catatan "bukan demo... mencerminkan
  unit kerja sungguhan" — ini bukan data mainan, ini data perusahaan nyata.
- D-4 (badge notifikasi permanen 0) sengaja **ditunda** di Phase 1-11 karena belum ada aturan
  bisnis — dan aturan yang paling natural (jumlah item yang menunggu approval dari role
  pengguna yang login) baru bisa ditulis SETELAH role sungguhan ada.

Kesimpulan: fase berikutnya bukan menambah fitur baru dari nol, melainkan **mewujudkan sistem
role-based yang sudah tersirat di dalam kode ini menjadi sungguhan** — backend Node.js +
Express + MySQL (dipilih user karena `src/domain/*.js` dan `src/services/*.js` adalah fungsi
murni tanpa DOM yang bisa dipakai ULANG APA ADANYA sebagai business-logic layer backend, tanpa
ditulis ulang ke bahasa lain — nilai refactoring 11 fase sebelumnya cair langsung di sini).

---

## Keputusan arsitektur inti

### 1. Repository sebagai satu-satunya seam yang berubah

`src/services/*.js` (misal `inspection-service.js`) meng-import repository lewat path relatif
tetap: `import * as inspectionRepository from '../repositories/inspection-repository.js'`.
Domain (`src/domain/*.js`) dan services **tidak perlu diubah sama sekali** — hanya
`src/repositories/*.js` yang berganti isi, dari array in-memory menjadi query MySQL (backend)
atau `fetch()` ke API (frontend, Phase 14).

**Satu pengecualian yang disengaja:** `approval-rules.buildApprovalRecord()` dan
`approval-service.approve()`/`reject()` hardcode `by: 'Approver'` untuk tahap 2-4 — ini harus
menerima parameter `approver` (identitas user sungguhan) untuk menutup S-07. Ini satu-satunya
titik domain/services yang sengaja disentuh, bukan cuma seam repository.

### 2. Backend TIDAK menimpa `src/repositories/*.js` — folder terpisah

Supaya demo browser tetap hidup selama Phase 12-13 (backend dibangun tapi frontend belum
disambungkan), backend Express punya repository-nya sendiri di `server/repositories/*.js`
(query MySQL), **bukan** menimpa `src/repositories/*.js` yang dipakai browser. `src/services/*.js`
dan `src/domain/*.js` di-import langsung oleh backend (path naik: `../../src/services/...`) —
kode fungsi bisnisnya benar-benar sama persis, cuma dipakai dari proses Node, bukan browser.

`src/repositories/*.js` (in-memory, dipakai browser) baru diubah SEKALI di Phase 14 — langsung
dari in-memory ke `fetch()` — bukan dua kali seperti pola "timpa lalu timpa lagi". Trade-off:
selama Phase 12-13 ada duplikasi bentuk (dua implementasi repository dengan signature fungsi
sama, satu MySQL satu in-memory) — ini disengaja dan sementara, ditukar dengan demo browser
yang tidak pernah rusak sepanjang migrasi.

### 3. ID: `AUTO_INCREMENT` numerik + kode tampilan dihitung, bukan tabel sequence custom

`INS-nnn`/`SCH-nnn` saat ini dihitung dari `array.length + 1` (repository lama) — sudah
diketahui rawan tabrakan begitu ada fitur hapus (`schedule-repository.remove()` sudah
menunjukkan ini). Solusi: kolom PK numerik `AUTO_INCREMENT` biasa (concurrency-safe secara
native di MySQL), kode `INS-003`/`SCH-014` dihitung dari nilai id itu di layer repository saat
dibaca — tidak perlu tabel sequence tambahan, tidak perlu logika atomic-increment manual.

---

## Skema database (MySQL)

```sql
-- users: mengganti satu login hardcoded (demo-auth.js) dengan akun sungguhan per orang
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name  VARCHAR(100) NOT NULL,
  role          ENUM('safety_officer','koordinator_k3l','manajer_bagian','ketua_p2k3','admin') NOT NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,      -- soft-disable, jangan hard-delete akun yang punya histori
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- plants: PLANT_LIST dipindah apa adanya. id 13 SENGAJA tidak ada (lihat src/data/plants.js) — jangan diisi ulang.
CREATE TABLE plants (
  id        INT PRIMARY KEY,             -- literal 1,2,3,4,5,6,7,8,9,10,11,12,14,15,16 dari PLANT_LIST, id baru lewat AUTO_INCREMENT mulai 17
  name      VARCHAR(100) NOT NULL,
  code      VARCHAR(20)  NOT NULL UNIQUE,
  is_active TINYINT(1)   NOT NULL DEFAULT 1
);

CREATE TABLE inspections (
  id                 INT AUTO_INCREMENT PRIMARY KEY,   -- kode tampilan "INS-003" = CONCAT('INS-', LPAD(id,3,'0')), dihitung di repository
  plant_id           INT          NOT NULL,
  keterangan_lokasi  VARCHAR(255) NULL,
  tanggal            DATE         NOT NULL,
  petugas            VARCHAR(100) NOT NULL,             -- nama tampilan, DIPAKSA dari user login di route handler (lihat Keamanan)
  petugas_user_id    INT          NOT NULL,
  status             ENUM('proses','selesai','tinjau') NOT NULL DEFAULT 'proses',  -- persis nilai INSPECTION_STATUS — dipakai sebagai class CSS di frontend, JANGAN diubah namanya
  due_date           DATE         NULL,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (plant_id) REFERENCES plants(id),
  FOREIGN KEY (petugas_user_id) REFERENCES users(id),
  INDEX idx_inspections_plant (plant_id),
  INDEX idx_inspections_status (status)
);

CREATE TABLE findings (                                 -- temuan
  id             INT AUTO_INCREMENT PRIMARY KEY,
  inspection_id  INT NOT NULL,
  deskripsi      TEXT NOT NULL,
  kategori       ENUM('Kebakaran','Kecelakaan','Kebocoran','Kesehatan','Kelistrikan','Lainnya') NOT NULL,  -- 6 nilai persis dari index.html #kategoriInput
  FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE
);

CREATE TABLE corrective_actions (                        -- perbaikan
  id             INT AUTO_INCREMENT PRIMARY KEY,
  inspection_id  INT NOT NULL,
  finding_id     INT NULL,                               -- diisi utk tindakan awal otomatis per temuan; NULL utk progres manual berikutnya
  tgl            DATE NOT NULL,
  action         TEXT NOT NULL,
  status         ENUM('open','on-progress','closed') NOT NULL,  -- persis nilai ACTION_STATUS (class CSS)
  pic            VARCHAR(100) NOT NULL,                    -- tetap teks bebas: PIC perbaikan tidak selalu user sistem
  FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE,
  FOREIGN KEY (finding_id) REFERENCES findings(id) ON DELETE SET NULL
);

CREATE TABLE approvals (                                  -- satu baris per inspeksi per tahap 1-4
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  inspection_id       INT NOT NULL,
  stage_id            TINYINT NOT NULL,                    -- APPROVAL_STAGES[].id, 1-4
  approved            TINYINT(1) NOT NULL DEFAULT 0,
  rejected            TINYINT(1) NOT NULL DEFAULT 0,
  approved_by_user_id INT NULL,                             -- identitas sungguhan — menutup S-07
  approved_by_name    VARCHAR(100) NULL,                     -- nama beku saat keputusan diambil (semantik audit)
  jabatan             VARCHAR(100) NOT NULL,
  decided_at          DATETIME NULL,
  FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id),
  UNIQUE KEY uq_inspection_stage (inspection_id, stage_id)
);

CREATE TABLE schedules (
  id                 INT AUTO_INCREMENT PRIMARY KEY,        -- kode tampilan "SCH-014" dihitung sama seperti inspections
  plant_id           INT NOT NULL,
  plant_name         VARCHAR(100) NOT NULL,                  -- cache denormalisasi, sesuai perilaku schedule-service.js saat ini
  periode            TINYINT NOT NULL,                       -- 1-4, PERIODE_LIST
  tahun              SMALLINT NOT NULL,
  minggu             TINYINT NOT NULL,                       -- 1-5
  tanggal_jadwal     DATE NOT NULL,
  tanggal_realisasi  DATE NULL,
  officer            VARCHAR(100) NOT NULL,
  officer_user_id    INT NULL,
  status             ENUM('aktif','selesai') NOT NULL DEFAULT 'aktif',  -- HANYA dua nilai ini yang pernah disimpan; 'terlambat' dihitung runtime oleh schedule-rules.getState(), tidak pernah persisted
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (plant_id) REFERENCES plants(id),
  FOREIGN KEY (officer_user_id) REFERENCES users(id)
);

CREATE TABLE photos (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  inspection_id         INT NULL,
  corrective_action_id  INT NULL,
  slot                  ENUM('dekat','jauh','perbaikan') NOT NULL,
  file_path             VARCHAR(255) NOT NULL,
  original_name         VARCHAR(255) NOT NULL,
  mime_type             VARCHAR(100) NOT NULL,
  size_bytes            INT NOT NULL,
  uploaded_by           INT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE,
  FOREIGN KEY (corrective_action_id) REFERENCES corrective_actions(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);
```

**Kenapa foto jadi tabel relasional, bukan kolom JSON:** hari ini `fotoDekat`/`fotoJauh` cuma
nama file yang DIKETIK (dikonfirmasi di `src/legacy-app.js`: `Array.from(...files).map(f =>
f.name)` — byte file-nya dibuang). Upload sungguhan (Phase 15) butuh metadata nyata (path,
mime, ukuran, siapa upload) yang FK-able dan bisa di-query ("temuan yang belum ada fotonya") —
kolom JSON kehilangan itu semua tanpa keuntungan balik.

---

## Role dan matriks permission

Role: **4 role approval yang sudah ada** + **1 role baru: `admin`**.

Kenapa perlu Admin baru: tidak satu pun dari 4 role approval secara alami memegang tanggung
jawab administrasi sistem (kelola akun user, kelola master data plant). Menumpangkannya ke
`ketua_p2k3` (role approval paling senior) mencampur senioritas organisasi dengan tanggung
jawab administrasi sistem — dua hal berbeda.

| Aksi | Safety Officer | Koord. K3L | Manajer Bagian | Ketua P2K3 | Admin |
|---|---|---|---|---|---|
| Buat inspeksi | **Ya** | - | - | - | - |
| Lihat semua data | Ya | Ya | Ya | Ya | Ya |
| Tambah tindakan perbaikan | **Ya** | - | - | - | - |
| Setujui/tolak tahap 1 | otomatis saat buat inspeksi, tidak ada aksi manual | | | | |
| Setujui/tolak tahap 2 | - | **Ya** | - | - | - |
| Setujui/tolak tahap 3 | - | - | **Ya** | - | - |
| Setujui/tolak tahap 4 | - | - | - | **Ya** | - |
| Buat/edit jadwal | **Ya** | lihat saja | lihat saja | lihat saja | **Ya** |
| Hapus jadwal | - | - | - | - | **Ya** |
| Kelola user | - | - | - | - | **Ya** |
| Kelola plant | - | - | - | - | **Ya** |
| Export PDF/Excel | Ya | Ya | Ya | Ya | Ya |

Penegakan approve/reject dua lapis: middleware `require-role` memastikan `req.user.role` cocok
dengan tahap yang diminta, dan `canApproveStage()` (sudah ada, `approval-rules.js`) tetap
memastikan tahap sebelumnya sudah disetujui — logic itu tidak diubah, cuma sekarang benar-benar
ditegakkan lewat identitas asli.

---

## Permukaan API (REST)

```
Auth
  POST   /api/auth/login          {username,password} -> cookie sesi HttpOnly, {user}
  POST   /api/auth/logout
  GET    /api/auth/me             401 bila belum login

Inspeksi
  GET    /api/inspections         ?q= ?status= ?plantId=
  GET    /api/inspections/:id     detail lengkap: temuan, perbaikan, approvals, foto
  POST   /api/inspections         Safety Officer saja; field `petugas` DIPAKSA dari req.user, bukan dari body
  POST   /api/inspections/:id/approve   {stageId} — role harus cocok tahap + tahap sebelumnya sudah approved
  POST   /api/inspections/:id/reject    {stageId}
  POST   /api/inspections/:id/corrective-actions   multipart: action, status, pic + file foto

Jadwal
  GET    /api/schedules           ?tahun= ?plantId= ?status=
  POST   /api/schedules           Safety Officer, Admin
  PUT    /api/schedules/:id       Safety Officer, Admin
  DELETE /api/schedules/:id       Admin saja (diperketat — saat ini siapa pun bisa hapus)

Plant (Admin untuk tulis)
  GET/POST/PUT/DELETE /api/plants

User (Admin saja)
  GET/POST/PUT /api/users, PUT /api/users/:id/password
```

Tidak ada endpoint export PDF/Excel di backend — `pdf-report.view.js` (pakai html2pdf, butuh
DOM nyata) dan `excel-exporter.js` tetap jalan di browser, mengambil data lewat API lalu
memproses seperti sekarang.

---

## Keamanan yang ditutup fase ini

- **S-01** (kredensial hardcoded di client) — diganti login sungguhan: `bcrypt` + `express-session`
  dengan cookie `HttpOnly`, persis rekomendasi eksplisit di `docs/SECURITY.md`.
- **S-07** (tanpa otorisasi approval) — role dicek di middleware SEBELUM memanggil
  `approval-service.approve()`, dan `by` di record approval sekarang identitas asli, bukan
  string `'Approver'`.
- **`petugas` dan `officer` tidak lagi input bebas** — route handler memaksanya dari
  `req.user.displayName` sebelum memanggil service, mencegah Safety Officer memalsukan nama
  petugas lain (dan memalsukan siapa yang "menyetujui" tahap 1 atas nama orang lain).
- CSRF: karena beralih ke cookie session, endpoint yang mengubah state (`POST`/`PUT`/`DELETE`)
  butuh proteksi CSRF token — bagian kecil dari Phase 13, bukan fase terpisah.

D-4 (badge notifikasi) dan S-11 (audit trail) sengaja **tidak** masuk cakupan wajib fase ini —
lihat fase 16/17 di bawah, keduanya baru make sense setelah role sungguhan berjalan.

---

## Pentahapan (lanjutan dari Phase 11)

**Phase 12 — Scaffold backend + skema + seed data**
`package.json` root (`"type":"module"`), folder `server/` (Express, `mysql2`, migration SQL
bernomor, `server/repositories/*.js` berisi query MySQL dengan signature fungsi SAMA seperti
`src/repositories/*.js` sekarang — `getAll`, `findById`, `add`, `count`, dst — supaya
`src/services/*.js` yang di-import backend tidak perlu tahu bedanya). Seed data port dari
`src/data/plants.js` + `inspections.seed.js` + `schedules.seed.js`, plus 1 user per role.
**Demo browser tidak disentuh, tetap jalan seperti sekarang.** Verifikasi: test API langsung
(supertest/Postman) terhadap MySQL sungguhan, termasuk alur penuh buat inspeksi → approve
berjenjang → tambah tindakan perbaikan.

**Phase 13 — Auth sungguhan (menutup S-01, S-07)**
`bcrypt`, `express-session` + session store MySQL, middleware `require-auth`/`require-role`
sesuai matriks di atas, CSRF token pada route pengubah state. `approval-rules.buildApprovalRecord`
dan `approval-service.approve`/`reject` menerima parameter `approver` (satu-satunya titik
domain/services yang sengaja diubah). `src/config/demo-auth.js` dihapus. Verifikasi: setiap
role dicoba mengakses endpoint yang bukan haknya → 403; approval sekarang membawa identitas
asli.

**Phase 14 — Sambungkan frontend ke API (satu-satunya penulisan ulang `src/repositories/*.js`)**
`src/repositories/*.js`: in-memory → `fetch()`. Domain/services tidak berubah, TAPI setiap view
yang selama ini memanggil `repository.getAll()` secara sinkron (`tables.view.js`,
`calendar.view.js`, `charts.view.js`, `approval.view.js`, `detail-modal.view.js`,
`perbaikan-modal.view.js`, dan pendaftaran di `action-dispatcher.js`) harus jadi
async/await — ini bobot teknis sungguhan fase ini, bukan sekadar tukar isi file repository.
Form login menembak `/api/auth/login`; field petugas/officer di form dikunci dari user yang
login, tidak lagi diketik bebas. Verifikasi: uji manual browser end-to-end per alur (lihat
`docs/VERIFICATION.md` yang sudah ada sebagai checklist dasar, diperluas untuk multi-user).

**Phase 15 — Upload foto sungguhan**
`multer` pada dua endpoint multipart, tabel `photos` terisi sungguhan, lightbox/detail/PDF
menunjuk file asli. Verifikasi: upload → tersimpan → bisa dibuka lewat lightbox.

**Phase 16 — D-4 (badge notifikasi), sekarang bisa diselesaikan**
Aturan: jumlah inspeksi yang menunggu approval PADA tahap yang cocok dengan role user yang
login (0/hidden untuk role `admin`, yang tidak ada di rantai approval).

**Phase 17 (opsional, nanti) — Audit trail (S-11)**
Tabel `audit_log` (siapa, aksi apa, kapan) — minimal untuk hapus jadwal dan penolakan tahap.
Tidak blocking.

---

## Asumsi kunci (mohon dikonfirmasi atau dikoreksi)

1. Session-based auth (bukan JWT) — sesuai rekomendasi eksplisit `docs/SECURITY.md`. Relevan
   HANYA bila nanti ada mobile app/klien API eksternal.
2. `mysql2` + SQL migration bernomor, bukan ORM (Sequelize/Prisma) — skema cuma 7 tabel, objek
   yang dikembalikan services sudah berbentuk row-like, ORM menambah lapisan tanpa manfaat jelas.
3. Satu `role` per user (bukan multi-role) — konfirmasi tidak ada orang yang perlu 2 role
   sekaligus (mis. Manajer Bagian di satu departemen SEKALIGUS Ketua P2K3).
4. Tambah corrective action tetap terbatas ke Safety Officer saja (meniru perilaku implisit
   sekarang) — konfirmasi ini tidak perlu diperluas ke role lain.
5. Foto disimpan di disk lokal (`uploads/`, cocok untuk deployment di server sendiri lewat
   Laragon), bukan cloud storage — beri tahu bila sebenarnya butuh S3/object storage.
6. Tidak ada endpoint export di backend — PDF/Excel tetap 100% di browser seperti sekarang.

---

## Verifikasi keseluruhan

- Phase 12: test otomatis (supertest) untuk setiap endpoint terhadap MySQL sungguhan, alur
  penuh create → approve 4 tahap → tambah tindakan perbaikan, dijalankan tanpa menyentuh
  frontend sama sekali (`index.html` tetap dites terpisah dengan cara lama, tidak boleh rusak).
- Phase 13: matriks 403/401 — setiap role dicoba pada endpoint yang bukan haknya.
- Phase 14: checklist manual di `docs/VERIFICATION.md` (sudah ada, dipakai sebagai basis) diuji
  ulang di browser sungguhan dengan backend nyata, ditambah kasus multi-user (2 browser/profile
  berbeda login sebagai role berbeda, approval berjenjang diuji sungguhan antar akun).
  Regression: seluruh 352 assertion test suite Node yang sudah ada (`test-*.mjs` di scratchpad)
  tetap harus lulus untuk bagian domain/services yang tidak berubah.
- Setiap fase: `docs/KNOWN-ISSUES.md`, `docs/DECISIONS.md`, `docs/VERIFICATION.md` diperbarui
  mengikuti pola yang sudah berjalan di Phase 1-11 (jangan diputus konsistensinya).
