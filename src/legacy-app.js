/* legacy-app.js — seluruh JavaScript aplikasi, dipindahkan apa adanya dari
   index.html baris 522-3138 pada Phase 2.

   Berkas ini SEMENTARA. Isinya akan dipecah bertahap pada Phase 3-9 menjadi
   shared/ domain/ repositories/ services/ presentation/. Jangan menambah kode
   baru di sini — tambahkan di modul tujuannya.

   Catatan: berkas ini kini dimuat sebagai ES module, sehingga berjalan dalam
   strict mode. Sudah dipindai: tidak ada assignment ke variabel tak
   terdeklarasi dan tidak ada deklarasi function di dalam blok. */

import { escapeHtml, jsArg } from './shared/html.js';
import { reportError } from './shared/errors.js';

import { APPROVAL_STAGES } from './config/constants.js';
import { isValidDemoLogin, DEMO_DISPLAY_NAME } from './config/demo-auth.js';
import { getRandomOfficer } from './data/officers.js';
import * as inspectionRepository from './repositories/inspection-repository.js';
import * as scheduleRepository from './repositories/schedule-repository.js';
import * as plantRepository from './repositories/plant-repository.js';

import { allActionsClosed, countAllFindings } from './domain/inspection-rules.js';
import { findStage, isFullyApproved } from './domain/approval-rules.js';
import * as scheduleRules from './domain/schedule-rules.js';

import * as approvalService from './services/approval-service.js';
import * as correctiveActionService from './services/corrective-action-service.js';
import * as inspectionService from './services/inspection-service.js';
import * as scheduleService from './services/schedule-service.js';
import * as excelExporter from './infrastructure/excel-exporter.js';
import * as pdfExporter from './infrastructure/pdf-exporter.js';

import { createPlantSelect } from './presentation/components/plant-select.js';
import { bindModalClose, closeModal } from './presentation/components/modal.js';
import { openLightbox } from './presentation/components/lightbox.js';
import { showToast } from './presentation/components/toast.js';
import { setupSearch } from './presentation/components/search-box.js';
window.showToast = showToast;

import { renderCalendar, changeCalendarMonth, showDayEvents } from './presentation/views/calendar.view.js';
import { openApprovalModal } from './presentation/views/approval.view.js';
import { openDetailModal } from './presentation/views/detail-modal.view.js';
import { openPerbaikanModal } from './presentation/views/perbaikan-modal.view.js';
import {
    renderJadwalTable,
    renderInspeksiWithSearch,
    renderAllInspeksiWithSearch,
    renderJadwalWithSearch,
    renderPerbaikanWithSearch,
} from './presentation/views/tables.view.js';
import { initCharts, renderTemuanPlantChart, updatePerbaikanChart } from './presentation/views/charts.view.js';
import { buildInspectionReportHtml } from './presentation/views/pdf-report.view.js';
import { registerAction, initActionDispatcher } from './presentation/controllers/action-dispatcher.js';

