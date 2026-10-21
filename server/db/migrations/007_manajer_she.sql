-- 007_manajer_she.sql — role & tahap pengesahan baru: Manajer SHE, di antara
-- Manajer Bagian dan Ketua P2K3. Urutan pengesahan menjadi
-- Koordinator K3L -> Manajer Bagian -> Manajer SHE -> Ketua P2K3
-- (src/config/constants.js APPROVAL_STAGES).
--
-- Additive saja: nilai 'manajer_she' ditambahkan di AKHIR ketiga ENUM (urutan
-- nilai ENUM tidak dipakai aplikasi; menambah di akhir tidak mengubah data
-- yang sudah tersimpan). Tidak ada baris yang diubah:
--   - inspeksi yang sedang menunggu Ketua P2K3 tetap di tahap Ketua P2K3;
--   - inspeksi yang sudah selesai tetap selesai dengan tiga tahapnya.
-- Keduanya tidak pernah melalui Manajer SHE — riwayat, ringkasan "x/y", dan
-- PDF-nya hanya memuat tahap yang dilalui (domain/approval-rules.js
-- applicableStages). Inspeksi yang belum melewati Manajer Bagian akan
-- melalui Manajer SHE.
-- Akun Manajer SHE dibuat Admin lewat Manajemen Pengguna (bukan di sini).
--
-- MODIFY dengan daftar yang sama: aman dijalankan ulang.
--
-- Rollback manual (hanya bila belum ada akun/keputusan/inspeksi bernilai
-- 'manajer_she'): MODIFY ketiga kolom kembali ke daftar tanpa 'manajer_she'.

ALTER TABLE users
  MODIFY role ENUM('safety_officer','koordinator_k3l','manajer_bagian','ketua_p2k3','admin','manajer_she') NOT NULL;

ALTER TABLE approvals
  MODIFY stage ENUM('koordinator_k3l','manajer','ketua_p2k3','manajer_she') NOT NULL;

ALTER TABLE inspections
  MODIFY current_approval_stage ENUM('koordinator_k3l','manajer','ketua_p2k3','manajer_she') NULL;
