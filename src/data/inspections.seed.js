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
        lat: -6.200000,
        lng: 106.816666,
        tanggal: getDateOffset(-5),
        petugas: 'Arif',
        status: 'selesai',
        dueDate: getDateOffset(-2),
        fotoDekat: ['kimia_dekat1.jpg', 'kimia_dekat2.jpg'],
        fotoJauh: ['kimia_jauh1.jpg'],
        approvals: {
            1: { approved: true, by: 'Arif', jabatan: 'Safety Officer', tanggal: getDateOffset(-4) + ' 09:00' },
            2: { approved: true, by: 'Bambang', jabatan: 'Koord. K3L Bagian', tanggal: getDateOffset(-3) + ' 10:30' },
            3: { approved: true, by: 'Siti', jabatan: 'Manajer Bagian', tanggal: getDateOffset(-2) + ' 13:15' },
            4: { approved: true, by: 'Hadi', jabatan: 'Ketua P2K3', tanggal: getDateOffset(-1) + ' 16:00' }
        },
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
        lat: -6.210000,
        lng: 106.820000,
        tanggal: getDateOffset(-3),
        petugas: 'Mustofa',
        status: 'proses',
        dueDate: getDateOffset(3),
        fotoDekat: ['fermentasi_dekat1.jpg'],
        fotoJauh: ['fermentasi_jauh1.jpg'],
        approvals: {
            1: { approved: true, by: 'Mustofa', jabatan: 'Safety Officer', tanggal: getDateOffset(-2) + ' 08:00' },
            2: { approved: false, by: null, jabatan: 'Koord. K3L Bagian', tanggal: null },
            3: { approved: false, by: null, jabatan: 'Manajer Bagian', tanggal: null },
            4: { approved: false, by: null, jabatan: 'Ketua P2K3', tanggal: null }
        },
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
        lat: -6.190000,
        lng: 106.810000,
        tanggal: getDateOffset(-7),
        petugas: 'Melka',
        status: 'tinjau',
        dueDate: getDateOffset(-1),
        fotoDekat: ['pmr2_dekat1.jpg'],
        fotoJauh: ['pmr2_jauh1.jpg'],
        approvals: {
            1: { approved: true, by: 'Melka', jabatan: 'Safety Officer', tanggal: getDateOffset(-6) + ' 11:00' },
            2: { approved: true, by: 'Dewi', jabatan: 'Koord. K3L Bagian', tanggal: getDateOffset(-5) + ' 09:30' },
            3: { approved: false, by: null, jabatan: 'Manajer Bagian', tanggal: null },
            4: { approved: false, by: null, jabatan: 'Ketua P2K3', tanggal: null }
        },
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
        lat: -6.180000,
        lng: 106.815000,
        tanggal: getDateOffset(-10),
        petugas: 'Tulus',
        status: 'selesai',
        dueDate: getDateOffset(-5),
        fotoDekat: ['logistik_dekat1.jpg'],
        fotoJauh: ['logistik_jauh1.jpg'],
        approvals: {
            1: { approved: true, by: 'Tulus', jabatan: 'Safety Officer', tanggal: getDateOffset(-9) + ' 10:00' },
            2: { approved: true, by: 'Rina', jabatan: 'Koord. K3L Bagian', tanggal: getDateOffset(-8) + ' 11:30' },
            3: { approved: true, by: 'Andi', jabatan: 'Manajer Bagian', tanggal: getDateOffset(-7) + ' 09:00' },
            4: { approved: true, by: 'Hadi', jabatan: 'Ketua P2K3', tanggal: getDateOffset(-6) + ' 15:00' }
        },
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
        lat: -6.195000,
        lng: 106.825000,
        tanggal: getDateOffset(-1),
        petugas: 'Mustofa',
        status: 'proses',
        dueDate: getDateOffset(7),
        fotoDekat: ['utility_dekat1.jpg'],
        fotoJauh: ['utility_jauh1.jpg'],
        approvals: {
            1: { approved: true, by: 'Mustofa', jabatan: 'Safety Officer', tanggal: getDateOffset(0) + ' 07:30' },
            2: { approved: false, by: null, jabatan: 'Koord. K3L Bagian', tanggal: null },
            3: { approved: false, by: null, jabatan: 'Manajer Bagian', tanggal: null },
            4: { approved: false, by: null, jabatan: 'Ketua P2K3', tanggal: null }
        },
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
        lat: -6.205000,
        lng: 106.818000,
        tanggal: getDateOffset(-12),
        petugas: 'Melka',
        status: 'selesai',
        dueDate: getDateOffset(-8),
        fotoDekat: ['ipal_dekat1.jpg'],
        fotoJauh: ['ipal_jauh1.jpg'],
        approvals: {
            1: { approved: true, by: 'Melka', jabatan: 'Safety Officer', tanggal: getDateOffset(-11) + ' 08:00' },
            2: { approved: true, by: 'Dewi', jabatan: 'Koord. K3L Bagian', tanggal: getDateOffset(-10) + ' 09:30' },
            3: { approved: true, by: 'Andi', jabatan: 'Manajer Bagian', tanggal: getDateOffset(-9) + ' 13:00' },
            4: { approved: false, by: null, jabatan: 'Ketua P2K3', tanggal: null }
        },
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