// ========================================================================
// ========== CATATAN MIGRASI ==========
// ========================================================================
//
// Sudah dipindahkan keluar dari berkas ini:
//   Phase 3  formatDate, isOverdue, getDateOffset   -> shared/date.js
//            highlightText, highlightTextPlant      -> highlight() di shared/html.js
//                                                      (versi baru meng-escape teksnya)
//   Phase 4  PLANT_LIST                             -> data/plants.js
//            PERIODE_LIST, APPROVAL_STAGES          -> config/constants.js
//            VALID_USERNAME, VALID_PASSWORD         -> config/demo-auth.js
//            getRandomOfficer                       -> data/officers.js
//            generateWeeklySchedule                 -> data/schedules.seed.js
//            inspeksiData (literal)                 -> data/inspections.seed.js
//            inspeksiData, jadwalData (state)       -> repositories/
//
//   Phase 5  getProgress, getStatusPerbaikan          -> domain/inspection-rules.js
//            allApproved (5 salinan), approvedCount   -> domain/approval-rules.js
//            urutan tahap, pembuatan record approval  -> domain/approval-rules.js
//            overdue & keaktifan jadwal               -> domain/schedule-rules.js
//            nilai status (juga dipakai CSS class)    -> domain/statuses.js
//
//   Phase 6  approve/reject pengesahan                -> services/approval-service.js
//            tambah progres perbaikan                 -> services/corrective-action-service.js
//            pembuatan inspeksi                       -> services/inspection-service.js
//            simpan/hapus jadwal                      -> services/schedule-service.js
//            penyaringan pencarian                    -> services/search-service.js
//            SheetJS (4 jalur ekspor) + mitigasi S-04 -> infrastructure/excel-exporter.js
//            html2pdf                                 -> infrastructure/pdf-exporter.js
//            label status pengesahan                  -> shared/labels.js
//
//   Phase 7  select plant (dropdown + filter)          -> presentation/components/plant-select.js
//            tutup modal (5 salinan identik)           -> presentation/components/modal.js
//            lightbox                                  -> presentation/components/lightbox.js
//            toast                                     -> presentation/components/toast.js
//            search box (setupSearch)                  -> presentation/components/search-box.js
//
//   Kalender, tabel, chart, dan isi modal (approval/perbaikan/detail) TIDAK
//   dipindah di Phase 7: masing-masing dipakai sekali dan terikat erat pada
//   data aplikasi, jadi bukan duplikasi yang perlu dihilangkan. Itu bagian
//   Phase 8 (view), bukan Phase 7 (component). Lihat docs/DECISIONS.md K-11.
//
//   Phase 8  kalender + modal detail hari               -> presentation/views/calendar.view.js
//            tahap pengesahan + modal pengesahan        -> presentation/views/approval.view.js
//            modal detail inspeksi                      -> presentation/views/detail-modal.view.js
//            modal perbaikan (timeline + form)           -> presentation/views/perbaikan-modal.view.js
//            tabel dashboard/inspeksi/jadwal/perbaikan   -> presentation/views/tables.view.js
//            Chart.js (kedua chart)                       -> presentation/views/charts.view.js
//            markup laporan PDF                          -> presentation/views/pdf-report.view.js
//
//   Controller (approveStage/rejectStage, editJadwal/hapusJadwal/submitJadwal,
//   tambahPerbaikanCustom, submitInspeksi, cetakPDF, export/sync) SENGAJA
//   tetap di sini: masing-masing membaca form/memanggil service, bukan
//   sekadar merender data. Lihat docs/DECISIONS.md K-12.
//
//   Phase 9  seluruh onclick="..."/onsubmit="..." inline  -> data-action + presentation/controllers/action-dispatcher.js
//            src/compat/global-bridge.js                  -> dihapus, tidak diperlukan lagi
//
// Refactoring struktural selesai. Sisa yang didokumentasikan sebagai belum
// dikerjakan (Phase 10 lifecycle, Phase 11 defect kosmetik) ada di
// docs/KNOWN-ISSUES.md dan docs/VERIFICATION.md.
// ========================================================================
// ========================================================================
// ========== PESAN UNTUK PENGGUNA ==========
// ========================================================================
//
// Service mengembalikan KODE alasan, bukan kalimat. Pemetaan ke bahasa,
// emoji, dan gaya penulisan ada di sini — lapisan yang memang mengurus
// tampilan. Teksnya sama persis dengan sebelum refactoring.

const PESAN_GAGAL = {
    INSPECTION_NOT_FOUND: '⚠️ Data tidak ditemukan',
    STAGE_NOT_FOUND: '⚠️ Tahap tidak ditemukan',
    PREVIOUS_STAGE_PENDING: '⚠️ Tahap sebelumnya belum disetujui!',
    ALREADY_APPROVED: '⚠️ Tahap ini sudah disetujui!',
    ACTION_REQUIRED: '⚠️ Masukkan deskripsi tindakan',
    PHOTO_REQUIRED: '⚠️ Wajib upload foto sebagai bukti progres!',
    PLANT_REQUIRED: '⚠️ Silakan pilih Plant terlebih dahulu!',
    OFFICER_REQUIRED: '⚠️ Safety Officer wajib diisi!',
    YEAR_REQUIRED: '⚠️ Tahun wajib diisi!',
    DATE_REQUIRED: '⚠️ Tanggal Jadwal wajib diisi!',
};

