-- 008_inspection_schedule_link.sql — laporan inspeksi tertaut ke jadwal inspeksinya.
--
-- Sebelumnya tidak ada relasi sama sekali antara inspections dan schedules:
-- "Terlaksana" hanya tanggal_realisasi yang diketik manual di form jadwal.
--
-- inspections.schedule_id (boleh NULL):
--   - NULL = inspeksi tanpa jadwal (inspeksi insidental) dan seluruh inspeksi
--     lama — tetap sah, tidak di-backfill.
--   - UNIQUE: satu laporan per jadwal. MariaDB mengizinkan banyak NULL pada
--     kunci UNIQUE, jadi inspeksi tanpa jadwal tidak terpengaruh. Kunci ini
--     juga penjaga terakhir terhadap dua draft/pengajuan yang memakai jadwal
--     yang sama secara bersamaan.
--   - FK ON DELETE SET NULL: jadwal yang dihapus (hanya mungkin selama belum
--     terlaksana, lihat schedule-service.js remove()) melepas tautan draft,
--     tidak pernah menghapus inspeksinya.
-- Siapa boleh menautkan jadwal mana, dan kapan jadwal menjadi Terlaksana,
-- ditegakkan domain/schedule-rules.js checkScheduleLink() + inspection-service
-- + transaksi pengajuan di server/repositories/inspection-repository.js.
--
-- Tidak ada data yang diubah. IF NOT EXISTS: aman dijalankan ulang.
--
-- Rollback manual (bila diperlukan):
--   ALTER TABLE inspections DROP FOREIGN KEY fk_inspections_schedule;
--   ALTER TABLE inspections DROP INDEX uq_inspections_schedule;
--   ALTER TABLE inspections DROP COLUMN schedule_id;
-- (tautan laporan ke jadwal ikut hilang; status jadwal tetap.)

ALTER TABLE inspections ADD COLUMN IF NOT EXISTS schedule_id INT NULL AFTER plant_id;

ALTER TABLE inspections ADD UNIQUE INDEX IF NOT EXISTS uq_inspections_schedule (schedule_id);

ALTER TABLE inspections
  ADD CONSTRAINT fk_inspections_schedule FOREIGN KEY IF NOT EXISTS (schedule_id)
  REFERENCES schedules(id) ON DELETE SET NULL;
