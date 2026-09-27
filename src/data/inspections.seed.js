/* inspections.seed.js — data inspeksi demo.
 *
 * Tanggalnya relatif terhadap hari ini (getDateOffset), jadi data ini
 * "bergerak" setiap hari. Itu disengaja supaya demo selalu menampilkan
 * campuran inspeksi yang sudah lewat dan yang akan datang.
 *
 * Dibungkus fungsi, bukan konstanta modul, supaya tanggalnya dihitung
 * saat repository diinisialisasi — bukan saat modul di-parse.
 *
 * Akses lewat src/repositories/inspection-repository.js.
 */

import { getDateOffset } from '../shared/date.js';

export function createInspectionSeed() {
    return [{
        id: 'INS-001',
        lokasi: 'Electrical dan Instrument',
        plantId: 1,
        keteranganLokasi: 'Ruang Panel E&I Lantai 2',
        tanggal: getDateOffset(-5),
        petugas: 'Arif',
        status: 'completed',
        currentApprovalStage: null,
        dueDate: getDateOffset(-2),
        fotoDekat: ['kimia_dekat1.jpg', 'kimia_dekat2.jpg'],
        fotoJauh: ['kimia_jauh1.jpg'],
        approvalHistory: [
            { stage: 'koordinator_k3l', attempt: 1, decision: 'approved', by: 'Dewi', tanggal: getDateOffset(-3) + ' 10:30' },
            { stage: 'manajer', attempt: 1, decision: 'approved', by: 'Andi', tanggal: getDateOffset(-2) + ' 13:15' },
            { stage: 'ketua_p2k3', attempt: 1, decision: 'approved', by: 'Hadi', tanggal: getDateOffset(-1) + ' 16:00' },
        ],
        temuan: [
            { deskripsi: 'Kabel ground tidak terpasang dengan benar', kategori: 'Kelistrikan' },
            { deskripsi: 'Panel kontrol tidak terkunci', kategori: 'Kecelakaan' }
        ],
        perbaikan: [
            { tgl: getDateOffset(-4), action: 'Perbaiki grounding kabel', status: 'closed', pic: 'Arif',
                foto: ['ground1.jpg'] },
            { tgl: getDateOffset(-3), action: 'Pasang kunci panel', status: 'closed', pic: 'Tulus',
                foto: ['kunci1.jpg'] }
        ]
    }, {
        id: 'INS-002',
        lokasi: 'Fermentation',
        plantId: 3,
        keteranganLokasi: 'Area Fermentasi A2',
        tanggal: getDateOffset(-3),
        petugas: 'Mustofa',
        status: 'in_review',
        currentApprovalStage: 'koordinator_k3l',
        dueDate: getDateOffset(3),
        fotoDekat: ['fermentasi_dekat1.jpg'],
        fotoJauh: ['fermentasi_jauh1.jpg'],
        approvalHistory: [],
        temuan: [
            { deskripsi: 'Suhu fermentasi tidak stabil', kategori: 'Kesehatan' },
            { deskripsi: 'Kebocoran pada pipa transfer', kategori: 'Kebocoran' }
        ],
        perbaikan: [
            { tgl: getDateOffset(-2), action: 'Kalibrasi sensor suhu', status: 'closed', pic: 'Tulus',
                foto: ['sensor1.jpg'] },
            { tgl: getDateOffset(-1), action: 'Perbaiki kebocoran pipa', status: 'on-progress', pic: 'Melka',
                foto: ['pipa1.jpg'] }
        ]
    }, {
        id: 'INS-003',
        lokasi: 'PMR 2',
        plantId: 6,
        keteranganLokasi: 'Gedung PMR 2 - Lantai 3',
        tanggal: getDateOffset(-7),
        petugas: 'Melka',
        status: 'revision_required',
        currentApprovalStage: 'manajer',
        dueDate: getDateOffset(-1),
        fotoDekat: ['pmr2_dekat1.jpg'],
        fotoJauh: ['pmr2_jauh1.jpg'],
        approvalHistory: [
            { stage: 'koordinator_k3l', attempt: 1, decision: 'approved', by: 'Bambang', tanggal: getDateOffset(-5) + ' 09:30' },
            { stage: 'manajer', attempt: 1, decision: 'rejected', by: 'Andi', tanggal: getDateOffset(-4) + ' 14:00',
                reason: 'Foto jauh belum memperlihatkan jalur evakuasi; lengkapi foto area rambu.' },
        ],
        temuan: [
            { deskripsi: 'APAR tidak terisi penuh', kategori: 'Kebakaran' },
            { deskripsi: 'Rambu evakuasi tidak terlihat', kategori: 'Kecelakaan' }
        ],
        perbaikan: [
            { tgl: getDateOffset(-6), action: 'Isi ulang APAR', status: 'closed', pic: 'Arif',
                foto: ['apar1.jpg'] },
            { tgl: getDateOffset(-4), action: 'Pasang rambu evakuasi baru', status: 'open', pic: 'Tulus',
                foto: [] }
        ]
    }, {
        id: 'INS-004',
        lokasi: 'Logistic',
        plantId: 9,
        keteranganLokasi: 'Gudang Logistik - Rak C4',
        tanggal: getDateOffset(-10),
        petugas: 'Tulus',
        status: 'completed',
        currentApprovalStage: null,
        dueDate: getDateOffset(-5),
        fotoDekat: ['logistik_dekat1.jpg'],
        fotoJauh: ['logistik_jauh1.jpg'],
        approvalHistory: [
            { stage: 'koordinator_k3l', attempt: 1, decision: 'approved', by: 'Rina', tanggal: getDateOffset(-8) + ' 11:30' },
            { stage: 'manajer', attempt: 1, decision: 'approved', by: 'Andi', tanggal: getDateOffset(-7) + ' 09:00' },
            { stage: 'ketua_p2k3', attempt: 1, decision: 'approved', by: 'Hadi', tanggal: getDateOffset(-6) + ' 15:00' },
        ],
        temuan: [
            { deskripsi: 'Rak penyimpanan tidak stabil', kategori: 'Kecelakaan' },
            { deskripsi: 'Penerangan gudang kurang', kategori: 'Kesehatan' }
        ],
        perbaikan: [
            { tgl: getDateOffset(-9), action: 'Perbaiki rak penyimpanan', status: 'closed', pic: 'Melka',
                foto: ['rak1.jpg'] },
            { tgl: getDateOffset(-7), action: 'Tambah lampu penerangan', status: 'closed', pic: 'Arif',
                foto: ['lampu1.jpg'] }
        ]
    }, {
        id: 'INS-005',
        lokasi: 'UTILITY',
        plantId: 16,
        keteranganLokasi: 'Ruang Utility - Pompa Air',
        tanggal: getDateOffset(-1),
        petugas: 'Mustofa',
        status: 'in_review',
        currentApprovalStage: 'koordinator_k3l',
        dueDate: getDateOffset(7),
        fotoDekat: ['utility_dekat1.jpg'],
        fotoJauh: ['utility_jauh1.jpg'],
        approvalHistory: [],
        temuan: [
            { deskripsi: 'Bocor pada sambungan pipa', kategori: 'Kebocoran' },
            { deskripsi: 'Tekanan air tidak stabil', kategori: 'Lainnya' }
        ],
        perbaikan: [
            { tgl: getDateOffset(0), action: 'Identifikasi sumber bocor', status: 'on-progress', pic: 'Tulus',
                foto: ['bocor1.jpg'] }
        ]
    }, {
        id: 'INS-006',
        lokasi: 'SHE, WT, IPAL',
        plantId: 14,
        keteranganLokasi: 'Area IPAL - Bak Sedimentasi',
        tanggal: getDateOffset(-12),
        petugas: 'Melka',
        status: 'in_review',
        currentApprovalStage: 'ketua_p2k3',
        dueDate: getDateOffset(-8),
        fotoDekat: ['ipal_dekat1.jpg'],
        fotoJauh: ['ipal_jauh1.jpg'],
        approvalHistory: [
            { stage: 'koordinator_k3l', attempt: 1, decision: 'rejected', by: 'Sari', tanggal: getDateOffset(-10) + ' 09:30',
                reason: 'Kategori temuan belum sesuai; pompa IPAL termasuk Kebocoran.' },
            { stage: 'koordinator_k3l', attempt: 2, decision: 'approved', by: 'Sari', tanggal: getDateOffset(-10) + ' 15:00' },
            { stage: 'manajer', attempt: 1, decision: 'approved', by: 'Andi', tanggal: getDateOffset(-9) + ' 13:00' },
        ],
        temuan: [
            { deskripsi: 'Pompa IPAL tidak berfungsi optimal', kategori: 'Lainnya' },
            { deskripsi: 'Kebersihan area sekitar kurang', kategori: 'Kesehatan' }
        ],
        perbaikan: [
            { tgl: getDateOffset(-11), action: 'Perbaiki pompa IPAL', status: 'closed', pic: 'Arif',
                foto: ['pompa1.jpg'] },
            { tgl: getDateOffset(-10), action: 'Bersihkan area IPAL', status: 'closed', pic: 'Mustofa',
                foto: ['bersih1.jpg'] }
        ]
    }];
}
