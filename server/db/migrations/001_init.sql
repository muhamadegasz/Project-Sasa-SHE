-- 001_init.sql — skema awal Phase 12. Lihat docs/ROADMAP-PHASE12.md untuk rasionalnya.

CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name  VARCHAR(100) NOT NULL,
  role          ENUM('safety_officer','koordinator_k3l','manajer_bagian','ketua_p2k3','admin') NOT NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- id literal dipertahankan dari PLANT_LIST (src/data/plants.js) — id 13 sengaja tidak ada.
CREATE TABLE plants (
  id        INT PRIMARY KEY,
  name      VARCHAR(100) NOT NULL,
  code      VARCHAR(20)  NOT NULL UNIQUE,
  is_active TINYINT(1)   NOT NULL DEFAULT 1
);

CREATE TABLE inspections (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  plant_id           INT          NOT NULL,
  keterangan_lokasi  VARCHAR(255) NULL,
  tanggal            DATE         NOT NULL,
  petugas            VARCHAR(100) NOT NULL,
  petugas_user_id    INT          NOT NULL,
  status             ENUM('proses','selesai','tinjau') NOT NULL DEFAULT 'proses',
  due_date           DATE         NULL,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (plant_id) REFERENCES plants(id),
  FOREIGN KEY (petugas_user_id) REFERENCES users(id),
  INDEX idx_inspections_plant (plant_id),
  INDEX idx_inspections_status (status)
);

CREATE TABLE findings (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  inspection_id  INT NOT NULL,
  deskripsi      TEXT NOT NULL,
  kategori       ENUM('Kebakaran','Kecelakaan','Kebocoran','Kesehatan','Kelistrikan','Lainnya') NOT NULL,
  FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE
);

CREATE TABLE corrective_actions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  inspection_id  INT NOT NULL,
  finding_id     INT NULL,
  tgl            DATE NOT NULL,
  action         TEXT NOT NULL,
  status         ENUM('open','on-progress','closed') NOT NULL,
  pic            VARCHAR(100) NOT NULL,
  FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE,
  FOREIGN KEY (finding_id) REFERENCES findings(id) ON DELETE SET NULL
);

CREATE TABLE approvals (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  inspection_id       INT NOT NULL,
  stage_id            TINYINT NOT NULL,
  approved            TINYINT(1) NOT NULL DEFAULT 0,
  rejected            TINYINT(1) NOT NULL DEFAULT 0,
  approved_by_user_id INT NULL,
  approved_by_name    VARCHAR(100) NULL,
  jabatan             VARCHAR(100) NOT NULL,
  decided_at          DATETIME NULL,
  FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id),
  UNIQUE KEY uq_inspection_stage (inspection_id, stage_id)
);

CREATE TABLE schedules (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  plant_id           INT NOT NULL,
  plant_name         VARCHAR(100) NOT NULL,
  periode            TINYINT NOT NULL,
  tahun              SMALLINT NOT NULL,
  minggu             TINYINT NOT NULL,
  tanggal_jadwal     DATE NOT NULL,
  tanggal_realisasi  DATE NULL,
  officer            VARCHAR(100) NOT NULL,
  officer_user_id    INT NULL,
  status             ENUM('aktif','selesai') NOT NULL DEFAULT 'aktif',
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
