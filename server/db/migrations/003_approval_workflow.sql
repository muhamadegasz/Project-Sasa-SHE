-- 003_approval_workflow.sql — Phase 17.2: fondasi alur pengesahan.
-- Lihat docs/DECISIONS.md K-24 untuk alasan dan pemetaan data lama.
--
-- TIDAK ADA yang dihapus: kolom status lama dipertahankan sebagai
-- inspections.legacy_status, dan tabel approvals lama dipertahankan utuh
-- sebagai approvals_legacy. Keduanya tidak lagi dibaca kode aplikasi.

-- 1. Koordinator K3L bertanggung jawab atas tepat SATU plant: satu kolom FK,
--    bukan tabel many-to-many. NULL untuk role lain. Koordinator tanpa plant
--    tidak punya cakupan apa pun (ditolak di domain/inspection-policy.js).
ALTER TABLE users
  ADD COLUMN plant_id INT NULL AFTER role,
  ADD CONSTRAINT fk_users_plant FOREIGN KEY (plant_id) REFERENCES plants(id);

-- 2. inspections: status lama (proses/selesai/tinjau) dicampur dari isian
--    form, hasil tindakan perbaikan, dan hasil pengesahan — tidak bisa
--    dipetakan apa adanya, jadi disimpan sebagai legacy_status. Status baru
--    adalah status alur kerja.
ALTER TABLE inspections
  RENAME INDEX idx_inspections_status TO idx_inspections_legacy_status;

ALTER TABLE inspections
  CHANGE COLUMN status legacy_status ENUM('proses','selesai','tinjau') NULL;

-- DEFAULT sementara 'in_review': seluruh baris yang sudah ada dibuat lewat
-- alur lama, di mana membuat = mengajukan. Diganti 'draft' di langkah 5.
ALTER TABLE inspections
  ADD COLUMN status ENUM('draft','in_review','revision_required','completed') NOT NULL DEFAULT 'in_review' AFTER petugas_user_id,
  ADD COLUMN current_approval_stage ENUM('koordinator_k3l','manajer','ketua_p2k3') NULL AFTER status,
  ADD COLUMN submitted_at DATETIME NULL AFTER current_approval_stage,
  ADD INDEX idx_inspections_status (status, current_approval_stage);

-- 3. Riwayat pengesahan append-only. Satu baris = satu keputusan; satu tahap
--    boleh punya beberapa attempt. Nama constraint eksplisit supaya tidak
--    bentrok dengan nama constraint milik approvals_legacy.
RENAME TABLE approvals TO approvals_legacy;

CREATE TABLE approvals (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  inspection_id       INT NOT NULL,
  stage               ENUM('koordinator_k3l','manajer','ketua_p2k3') NOT NULL,
  attempt             SMALLINT UNSIGNED NOT NULL,
  decision            ENUM('approved','rejected') NOT NULL,
  reviewer_user_id    INT NULL,
  reviewer_name       VARCHAR(100) NULL,
  rejection_reason    TEXT NULL,
  signature_method    ENUM('upload','canvas') NULL,
  signature_file_path VARCHAR(255) NULL,
  signature_mime_type VARCHAR(100) NULL,
  watermark_enabled   TINYINT(1) NOT NULL DEFAULT 0,
  -- Posisi ternormalisasi 0..1 relatif terhadap area tanda tangan, bukan
  -- piksel layar — ukuran dan opacity watermark tetap dari sistem.
  watermark_x         DECIMAL(5,4) NULL,
  watermark_y         DECIMAL(5,4) NULL,
  decided_at          DATETIME NULL,
  CONSTRAINT fk_approvals_inspection FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE,
  CONSTRAINT fk_approvals_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES users(id),
  CONSTRAINT uq_approvals_attempt UNIQUE (inspection_id, stage, attempt),
  CONSTRAINT chk_approvals_reason_only_on_reject CHECK (decision = 'rejected' OR rejection_reason IS NULL),
  CONSTRAINT chk_approvals_signature_only_on_approve CHECK (decision = 'approved' OR (signature_method IS NULL AND signature_file_path IS NULL)),
  -- IS NOT NULL eksplisit: NULL BETWEEN 0 AND 1 bernilai NULL, dan CHECK
  -- hanya menolak FALSE — tanpa ini watermark aktif tanpa posisi lolos.
  CONSTRAINT chk_approvals_watermark_position CHECK (
    (watermark_enabled = 0 AND watermark_x IS NULL AND watermark_y IS NULL)
    OR (watermark_enabled = 1
        AND watermark_x IS NOT NULL AND watermark_y IS NOT NULL
        AND watermark_x BETWEEN 0 AND 1 AND watermark_y BETWEEN 0 AND 1)
  ),
  INDEX idx_approvals_inspection (inspection_id, stage)
);

