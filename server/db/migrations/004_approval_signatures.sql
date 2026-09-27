-- 004_approval_signatures.sql — Phase 17.4A: tanda tangan wajib pada persetujuan.
-- Lihat docs/DECISIONS.md K-26.
--
-- Kolom tanda tangan sudah ada sejak 003 (signature_method, signature_file_path,
-- signature_mime_type) — satu keputusan, paling banyak satu tanda tangan, jadi
-- metadata tetap di baris approvals, bukan tabel terpisah. Migrasi ini hanya
-- MENAMBAH penanda dan constraint; tidak ada data yang dihapus atau diubah
-- selain penanda di bawah.

-- 1. Persetujuan yang tersimpan SEBELUM tanda tangan diwajibkan (data 003 dan
--    data demo seed) memang tidak punya tanda tangan. Ditandai eksplisit,
--    bukan diberi tanda tangan palsu. Aplikasi tidak pernah mengisi kolom ini
--    (DEFAULT 0), jadi setiap persetujuan baru wajib bertanda tangan.
ALTER TABLE approvals
  ADD COLUMN legacy_unsigned TINYINT(1) NOT NULL DEFAULT 0 AFTER signature_mime_type;

UPDATE approvals
SET legacy_unsigned = 1
WHERE decision = 'approved'
  AND NOT (signature_method IS NOT NULL
           AND signature_file_path IS NOT NULL
           AND signature_mime_type IN ('image/png', 'image/jpeg'));

-- 2. Invarian tanda tangan. Penegakan utama tetap di domain/service
--    (src/domain/signature-rules.js); ini jaring pengaman terakhir.
--    IS NOT NULL eksplisit untuk alasan yang sama dengan 003: CHECK hanya
--    menolak FALSE, bukan NULL.
ALTER TABLE approvals
  -- Disetujui -> tanda tangan lengkap (metode + file + tipe PNG/JPEG),
  -- kecuali baris lama yang ditandai legacy_unsigned.
  ADD CONSTRAINT chk_approvals_signature_on_approve CHECK (
    decision <> 'approved'
    OR legacy_unsigned = 1
    OR (signature_method IS NOT NULL
        AND signature_file_path IS NOT NULL
        AND signature_mime_type IS NOT NULL
        AND signature_mime_type IN ('image/png', 'image/jpeg'))
  ),
  -- Penanda legacy hanya bermakna pada persetujuan.
  ADD CONSTRAINT chk_approvals_legacy_unsigned CHECK (legacy_unsigned = 0 OR decision = 'approved'),
  -- Tanda tangan CANVAS selalu PNG.
  ADD CONSTRAINT chk_approvals_canvas_png CHECK (
    signature_method IS NULL OR signature_method <> 'canvas'
    OR (signature_mime_type IS NOT NULL AND signature_mime_type = 'image/png')
  ),
  -- Penolakan tanpa tanda tangan: metode & path sudah dijaga 003
  -- (chk_approvals_signature_only_on_approve); ini melengkapi untuk tipe file.
  ADD CONSTRAINT chk_approvals_signature_mime_only_on_approve CHECK (decision = 'approved' OR signature_mime_type IS NULL),
  -- Satu file tanda tangan milik tepat satu keputusan — menghapus file satu
  -- keputusan (pembersihan kelak) tidak pernah menyentuh keputusan lain.
  ADD CONSTRAINT uq_approvals_signature_file UNIQUE (signature_file_path);
