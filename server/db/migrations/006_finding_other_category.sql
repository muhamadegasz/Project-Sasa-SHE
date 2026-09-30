-- 006_finding_other_category.sql — keterangan untuk temuan berkategori "Lainnya".
--
-- Additive saja: satu kolom baru yang boleh NULL. ENUM findings.kategori TIDAK
-- diubah — kategori standar tetap terstruktur untuk pelaporan; temuan
-- "Lainnya" tetap tercatat sebagai 'Lainnya', dan penjelasannya (mis.
-- "Ergonomi") disimpan terpisah di kolom ini. Aturannya ditegakkan
-- domain/inspection-rules.js checkFindingCategory(): wajib diisi (maks. 100
-- karakter) bila kategori = 'Lainnya', selalu NULL untuk kategori lain.
--
-- Tidak ada data yang diubah: semua baris lama mendapat NULL (termasuk temuan
-- 'Lainnya' lama yang memang belum pernah punya penjelasan — tidak di-backfill).
-- IF NOT EXISTS: aman dijalankan ulang.
--
-- Rollback manual (bila diperlukan): ALTER TABLE findings DROP COLUMN kategori_lainnya;
-- (penjelasan kategori "Lainnya" yang sudah tersimpan ikut hilang).

ALTER TABLE findings ADD COLUMN IF NOT EXISTS kategori_lainnya VARCHAR(100) NULL AFTER kategori;
