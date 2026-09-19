/* legacy-app.js — seluruh JavaScript aplikasi, dipindahkan apa adanya dari
   index.html baris 522-3138 pada Phase 2.

   Berkas ini SEMENTARA. Isinya akan dipecah bertahap pada Phase 3-9 menjadi
   shared/ domain/ repositories/ services/ presentation/. Jangan menambah kode
   baru di sini — tambahkan di modul tujuannya.

   Catatan: berkas ini kini dimuat sebagai ES module, sehingga berjalan dalam
   strict mode. Sudah dipindai: tidak ada assignment ke variabel tak
   terdeklarasi dan tidak ada deklarasi function di dalam blok. */

// ========================================================================
// ========== PLANT DATA ==========
// ========================================================================

const PLANT_LIST = [
    { id: 1, name: 'Electrical dan Instrument', code: 'E&I' },
    { id: 2, name: 'Engineering TD', code: 'ENG-TD' },
    { id: 3, name: 'Fermentation', code: 'FERM' },
    { id: 4, name: 'HRGA', code: 'HRGA' },
    { id: 5, name: 'PMR 1 dan DCL', code: 'PMR1-DCL' },
    { id: 6, name: 'PMR 2', code: 'PMR2' },
    { id: 7, name: 'Isolasi dan LF', code: 'ISOLASI-LF' },
    { id: 8, name: 'IT', code: 'IT' },
    { id: 9, name: 'Logistic', code: 'LOG' },
    { id: 10, name: 'Packing', code: 'PACK' },
    { id: 11, name: 'Polycello dan TMP', code: 'POLY-TMP' },
    { id: 12, name: 'QC & QA', code: 'QC-QA' },
    { id: 14, name: 'SHE, WT, IPAL', code: 'SHE-WT-IPAL' },
    { id: 15, name: 'TMM', code: 'TMM' },
    { id: 16, name: 'UTILITY', code: 'UTIL' }
];

const PERIODE_LIST = [
    { id: 1, name: 'Periode 1', months: 'Jan - Mar' },
    { id: 2, name: 'Periode 2', months: 'Apr - Jun' },
    { id: 3, name: 'Periode 3', months: 'Jul - Sep' },
    { id: 4, name: 'Periode 4', months: 'Okt - Des' }
];

// ========================================================================
// ========== APPROVAL STAGES ==========
// ========================================================================

const APPROVAL_STAGES = [
    { id: 1, name: 'Safety Officer', title: 'Safety Officer', order: 1 },
    { id: 2, name: 'Koord. K3L Bagian', title: 'Koordinator K3L Bagian', order: 2 },
    { id: 3, name: 'Manajer Bagian', title: 'Manajer Bagian', order: 3 },
    { id: 4, name: 'Ketua P2K3', title: 'Ketua P2K3', order: 4 }
];

// ========================================================================
// ========== HELPERS ==========
// ========================================================================

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID');
}

function getDateOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString('id-ID');
}

function getRandomOfficer() {
    const officers = ['Arif', 'Tulus', 'Mustofa', 'Melka'];
    return officers[Math.floor(Math.random() * officers.length)];
}

// ========================================================================
// ========== GENERATE JADWAL MINGGUAN (DIKURANGI) ==========
// ========================================================================

function generateWeeklySchedule() {
    const today = new Date();
    const currentYear = today.getFullYear();
    
    const schedules = [];
    let idCounter = 1;

    // Hanya 6 plant yang aktif
    const activePlants = [
        { id: 1, name: 'Electrical dan Instrument', code: 'E&I' },
        { id: 3, name: 'Fermentation', code: 'FERM' },
        { id: 6, name: 'PMR 2', code: 'PMR2' },
        { id: 9, name: 'Logistic', code: 'LOG' },
        { id: 14, name: 'SHE, WT, IPAL', code: 'SHE-WT-IPAL' },
        { id: 16, name: 'UTILITY', code: 'UTIL' }
    ];

    const officers = ['Arif', 'Tulus', 'Mustofa', 'Melka'];

    activePlants.forEach((plant, plantIndex) => {
        // Setiap plant punya 2 jadwal
        for (let i = 0; i < 2; i++) {
            // Jadwal di hari Senin, dengan interval 2-3 minggu
            const weekOffset = (i * 3) + (plantIndex % 2) + 1;
            const date = new Date(today);
            date.setDate(date.getDate() + (weekOffset * 7) + (1 - date.getDay() + 7) % 7 + 7);
            
            const diffDays = (date - today) / (1000 * 60 * 60 * 24);
            if (diffDays > 35 || diffDays < -7) continue;
            
            const officerIndex = (plant.id + i) % officers.length;
            
            const isRealisasi = Math.random() < 0.3 && diffDays < 0;
            const realisasiDate = isRealisasi ? new Date(date) : null;
            if (realisasiDate) {
                realisasiDate.setDate(realisasiDate.getDate() + Math.floor(Math.random() * 3) + 1);
            }
            
            const month = date.getMonth();
            let periode = 1;
            if (month >= 3 && month <= 5) periode = 2;
            else if (month >= 6 && month <= 8) periode = 3;
            else if (month >= 9 && month <= 11) periode = 4;
            
            schedules.push({
                id: `SCH-${String(idCounter++).padStart(3, '0')}`,
                plantId: plant.id,
                plantName: plant.name,
                periode: periode,
                tahun: currentYear,
                minggu: i + 1,
                tanggalJadwal: date.toISOString().split('T')[0],
                tanggalRealisasi: realisasiDate ? realisasiDate.toISOString().split('T')[0] : null,
                officer: officers[officerIndex],
                status: isRealisasi ? 'selesai' : 'aktif'
            });
        }
    });

    return schedules;
}

// ========================================================================
// ========== DATA ==========
// ========================================================================

let jadwalData = generateWeeklySchedule();

let inspeksiData = [{
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

// ========================================================================
// ========== SELECT WITH SEARCH ==========
// ========================================================================

let selectedPlant = null;
let selectedPlantJadwal = null;

function initPlantSelect() {
    // Untuk form inspeksi
    const input = document.getElementById('plantSearchInput');
    const dropdown = document.getElementById('plantDropdown');
    const hiddenInput = document.getElementById('selectedPlant');
    const display = document.getElementById('selectedPlantDisplay');
    const clearBtn = document.getElementById('clearPlantSelection');

    function renderDropdown(filter = '') {
        const filtered = PLANT_LIST.filter(p => 
            p.name.toLowerCase().includes(filter.toLowerCase()) ||
            p.code.toLowerCase().includes(filter.toLowerCase())
        );

        if (filtered.length === 0) {
            dropdown.innerHTML = `<div class="dropdown-item" style="color:#8a6a6a;">Tidak ada plant ditemukan</div>`;
        } else {
            dropdown.innerHTML = filtered.map(p => {
                const nameHighlight = highlightTextPlant(p.name, filter);
                const codeHighlight = highlightTextPlant(p.code, filter);
                return `
                    <div class="dropdown-item" data-id="${p.id}" data-name="${p.name}" data-code="${p.code}">
                        ${nameHighlight}
                        <span class="plant-code">${codeHighlight}</span>
                    </div>
                `;
            }).join('');
        }

        dropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', function() {
                const id = parseInt(this.dataset.id);
                const name = this.dataset.name;
                const code = this.dataset.code;
                selectPlant(id, name, code);
            });
        });
    }

    function selectPlant(id, name, code) {
        selectedPlant = { id, name, code };
        hiddenInput.value = id;
        input.value = name;
        display.innerHTML = `<span class="selected-value"><i class="fas fa-check-circle"></i> ${name} (${code})</span>`;
        clearBtn.classList.add('visible');
        dropdown.classList.remove('show');
        input.classList.remove('error');
    }

    function clearPlant() {
        selectedPlant = null;
        hiddenInput.value = '';
        input.value = '';
        display.innerHTML = '';
        clearBtn.classList.remove('visible');
        dropdown.classList.remove('show');
        input.focus();
    }

    input.addEventListener('input', function() {
        const value = this.value.trim();
        if (value === '') {
            dropdown.classList.remove('show');
            if (!selectedPlant) {
                display.innerHTML = '';
                clearBtn.classList.remove('visible');
            }
            return;
        }
        renderDropdown(value);
        dropdown.classList.add('show');
        clearBtn.classList.add('visible');
    });

    input.addEventListener('focus', function() {
        if (this.value.trim() !== '') {
            renderDropdown(this.value.trim());
            dropdown.classList.add('show');
        }
    });

    document.addEventListener('click', function(e) {
        const wrapper = document.getElementById('plantSelectWrapper');
        if (!wrapper.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });

    clearBtn.addEventListener('click', clearPlant);

    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const firstItem = dropdown.querySelector('.dropdown-item');
            if (firstItem && dropdown.classList.contains('show')) {
                firstItem.click();
            }
        }
        if (e.key === 'Escape') {
            dropdown.classList.remove('show');
            this.blur();
        }
    });

    // ========== Untuk Jadwal ==========
    const inputJ = document.getElementById('plantSearchInputJadwal');
    const dropdownJ = document.getElementById('plantDropdownJadwal');
    const hiddenInputJ = document.getElementById('selectedPlantJadwal');
    const displayJ = document.getElementById('selectedPlantDisplayJadwal');
    const clearBtnJ = document.getElementById('clearPlantSelectionJadwal');

    function renderDropdownJ(filter = '') {
        const filtered = PLANT_LIST.filter(p => 
            p.name.toLowerCase().includes(filter.toLowerCase()) ||
            p.code.toLowerCase().includes(filter.toLowerCase())
        );

        if (filtered.length === 0) {
            dropdownJ.innerHTML = `<div class="dropdown-item" style="color:#8a6a6a;">Tidak ada plant ditemukan</div>`;
        } else {
            dropdownJ.innerHTML = filtered.map(p => {
                const nameHighlight = highlightTextPlant(p.name, filter);
                const codeHighlight = highlightTextPlant(p.code, filter);
                return `
                    <div class="dropdown-item" data-id="${p.id}" data-name="${p.name}" data-code="${p.code}">
                        ${nameHighlight}
                        <span class="plant-code">${codeHighlight}</span>
                    </div>
                `;
            }).join('');
        }

        dropdownJ.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', function() {
                const id = parseInt(this.dataset.id);
                const name = this.dataset.name;
                const code = this.dataset.code;
                selectPlantJ(id, name, code);
            });
        });
    }

    function selectPlantJ(id, name, code) {
        selectedPlantJadwal = { id, name, code };
        hiddenInputJ.value = id;
        inputJ.value = name;
        displayJ.innerHTML = `<span class="selected-value"><i class="fas fa-check-circle"></i> ${name} (${code})</span>`;
        clearBtnJ.classList.add('visible');
        dropdownJ.classList.remove('show');
        inputJ.classList.remove('error');
    }

    function clearPlantJ() {
        selectedPlantJadwal = null;
        hiddenInputJ.value = '';
        inputJ.value = '';
        displayJ.innerHTML = '';
        clearBtnJ.classList.remove('visible');
        dropdownJ.classList.remove('show');
        inputJ.focus();
    }

    inputJ.addEventListener('input', function() {
        const value = this.value.trim();
        if (value === '') {
            dropdownJ.classList.remove('show');
            if (!selectedPlantJadwal) {
                displayJ.innerHTML = '';
                clearBtnJ.classList.remove('visible');
            }
            return;
        }
        renderDropdownJ(value);
        dropdownJ.classList.add('show');
        clearBtnJ.classList.add('visible');
    });

    inputJ.addEventListener('focus', function() {
        if (this.value.trim() !== '') {
            renderDropdownJ(this.value.trim());
            dropdownJ.classList.add('show');
        }
    });

    document.addEventListener('click', function(e) {
        const wrapper = document.getElementById('plantSelectWrapperJadwal');
        if (!wrapper.contains(e.target)) {
            dropdownJ.classList.remove('show');
        }
    });

    clearBtnJ.addEventListener('click', clearPlantJ);

    inputJ.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const firstItem = dropdownJ.querySelector('.dropdown-item');
            if (firstItem && dropdownJ.classList.contains('show')) {
                firstItem.click();
            }
        }
        if (e.key === 'Escape') {
            dropdownJ.classList.remove('show');
            this.blur();
        }
    });

    renderDropdown('');
    renderDropdownJ('');
}