function pesanGagal(reason) {
    return PESAN_GAGAL[reason] || '⚠️ Terjadi kesalahan';
}

// ========================================================================
// ========== SELECT WITH SEARCH ==========
// ========================================================================

let plantSelectForm = null;
let plantSelectJadwal = null;

function initPlantSelect() {
    plantSelectForm = createPlantSelect({
        inputId: 'plantSearchInput',
        dropdownId: 'plantDropdown',
        hiddenInputId: 'selectedPlant',
        displayId: 'selectedPlantDisplay',
        clearBtnId: 'clearPlantSelection',
        wrapperId: 'plantSelectWrapper',
    });
    plantSelectJadwal = createPlantSelect({
        inputId: 'plantSearchInputJadwal',
        dropdownId: 'plantDropdownJadwal',
        hiddenInputId: 'selectedPlantJadwal',
        displayId: 'selectedPlantDisplayJadwal',
        clearBtnId: 'clearPlantSelectionJadwal',
        wrapperId: 'plantSelectWrapperJadwal',
    });
}

// ========================================================================
// ========== LOGIN SYSTEM ==========
// ========================================================================

document.getElementById('loginForm').addEventListener('submit', handleLogin);

function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const errorMessage = document.getElementById('loginError');

    if (isValidDemoLogin(username, password)) {
        errorMessage.classList.remove('show');
        document.getElementById('loginPage').classList.add('hidden');
        document.getElementById('mainApp').classList.add('visible');

        const initial = username.charAt(0).toUpperCase();
        document.getElementById('userAvatar').textContent = initial + initial;
        document.getElementById('userName').textContent = DEMO_DISPLAY_NAME;

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

// Badge jam, status "Online", dan tanggal semuanya dihapus dari header
// (docs/DECISIONS.md K-6). Fungsi updateClock/updateHeaderDate beserta
// interval-nya ikut dihapus karena elemen tujuannya sudah tidak ada —
// menyentuh #currentTime / #currentDate akan melempar TypeError dan
// mematikan initApp() di tengah jalan.

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


function renderGallery(images, label = '') {
    if (!images || images.length === 0 || images[0] === '-') {
        return `<div class="thumb-placeholder"><i class="fas fa-image"></i></div>`;
    }
    return `
            <div class="gallery-thumb">
                ${images.map((img, idx) => `
                    <img class="thumb" 
                         src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='45' height='45'%3E%3Crect width='45' height='45' fill='%23f0e8e8'/%3E%3Ctext x='50%25' y='55%25' text-anchor='middle' fill='%238a6a6a' font-size='8' font-family='sans-serif'%3E📷%3C/text%3E%3C/svg%3E" 
                         alt="${escapeHtml(img)}"
                         data-action="openLightbox" data-images="${jsArg(images)}" data-index="${idx}"
                         title="Klik untuk preview: ${escapeHtml(img)}"
                         style="cursor:pointer;">
                `).join('')}
            </div>
        `;
}

// ========================================================================
// ========== APPROVAL FUNCTIONS ==========
// ========================================================================

function approveStage(inspeksiId, stageId) {
    const result = approvalService.approve(inspeksiId, stageId);
    if (!result.ok) { showToast(pesanGagal(result.reason)); return; }

    const { stage, fullyApproved } = result.data;
    showToast(fullyApproved
        ? '🎉 Semua tahap pengesahan telah disetujui! Inspeksi selesai.'
        : `✅ ${stage.title} telah menyetujui inspeksi ${inspeksiId}`);

    refreshAll();
    openApprovalModal(inspeksiId);
}

function rejectStage(inspeksiId, stageId) {
    const stage = findStage(stageId);
    if (!stage) { showToast(pesanGagal('STAGE_NOT_FOUND')); return; }
    if (!confirm(`Tolak inspeksi ${inspeksiId} oleh ${stage.title}?`)) return;

    const result = approvalService.reject(inspeksiId, stageId);
    if (!result.ok) { showToast(pesanGagal(result.reason)); return; }

    showToast(`❌ ${result.data.stage.title} menolak inspeksi ${inspeksiId}`);
    refreshAll();
    openApprovalModal(inspeksiId);
}

// ========================================================================
// ========== PDF GENERATOR ==========
// ========================================================================

function cetakPDF(id) {
    const item = inspectionRepository.findById(id);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }

    const allApproved = isFullyApproved(item);
    if (!allApproved) {
        showToast('⚠️ Inspeksi belum disetujui semua tahap! Silahkan selesaikan pengesahan terlebih dahulu.');
        return;
    }

    const pdfContainer = document.getElementById('pdfContent');
    pdfContainer.innerHTML = buildInspectionReportHtml(item);

    showToast('📄 Sedang membuat PDF...');

    pdfExporter.savePdf(pdfContainer, pdfExporter.reportFilename(item.id)).then(() => {
        showToast(`✅ PDF Laporan ${item.id} berhasil dicetak!`);
    }).catch((err) => {
        showToast(reportError('cetak PDF ' + item.id, err, '⚠️ Gagal membuat PDF. Coba ulangi beberapa saat lagi.'));
    });
}