-- Keputusan sungguhan lama (tahap 2-4, disetujui ATAU ditolak) -> attempt 1.
-- Tahap 1 (Safety Officer, bukan tahap pengesahan lagi) dan baris placeholder
-- "belum diputuskan" tidak disalin — keduanya bukan keputusan; tetap ada di
-- approvals_legacy. Penolakan lama menyimpan literal 'Rejected' sebagai nama
-- dan tidak pernah menyimpan identitas penolak -> reviewer tidak diketahui (NULL).
INSERT INTO approvals (inspection_id, stage, attempt, decision, reviewer_user_id, reviewer_name, decided_at)
SELECT inspection_id,
       ELT(stage_id - 1, 'koordinator_k3l', 'manajer', 'ketua_p2k3'),
       1,
       IF(approved = 1, 'approved', 'rejected'),
       approved_by_user_id,
       IF(approved = 1, approved_by_name, NULL),
       decided_at
FROM approvals_legacy
WHERE stage_id IN (2, 3, 4) AND (approved = 1 OR rejected = 1);

-- 4. Status alur kerja diturunkan dari keputusan lama (bukan dari legacy_status):
--    tahap pertama (urutan 2,3,4) yang belum disetujui menjadi tahap saat ini;
--    bila tahap itu ditolak -> revision_required, bila belum diputuskan ->
--    in_review; bila ketiganya disetujui -> completed.
UPDATE inspections i
JOIN (
  SELECT inspection_id,
         MAX(stage_id = 2 AND approved = 1) AS a2,
         MAX(stage_id = 3 AND approved = 1) AS a3,
         MAX(stage_id = 4 AND approved = 1) AS a4,
         MAX(stage_id = 2 AND rejected = 1) AS r2,
         MAX(stage_id = 3 AND rejected = 1) AS r3,
         MAX(stage_id = 4 AND rejected = 1) AS r4,
         MAX(IF(stage_id = 1 AND approved = 1, decided_at, NULL)) AS submitted
  FROM approvals_legacy
  GROUP BY inspection_id
) s ON s.inspection_id = i.id
SET i.status = CASE
        WHEN s.a2 = 0 THEN IF(s.r2 = 1, 'revision_required', 'in_review')
        WHEN s.a3 = 0 THEN IF(s.r3 = 1, 'revision_required', 'in_review')
        WHEN s.a4 = 0 THEN IF(s.r4 = 1, 'revision_required', 'in_review')
        ELSE 'completed'
    END,
    i.current_approval_stage = CASE
        WHEN s.a2 = 0 THEN 'koordinator_k3l'
        WHEN s.a3 = 0 THEN 'manajer'
        WHEN s.a4 = 0 THEN 'ketua_p2k3'
        ELSE NULL
    END,
    i.submitted_at = COALESCE(s.submitted, i.created_at);

-- Inspeksi lama tanpa baris approval sama sekali (tidak ada di data saat ini,
-- tapi tidak diasumsikan): tetap diperlakukan sebagai sudah diajukan, di tahap pertama.
UPDATE inspections
SET current_approval_stage = 'koordinator_k3l', submitted_at = created_at
WHERE status = 'in_review' AND current_approval_stage IS NULL;

-- 5. Inspeksi baru mulai sebagai draft.
ALTER TABLE inspections
  ALTER COLUMN status SET DEFAULT 'draft';