function highlightTextPlant(text, query) {
    if (!query || !text) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span class="highlight-match">$1</span>');
}

// ========================================================================
// ========== LOGIN SYSTEM ==========
// ========================================================================

const VALID_USERNAME = 'sasapolkesma';
const VALID_PASSWORD = 'sasapolkesma';

function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const errorMessage = document.getElementById('loginError');

    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
        errorMessage.classList.remove('show');
        document.getElementById('loginPage').classList.add('hidden');
        document.getElementById('mainApp').classList.add('visible');

        const initial = username.charAt(0).toUpperCase();
        document.getElementById('userAvatar').textContent = initial + initial;
        document.getElementById('userName').textContent = 'Safety Officer';

        showToast('✅ Selamat datang, Safety Officer!');

        setTimeout(initApp, 300);
    } else {
        errorMessage.textContent = '⚠️ Username atau password salah!';
        errorMessage.classList.add('show');
        document.getElementById('loginPassword').value = '';
        document.getElementById('loginPassword').focus();

        setTimeout(() => {
            errorMessage.classList.remove('show');
        }, 3000);
    }
}

function logout() {
    if (confirm('Anda yakin ingin keluar?')) {
        document.getElementById('mainApp').classList.remove('visible');
        document.getElementById('loginPage').classList.remove('hidden');
        document.getElementById('loginUsername').value = '';
        document.getElementById('loginPassword').value = '';
        document.getElementById('loginUsername').focus();
        showToast('👋 Anda telah keluar');
    }
}

document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        const loginPage = document.getElementById('loginPage');
        if (!loginPage.classList.contains('hidden')) {
            const form = document.getElementById('loginForm');
            if (document.activeElement === document.getElementById('loginUsername') ||
                document.activeElement === document.getElementById('loginPassword')) {
                form.dispatchEvent(new Event('submit'));
            }
        }
    }
});

window.addEventListener('load', function() {
    document.getElementById('loginUsername').focus();
});

// ========================================================================
// ========== CLOCK REAL TIME ==========
// ========================================================================

function updateClock() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    document.getElementById('currentDate').textContent = dateStr;
    const timeStr = now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    document.getElementById('currentTime').textContent = timeStr;
}

// ========================================================================
// ========== LIGHTBOX ==========
// ========================================================================

let lightboxImages = [];
let currentLightboxIndex = 0;

function openLightbox(images, index = 0) {
    if (!images || images.length === 0) return;
    lightboxImages = images;
    currentLightboxIndex = index;
    const overlay = document.getElementById('lightboxOverlay');
    const img = document.getElementById('lightboxImage');
    const info = document.getElementById('lightboxFileName');
    const counter = document.getElementById('lightboxCounter');

    img.src =
        `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400'%3E%3Crect width='600' height='400' fill='%232a2a2a'/%3E%3Ctext x='50%25' y='45%25' text-anchor='middle' fill='%23666' font-size='40' font-family='sans-serif'%3E📷%3C/text%3E%3Ctext x='50%25' y='60%25' text-anchor='middle' fill='%23888' font-size='20' font-family='sans-serif'%3E${images[index]}%3C/text%3E%3C/svg%3E`;
    info.textContent = images[index];
    counter.textContent = `${index + 1} dari ${images.length}`;
    document.getElementById('lightboxPrev').style.display = images.length > 1 ? 'flex' : 'none';
    document.getElementById('lightboxNext').style.display = images.length > 1 ? 'flex' : 'none';
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    document.getElementById('lightboxOverlay').classList.remove('show');
    document.body.style.overflow = '';
}

function navigateLightbox(direction) {
    const newIndex = currentLightboxIndex + direction;
    if (newIndex < 0 || newIndex >= lightboxImages.length) return;
    currentLightboxIndex = newIndex;
    const img = document.getElementById('lightboxImage');
    const info = document.getElementById('lightboxFileName');
    const counter = document.getElementById('lightboxCounter');
    img.src =
        `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400'%3E%3Crect width='600' height='400' fill='%232a2a2a'/%3E%3Ctext x='50%25' y='45%25' text-anchor='middle' fill='%23666' font-size='40' font-family='sans-serif'%3E📷%3C/text%3E%3Ctext x='50%25' y='60%25' text-anchor='middle' fill='%23888' font-size='20' font-family='sans-serif'%3E${lightboxImages[currentLightboxIndex]}%3C/text%3E%3C/svg%3E`;
    info.textContent = lightboxImages[currentLightboxIndex];
    counter.textContent = `${currentLightboxIndex + 1} dari ${lightboxImages.length}`;
}

document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
document.getElementById('lightboxOverlay').addEventListener('click', function(e) {
    if (e.target === this) closeLightbox();
});
document.getElementById('lightboxPrev').addEventListener('click', function(e) {
    e.stopPropagation();
    navigateLightbox(-1);
});
document.getElementById('lightboxNext').addEventListener('click', function(e) {
    e.stopPropagation();
    navigateLightbox(1);
});
document.addEventListener('keydown', function(e) {
    const overlay = document.getElementById('lightboxOverlay');
    if (!overlay.classList.contains('show')) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') navigateLightbox(-1);
    else if (e.key === 'ArrowRight') navigateLightbox(1);
});

// ========================================================================
// ========== SISTEM ==========
// ========================================================================

function switchTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    const tab = document.querySelector(`.nav-tab[data-panel="${tabName}"]`);
    if (tab) tab.classList.add('active');
    const panel = document.getElementById(`panel-${tabName}`);
    if (panel) panel.classList.add('active');
    setTimeout(() => {
        document.querySelectorAll('.search-wrapper input').forEach(inp => {
            inp.value = '';
            inp.dispatchEvent(new Event('input'));
        });
    }, 100);
}

function getProgress(item) {
    if (!item.perbaikan || item.perbaikan.length === 0) return 0;
    const done = item.perbaikan.filter(p => p.status === 'closed').length;
    return Math.round((done / item.perbaikan.length) * 100);
}

function getStatusPerbaikan(item) {
    if (!item.perbaikan || item.perbaikan.length === 0) return 'open';
    const allClosed = item.perbaikan.every(p => p.status === 'closed');
    if (allClosed) return 'selesai_perbaikan';
    const hasProgress = item.perbaikan.some(p => p.status === 'on-progress');
    if (hasProgress) return 'perbaikan';
    return 'tinjau';
}

function isOverdue(dueDate) {
    if (!dueDate || dueDate === '-') return false;
    const today = new Date();
    const parts = dueDate.split('/');
    if (parts.length === 3) {
        const due = new Date(parts[2], parts[1] - 1, parts[0]);
        return due < today;
    }
    return false;
}

function highlightText(text, query) {
    if (!query || !text) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
}

function renderGallery(images, label = '') {
    if (!images || images.length === 0 || images[0] === '-') {
        return `<div class="thumb-placeholder"><i class="fas fa-image"></i></div>`;
    }
    return `
            <div class="gallery-thumb">
                ${images.map((img, idx) => `
                    <img class="thumb" 
                         src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='45' height='45'%3E%3Crect width='45' height='45' fill='%23f0e8e8'/%3E%3Ctext x='50%25' y='55%25' text-anchor='middle' fill='%238a6a6a' font-size='8' font-family='sans-serif'%3E📷%3C/text%3E%3C/svg%3E" 
                         alt="${img}" 
                         onclick="openLightbox(${JSON.stringify(images)}, ${idx})"
                         title="Klik untuk preview: ${img}"
                         style="cursor:pointer;">
                `).join('')}
            </div>
        `;
}

// ========================================================================
// ========== RENDER APPROVAL STAGES ==========
// ========================================================================

function renderApprovalStages(item) {
    const approvals = item.approvals || {};
    
    return `
        <div class="approval-stages">
            ${APPROVAL_STAGES.map((stage, index) => {
                const approval = approvals[stage.id] || { approved: false, by: null, jabatan: stage.title, tanggal: null };
                const isCompleted = approval.approved === true;
                const isCurrent = !isCompleted && (index === 0 || (approvals[APPROVAL_STAGES[index-1].id] && approvals[APPROVAL_STAGES[index-1].id].approved === true));
                const isPending = !isCompleted && !isCurrent;

                let statusClass = 'waiting';
                let statusText = 'Menunggu';
                let actionHtml = '';

                if (isCompleted) {
                    statusClass = 'done';
                    statusText = '✅ Disetujui';
                } else if (isCurrent) {
                    statusClass = 'in-progress';
                    statusText = '⏳ Menunggu Persetujuan';
                    actionHtml = `
                        <button class="stage-action-btn approve" onclick="approveStage('${item.id}', ${stage.id})">
                            <i class="fas fa-check"></i> Setujui
                        </button>
                        <button class="stage-action-btn reject" onclick="rejectStage('${item.id}', ${stage.id})">
                            <i class="fas fa-times"></i> Tolak
                        </button>
                    `;
                } else {
                    statusClass = 'waiting';
                    statusText = '⏳ Menunggu';
                }

                const stageClass = isCompleted ? 'completed' : (isCurrent ? 'current' : 'pending');

                return `
                    <div class="approval-stage ${stageClass}">
                        <div class="stage-number">${stage.order}</div>
                        <div class="stage-info">
                            <div class="stage-title">${stage.title}</div>
                            <div class="stage-detail">
                                ${isCompleted ? `${approval.by} · ${approval.tanggal}` : (isCurrent ? 'Menunggu persetujuan' : 'Belum mencapai tahap ini')}
                            </div>
                        </div>
                        <span class="stage-status ${statusClass}">${statusText}</span>
                        ${actionHtml}
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// ========================================================================
// ========== APPROVAL FUNCTIONS ==========
// ========================================================================

window.approveStage = function(inspeksiId, stageId) {
    const item = inspeksiData.find(d => d.id === inspeksiId);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }

    const stage = APPROVAL_STAGES.find(s => s.id === stageId);
    if (!stage) { showToast('⚠️ Tahap tidak ditemukan'); return; }

    const prevStage = APPROVAL_STAGES.find(s => s.order === stage.order - 1);
    if (prevStage) {
        const prevApproval = item.approvals && item.approvals[prevStage.id];
        if (!prevApproval || !prevApproval.approved) {
            showToast('⚠️ Tahap sebelumnya belum disetujui!');
            return;
        }
    }

    if (item.approvals && item.approvals[stageId] && item.approvals[stageId].approved) {
        showToast('⚠️ Tahap ini sudah disetujui!');
        return;
    }

    if (!item.approvals) item.approvals = {};
    item.approvals[stageId] = {
        approved: true,
        by: stage.name === 'Safety Officer' ? item.petugas : 'Approver',
        jabatan: stage.title,
        tanggal: new Date().toLocaleString('id-ID')
    };

    const allApproved = APPROVAL_STAGES.every(s => item.approvals[s.id] && item.approvals[s.id].approved === true);
    if (allApproved) {
        item.status = 'selesai';
        showToast('🎉 Semua tahap pengesahan telah disetujui! Inspeksi selesai.');
    } else {
        showToast(`✅ ${stage.title} telah menyetujui inspeksi ${inspeksiId}`);
    }

    refreshAll();
    openApprovalModal(inspeksiId);
};