// ========================================================================
// ========== EXPORT FUNCTIONS ==========
// ========================================================================

function exportTemuanPerItem(id) {
    const item = inspectionRepository.findById(id);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }
    if (!item.temuan || item.temuan.length === 0) { showToast('⚠️ Tidak ada temuan'); return; }

    const { count } = excelExporter.exportFindingsOf(item);
    showToast(`📊 ${count} temuan dari ${item.id} diekspor`);
}


function exportAllTemuan() {
    const inspections = inspectionRepository.getAll();
    const total = inspections.reduce((sum, item) => sum + (item.temuan ? item.temuan.length : 0), 0);
    if (total === 0) { showToast('⚠️ Tidak ada temuan'); return; }

    const { count } = excelExporter.exportAllFindings(inspections);
    showToast(`📊 ${count} temuan diekspor`);
}

function exportToExcel(data, filename = 'Data_Inspeksi_K3.xlsx') {
    excelExporter.exportInspections(data, filename);
    showToast(`📊 Spreadsheet berhasil diekspor: ${filename}`);
}

// ========================================================================
// ========== JADWAL FUNCTIONS ==========
// ========================================================================

function setRealisasiHariIni() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('jadwalRealisasi').value = today;
    showToast('📅 Tanggal realisasi diisi hari ini');
}

function openJadwalModal(data = null) {
    const modal = document.getElementById('jadwalModal');
    document.getElementById('jadwalModalTitle').textContent = data ? 'Edit Jadwal' : 'Tambah Jadwal';
    const currentYear = new Date().getFullYear();
    const todayISO = new Date().toISOString().split('T')[0];

    if (data) {
        document.getElementById('editJadwalId').value = data.id;
        const plant = plantRepository.findById(data.plantId);
        if (plant) {
            plantSelectJadwal.select(plant.id, plant.name, plant.code);
        }
        document.getElementById('jadwalPeriode').value = data.periode || 1;
        document.getElementById('jadwalTahun').value = data.tahun || currentYear;
        document.getElementById('jadwalTanggal').value = data.tanggalJadwal || '';
        document.getElementById('jadwalPetugas').value = data.officer || '';
        document.getElementById('jadwalRealisasi').value = data.tanggalRealisasi || '';
        document.getElementById('jadwalMinggu').value = data.minggu || 1;
    } else {
        document.getElementById('editJadwalId').value = '';
        plantSelectJadwal.clear();
        document.getElementById('jadwalPeriode').value = '1';
        document.getElementById('jadwalTahun').value = currentYear;
        document.getElementById('jadwalTanggal').value = todayISO;
        document.getElementById('jadwalPetugas').value = getRandomOfficer();
        document.getElementById('jadwalRealisasi').value = '';
        document.getElementById('jadwalMinggu').value = '1';
    }
    modal.classList.add('show');
}

