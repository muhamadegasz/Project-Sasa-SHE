-- 005_user_delete_set_null.sql — Phase 18: Admin boleh menghapus akun secara
-- permanen TANPA menghapus data bisnis.
--
-- Kelima foreign key ke users(id) sebelumnya RESTRICT (bawaan, tanpa ON DELETE):
-- akun yang pernah membuat inspeksi, memutuskan pengesahan, punya jadwal, atau
-- mengunggah foto tidak bisa dihapus sama sekali. Sekarang ON DELETE SET NULL:
-- baris bisnisnya TETAP ada, hanya tautan *_user_id yang menjadi NULL. Nama
-- yang tampil di riwayat sudah dibekukan terpisah di kolom teks
-- (inspections.petugas, schedules.officer, approvals.reviewer_name,
-- approvals_legacy.approved_by_name), jadi riwayat tetap terbaca utuh.
-- Tidak ada CASCADE ke data bisnis.
--
-- Satu-satunya perubahan tipe kolom: inspections.petugas_user_id menjadi NULL
-- (sebelumnya NOT NULL — SET NULL tidak mungkin tanpanya). Inspeksi tanpa
-- pemilik tetap gagal-tertutup di domain/inspection-policy.js (isOwner
-- memeriksa null). Supaya tidak ada draft/revisi yang tertinggal tanpa
-- pemilik, user-service.js menolak menghapus akun yang masih memiliki
-- inspeksi DRAFT atau REVISION_REQUIRED.
--
-- Tidak ada data yang diubah atau dihapus oleh migrasi ini. Nama constraint
-- lama adalah nama otomatis InnoDB (sama di she_sasa dan she_sasa_test,
-- diperiksa lewat information_schema); penggantinya diberi nama eksplisit.
-- IF EXISTS / IF NOT EXISTS: aman dijalankan ulang bila terhenti di tengah
-- (DDL MariaDB langsung ter-commit per pernyataan).
--
-- Rollback manual (bila diperlukan): kembalikan setiap constraint tanpa
-- ON DELETE; NOT NULL pada inspections.petugas_user_id hanya bisa dipulihkan
-- selama belum ada inspeksi yang pemiliknya terhapus (petugas_user_id NULL).

-- inspections.petugas_user_id (pembuat inspeksi)
ALTER TABLE inspections DROP FOREIGN KEY IF EXISTS inspections_ibfk_2;
ALTER TABLE inspections DROP FOREIGN KEY IF EXISTS fk_inspections_petugas;
ALTER TABLE inspections MODIFY petugas_user_id INT NULL;
ALTER TABLE inspections
  ADD CONSTRAINT fk_inspections_petugas FOREIGN KEY IF NOT EXISTS (petugas_user_id)
  REFERENCES users(id) ON DELETE SET NULL;

-- approvals.reviewer_user_id (pemutus pengesahan; reviewer_name dibekukan)
ALTER TABLE approvals DROP FOREIGN KEY IF EXISTS fk_approvals_reviewer;
ALTER TABLE approvals
  ADD CONSTRAINT fk_approvals_reviewer FOREIGN KEY IF NOT EXISTS (reviewer_user_id)
  REFERENCES users(id) ON DELETE SET NULL;

-- approvals_legacy.approved_by_user_id (tabel lama, tidak lagi dibaca aplikasi,
-- tapi FK-nya tetap memblokir penghapusan akun yang ada di data lama)
ALTER TABLE approvals_legacy DROP FOREIGN KEY IF EXISTS approvals_legacy_ibfk_2;
ALTER TABLE approvals_legacy DROP FOREIGN KEY IF EXISTS fk_approvals_legacy_approver;
ALTER TABLE approvals_legacy
  ADD CONSTRAINT fk_approvals_legacy_approver FOREIGN KEY IF NOT EXISTS (approved_by_user_id)
  REFERENCES users(id) ON DELETE SET NULL;

-- schedules.officer_user_id (petugas jadwal; officer dibekukan)
ALTER TABLE schedules DROP FOREIGN KEY IF EXISTS schedules_ibfk_2;
ALTER TABLE schedules DROP FOREIGN KEY IF EXISTS fk_schedules_officer;
ALTER TABLE schedules
  ADD CONSTRAINT fk_schedules_officer FOREIGN KEY IF NOT EXISTS (officer_user_id)
  REFERENCES users(id) ON DELETE SET NULL;

-- photos.uploaded_by (pengunggah foto)
ALTER TABLE photos DROP FOREIGN KEY IF EXISTS photos_ibfk_3;
ALTER TABLE photos DROP FOREIGN KEY IF EXISTS fk_photos_uploader;
ALTER TABLE photos
  ADD CONSTRAINT fk_photos_uploader FOREIGN KEY IF NOT EXISTS (uploaded_by)
  REFERENCES users(id) ON DELETE SET NULL;