window.rejectStage = function(inspeksiId, stageId) {
    const item = inspeksiData.find(d => d.id === inspeksiId);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }

    const stage = APPROVAL_STAGES.find(s => s.id === stageId);
    if (!stage) { showToast('⚠️ Tahap tidak ditemukan'); return; }

    if (confirm(`Tolak inspeksi ${inspeksiId} oleh ${stage.title}?`)) {
        if (!item.approvals) item.approvals = {};
        item.approvals[stageId] = {
            approved: false,
            by: 'Rejected',
            jabatan: stage.title,
            tanggal: new Date().toLocaleString('id-ID'),
            rejected: true
        };
        item.status = 'tinjau';
        showToast(`❌ ${stage.title} menolak inspeksi ${inspeksiId}`);
        refreshAll();
        openApprovalModal(inspeksiId);
    }
};

// ========================================================================
// ========== APPROVAL MODAL ==========
// ========================================================================

function openApprovalModal(inspeksiId) {
    const item = inspeksiData.find(d => d.id === inspeksiId);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }

    const modal = document.getElementById('approvalModal');
    const content = document.getElementById('approvalContent');

    content.innerHTML = `
        <div class="detail-container">
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="label">ID Inspeksi</span>
                    <span class="value" style="color:#b31b1b;font-weight:700;">${item.id}</span>
                </div>
                <div class="detail-item">
                    <span class="label">Lokasi / Plant</span>
                    <span class="value">${item.lokasi}</span>
                </div>
                <div class="detail-item">
                    <span class="label">Safety Officer</span>
                    <span class="value">${item.petugas}</span>
                </div>
                <div class="detail-item">
                    <span class="label">Status</span>
                    <span class="value"><span class="status-badge ${item.status}">${item.status.charAt(0).toUpperCase() + item.status.slice(1)}</span></span>
                </div>
            </div>

            <div class="detail-section">
                <div class="section-title"><i class="fas fa-stamp"></i> Tahap Pengesahan (4 Tahap)</div>
                ${renderApprovalStages(item)}
            </div>

            ${item.temuan && item.temuan.length > 0 ? `
                <div class="detail-section">
                    <div class="section-title"><i class="fas fa-list"></i> Daftar Temuan</div>
                    <ul class="temuan-list-detail">
                        ${item.temuan.map(t => `<li><span>${t.deskripsi}</span><span class="temuan-kategori">${t.kategori}</span></li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </div>
    `;

    modal.classList.add('show');
}

document.getElementById('closeApprovalModal').addEventListener('click', function() {
    document.getElementById('approvalModal').classList.remove('show');
});
document.getElementById('approvalModal').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('show');
});

// ========================================================================
// ========== PDF GENERATOR ==========
// ========================================================================

window.cetakPDF = function(id) {
    const item = inspeksiData.find(d => d.id === id);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }

    const allApproved = APPROVAL_STAGES.every(s => item.approvals && item.approvals[s.id] && item.approvals[s.id].approved === true);
    if (!allApproved) {
        showToast('⚠️ Inspeksi belum disetujui semua tahap! Silahkan selesaikan pengesahan terlebih dahulu.');
        return;
    }

    const now = new Date();
    const pdfContainer = document.getElementById('pdfContent');

    const allPhotos = [...(item.fotoDekat || []), ...(item.fotoJauh || [])];
    const galleryHtml = allPhotos.length > 0 && allPhotos[0] !== '-' ?
        allPhotos.map(img =>
            `<div class="pdf-thumb">📷</div>`
        ).join('') :
        '<span style="color:#888;">Tidak ada foto</span>';

    const temuanRows = item.temuan && item.temuan.length > 0 ?
        item.temuan.map((t, idx) =>
            `<tr><td>${idx + 1}</td><td>${t.deskripsi}</td><td><span style="background:#f0e8e8;padding:0.1rem 0.5rem;border-radius:4px;font-size:0.7rem;">${t.kategori}</span></td></tr>`
        ).join('') :
        '<tr><td colspan="3" style="text-align:center;color:#888;">Tidak ada temuan</td></tr>';

    const perbaikanRows = item.perbaikan && item.perbaikan.length > 0 ?
        item.perbaikan.map(p => {
            const statusMap = {
                'closed': '✅ Selesai',
                'on-progress': '🔄 Progres',
                'open': '⏳ Pending'
            };
            return `<tr><td>${p.tgl}</td><td>${p.action}</td><td>${p.pic}</td><td><span style="background:${p.status === 'closed' ? '#e8f5e9' : p.status === 'on-progress' ? '#fff3e0' : '#fce4ec'};padding:0.1rem 0.5rem;border-radius:4px;font-size:0.7rem;">${statusMap[p.status] || p.status}</span></td></tr>`;
        }).join('') :
        '<tr><td colspan="4" style="text-align:center;color:#888;">Belum ada tindakan perbaikan</td></tr>';

    const approvalSignatures = APPROVAL_STAGES.map(s => {
        const approval = item.approvals && item.approvals[s.id];
        if (approval && approval.approved) {
            return `
                <div class="sign-item">
                    <div style="font-size:0.7rem;color:#888;">${s.title}</div>
                    <div class="sign-name">${approval.by}</div>
                    <div style="font-size:0.7rem;color:#666;">${approval.jabatan}</div>
                    <div class="sign-line"></div>
                    <div style="font-size:0.6rem;color:#888;">${approval.tanggal}</div>
                </div>
            `;
        }
        return `
            <div class="sign-item">
                <div style="font-size:0.7rem;color:#888;">${s.title}</div>
                <div style="font-size:0.8rem;color:#aaa;">Belum ditandatangani</div>
                <div class="sign-line" style="border-color:#ddd;"></div>
            </div>
        `;
    }).join('');

    pdfContainer.innerHTML = `
            <div class="pdf-header">
                <h1>SHE <span>Sasa</span></h1>
                <div class="sub">SISTEM INFORMASI K3</div>
                <div style="margin-top:0.3rem;font-size:0.8rem;color:#888;">Laporan Inspeksi Keselamatan dan Kesehatan Kerja</div>
            </div>

            <div class="pdf-body">
                <div class="info-grid">
                    <div class="item">
                        <div class="label">ID Inspeksi</div>
                        <div class="value" style="color:#b31b1b;font-weight:700;">${item.id}</div>
                    </div>
                    <div class="item">
                        <div class="label">Status</div>
                        <div class="value"><span style="background:${item.status === 'selesai' ? '#e8f5e9' : item.status === 'proses' ? '#fff3e0' : '#fce4ec'};padding:0.1rem 0.6rem;border-radius:60px;font-size:0.75rem;">${item.status.charAt(0).toUpperCase() + item.status.slice(1)}</span></div>
                    </div>
                    <div class="item">
                        <div class="label">Lokasi / Plant</div>
                        <div class="value">${item.lokasi}</div>
                    </div>
                    <div class="item">
                        <div class="label">Keterangan Lokasi</div>
                        <div class="value">${item.keteranganLokasi || '-'}</div>
                    </div>
                    <div class="item">
                        <div class="label">Tanggal Inspeksi</div>
                        <div class="value">${item.tanggal}</div>
                    </div>
                    <div class="item">
                        <div class="label">Safety Officer</div>
                        <div class="value">${item.petugas}</div>
                    </div>
                    <div class="item">
                        <div class="label">Due Date ke Plant</div>
                        <div class="value">${item.dueDate || '-'}</div>
                    </div>
                    <div class="item">
                        <div class="label">Jumlah Temuan</div>
                        <div class="value">${item.temuan ? item.temuan.length : 0}</div>
                    </div>
                </div>

                <div class="section">
                    <div class="title"><i class="fas fa-list"></i> Daftar Temuan</div>
                    <table>
                        <thead>
                            <tr>
                                <th style="width:40px;">No</th>
                                <th>Deskripsi Temuan</th>
                                <th style="width:120px;">Kategori</th>
                            </tr>
                        </thead>
                        <tbody>${temuanRows}</tbody>
                    </table>
                </div>

                <div class="section">
                    <div class="title"><i class="fas fa-tools"></i> Tindakan Perbaikan</div>
                    <table>
                        <thead>
                            <tr>
                                <th style="width:100px;">Tanggal</th>
                                <th>Tindakan</th>
                                <th style="width:100px;">PIC</th>
                                <th style="width:100px;">Status</th>
                            </tr>
                        </thead>
                        <tbody>${perbaikanRows}</tbody>
                    </table>
                </div>

                <div class="section">
                    <div class="title"><i class="fas fa-images"></i> Dokumentasi Foto</div>
                    <div class="pdf-gallery">${galleryHtml}</div>
                    <div style="font-size:0.7rem;color:#888;margin-top:0.3rem;">${allPhotos.length} foto terupload</div>
                </div>

                <div class="section">
                    <div class="title"><i class="fas fa-stamp"></i> Lembar Pengesahan</div>
                    <div class="signature-block" style="display:flex;justify-content:space-around;flex-wrap:wrap;gap:1rem;margin-top:0.5rem;">
                        ${approvalSignatures}
                    </div>
                </div>
            </div>

            <div class="pdf-footer">
                <div class="legal-text">
                    <i class="fas fa-check-circle"></i>
                    Dokumen ini telah ditandatangani dan disetujui secara elektronik melalui 
                    <strong>Sistem Informasi K3 SHE Sasa</strong> pada tanggal ${new Date().toLocaleString('id-ID')}.
                    <br>
                    <span style="font-size:0.65rem;">Dokumen ini sah dan berlaku sebagai bukti resmi inspeksi keselamatan dan kesehatan kerja.</span>
                </div>

                <div style="margin-top:0.5rem;font-size:0.6rem;color:#aaa;text-align:center;">
                    Dicetak pada: ${now.toLocaleString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    <br>
                    © SHE Sasa - Sistem Informasi K3
                </div>
            </div>

            <div class="pdf-stamp">
                DISETUJUI
                <small>Elektronik</small>
            </div>
        `;

    const element = document.getElementById('pdfContent');
    const opt = {
        margin: [0.5, 0.5, 0.5, 0.5],
        filename: `Laporan_Inspeksi_${item.id}_${new Date().toISOString().slice(0,10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            letterRendering: true,
            scrollY: 0,
            windowHeight: element.scrollHeight
        },
        jsPDF: {
            unit: 'in',
            format: 'a4',
            orientation: 'portrait'
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    showToast('📄 Sedang membuat PDF...');

    html2pdf().set(opt).from(element).save().then(() => {
        showToast(`✅ PDF Laporan ${item.id} berhasil dicetak!`);
    }).catch((err) => {
        console.error('PDF error:', err);
        showToast('⚠️ Gagal membuat PDF: ' + err.message);
    });
};

// ========================================================================
// ========== CALENDAR FUNCTIONS ==========
// ========================================================================

let currentCalendarMonth = new Date().getMonth();
let currentCalendarYear = new Date().getFullYear();

function renderCalendar() {
    const container = document.getElementById('calendarContainer');
    if (!container) return;

    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

    const firstDay = new Date(currentCalendarYear, currentCalendarMonth, 1).getDay();
    const daysInMonth = new Date(currentCalendarYear, currentCalendarMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentCalendarYear, currentCalendarMonth, 0).getDate();

    const today = new Date();
    const todayDate = today.getDate();
    const todayMonth = today.getMonth();
    const todayYear = today.getFullYear();

    const events = {};
    jadwalData.forEach(j => {
        if (j.tanggalJadwal) {
            const d = new Date(j.tanggalJadwal);
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            if (!events[key]) events[key] = [];
            events[key].push({ 
                plant: j.plantName, 
                status: j.tanggalRealisasi ? 'completed' : 'scheduled',
                id: j.id,
                isRealisasi: false,
                officer: j.officer,
                minggu: j.minggu,
                periode: j.periode
            });
        }
        if (j.tanggalRealisasi) {
            const d = new Date(j.tanggalRealisasi);
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            if (!events[key]) events[key] = [];
            events[key].push({ 
                plant: j.plantName, 
                status: 'completed',
                id: j.id,
                isRealisasi: true,
                officer: j.officer,
                minggu: j.minggu,
                periode: j.periode
            });
        }
    });

    let html = `
        <div class="calendar-header">
            <button class="nav-btn" onclick="changeCalendarMonth(-1)"><i class="fas fa-chevron-left"></i></button>
            <span class="month-year">${monthNames[currentCalendarMonth]} ${currentCalendarYear}</span>
            <button class="nav-btn" onclick="changeCalendarMonth(1)"><i class="fas fa-chevron-right"></i></button>
        </div>
        <div class="calendar-grid">
    `;

    dayNames.forEach(name => {
        html += `<div class="day-name">${name}</div>`;
    });

    for (let i = 0; i < firstDay; i++) {
        const prevDate = daysInPrevMonth - firstDay + i + 1;
        html += `<div class="day-cell other-month">${prevDate}</div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${currentCalendarYear}-${String(currentCalendarMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const isToday = day === todayDate && currentCalendarMonth === todayMonth && currentCalendarYear === todayYear;
        const dayEvents = events[dateKey] || [];
        const hasEvent = dayEvents.length > 0;

        let dotClass = '';

        if (hasEvent) {
            const hasCompleted = dayEvents.some(e => e.status === 'completed' && !e.isRealisasi);
            const hasScheduled = dayEvents.some(e => e.status === 'scheduled');
            const hasRealisasi = dayEvents.some(e => e.isRealisasi === true);
            
            if (hasCompleted && hasScheduled) {
                dotClass = 'mixed';
            } else if (hasCompleted || hasRealisasi) {
                dotClass = 'completed';
            } else if (hasScheduled) {
                dotClass = 'scheduled';
                const eventDate = new Date(currentCalendarYear, currentCalendarMonth, day);
                if (eventDate < today) {
                    dotClass = 'overdue';
                }
            }
        }

        html += `
            <div class="day-cell ${isToday ? 'today' : ''} ${hasEvent ? 'has-event' : ''}" 
                 ${hasEvent ? `onclick="showDayEvents('${dateKey}')"` : ''}>
                <span class="day-number">${day}</span>
                ${hasEvent ? `<div class="event-dot ${dotClass}"></div>` : ''}
            </div>
        `;
    }

    html += `</div>`;

    html += `
        <div class="calendar-legend">
            <span class="legend-item"><span class="dot scheduled"></span> Terjadwal</span>
            <span class="legend-item"><span class="dot completed"></span> Selesai</span>
            <span class="legend-item"><span class="dot overdue"></span> Overdue</span>
            <span class="legend-item"><span class="dot mixed"></span> Campuran</span>
        </div>
    `;

    container.innerHTML = html;
}

function changeCalendarMonth(delta) {
    currentCalendarMonth += delta;
    if (currentCalendarMonth > 11) {
        currentCalendarMonth = 0;
        currentCalendarYear++;
    } else if (currentCalendarMonth < 0) {
        currentCalendarMonth = 11;
        currentCalendarYear--;
    }
    renderCalendar();
}

// ========================================================================
// ========== SHOW DAY EVENTS WITH MODAL ==========
// ========================================================================

function showDayEvents(dateKey) {
    const events = [];
    jadwalData.forEach(j => {
        if (j.tanggalJadwal) {
            const d = new Date(j.tanggalJadwal);
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            if (key === dateKey) {
                events.push({
                    plant: j.plantName,
                    tanggal: formatDate(j.tanggalJadwal),
                    status: j.tanggalRealisasi ? '✅ Sudah dilaksanakan' : '📋 Terjadwal',
                    realisasi: j.tanggalRealisasi ? formatDate(j.tanggalRealisasi) : 'Belum',
                    minggu: j.minggu || '-',
                    periode: j.periode || '-',
                    officer: j.officer
                });
            }
        }
        if (j.tanggalRealisasi) {
            const d = new Date(j.tanggalRealisasi);
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            if (key === dateKey) {
                events.push({
                    plant: j.plantName,
                    tanggal: formatDate(j.tanggalRealisasi),
                    status: '✅ Realisasi',
                    realisasi: formatDate(j.tanggalRealisasi),
                    minggu: j.minggu || '-',
                    periode: j.periode || '-',
                    officer: j.officer
                });
            }
        }
    });

    if (events.length === 0) {
        showToast('📅 Tidak ada jadwal pada tanggal ini');
        return;
    }

    // Tampilkan modal cantik
    const modal = document.getElementById('calendarModal');
    const content = document.getElementById('calendarModalContent');
    
    let eventHtml = events.map(e => `
        <div class="calendar-event-item">
            <div class="event-icon">🏭</div>
            <div class="event-detail">
                <div class="event-title"><strong>${e.plant}</strong></div>
                <div class="event-meta">
                    <span class="event-status ${e.status.includes('Realisasi') || e.status.includes('dilaksanakan') ? 'completed' : 'scheduled'}">${e.status}</span>
                    ${e.periode ? `<span class="event-meta-item">📅 Periode ${e.periode}</span>` : ''}
                    ${e.minggu ? `<span class="event-meta-item">📌 Minggu ke-${e.minggu}</span>` : ''}
                    ${e.officer ? `<span class="event-meta-item">👤 ${e.officer}</span>` : ''}
                </div>
            </div>
        </div>
    `).join('');

    content.innerHTML = `
        <div style="margin-bottom:1rem;font-size:0.9rem;color:#7a4a4a;">
            <i class="fas fa-calendar-day" style="color:#d42a2a;"></i> 
            <strong>${formatDate(dateKey)}</strong>
        </div>
        <div class="calendar-event-list">
            ${eventHtml}
        </div>
    `;
    
    modal.classList.add('show');
}

// ========================================================================
// ========== MODAL KALENDER EVENTS ==========
// ========================================================================

document.getElementById('closeCalendarModal').addEventListener('click', function() {
    document.getElementById('calendarModal').classList.remove('show');
});
document.getElementById('calendarModal').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('show');
});