function editJadwal(id) {
    const item = scheduleRepository.findById(id);
    if (item) openJadwalModal(item);
}

function hapusJadwal(id) {
    if (!confirm(`Hapus jadwal ${id}?`)) return;

    scheduleService.remove(id);
    refreshAll();
    showToast(`🗑️ Jadwal ${id} dihapus`);
}

bindModalClose('jadwalModal', 'closeJadwalModal');

document.getElementById('submitJadwal').addEventListener('click', function(e) {
    e.preventDefault();
    const result = scheduleService.save({
        id: document.getElementById('editJadwalId').value,
        plantId: document.getElementById('selectedPlantJadwal').value,
        periode: parseInt(document.getElementById('jadwalPeriode').value),
        tahun: parseInt(document.getElementById('jadwalTahun').value),
        tanggalJadwal: document.getElementById('jadwalTanggal').value,
        officer: document.getElementById('jadwalPetugas').value,
        tanggalRealisasi: document.getElementById('jadwalRealisasi').value,
        minggu: parseInt(document.getElementById('jadwalMinggu').value),
    });
    if (!result.ok) { showToast(pesanGagal(result.reason)); return; }

    // schedule bernilai null hanya bila id yang diedit tidak ditemukan —
    // kode lama juga diam pada kasus itu. Lihat schedule-service.js.
    const { schedule, created } = result.data;
    if (schedule) {
        showToast(created
            ? `✅ Jadwal ${schedule.id} berhasil ditambahkan`
            : `✅ Jadwal ${schedule.id} berhasil diupdate`);
    }

    plantSelectJadwal.clear();

    refreshAll();
    closeModal('jadwalModal');
});

// ========================================================================
// ========== PERBAIKAN MODAL ==========
// ========================================================================