// ========================================================================
// ========== SEARCH FUNCTIONS ==========
// ========================================================================

function setupSearch(inputId, clearId, countId, dataGetter, renderFunction, searchFields) {
    const input = document.getElementById(inputId);
    const clearBtn = document.getElementById(clearId);
    const countEl = document.getElementById(countId);
    if (!input) return;

    function doSearch() {
        const query = input.value.trim().toLowerCase();
        const data = dataGetter();
        if (query === '') {
            clearBtn.classList.remove('visible');
            countEl.textContent = '';
            renderFunction(data, '');
            return;
        }
        clearBtn.classList.add('visible');
        const filtered = data.filter(item => {
            return searchFields.some(field => {
                const value = String(item[field] || '').toLowerCase();
                return value.includes(query);
            });
        });
        countEl.textContent = `${filtered.length} dari ${data.length}`;
        renderFunction(filtered, query);
    }
    input.addEventListener('input', doSearch);
    clearBtn.addEventListener('click', function() {
        input.value = '';
        doSearch();
        input.focus();
    });
    doSearch();
}

// ========================================================================
// ========== RENDER FUNCTIONS ==========
// ========================================================================

function renderDashboardJadwal() {
    renderCalendar();
}

function renderInspeksiTable(data, tbodyId, isFull, highlightQuery = '') {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    if (data.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="10" style="text-align:center;padding:2rem;color:#8a6a6a;">Tidak ada data ditemukan</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(item => {
        const progress = getProgress(item);
        const statusPerbaikan = getStatusPerbaikan(item);
        const statusLabel = statusPerbaikan === 'selesai_perbaikan' ? '✅ Selesai' :
            statusPerbaikan === 'perbaikan' ? '🔄 Perbaikan' : '⏳ Tinjau';
        const overdue = isOverdue(item.dueDate);
        const jmlTemuan = item.temuan ? item.temuan.length : 0;
        const temuanPreview = item.temuan && item.temuan.length > 0 ? item.temuan[0].deskripsi : '-';
        const moreTemuan = jmlTemuan > 1 ? ` +${jmlTemuan - 1} lagi` : '';

        const lokasiDisplay = highlightQuery ? highlightText(item.lokasi, highlightQuery) : item.lokasi;
        const temuanDisplay = highlightQuery ? highlightText(temuanPreview, highlightQuery) : temuanPreview;

        const progressBar = `
                <div class="progress-wrapper">
                    <div class="progress-bar-container">
                        <div class="progress-fill ${statusPerbaikan}" style="width:${progress}%"></div>
                    </div>
                    <span class="progress-text">${progress}%</span>
                    <span class="progress-label">${statusLabel}</span>
                </div>
            `;

        const overdueBadge = overdue ?
            `<span class="overdue-badge"><i class="fas fa-exclamation-circle"></i> OVERDUE</span>` :
            '';

        const exportBtn = item.temuan && item.temuan.length > 0 ?
            `<button class="btn-export-temuan" onclick="exportTemuanPerItem('${item.id}')" title="Export temuan ke Excel"><i class="fas fa-file-excel"></i></button>` :
            '';

        const allApproved = APPROVAL_STAGES.every(s => item.approvals && item.approvals[s.id] && item.approvals[s.id].approved === true);
        const pdfBtn = allApproved ?
            `<button class="btn-pdf" onclick="cetakPDF('${item.id}')" title="Cetak PDF Laporan"><i class="fas fa-file-pdf"></i></button>` :
            `<button class="btn-pdf" disabled title="Harus disetujui semua tahap terlebih dahulu"><i class="fas fa-file-pdf"></i></button>`;

        let approvalStatus = 'Belum';
        let approvalColor = 'menunggu';
        if (allApproved) {
            approvalStatus = '✅ Lengkap';
            approvalColor = 'selesai';
        } else {
            const approvedCount = Object.values(item.approvals || {}).filter(a => a && a.approved === true).length;
            if (approvedCount > 0) {
                approvalStatus = `${approvedCount}/${APPROVAL_STAGES.length}`;
                approvalColor = 'proses';
            }
        }

        if (isFull) {
            return `
                    <tr>
                        <td><strong>${item.id}</strong></td>
                        <td>${lokasiDisplay}</td>
                        <td>${item.keteranganLokasi || '-'}</td>
                        <td>${item.tanggal}</td>
                        <td>${item.petugas}</td>
                        <td>${jmlTemuan}</td>
                        <td><span class="status-badge ${item.status}">${item.status.charAt(0).toUpperCase() + item.status.slice(1)}</span></td>
                        <td>
                            <span class="status-badge ${approvalColor}">${approvalStatus}</span>
                            <button class="btn-sm info" onclick="openApprovalModal('${item.id}')" style="margin-top:0.2rem;"><i class="fas fa-stamp"></i></button>
                        </td>
                        <td>${exportBtn} ${pdfBtn}</td>
                    </tr>
                `;
        } else {
            return `
                    <tr>
                        <td><strong>${item.id}</strong></td>
                        <td>${lokasiDisplay}</td>
                        <td>${temuanDisplay}${moreTemuan}</td>
                        <td>${item.dueDate || '-'} ${overdueBadge}</td>
                        <td><span class="status-badge ${item.status}">${item.status.charAt(0).toUpperCase() + item.status.slice(1)}</span></td>
                        <td>${progressBar}</td>
                        <td>
                            <button class="btn-sm info" onclick="openDetailModal('${item.id}')"><i class="fas fa-eye"></i></button>
                            <button class="btn-sm primary" onclick="openPerbaikanModal('${item.id}')"><i class="fas fa-tools"></i></button>
                            <button class="btn-sm warning" onclick="openApprovalModal('${item.id}')"><i class="fas fa-stamp"></i></button>
                            ${exportBtn}
                            ${pdfBtn}
                        </td>
                    </tr>
                `;
        }
    }).join('');
}

function renderJadwalTable(data = null, highlightQuery = '') {
    const tbody = document.getElementById('jadwalTableBody');
    if (!tbody) return;
    const displayData = data !== null ? data : jadwalData;
    let notifCount = 0;

    if (displayData.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#8a6a6a;">Tidak ada data ditemukan</td></tr>';
        updateNotifBadge(0);
        return 0;
    }

    const limitedData = displayData.slice(0, 100);

    tbody.innerHTML = limitedData.map(item => {
        const periode = PERIODE_LIST.find(p => p.id === item.periode);
        const plant = PLANT_LIST.find(p => p.id === item.plantId);
        
        const plantDisplay = highlightQuery ? highlightText(item.plantName, highlightQuery) : item.plantName;
        const officerDisplay = highlightQuery ? highlightText(item.officer, highlightQuery) : item.officer;
        const periodeDisplay = highlightQuery && periode ? highlightText(periode.name, highlightQuery) : (periode ? periode.name : 'Periode ' + item.periode);
        const tanggalJadwalDisplay = item.tanggalJadwal ? formatDate(item.tanggalJadwal) : '-';
        const tanggalRealisasiDisplay = item.tanggalRealisasi ? formatDate(item.tanggalRealisasi) : '-';
        const mingguDisplay = item.minggu ? `Minggu ${item.minggu}` : '-';

        const isOverdueSchedule = item.tanggalJadwal && new Date(item.tanggalJadwal) < new Date() && !item.tanggalRealisasi;

        let statusClass = 'proses';
        let statusText = 'Aktif';
        if (item.tanggalRealisasi) {
            statusClass = 'selesai';
            statusText = '✅ Selesai';
        } else if (isOverdueSchedule) {
            statusClass = 'terlambat';
            statusText = '⚠️ Overdue';
        }

        return `
                <tr>
                    <td>${plantDisplay} ${plant ? '<span style="font-size:0.6rem;color:#8a6a6a;">('+plant.code+')</span>' : ''}</td>
                    <td>${periodeDisplay}</td>
                    <td>${mingguDisplay}</td>
                    <td>${tanggalJadwalDisplay} ${isOverdueSchedule ? '<span class="overdue-badge"><i class="fas fa-exclamation-circle"></i> OVERDUE</span>' : ''}</td>
                    <td>${tanggalRealisasiDisplay}</td>
                    <td>${officerDisplay}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>
                        <button class="btn-sm warning" onclick="editJadwal('${item.id}')"><i class="fas fa-edit"></i></button>
                        <button class="btn-sm danger" onclick="hapusJadwal('${item.id}')"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
    }).join('');

    if (data === null) {
        updateNotifBadge(notifCount);
    }
    return notifCount;
}

function renderPerbaikanTable(data = null, highlightQuery = '') {
    const tbody = document.getElementById('perbaikanTableBody');
    if (!tbody) return;
    const sourceData = data !== null ? data : inspeksiData;
    const displayData = sourceData.filter(item => item.perbaikan && item.perbaikan.length > 0);

    if (displayData.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="9" style="text-align:center;padding:2rem;color:#8a6a6a;">Tidak ada data ditemukan</td></tr>';
        return;
    }

    tbody.innerHTML = displayData.map(item => {
        const progress = getProgress(item);
        const statusPerbaikan = getStatusPerbaikan(item);
        const lastAction = item.perbaikan[item.perbaikan.length - 1];
        const temuanText = item.temuan && item.temuan.length > 0 ? item.temuan[0].deskripsi : '-';
        const overdue = isOverdue(item.dueDate);

        const lokasiDisplay = highlightQuery ? highlightText(item.lokasi, highlightQuery) : item.lokasi;
        const temuanDisplay = highlightQuery ? highlightText(temuanText, highlightQuery) : temuanText;
        const actionDisplay = highlightQuery && lastAction ? highlightText(lastAction.action, highlightQuery) :
            (lastAction ? lastAction.action : '-');
        const picDisplay = highlightQuery && lastAction ? highlightText(lastAction.pic, highlightQuery) : (
            lastAction ? lastAction.pic : '-');

        const overdueBadge = overdue ?
            `<span class="overdue-badge"><i class="fas fa-exclamation-circle"></i> OVERDUE</span>` :
            '';

        const progressBar = `
                <div class="progress-wrapper">
                    <div class="progress-bar-container">
                        <div class="progress-fill ${statusPerbaikan}" style="width:${progress}%"></div>
                    </div>
                    <span class="progress-text">${progress}%</span>
                </div>
            `;

        const statusMap = {
            'selesai_perbaikan': 'Closed',
            'perbaikan': 'On Progress',
            'tinjau': 'Open'
        };

        return `
                <tr>
                    <td><strong>${item.id}</strong></td>
                    <td>${lokasiDisplay}</td>
                    <td>${temuanDisplay}</td>
                    <td>${item.dueDate || '-'} ${overdueBadge}</td>
                    <td>${actionDisplay}</td>
                    <td>${picDisplay}</td>
                    <td>${progressBar}</td>
                    <td><span class="status-badge ${statusPerbaikan}">${statusMap[statusPerbaikan] || statusPerbaikan}</span></td>
                    <td>
                        <button class="btn-sm primary" onclick="openPerbaikanModal('${item.id}')"><i class="fas fa-edit"></i></button>
                        <button class="btn-sm info" onclick="openDetailModal('${item.id}')"><i class="fas fa-eye"></i></button>
                    </td>
                </tr>
            `;
    }).join('');
}

function renderInspeksiWithSearch(data, query) {
    renderInspeksiTable(data, 'inspeksiTableBody', false, query);
}

function renderAllInspeksiWithSearch(data, query) {
    renderInspeksiTable(data, 'allInspeksiTable', true, query);
}

function renderJadwalWithSearch(data, query) {
    renderJadwalTable(data, query);
}

function renderPerbaikanWithSearch(data, query) {
    renderPerbaikanTable(data, query);
}

// ========================================================================
// ========== NOTIFICATION BADGE ==========
// ========================================================================

function updateNotifBadge(count) {
    const countEl = document.getElementById('notifCount');
    const dotEl = document.getElementById('notifDot');
    if (count > 0) {
        countEl.textContent = count;
        dotEl.classList.add('active');
    } else {
        countEl.textContent = '0';
        dotEl.classList.remove('active');
    }
}

// ========================================================================
// ========== CHART: Temuan per Plant ==========
// ========================================================================

let temuanPlantChart = null;

function renderTemuanPlantChart() {
    const ctx = document.getElementById('temuanPlantChart').getContext('2d');

    const plantCounts = {};
    PLANT_LIST.forEach(p => {
        plantCounts[p.name] = 0;
    });

    inspeksiData.forEach(item => {
        if (item.temuan && item.temuan.length > 0) {
            const plantName = item.lokasi;
            if (plantCounts[plantName] !== undefined) {
                plantCounts[plantName] += item.temuan.length;
            }
        }
    });

    const labels = Object.keys(plantCounts);
    const data = Object.values(plantCounts);

    const colors = [
        '#d42a2a', '#e67e22', '#f1c40f', '#2ecc71', '#3498db',
        '#9b59b6', '#1abc9c', '#e74c3c', '#2c3e50', '#f39c12',
        '#2980b9', '#8e44ad', '#16a085', '#c0392b', '#27ae60',
        '#d35400'
    ];

    if (temuanPlantChart) {
        temuanPlantChart.destroy();
    }

    temuanPlantChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Jumlah Temuan',
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderRadius: 6,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 30,
                        font: {
                            size: 8
                        }
                    }
                }
            }
        }
    });
}

// ========================================================================
// ========== EXPORT FUNCTIONS ==========
// ========================================================================

window.exportTemuanPerItem = function(id) {
    const item = inspeksiData.find(d => d.id === id);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }
    if (!item.temuan || item.temuan.length === 0) { showToast('⚠️ Tidak ada temuan'); return; }

    const exportData = item.temuan.map((t, idx) => ({
        'No': idx + 1,
        'ID Inspeksi': item.id,
        'Lokasi / Plant': item.lokasi,
        'Keterangan Lokasi': item.keteranganLokasi || '-',
        'Tanggal Inspeksi': item.tanggal,
        'Safety Officer': item.petugas,
        'Deskripsi Temuan': t.deskripsi,
        'Kategori': t.kategori,
        'Status Inspeksi': item.status,
        'Due Date Plant': item.dueDate || '-',
        'Status Pengesahan': getApprovalStatusText(item)
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [
        { wch: 5 }, { wch: 12 }, { wch: 25 }, { wch: 20 }, { wch: 15 },
        { wch: 15 }, { wch: 35 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
        { wch: 25 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Temuan');
    XLSX.writeFile(wb, `Temuan_${item.id}_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast(`📊 ${item.temuan.length} temuan dari ${item.id} diekspor`);
};

function getApprovalStatusText(item) {
    const allApproved = APPROVAL_STAGES.every(s => item.approvals && item.approvals[s.id] && item.approvals[s.id].approved === true);
    if (allApproved) return '✅ Lengkap (4/4)';
    const approvedCount = Object.values(item.approvals || {}).filter(a => a && a.approved === true).length;
    return `${approvedCount}/${APPROVAL_STAGES.length}`;
}

function exportAllTemuan() {
    let allTemuan = [];
    inspeksiData.forEach(item => {
        if (item.temuan && item.temuan.length > 0) {
            item.temuan.forEach((t) => {
                allTemuan.push({
                    'No': allTemuan.length + 1,
                    'ID Inspeksi': item.id,
                    'Lokasi / Plant': item.lokasi,
                    'Keterangan Lokasi': item.keteranganLokasi || '-',
                    'Tanggal Inspeksi': item.tanggal,
                    'Safety Officer': item.petugas,
                    'Deskripsi Temuan': t.deskripsi,
                    'Kategori': t.kategori,
                    'Status Inspeksi': item.status,
                    'Due Date Plant': item.dueDate || '-',
                    'Status Pengesahan': getApprovalStatusText(item)
                });
            });
        }
    });

    if (allTemuan.length === 0) { showToast('⚠️ Tidak ada temuan'); return; }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(allTemuan);
    ws['!cols'] = [
        { wch: 5 }, { wch: 12 }, { wch: 25 }, { wch: 20 }, { wch: 15 },
        { wch: 15 }, { wch: 35 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
        { wch: 25 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Semua Temuan');
    XLSX.writeFile(wb, `Semua_Temuan_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast(`📊 ${allTemuan.length} temuan diekspor`);
}

function exportToExcel(data, filename = 'Data_Inspeksi_K3.xlsx') {
    const exportData = data.map(item => ({
        'ID': item.id,
        'Lokasi / Plant': item.lokasi,
        'Keterangan Lokasi': item.keteranganLokasi || '-',
        'Tanggal': item.tanggal,
        'Safety Officer': item.petugas,
        'Jumlah Temuan': item.temuan ? item.temuan.length : 0,
        'Daftar Temuan': item.temuan ? item.temuan.map(t => `${t.deskripsi} (${t.kategori})`).join('; ') : '-',
        'Due Date Plant': item.dueDate || '-',
        'Status': item.status,
        'Progres Perbaikan': `${getProgress(item)}%`,
        'Status Perbaikan': getStatusPerbaikan(item),
        'Status Pengesahan': getApprovalStatusText(item),
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, 'Inspeksi');
    XLSX.writeFile(wb, filename);
    showToast(`📊 Spreadsheet berhasil diekspor: ${filename}`);
}

// ========================================================================
// ========== DETAIL MODAL ==========
// ========================================================================

window.openDetailModal = function(id) {
    const item = inspeksiData.find(d => d.id === id);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }
    const modal = document.getElementById('detailModal');
    const content = document.getElementById('detailContent');

    const statusMap = { 'selesai': 'Selesai', 'proses': 'Proses', 'tinjau': 'Tinjau' };

    const temuanHtml = item.temuan && item.temuan.length > 0 ?
        item.temuan.map(t =>
            `<li><span>${t.deskripsi}</span><span class="temuan-kategori">${t.kategori}</span></li>`
        ).join('') :
        '<li style="color:#8a6a6a;">Tidak ada temuan</li>';

    const allPhotos = [...(item.fotoDekat || []), ...(item.fotoJauh || [])];
    const galleryHtml = allPhotos.length > 0 && allPhotos[0] !== '-' ?
        allPhotos.map((img, idx) =>
                `<div class="gallery-item" onclick="openLightbox(${JSON.stringify(allPhotos)}, ${idx})" title="Klik untuk preview">
                    <span class="preview-icon">📷</span>
                    <span class="file-name">${img}</span>
                </div>`
            ).join('') :
        '<div style="color:#8a6a6a;font-size:0.8rem;">Tidak ada foto</div>';

    const overdueBadge = isOverdue(item.dueDate) ?
        `<span class="overdue-badge"><i class="fas fa-exclamation-circle"></i> OVERDUE</span>` :
        '';

    content.innerHTML = `
            <div class="detail-container">
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="label"><i class="fas fa-hashtag"></i> ID Inspeksi</span>
                        <span class="value" style="color:#b31b1b;font-weight:700;">${item.id}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label"><i class="fas fa-map-marker-alt"></i> Status</span>
                        <span class="value"><span class="status-badge ${item.status}">${statusMap[item.status] || item.status}</span></span>
                    </div>
                    <div class="detail-item">
                        <span class="label"><i class="fas fa-building"></i> Lokasi / Plant</span>
                        <span class="value">${item.lokasi}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label"><i class="fas fa-tag"></i> Keterangan Lokasi</span>
                        <span class="value">${item.keteranganLokasi || '-'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label"><i class="fas fa-calendar-day"></i> Tanggal Inspeksi</span>
                        <span class="value">${item.tanggal}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label"><i class="fas fa-user"></i> Safety Officer</span>
                        <span class="value">${item.petugas}</span>
                    </div>
                    <div class="detail-item" style="grid-column:1/3;">
                        <span class="label"><i class="fas fa-clock"></i> Due Date ke Plant</span>
                        <span class="value">${item.dueDate || '-'} ${overdueBadge}</span>
                    </div>
                </div>

                <div class="detail-section">
                    <div class="section-title"><i class="fas fa-list"></i> Temuan (${item.temuan ? item.temuan.length : 0})</div>
                    <ul class="temuan-list-detail">${temuanHtml}</ul>
                    ${item.temuan && item.temuan.length > 0 ? `
                        <div style="margin-top:0.5rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
                            <button class="btn-export-temuan" onclick="exportTemuanPerItem('${item.id}')">
                                <i class="fas fa-file-excel"></i> Export Temuan
                            </button>
                        </div>
                    ` : ''}
                </div>

                <div class="detail-section">
                    <div class="section-title"><i class="fas fa-images"></i> Dokumentasi Foto</div>
                    <div class="detail-gallery">${galleryHtml}</div>
                    <div style="font-size:0.65rem;color:#8a6a6a;margin-top:0.3rem;">Klik gambar untuk preview</div>
                </div>

                <div class="detail-section">
                    <div class="section-title"><i class="fas fa-stamp"></i> Pengesahan (4 Tahap)</div>
                    ${renderApprovalStages(item)}
                    <div style="margin-top:0.5rem;">
                        <button class="btn-sm primary" onclick="openApprovalModal('${item.id}')"><i class="fas fa-stamp"></i> Kelola Pengesahan</button>
                    </div>
                </div>
            </div>
        `;
    modal.classList.add('show');
};

document.getElementById('closeDetailModal').addEventListener('click', function() {
    document.getElementById('detailModal').classList.remove('show');
});
document.getElementById('detailModal').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('show');
});

// ========================================================================
// ========== JADWAL FUNCTIONS ==========
// ========================================================================

function setRealisasiHariIni() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('jadwalRealisasi').value = today;
    showToast('📅 Tanggal realisasi diisi hari ini');
}

window.openJadwalModal = function(data = null) {
    const modal = document.getElementById('jadwalModal');
    document.getElementById('jadwalModalTitle').textContent = data ? 'Edit Jadwal' : 'Tambah Jadwal';
    const currentYear = new Date().getFullYear();
    const todayISO = new Date().toISOString().split('T')[0];

    if (data) {
        document.getElementById('editJadwalId').value = data.id;
        const plant = PLANT_LIST.find(p => p.id === data.plantId);
        if (plant) {
            document.getElementById('plantSearchInputJadwal').value = plant.name;
            document.getElementById('selectedPlantJadwal').value = plant.id;
            document.getElementById('selectedPlantDisplayJadwal').innerHTML = 
                `<span class="selected-value"><i class="fas fa-check-circle"></i> ${plant.name} (${plant.code})</span>`;
            document.getElementById('clearPlantSelectionJadwal').classList.add('visible');
            selectedPlantJadwal = plant;
        }
        document.getElementById('jadwalPeriode').value = data.periode || 1;
        document.getElementById('jadwalTahun').value = data.tahun || currentYear;
        document.getElementById('jadwalTanggal').value = data.tanggalJadwal || '';
        document.getElementById('jadwalPetugas').value = data.officer || '';
        document.getElementById('jadwalRealisasi').value = data.tanggalRealisasi || '';
        document.getElementById('jadwalMinggu').value = data.minggu || 1;
    } else {
        document.getElementById('editJadwalId').value = '';
        document.getElementById('plantSearchInputJadwal').value = '';
        document.getElementById('selectedPlantJadwal').value = '';
        document.getElementById('selectedPlantDisplayJadwal').innerHTML = '';
        document.getElementById('clearPlantSelectionJadwal').classList.remove('visible');
        selectedPlantJadwal = null;
        document.getElementById('jadwalPeriode').value = '1';
        document.getElementById('jadwalTahun').value = currentYear;
        document.getElementById('jadwalTanggal').value = todayISO;
        document.getElementById('jadwalPetugas').value = getRandomOfficer();
        document.getElementById('jadwalRealisasi').value = '';
        document.getElementById('jadwalMinggu').value = '1';
    }
    modal.classList.add('show');
};

window.editJadwal = function(id) {
    const item = jadwalData.find(d => d.id === id);
    if (item) openJadwalModal(item);
};

window.hapusJadwal = function(id) {
    if (confirm(`Hapus jadwal ${id}?`)) {
        jadwalData = jadwalData.filter(d => d.id !== id);
        refreshAll();
        showToast(`🗑️ Jadwal ${id} dihapus`);
    }
};

document.getElementById('closeJadwalModal').addEventListener('click', function() {
    document.getElementById('jadwalModal').classList.remove('show');
});
document.getElementById('jadwalModal').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('show');
});

document.getElementById('submitJadwal').addEventListener('click', function(e) {
    e.preventDefault();
    const id = document.getElementById('editJadwalId').value;
    const plantId = document.getElementById('selectedPlantJadwal').value;
    const periode = parseInt(document.getElementById('jadwalPeriode').value);
    const tahun = parseInt(document.getElementById('jadwalTahun').value);
    const tanggalJadwal = document.getElementById('jadwalTanggal').value;
    const officer = document.getElementById('jadwalPetugas').value.trim();
    const tanggalRealisasi = document.getElementById('jadwalRealisasi').value;
    const minggu = parseInt(document.getElementById('jadwalMinggu').value);

    if (!plantId) { showToast('⚠️ Silakan pilih Plant terlebih dahulu!'); return; }
    if (!officer) { showToast('⚠️ Safety Officer wajib diisi!'); return; }
    if (!tahun || tahun < 2020) { showToast('⚠️ Tahun wajib diisi!'); return; }
    if (!tanggalJadwal) { showToast('⚠️ Tanggal Jadwal wajib diisi!'); return; }

    const plant = PLANT_LIST.find(p => p.id == plantId);
    const plantName = plant ? plant.name : '';

    if (id) {
        const item = jadwalData.find(d => d.id === id);
        if (item) {
            item.plantId = parseInt(plantId);
            item.plantName = plantName;
            item.periode = periode;
            item.tahun = tahun;
            item.tanggalJadwal = tanggalJadwal;
            item.tanggalRealisasi = tanggalRealisasi || null;
            item.officer = officer;
            item.minggu = minggu;
            showToast(`✅ Jadwal ${id} berhasil diupdate`);
        }
    } else {
        const newId = `SCH-${String(jadwalData.length + 1).padStart(3, '0')}`;
        jadwalData.push({
            id: newId,
            plantId: parseInt(plantId),
            plantName: plantName,
            periode: periode,
            tahun: tahun,
            tanggalJadwal: tanggalJadwal,
            tanggalRealisasi: tanggalRealisasi || null,
            officer: officer,
            minggu: minggu,
            status: 'aktif'
        });
        showToast(`✅ Jadwal ${newId} berhasil ditambahkan`);
    }

    document.getElementById('plantSearchInputJadwal').value = '';
    document.getElementById('selectedPlantJadwal').value = '';
    document.getElementById('selectedPlantDisplayJadwal').innerHTML = '';
    document.getElementById('clearPlantSelectionJadwal').classList.remove('visible');
    selectedPlantJadwal = null;

    refreshAll();
    document.getElementById('jadwalModal').classList.remove('show');
});

// ========================================================================
// ========== PERBAIKAN MODAL ==========
// ========================================================================

window.openPerbaikanModal = function(id) {
    const item = inspeksiData.find(d => d.id === id);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }
    const modal = document.getElementById('perbaikanModal');
    const content = document.getElementById('modalContent');

    const progress = getProgress(item);
    const statusPerbaikan = getStatusPerbaikan(item);

    const statusMap = {
        'closed': '✅ Closed',
        'on-progress': '🔄 On Progress',
        'open': '⏳ Open'
    };

    let timelineHtml = '';
    if (item.perbaikan && item.perbaikan.length > 0) {
        timelineHtml = item.perbaikan.map(p => {
            const fotoList = p.foto && p.foto.length > 0 ? p.foto : [];
            const galleryHtml = fotoList.length > 0 ?
                fotoList.map(f => `
                    <div class="thumb-mini" onclick="openLightbox(${JSON.stringify(fotoList)}, ${fotoList.indexOf(f)})" title="${f}">
                        📷
                    </div>
                `).join('') :
                '<span style="font-size:0.6rem;color:#c62828;">⚠️ Belum ada foto</span>';
            return `
                    <div class="perbaikan-item">
                        <span class="date">${p.tgl}</span>
                        <span class="action">${p.action}</span>
                        <span class="status-mini ${p.status}">${statusMap[p.status] || p.status}</span>
                        <span class="pic-name">- ${p.pic}</span>
                        <div class="foto-thumbs">${galleryHtml}</div>
                    </div>
                `;
        }).join('');
    } else {
        timelineHtml = '<div style="padding:0.8rem;color:#8a6a6a;text-align:center;">Belum ada tindakan perbaikan</div>';
    }

    const statusPerbaikanMap = {
        'selesai_perbaikan': 'Closed',
        'perbaikan': 'On Progress',
        'tinjau': 'Open'
    };

    const allApproved = APPROVAL_STAGES.every(s => item.approvals && item.approvals[s.id] && item.approvals[s.id].approved === true);

    content.innerHTML = `
            <div class="perbaikan-info-box">
                <div class="info-row">
                    <span class="label">ID Inspeksi</span>
                    <span class="value"><strong>${item.id}</strong></span>
                </div>
                <div class="info-row">
                    <span class="label">Lokasi / Plant</span>
                    <span class="value">${item.lokasi}</span>
                </div>
                <div class="info-row">
                    <span class="label">Due Date Plant</span>
                    <span class="value">${item.dueDate || '-'} ${isOverdue(item.dueDate) ? '<span class="overdue-badge"><i class="fas fa-exclamation-circle"></i> OVERDUE</span>' : ''}</span>
                </div>
                <div class="info-row">
                    <span class="label">Status</span>
                    <span class="value"><span class="status-badge ${item.status}">${item.status.charAt(0).toUpperCase() + item.status.slice(1)}</span></span>
                </div>
                <div class="info-row" style="margin-top:0.3rem;padding-top:0.5rem;border-top:2px solid #f0e0e0;">
                    <span class="label">Pengesahan</span>
                    <span class="value">
                        <span class="status-badge ${allApproved ? 'selesai' : 'proses'}">
                            ${allApproved ? '✅ Lengkap (4/4)' : getApprovalStatusText(item)}
                        </span>
                        ${!allApproved ? `<button class="btn-sm info" onclick="openApprovalModal('${item.id}')" style="margin-left:0.3rem;font-size:0.55rem;"><i class="fas fa-stamp"></i></button>` : ''}
                    </span>
                </div>
                <div class="info-row">
                    <span class="label">Progres Perbaikan</span>
                    <span class="value">
                        <div class="progress-wrapper" style="min-width:150px;">
                            <div class="progress-bar-container" style="flex:1;">
                                <div class="progress-fill ${statusPerbaikan}" style="width:${progress}%"></div>
                            </div>
                            <span class="progress-text">${progress}%</span>
                            <span class="status-badge ${statusPerbaikan}" style="font-size:0.6rem;">${statusPerbaikanMap[statusPerbaikan] || statusPerbaikan}</span>
                        </div>
                    </span>
                </div>
            </div>

            <h4 style="color:#7a3a3a;font-size:0.9rem;margin-bottom:0.8rem;"><i class="fas fa-history"></i> Timeline Perbaikan</h4>
            <div class="perbaikan-timeline">
                ${timelineHtml}
            </div>

            <div class="perbaikan-form-section">
                <h5><i class="fas fa-camera"></i> Tambah Progres</h5>
                <div class="form-group">
                    <label>Tindakan <span style="color:#c62828;">*</span></label>
                    <input type="text" id="newAction" placeholder="Deskripsi tindakan...">
                </div>
                <div class="form-row" style="grid-template-columns:1fr 1fr;">
                    <div class="form-group">
                        <label>Status <span style="color:#c62828;">*</span></label>
                        <select id="newStatus">
                            <option value="on-progress">🔄 On Progress</option>
                            <option value="closed">✅ Closed</option>
                            <option value="open">⏳ Open</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>PIC <span style="color:#c62828;">*</span></label>
                        <input type="text" id="newPIC" placeholder="Nama PIC" value="${getRandomOfficer()}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Foto Perbaikan <span style="color:#c62828;">*</span></label>
                    <div class="file-input-wrapper">
                        <input type="file" id="newFoto" accept="image/*" multiple>
                        <span class="file-count" id="newFotoCount">Belum ada file</span>
                    </div>
                </div>
                <button class="btn-sm primary" onclick="tambahPerbaikanCustom('${item.id}')" style="margin-top:0.5rem;padding:0.5rem 1.5rem;">
                    <i class="fas fa-plus"></i> Tambah Progres
                </button>
            </div>
        `;

    document.getElementById('newFoto').addEventListener('change', function() {
        const count = this.files.length;
        document.getElementById('newFotoCount').textContent = count > 0 ? `${count} file dipilih` : 'Belum ada file';
    });

    modal.classList.add('show');
};

window.tambahPerbaikanCustom = function(id) {
    const item = inspeksiData.find(d => d.id === id);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }
    
    const action = document.getElementById('newAction').value.trim();
    const status = document.getElementById('newStatus').value;
    const pic = document.getElementById('newPIC').value.trim() || getRandomOfficer();
    const fotoInput = document.getElementById('newFoto');
    const fotoFiles = Array.from(fotoInput.files).map(f => f.name);

    if (!action) { showToast('⚠️ Masukkan deskripsi tindakan'); return; }
    if (fotoFiles.length === 0) { showToast('⚠️ Wajib upload foto sebagai bukti progres!'); return; }

    const today = new Date().toLocaleDateString('id-ID');
    item.perbaikan = item.perbaikan || [];
    item.perbaikan.push({ 
        tgl: today, 
        action: action, 
        status: status, 
        pic: pic, 
        foto: fotoFiles 
    });
    
    const allClosed = item.perbaikan.every(p => p.status === 'closed');
    if (allClosed) {
        item.status = 'selesai';
    } else {
        item.status = 'proses';
    }
    
    refreshAll();
    showToast(`✅ Tindakan "${action}" ditambahkan dengan ${fotoFiles.length} foto`);
    document.getElementById('newAction').value = '';
    document.getElementById('newFoto').value = '';
    document.getElementById('newFotoCount').textContent = 'Belum ada file';
    openPerbaikanModal(id);
};

document.getElementById('closePerbaikanModal').addEventListener('click', function() {
    document.getElementById('perbaikanModal').classList.remove('show');
});
document.getElementById('perbaikanModal').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('show');
});

// ========================================================================
// ========== TEMUAN LIST ==========
// ========================================================================

let temuanList = [];

function renderTemuanList() {
    const container = document.getElementById('temuanListContainer');
    const counter = document.getElementById('temuanCounter');
    if (temuanList.length === 0) {
        container.innerHTML =
            '<div style="padding:0.5rem;color:#8a6a6a;font-size:0.8rem;text-align:center;">Belum ada temuan ditambahkan</div>';
    } else {
        container.innerHTML = temuanList.map((item, index) => `
                <div class="temuan-item" style="display:flex;justify-content:space-between;align-items:center;padding:0.4rem 0.6rem;border-bottom:1px solid #f0e0e0;">
                    <span><span class="status-badge" style="font-size:0.6rem;">${item.kategori}</span> ${item.deskripsi}</span>
                    <button class="btn-sm danger" onclick="hapusTemuan(${index})"><i class="fas fa-trash"></i></button>
                </div>
            `).join('');
    }
    counter.textContent = `${temuanList.length} temuan ditambahkan`;
    document.getElementById('temuanData').value = JSON.stringify(temuanList);
}

window.hapusTemuan = function(index) {
    temuanList.splice(index, 1);
    renderTemuanList();
};

document.getElementById('tambahTemuanBtn').addEventListener('click', function() {
    const input = document.getElementById('temuanInput');
    const kategori = document.getElementById('kategoriInput');
    const deskripsi = input.value.trim();
    if (!deskripsi) { showToast('⚠️ Masukkan deskripsi temuan'); return; }
    temuanList.push({ deskripsi: deskripsi, kategori: kategori.value });
    input.value = '';
    renderTemuanList();
    showToast(`✅ Temuan "${deskripsi}" ditambahkan`);
});

document.getElementById('temuanInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') { e.preventDefault();
        document.getElementById('tambahTemuanBtn').click(); }
});

// ========================================================================
// ========== SUBMIT FORM ==========
// ========================================================================

document.getElementById('submitInspeksi').addEventListener('click', function(e) {
    e.preventDefault();
    
    const selectedPlantId = document.getElementById('selectedPlant').value;
    if (!selectedPlantId) {
        showToast('⚠️ Silakan pilih Lokasi / Plant terlebih dahulu!');
        document.getElementById('plantSearchInput').focus();
        document.getElementById('plantSearchInput').classList.add('error');
        setTimeout(() => {
            document.getElementById('plantSearchInput').classList.remove('error');
        }, 3000);
        return;
    }

    const temuanData = document.getElementById('temuanData').value;
    const temuan = temuanData ? JSON.parse(temuanData) : [];
    if (temuan.length === 0) { showToast('⚠️ Tambahkan minimal 1 temuan!'); return; }

    const plant = PLANT_LIST.find(p => p.id == selectedPlantId);
    const lokasi = plant ? plant.name : '';
    const keteranganLokasi = document.getElementById('formKeteranganLokasi').value.trim();
    const tanggal = document.getElementById('formTanggal').value;
    const petugas = document.getElementById('formPetugas').value.trim() || getRandomOfficer();
    const status = document.getElementById('formStatus').value;
    const dueDate = document.getElementById('formDueDate').value;
    const fotoDekat = Array.from(document.getElementById('fotoDekat').files).map(f => f.name);
    const fotoJauh = Array.from(document.getElementById('fotoJauh').files).map(f => f.name);

    if (!tanggal) { showToast('⚠️ Tanggal inspeksi wajib diisi!'); return; }

    const newId = `INS-${String(inspeksiData.length + 1).padStart(3, '0')}`;
    
    const initialApprovals = {};
    APPROVAL_STAGES.forEach((s, index) => {
        if (index === 0) {
            initialApprovals[s.id] = {
                approved: true,
                by: petugas,
                jabatan: s.title,
                tanggal: new Date().toLocaleString('id-ID')
            };
        } else {
            initialApprovals[s.id] = {
                approved: false,
                by: null,
                jabatan: s.title,
                tanggal: null
            };
        }
    });

    const newInspeksi = {
        id: newId,
        lokasi: lokasi,
        plantId: parseInt(selectedPlantId),
        keteranganLokasi: keteranganLokasi || '-',
        lat: -6.200000,
        lng: 106.816666,
        tanggal: new Date(tanggal).toLocaleDateString('id-ID'),
        petugas: petugas,
        status: status,
        dueDate: dueDate ? new Date(dueDate).toLocaleDateString('id-ID') : '-',
        fotoDekat: fotoDekat.length ? fotoDekat : ['-'],
        fotoJauh: fotoJauh.length ? fotoJauh : ['-'],
        approvals: initialApprovals,
        temuan: temuan,
        perbaikan: temuan.map((t, idx) => ({
            tgl: new Date().toLocaleDateString('id-ID'),
            action: `Temuan ${idx+1}: ${t.deskripsi}`,
            status: 'open',
            pic: petugas,
            foto: []
        }))
    };

    inspeksiData.unshift(newInspeksi);
    temuanList = [];
    renderTemuanList();
    document.getElementById('temuanInput').value = '';
    document.getElementById('fotoDekat').value = '';
    document.getElementById('fotoJauh').value = '';
    
    document.getElementById('selectedPlant').value = '';
    document.getElementById('plantSearchInput').value = '';
    document.getElementById('selectedPlantDisplay').innerHTML = '';
    document.getElementById('clearPlantSelection').classList.remove('visible');
    selectedPlant = null;
    
    refreshAll();
    showToast(`✅ Inspeksi ${newId} berhasil disimpan! Tahap 1 (Safety Officer) sudah disetujui.`);
    this.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Menyimpan...';
    setTimeout(() => { this.innerHTML = '<i class="fas fa-save"></i> Simpan Inspeksi'; }, 1000);
});

// ========================================================================
// ========== STATS & REFRESH ==========
// ========================================================================

function updateStats() {
    const total = inspeksiData.length;
    const totalTemuan = inspeksiData.reduce((sum, d) => sum + (d.temuan ? d.temuan.length : 0), 0);
    const selesaiPerbaikan = inspeksiData.filter(d => d.perbaikan && d.perbaikan.every(p => p.status === 'closed'))
        .length;
    const jadwalAktif = jadwalData.filter(d => d.status === 'aktif' && !d.tanggalRealisasi).length;
    document.getElementById('statTotalInspeksi').textContent = total;
    document.getElementById('statTotalTemuan').textContent = totalTemuan;
    document.getElementById('statJadwalAktif').textContent = jadwalAktif;
    document.getElementById('statSelesaiPerbaikan').textContent = selesaiPerbaikan;
}

function refreshAll() {
    document.querySelectorAll('.search-wrapper input').forEach(inp => {
        inp.dispatchEvent(new Event('input'));
    });
    renderDashboardJadwal();
    updateStats();
    renderTemuanPlantChart();

    if (perbaikanChart) {
        const counts = {
            selesai: inspeksiData.filter(d => d.perbaikan && d.perbaikan.every(p => p.status === 'closed'))
                .length,
            perbaikan: inspeksiData.filter(d => d.perbaikan && d.perbaikan.some(p => p.status === 'on-progress'))
                .length,
            tinjau: inspeksiData.filter(d => d.perbaikan && d.perbaikan.some(p => p.status === 'open'))
                .length,
        };
        perbaikanChart.data.datasets[0].data = [counts.selesai, counts.perbaikan, counts.tinjau];
        perbaikanChart.update();
    }
}

// ========================================================================
// ========== CHARTS ==========
// ========================================================================

let perbaikanChart;

function initCharts() {
    renderTemuanPlantChart();

    const ctx2 = document.getElementById('perbaikanChart').getContext('2d');
    const counts = {
        selesai: inspeksiData.filter(d => d.perbaikan && d.perbaikan.every(p => p.status === 'closed')).length,
        perbaikan: inspeksiData.filter(d => d.perbaikan && d.perbaikan.some(p => p.status === 'on-progress')).length,
        tinjau: inspeksiData.filter(d => d.perbaikan && d.perbaikan.some(p => p.status === 'open')).length,
    };
    perbaikanChart = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: ['Closed', 'On Progress', 'Open'],
            datasets: [{ data: [counts.selesai, counts.perbaikan, counts.tinjau],
                backgroundColor: ['#2e7d32', '#f57f17', '#c62828'], borderColor: 'white', borderWidth: 2 }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12,
                        font: { size: 11 } } } }, cutout: '65%' }
    });
}

// ========================================================================
// ========== NAVIGASI ==========
// ========================================================================

document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        document.getElementById('panel-' + this.dataset.panel).classList.add('active');
        setTimeout(() => {
            const activePanel = document.querySelector('.panel.active');
            if (activePanel) {
                const searchInput = activePanel.querySelector('.search-wrapper input');
                if (searchInput) {
                    searchInput.dispatchEvent(new Event('input'));
                }
            }
        }, 100);
    });
});

// ========================================================================
// ========== EVENT LISTENERS EXPORT ==========
// ========================================================================

document.getElementById('exportSpreadsheet').addEventListener('click', () => exportToExcel(inspeksiData,
    'Inspeksi_K3.xlsx'));
document.getElementById('exportAllTemuan').addEventListener('click', exportAllTemuan);

// ========================================================================
// ========== SYNC ==========
// ========================================================================

async function syncToGoogleSheets(btn) {
    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Menyiapkan...';
        }
        showToast('🔄 Menyiapkan data...');

        const dataToSync = inspeksiData.map(item => ({
            'ID': item.id,
            'Lokasi / Plant': item.lokasi,
            'Keterangan Lokasi': item.keteranganLokasi || '-',
            'Tanggal': item.tanggal,
            'Safety Officer': item.petugas,
            'Jumlah Temuan': item.temuan ? item.temuan.length : 0,
            'Daftar Temuan': item.temuan ? item.temuan.map(t => `${t.deskripsi} (${t.kategori})`).join('; ') :
                '-',
            'Due Date Plant': item.dueDate || '-',
            'Status': item.status,
            'Progres Perbaikan': `${getProgress(item)}%`,
            'Status Perbaikan': getStatusPerbaikan(item),
            'Status Pengesahan': getApprovalStatusText(item),
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(dataToSync);
        XLSX.utils.book_append_sheet(wb, ws, 'Inspeksi K3');
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Inspeksi_K3_${new Date().toISOString().slice(0,10)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        showToast('✅ File Excel siap! Upload ke Google Sheets.');
    } catch (error) {
        showToast('⚠️ Gagal: ' + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Sync Google Sheets';
        }
    }
}

document.querySelectorAll('#syncToSheets, #syncToSheets2, #syncToSheets3').forEach(btn => {
    btn.addEventListener('click', function() {
        syncToGoogleSheets(this);
    });
});

// ========================================================================
// ========== TOAST ==========
// ========================================================================

const toast = document.getElementById('toastMessage');
const toastText = document.getElementById('toastText');

window.showToast = function(msg) {
    toastText.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.classList.remove('show'); }, 5000);
};

// ========================================================================
// ========== INIT APP ==========
// ========================================================================

function initApp() {
    initPlantSelect();

    document.getElementById('formTanggal').value = new Date().toISOString().split('T')[0];
    const defaultDueDate = new Date();
    defaultDueDate.setDate(defaultDueDate.getDate() + 14);
    document.getElementById('formDueDate').value = defaultDueDate.toISOString().split('T')[0];

    setupSearch('searchInspeksiInput', 'clearSearchInspeksi', 'searchInspeksiCount',
        () => inspeksiData, renderInspeksiWithSearch, ['id', 'lokasi', 'petugas', 'status', 'dueDate']);

    setupSearch('searchAllInspeksiInput', 'clearSearchAllInspeksi', 'searchAllInspeksiCount',
        () => inspeksiData, renderAllInspeksiWithSearch, ['id', 'lokasi', 'keteranganLokasi', 'petugas',
            'status'
        ]);

    setupSearch('searchJadwalInput', 'clearSearchJadwal', 'searchJadwalCount',
        () => jadwalData, renderJadwalWithSearch, ['plantName', 'officer', 'status']);

    setupSearch('searchPerbaikanInput', 'clearSearchPerbaikan', 'searchPerbaikanCount',
        () => inspeksiData, renderPerbaikanWithSearch, ['id', 'lokasi', 'petugas', 'dueDate']);

    renderTemuanList();
    initCharts();
    refreshAll();
    updateClock();
    setInterval(updateClock, 1000);

    setInterval(() => {
        renderJadwalTable();
        renderDashboardJadwal();
    }, 10000);

    console.log('🚀 SHE Sasa K3 System - DEMO MODE ACTIVE');
    console.log(`📊 ${inspeksiData.length} inspeksi, ${jadwalData.length} jadwal mingguan`);
    console.log(`🏭 ${PLANT_LIST.length} Plant terdaftar`);
    console.log(`📋 4 Tahap Pengesahan: ${APPROVAL_STAGES.map(s => s.title).join(' → ')}`);
    console.log(`📅 Jadwal mingguan setiap plant - ${jadwalData.length} total jadwal`);
}

document.getElementById('loginPassword').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('loginForm').dispatchEvent(new Event('submit'));
    }
});

document.getElementById('loginUsername').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('loginPassword').focus();
    }
});

/* ---------------------------------------------------------------------------
   Ekspor untuk jembatan kompatibilitas.

   Scope module BUKAN scope global, sehingga atribut onclick="..." di HTML tidak
   dapat melihat fungsi-fungsi ini. Yang di bawah adalah deklarasi function biasa
   yang perlu dinaikkan ke window oleh src/compat/global-bridge.js.

   Sisanya (approveStage, cetakPDF, editJadwal, exportTemuanPerItem, hapusJadwal, hapusTemuan, openDetailModal, openJadwalModal, openPerbaikanModal, rejectStage, tambahPerbaikanCustom)
   sudah memasang dirinya sendiri lewat window.X = function di atas.

   Seluruh blok ini dihapus pada Phase 9 ketika inline handler diganti
   event delegation. --------------------------------------------------------- */
export {
    changeCalendarMonth,
    handleLogin,
    logout,
    openApprovalModal,
    openLightbox,
    setRealisasiHariIni,
    showDayEvents,
    switchTab
};