function tambahPerbaikanCustom(id) {
    const fotoFiles = Array.from(document.getElementById('newFoto').files).map(f => f.name);
    const result = correctiveActionService.addAction(id, {
        action: document.getElementById('newAction').value,
        status: document.getElementById('newStatus').value,
        pic: document.getElementById('newPIC').value.trim() || getRandomOfficer(),
        photos: fotoFiles,
    });
    if (!result.ok) { showToast(pesanGagal(result.reason)); return; }

    refreshAll();
    showToast(`✅ Tindakan "${result.data.action.action}" ditambahkan dengan ${fotoFiles.length} foto`);
    document.getElementById('newAction').value = '';
    document.getElementById('newFoto').value = '';
    document.getElementById('newFotoCount').textContent = 'Belum ada file';
    openPerbaikanModal(id);
}

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
                    <span><span class="status-badge" style="font-size:0.6rem;">${escapeHtml(item.kategori)}</span> ${escapeHtml(item.deskripsi)}</span>
                    <button class="btn-sm danger" data-action="hapusTemuan" data-index="${index}"><i class="fas fa-trash"></i></button>
                </div>
            `).join('');
    }
    counter.textContent = `${temuanList.length} temuan ditambahkan`;
    document.getElementById('temuanData').value = JSON.stringify(temuanList);
}

function hapusTemuan(index) {
    temuanList.splice(index, 1);
    renderTemuanList();
}

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
    
    const temuanData = document.getElementById('temuanData').value;

    const result = inspectionService.create({
        plantId: document.getElementById('selectedPlant').value,
        keteranganLokasi: document.getElementById('formKeteranganLokasi').value.trim(),
        tanggal: document.getElementById('formTanggal').value,
        petugas: document.getElementById('formPetugas').value.trim() || getRandomOfficer(),
        status: document.getElementById('formStatus').value,
        dueDate: document.getElementById('formDueDate').value,
        fotoDekat: Array.from(document.getElementById('fotoDekat').files).map(f => f.name),
        fotoJauh: Array.from(document.getElementById('fotoJauh').files).map(f => f.name),
        temuan: temuanData ? JSON.parse(temuanData) : [],
    });

    if (!result.ok) {
        if (result.reason === inspectionService.INSPECTION_ERROR.PLANT_REQUIRED) {
            showToast('⚠️ Silakan pilih Lokasi / Plant terlebih dahulu!');
            plantSelectForm.markInvalid();
        } else if (result.reason === inspectionService.INSPECTION_ERROR.FINDINGS_REQUIRED) {
            showToast('⚠️ Tambahkan minimal 1 temuan!');
        } else {
            showToast('⚠️ Tanggal inspeksi wajib diisi!');
        }
        return;
    }

    const newId = result.data.inspection.id;


    temuanList = [];
    renderTemuanList();
    document.getElementById('temuanInput').value = '';
    document.getElementById('fotoDekat').value = '';
    document.getElementById('fotoJauh').value = '';
    
    plantSelectForm.clear();
    
    refreshAll();
    showToast(`✅ Inspeksi ${newId} berhasil disimpan! Tahap 1 (Safety Officer) sudah disetujui.`);
    this.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Menyimpan...';
    setTimeout(() => { this.innerHTML = '<i class="fas fa-save"></i> Simpan Inspeksi'; }, 1000);
});

// ========================================================================
// ========== STATS & REFRESH ==========
// ========================================================================

function updateStats() {
    const total = inspectionRepository.count();
    const totalTemuan = countAllFindings(inspectionRepository.getAll());
    const selesaiPerbaikan = inspectionRepository.getAll().filter(allActionsClosed).length;
    const jadwalAktif = scheduleRules.countActive(scheduleRepository.getAll());
    document.getElementById('statTotalInspeksi').textContent = total;
    document.getElementById('statTotalTemuan').textContent = totalTemuan;
    document.getElementById('statJadwalAktif').textContent = jadwalAktif;
    document.getElementById('statSelesaiPerbaikan').textContent = selesaiPerbaikan;
}

function refreshAll() {
    document.querySelectorAll('.search-wrapper input').forEach(inp => {
        inp.dispatchEvent(new Event('input'));
    });
    renderCalendar();
    updateStats();
    renderTemuanPlantChart();
    updatePerbaikanChart();
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

document.getElementById('exportSpreadsheet').addEventListener('click', () => exportToExcel(inspectionRepository.getAll(),
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
        excelExporter.downloadInspectionsWorkbook(inspectionRepository.getAll());
        showToast('✅ File Excel siap! Upload ke Google Sheets.');
    } catch (error) {
        showToast(reportError('siapkan file Excel', error, '⚠️ Gagal menyiapkan file Excel. Coba ulangi beberapa saat lagi.'));
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
// ========== INIT APP ==========
// ========================================================================

function initApp() {
    initPlantSelect();

    document.getElementById('formTanggal').value = new Date().toISOString().split('T')[0];
    const defaultDueDate = new Date();
    defaultDueDate.setDate(defaultDueDate.getDate() + 14);
    document.getElementById('formDueDate').value = defaultDueDate.toISOString().split('T')[0];

    setupSearch('searchInspeksiInput', 'clearSearchInspeksi', 'searchInspeksiCount',
        () => inspectionRepository.getAll(), renderInspeksiWithSearch, ['id', 'lokasi', 'petugas', 'status', 'dueDate']);

    setupSearch('searchAllInspeksiInput', 'clearSearchAllInspeksi', 'searchAllInspeksiCount',
        () => inspectionRepository.getAll(), renderAllInspeksiWithSearch, ['id', 'lokasi', 'keteranganLokasi', 'petugas',
            'status'
        ]);

    setupSearch('searchJadwalInput', 'clearSearchJadwal', 'searchJadwalCount',
        () => scheduleRepository.getAll(), renderJadwalWithSearch, ['plantName', 'officer', 'status']);

    setupSearch('searchPerbaikanInput', 'clearSearchPerbaikan', 'searchPerbaikanCount',
        () => inspectionRepository.getAll(), renderPerbaikanWithSearch, ['id', 'lokasi', 'petugas', 'dueDate']);

    renderTemuanList();
    initCharts();
    refreshAll();

    setInterval(() => {
        renderJadwalTable();
        renderCalendar();
    }, 10000);

    console.log('🚀 SHE Sasa K3 System - DEMO MODE ACTIVE');
    console.log(`📊 ${inspectionRepository.count()} inspeksi, ${scheduleRepository.count()} jadwal mingguan`);
    console.log(`🏭 ${plantRepository.count()} Plant terdaftar`);
    console.log(`📋 4 Tahap Pengesahan: ${APPROVAL_STAGES.map(s => s.title).join(' → ')}`);
    console.log(`📅 Jadwal mingguan setiap plant - ${scheduleRepository.count()} total jadwal`);
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
   Pendaftaran aksi klik (event delegation).

   Elemen yang dulu memakai onclick="handler(${jsArg(id)})" sekarang memakai
   data-action="handler" data-id="...". Baris di bawah memetakan setiap nama
   data-action ke handler-nya, sekaligus mengonversi tipe: dataset SELALU
   berisi string, sedangkan sebagian handler mengharapkan number (stageId,
   delta bulan, index array). Tanpa Number(...) di sini, changeCalendarMonth
   akan menggabung string alih-alih menghitung bulan, dan findStage/approveStage
   akan gagal mencocokkan stageId lewat === karena "2" !== 2.

   Menggantikan src/compat/global-bridge.js, yang sudah dihapus. -------------- */
registerAction('logout', () => logout());
registerAction('switchTab', (el) => switchTab(el.dataset.panel));
registerAction('openJadwalModal', () => openJadwalModal());
registerAction('setRealisasiHariIni', () => setRealisasiHariIni());
registerAction('changeCalendarMonth', (el) => changeCalendarMonth(Number(el.dataset.delta)));
registerAction('showDayEvents', (el) => showDayEvents(el.dataset.date));
registerAction('openLightbox', (el) => openLightbox(JSON.parse(el.dataset.images), Number(el.dataset.index)));
registerAction('approveStage', (el) => approveStage(el.dataset.id, Number(el.dataset.stage)));
registerAction('rejectStage', (el) => rejectStage(el.dataset.id, Number(el.dataset.stage)));
registerAction('exportTemuanPerItem', (el) => exportTemuanPerItem(el.dataset.id));
registerAction('cetakPDF', (el) => cetakPDF(el.dataset.id));
registerAction('openApprovalModal', (el) => openApprovalModal(el.dataset.id));
registerAction('openDetailModal', (el) => openDetailModal(el.dataset.id));
registerAction('openPerbaikanModal', (el) => openPerbaikanModal(el.dataset.id));
registerAction('editJadwal', (el) => editJadwal(el.dataset.id));
registerAction('hapusJadwal', (el) => hapusJadwal(el.dataset.id));
registerAction('tambahPerbaikanCustom', (el) => tambahPerbaikanCustom(el.dataset.id));
registerAction('hapusTemuan', (el) => hapusTemuan(Number(el.dataset.index)));
initActionDispatcher();

/* Ekspor murni untuk pengujian (lihat scratchpad test-*.mjs) — BUKAN untuk
   jembatan window lagi, itu sudah tidak ada. Runtime aplikasi memanggil
   fungsi-fungsi ini lewat pendaftaran aksi di atas atau lewat pemanggilan
   langsung antar fungsi, bukan lewat ekspor ini. */
export {
    approveStage,
    cetakPDF,
    changeCalendarMonth,
    editJadwal,
    exportTemuanPerItem,
    handleLogin,
    hapusJadwal,
    hapusTemuan,
    logout,
    openApprovalModal,
    openDetailModal,
    openJadwalModal,
    openLightbox,
    openPerbaikanModal,
    rejectStage,
    setRealisasiHariIni,
    showDayEvents,
    switchTab,
    tambahPerbaikanCustom,
};
