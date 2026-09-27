/* legacy-app.js — seluruh JavaScript aplikasi, dipindahkan apa adanya dari
   index.html baris 522-3138 pada Phase 2.

   Berkas ini SEMENTARA. Isinya akan dipecah bertahap pada Phase 3-9 menjadi
   shared/ domain/ repositories/ services/ presentation/. Jangan menambah kode
   baru di sini — tambahkan di modul tujuannya.

   Catatan: berkas ini kini dimuat sebagai ES module, sehingga berjalan dalam
   strict mode. Sudah dipindai: tidak ada assignment ke variabel tak
   terdeklarasi dan tidak ada deklarasi function di dalam blok. */

import { escapeHtml } from './shared/html.js';
import { reportError } from './shared/errors.js';

import { APPROVAL_STAGES } from './config/constants.js';
import { getRandomOfficer } from './data/officers.js';
import * as inspectionRepository from './repositories/inspection-repository.js';
import * as scheduleRepository from './repositories/schedule-repository.js';
import * as plantRepository from './repositories/plant-repository.js';

import { apiPost, apiGet, ApiError } from './infrastructure/api-client.js';
import { setSession, clearSession, getCurrentUser, onSessionExpired } from './infrastructure/session.js';

import { allActionsClosed, countAllFindings } from './domain/inspection-rules.js';
import { findStage, isFullyApproved, latestDecision } from './domain/approval-rules.js';
import { canEdit, canRevise } from './domain/inspection-policy.js';
import { INSPECTION_STATUS } from './domain/statuses.js';
import { localDateToIso } from './shared/date.js';
import * as scheduleRules from './domain/schedule-rules.js';

import * as approvalService from './services/approval-service.js';
import * as correctiveActionService from './services/corrective-action-service.js';
import * as inspectionService from './services/inspection-service.js';
import * as scheduleService from './services/schedule-service.js';
import * as excelExporter from './infrastructure/excel-exporter.js';
import * as pdfExporter from './infrastructure/pdf-exporter.js';

import { createPlantSelect } from './presentation/components/plant-select.js';
import { bindModalClose, closeModal, openModal } from './presentation/components/modal.js';
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
    NOT_FOUND: '⚠️ Data tidak ditemukan',
    PLANT_NOT_FOUND: '⚠️ Plant tidak ditemukan, coba pilih ulang',
    STAGE_NOT_FOUND: '⚠️ Tahap tidak ditemukan',
    NOT_IN_REVIEW: '⚠️ Inspeksi ini tidak sedang menunggu pengesahan',
    STAGE_NOT_CURRENT: '⚠️ Tahap ini sudah tidak menunggu keputusan — muat ulang data',
    REJECTION_REASON_REQUIRED: '⚠️ Alasan penolakan wajib diisi',
    REJECTION_REASON_INVALID: '⚠️ Alasan penolakan harus berupa teks',
    REJECTION_REASON_TOO_LONG: '⚠️ Alasan penolakan maksimal 1000 karakter',
    FORBIDDEN: '⛔ Anda tidak berwenang untuk aksi ini',
    NOT_EDITABLE: '⚠️ Inspeksi ini tidak bisa diubah pada status sekarang',
    NOT_SUBMITTABLE: '⚠️ Inspeksi ini tidak bisa diajukan pada status sekarang',
    NOT_DELETABLE: '⚠️ Hanya draft yang bisa dihapus',
    STATE_CHANGED: '⚠️ Status inspeksi baru saja berubah — muat ulang data',
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

/** Inisial dari nama tampilan, dipakai avatar header (mis. "Arif" -> "AR"). */
function initialsOf(displayName) {
    const parts = String(displayName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return parts.length === 1
        ? parts[0].slice(0, 2).toUpperCase()
        : (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Menampilkan #mainApp dan mengisi header dari identitas yang sedang login. */
function showMainApp(user) {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('mainApp').classList.add('visible');
    document.getElementById('userAvatar').textContent = initialsOf(user.displayName);
    document.getElementById('userName').textContent = user.displayName;
    // Terkunci sejak Phase 14 (docs/DECISIONS.md): server SELALU memaksa
    // petugas dari identitas login (lihat inspections.routes.js), field ini
    // kini murni tampilan — bukan lagi input bebas yang bisa menyimpang dari
    // apa yang benar-benar tersimpan.
    const formPetugas = document.getElementById('formPetugas');
    if (formPetugas) formPetugas.value = user.displayName;
}

async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    try {
        const { user, csrfToken } = await apiPost('/auth/login', { username, password });
        setSession(user, csrfToken);
        showMainApp(user);
        setTimeout(initApp, 300);
    } catch (error) {
        // Sengaja tanpa toast pesan gagal (permintaan pengguna sebelumnya,
        // lihat git log "remove error message notifications from login
        // process") — cukup kosongkan password dan kembalikan fokus.
        if (!(error instanceof ApiError)) reportError('login', error, '');
        document.getElementById('loginPassword').value = '';
        document.getElementById('loginPassword').focus();
    }
}

/** Dipanggil saat startup (window load): memulihkan sesi lewat cookie yang masih berlaku, tanpa perlu login ulang setelah reload halaman. */
async function restoreSession() {
    try {
        const { user, csrfToken } = await apiGet('/auth/me');
        setSession(user, csrfToken);
        showMainApp(user);
        initApp();
        return true;
    } catch {
        return false;
    }
}

/** Dipanggil session.js saat server menolak permintaan dengan 401 di tengah sesi (kedaluwarsa/dihapus). */
onSessionExpired(() => {
    clearSession();
    document.getElementById('mainApp').classList.remove('visible');
    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('loginPassword').value = '';
    showToast('⚠️ Sesi berakhir, silakan login kembali');
});

async function logout() {
    if (!confirm('Anda yakin ingin keluar?')) return;

    // Phase 14.1-J: sebelumnya kegagalan apa pun di sini (bukan cuma network
    // down) tetap diam-diam diperlakukan sebagai "logout berhasil" — state
    // klien dibersihkan tanpa syarat, padahal sesi di server bisa saja masih
    // hidup. Sekarang dibedakan eksplisit: berhasil -> bersih tanpa pesan
    // (perilaku lama, disengaja tetap tanpa toast pada kasus normal). Gagal
    // -> state klien TETAP dibersihkan (pengguna tidak punya cara lain
    // memaksa logout dari sini, dan meninggalkan UI seolah masih login lebih
    // menyesatkan), TAPI diberi tahu eksplisit bahwa sesi di server mungkin
    // belum benar-benar berakhir — bukan diam-diam disamarkan sebagai sukses.
    let serverConfirmedLogout = true;
    try {
        await apiPost('/auth/logout');
    } catch (error) {
        serverConfirmedLogout = false;
        reportError('logout', error, '');
    }

    clearSession();
    document.getElementById('mainApp').classList.remove('visible');
    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginUsername').focus();

    if (!serverConfirmedLogout) {
        showToast('⚠️ Sesi lokal dibersihkan, tapi server belum mengonfirmasi logout. Tutup browser bila memakai perangkat bersama.');
    }
}

// D-2 (docs/KNOWN-ISSUES.md): dulu ada listener keydown di sini yang secara
// manual men-dispatch submit lagi saat Enter ditekan. Itu berlebihan — form
// HTML sudah submit sendiri saat Enter ditekan di dalam input teks, tanpa
// perlu JS. Menduplikasi itu membuat handleLogin() terpanggil 2-3 kali per
// Enter, yang menjadwalkan setTimeout(initApp, 300) berkali-kali (pemicu D-3).
// Dihapus pada Phase 10, bukan diganti — sudah tidak diperlukan.

// Phase 16.1 (U-01): DOMContentLoaded, bukan lagi window.load — load baru
// terpicu setelah SELURUH subresource selesai (gambar latar login yang
// dihosting eksternal, tiga <script> CDN Chart.js/XLSX/html2pdf.js), yang
// memperpanjang jendela waktu #authLoading harus menutupi #loginPage tanpa
// alasan. main.js dimuat sebagai <script type="module">, yang SELALU
// deferred setara defer — kode ini sendiri baru berjalan setelah dokumen
// selesai di-parse, yaitu SEBELUM DOMContentLoaded ditembakkan (bukan
// sesudahnya), jadi listener di bawah dijamin belum ketinggalan event-nya.
// Chart.js/XLSX/html2pdf.js dimuat lewat <script> biasa (bukan
// defer/async) di <head>, yang blocking terhadap parsing — sudah pasti
// selesai dieksekusi jauh sebelum DOMContentLoaded, jadi initApp() (lewat
// restoreSession() di bawah) tetap aman memanggil initCharts() dst.
document.addEventListener('DOMContentLoaded', async function() {
    const restored = await restoreSession();
    // Status sesi sudah diketahui (berhasil -> showMainApp() di dalam
    // restoreSession() sudah menampilkan #mainApp; gagal -> #loginPage
    // tetap dalam keadaan default-nya) — aman menyingkap salah satunya.
    document.getElementById('authLoading').classList.add('hidden');
    if (!restored) document.getElementById('loginUsername').focus();
});

// Badge jam, status "Online", dan tanggal semuanya dihapus dari header
// (docs/DECISIONS.md K-6). Fungsi updateClock/updateHeaderDate beserta
// interval-nya ikut dihapus karena elemen tujuannya sudah tidak ada —
// menyentuh #currentTime / #currentDate akan melempar TypeError dan
// mematikan initApp() di tengah jalan.

// ========================================================================
// ========== SISTEM ==========
// ========================================================================

// Phase 16.3 (U-05): satu-satunya jalur ganti tab — dipakai tombol .nav-tab
// (lihat NAVIGASI di bawah) DAN pintasan data-action="switchTab" ("Kelola" di
// dashboard). Sebelumnya pintasan punya salinan sendiri yang MENGOSONGKAN
// keempat kotak pencarian, sedangkan navigasi utama mempertahankan isinya dan
// hanya memfilter ulang panel tujuan; perilaku navigasi utama yang dipakai.
function switchTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    const tab = document.querySelector(`.nav-tab[data-panel="${tabName}"]`);
    if (tab) tab.classList.add('active');
    const panel = document.getElementById(`panel-${tabName}`);
    if (panel) panel.classList.add('active');
    setTimeout(() => {
        const activePanel = document.querySelector('.panel.active');
        if (activePanel) {
            const searchInput = activePanel.querySelector('.search-wrapper input');
            if (searchInput) {
                searchInput.dispatchEvent(new Event('input'));
            }
        }
    }, 100);
}


// ========================================================================
// ========== APPROVAL FUNCTIONS ==========
// ========================================================================

async function approveStage(inspeksiId, stageId) {
    const result = await approvalService.approve(inspeksiId, stageId, getCurrentUser());
    if (!result.ok) { showToast(pesanGagal(result.reason)); return; }

    const { stage, fullyApproved } = result.data;
    showToast(fullyApproved
        ? '🎉 Semua tahap pengesahan telah disetujui! Inspeksi selesai.'
        : `✅ ${stage.title} telah menyetujui inspeksi ${inspeksiId}`);

    // Phase 17.3A: modal ditutup, TIDAK dibuka ulang — setelah tahapnya lewat,
    // penyetuju biasanya tidak lagi berhak melihat inspeksi ini (server menjawab
    // 404), dan membuka ulang hanya akan menimpa toast sukses dengan
    // "Data tidak ditemukan".
    closeModal('approvalModal');
    await refreshAll();
}

// Phase 17.3B: penolakan lewat modal (#rejectModal) dengan alasan wajib —
// menggantikan prompt() Phase 17.2. Server tetap memvalidasi ulang alasannya.
let pendingReject = null;

function updateRejectReasonCount() {
    const input = document.getElementById('rejectReason');
    document.getElementById('rejectReasonCount').textContent = `${input.value.length}/${input.maxLength}`;
}

function rejectStage(inspeksiId, stageId) {
    const stage = findStage(stageId);
    if (!stage) { showToast(pesanGagal('STAGE_NOT_FOUND')); return; }
    pendingReject = { inspeksiId, stageId };
    document.getElementById('rejectModalInfo').textContent =
        `${stage.title} menolak inspeksi ${inspeksiId}. Inspeksi kembali ke Safety Officer untuk direvisi, lalu diajukan ulang ke tahap ini.`;
    const input = document.getElementById('rejectReason');
    input.value = '';
    updateRejectReasonCount();
    openModal('rejectModal');
    input.focus();
}

async function confirmReject() {
    if (!pendingReject) return;
    const reason = document.getElementById('rejectReason').value;
    if (!reason.trim()) { showToast(pesanGagal('REJECTION_REASON_REQUIRED')); return; }

    const { inspeksiId, stageId } = pendingReject;
    const result = await approvalService.reject(inspeksiId, stageId, getCurrentUser(), reason);
    if (!result.ok) { showToast(pesanGagal(result.reason)); return; }

    pendingReject = null;
    showToast(`❌ ${result.data.stage.title} menolak inspeksi ${inspeksiId}`);
    // Phase 17.3A: setelah ditolak, inspeksi menunggu revisi dan tidak lagi
    // terlihat oleh penolaknya — kedua modal ditutup, bukan dibuka ulang.
    closeModal('rejectModal');
    closeModal('approvalModal');
    await refreshAll();
}

document.getElementById('rejectReason').addEventListener('input', updateRejectReasonCount);
bindModalClose('rejectModal', 'closeRejectModal');

// ========================================================================
// ========== PDF GENERATOR ==========
// ========================================================================

async function cetakPDF(id) {
    const item = await inspectionRepository.findById(id);
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

async function exportTemuanPerItem(id) {
    const item = await inspectionRepository.findById(id);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }
    if (!item.temuan || item.temuan.length === 0) { showToast('⚠️ Tidak ada temuan'); return; }

    const { count } = excelExporter.exportFindingsOf(item);
    showToast(`📊 ${count} temuan dari ${item.id} diekspor`);
}


async function exportAllTemuan() {
    const inspections = await inspectionRepository.getAll();
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

async function openJadwalModal(data = null) {
    document.getElementById('jadwalModalTitle').textContent = data ? 'Edit Jadwal' : 'Tambah Jadwal';
    const currentYear = new Date().getFullYear();
    const todayISO = new Date().toISOString().split('T')[0];

    if (data) {
        document.getElementById('editJadwalId').value = data.id;
        const plant = await plantRepository.findById(data.plantId);
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
    openModal('jadwalModal');
}

async function editJadwal(id) {
    const item = await scheduleRepository.findById(id);
    if (item) await openJadwalModal(item);
}

async function hapusJadwal(id) {
    if (!confirm(`Hapus jadwal ${id}?`)) return;

    await scheduleService.remove(id);
    await refreshAll();
    showToast(`🗑️ Jadwal ${id} dihapus`);
}

bindModalClose('jadwalModal', 'closeJadwalModal');

document.getElementById('submitJadwal').addEventListener('click', async function(e) {
    e.preventDefault();
    try {
        const result = await scheduleService.save({
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

        await refreshAll();
        closeModal('jadwalModal');
    } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
            showToast(reportError('simpan jadwal', error, '⚠️ Gagal menyimpan jadwal. Coba ulangi beberapa saat lagi.'));
        }
    }
});

// ========================================================================
// ========== PERBAIKAN MODAL ==========
// ========================================================================

async function tambahPerbaikanCustom(id) {
    const fotoFiles = Array.from(document.getElementById('newFoto').files);
    const result = await correctiveActionService.addAction(id, {
        action: document.getElementById('newAction').value,
        status: document.getElementById('newStatus').value,
        pic: document.getElementById('newPIC').value.trim() || getRandomOfficer(),
        photos: fotoFiles,
    }, getCurrentUser());
    if (!result.ok) { showToast(pesanGagal(result.reason)); return; }

    await refreshAll();
    showToast(`✅ Tindakan "${result.data.action.action}" ditambahkan dengan ${fotoFiles.length} foto`);
    document.getElementById('newAction').value = '';
    document.getElementById('newFoto').value = '';
    document.getElementById('newFotoCount').textContent = 'Belum ada file';
    await openPerbaikanModal(id);
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
//
// Phase 17.3B: form yang sama dipakai untuk membuat DRAFT baru dan untuk
// mengubah draft / revisi milik sendiri. "Simpan Draft" hanya menyimpan
// (status tidak berubah); "Simpan & Ajukan" menyimpan lalu mengajukan lewat
// endpoint submit — server yang menentukan status dan tahapnya.

/** Inspeksi yang sedang diubah lewat form ({ id }), atau null saat membuat baru. */
let editingInspection = null;
let savingInspeksi = false;

function formContent() {
    return {
        plantId: document.getElementById('selectedPlant').value,
        keteranganLokasi: document.getElementById('formKeteranganLokasi').value.trim(),
        tanggal: document.getElementById('formTanggal').value,
        dueDate: document.getElementById('formDueDate').value,
        fotoDekat: Array.from(document.getElementById('fotoDekat').files),
        fotoJauh: Array.from(document.getElementById('fotoJauh').files),
        // Temuan yang dimuat dari inspeksi membawa `id` — server memperbaruinya di tempat.
        temuan: temuanList.map((item) => ({ ...item })),
    };
}

function showFormValidation(reason) {
    const { INSPECTION_ERROR } = inspectionService;
    if (reason === INSPECTION_ERROR.PLANT_REQUIRED) {
        showToast('⚠️ Silakan pilih Lokasi / Plant terlebih dahulu!');
        plantSelectForm.markInvalid();
    } else if (reason === INSPECTION_ERROR.PLANT_NOT_FOUND) {
        showToast(pesanGagal('PLANT_NOT_FOUND'));
        plantSelectForm.markInvalid();
    } else if (reason === INSPECTION_ERROR.FINDINGS_REQUIRED) {
        showToast('⚠️ Tambahkan minimal 1 temuan!');
    } else if (reason === INSPECTION_ERROR.DATE_REQUIRED) {
        showToast('⚠️ Tanggal inspeksi wajib diisi!');
    } else {
        showToast(pesanGagal(reason));
    }
}

function submittedMessage(id, submitResult) {
    if (!submitResult.resubmitted) return `✅ Inspeksi ${id} berhasil disimpan dan diajukan ke Koordinator K3L.`;
    const stage = findStage(submitResult.inspection.currentApprovalStage);
    return `✅ Inspeksi ${id} berhasil disimpan dan diajukan ulang ke ${stage ? stage.title : 'tahap yang menolak'}.`;
}

async function saveInspeksi({ submit }) {
    if (savingInspeksi) return;
    savingInspeksi = true;
    const user = getCurrentUser();
    try {
        const content = formContent();
        // petugas TIDAK dibaca dari input bebas — server selalu memaksanya dari
        // identitas login (lihat inspections.routes.js); field formPetugas hanya tampilan.
        const saved = editingInspection
            ? await inspectionService.update(editingInspection.id, content, user)
            : await inspectionService.create({ ...content, petugas: user ? user.displayName : getRandomOfficer() });
        if (!saved.ok) { showFormValidation(saved.reason); return; }

        const id = saved.data.inspection.id;
        let message = editingInspection ? `✅ ${id} berhasil disimpan.` : `✅ Draft ${id} berhasil disimpan.`;
        if (submit) {
            const submitted = await inspectionService.submit(id, user);
            if (!submitted.ok) {
                resetInspeksiForm();
                await refreshAll();
                showToast(`⚠️ ${id} tersimpan, tapi belum diajukan: ${pesanGagal(submitted.reason)}`);
                return;
            }
            message = submittedMessage(id, submitted.data);
        }

        resetInspeksiForm();
        await refreshAll();
        showToast(message);
    } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
            showToast(reportError('simpan inspeksi', error, '⚠️ Gagal menyimpan inspeksi. Coba ulangi beberapa saat lagi.'));
        }
    } finally {
        savingInspeksi = false;
    }
}

/** Menyesuaikan judul, catatan revisi, dan tombol form dengan mode buat/ubah. */
function setFormMode(inspection) {
    const notice = document.getElementById('revisionNotice');
    const photoNote = document.getElementById('existingPhotoNote');
    const cancelBtn = document.getElementById('batalEditInspeksi');
    const submitBtn = document.getElementById('submitAjukanInspeksi');

    notice.style.display = 'none';
    notice.textContent = '';
    photoNote.textContent = '';
    if (!inspection) {
        document.getElementById('inspeksiFormTitle').textContent = 'Buat Inspeksi Baru';
        cancelBtn.style.display = 'none';
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Simpan &amp; Ajukan';
        return;
    }

    const revising = inspection.status === INSPECTION_STATUS.REVISION_REQUIRED;
    document.getElementById('inspeksiFormTitle').textContent = revising ? `Revisi ${inspection.id}` : `Edit Draft ${inspection.id}`;
    cancelBtn.style.display = '';
    submitBtn.innerHTML = revising
        ? '<i class="fas fa-paper-plane"></i> Simpan &amp; Ajukan Ulang'
        : '<i class="fas fa-paper-plane"></i> Simpan &amp; Ajukan';

    if (revising) {
        const stage = findStage(inspection.currentApprovalStage);
        const rejection = latestDecision(inspection, inspection.currentApprovalStage);
        // textContent, bukan innerHTML: alasan penolakan adalah isian bebas peninjau.
        notice.textContent = `Ditolak oleh ${stage ? stage.title : 'peninjau'}${rejection && rejection.reviewerName ? ` (${rejection.reviewerName})` : ''}: `
            + `"${rejection && rejection.rejectionReason ? rejection.rejectionReason : '-'}". `
            + `Setelah direvisi, inspeksi diajukan ulang ke tahap ${stage ? stage.title : 'yang sama'}.`;
        notice.style.display = 'block';
    }
    const photoCount = (inspection.fotoDekat || []).length + (inspection.fotoJauh || []).length;
    if (photoCount > 0) photoNote.textContent = `(${photoCount} foto sudah tersimpan — foto yang dipilih akan ditambahkan)`;
}

function resetInspeksiForm() {
    editingInspection = null;
    temuanList = [];
    renderTemuanList();
    document.getElementById('temuanInput').value = '';
    document.getElementById('fotoDekat').value = '';
    document.getElementById('fotoJauh').value = '';
    document.getElementById('formKeteranganLokasi').value = '';
    document.getElementById('formTanggal').value = '';
    document.getElementById('formDueDate').value = '';
    plantSelectForm.clear();
    setFormMode(null);
}

/** Membuka draft / revisi milik sendiri di form (tombol "Edit" di tabel inspeksi). */
async function editInspeksi(id) {
    const item = await inspectionRepository.findById(id);
    if (!item) { showToast(pesanGagal('NOT_FOUND')); return; }
    const user = getCurrentUser();
    if (!canEdit(user, item) && !canRevise(user, item)) { showToast(pesanGagal('NOT_EDITABLE')); return; }

    resetInspeksiForm();
    editingInspection = { id: item.id };
    const plant = await plantRepository.findById(item.plantId);
    if (plant) plantSelectForm.select(plant.id, plant.name, plant.code);
    document.getElementById('formKeteranganLokasi').value = item.keteranganLokasi === '-' ? '' : (item.keteranganLokasi || '');
    document.getElementById('formTanggal').value = localDateToIso(item.tanggal) || '';
    document.getElementById('formDueDate').value = localDateToIso(item.dueDate) || '';
    temuanList = (item.temuan || []).map((finding) => ({ id: finding.id, deskripsi: finding.deskripsi, kategori: finding.kategori }));
    renderTemuanList();
    setFormMode(item);
    switchTab('form');
}

/** Mengajukan / mengajukan ulang langsung dari tabel (tanpa membuka form). */
async function ajukanInspeksi(id) {
    if (!confirm(`Ajukan inspeksi ${id} untuk pengesahan? Setelah diajukan, isinya tidak bisa diubah kecuali ditolak peninjau.`)) return;
    const result = await inspectionService.submit(id, getCurrentUser());
    if (!result.ok) { showToast(pesanGagal(result.reason)); return; }
    if (editingInspection && editingInspection.id === id) resetInspeksiForm();
    await refreshAll();
    showToast(submittedMessage(id, result.data).replace(' berhasil disimpan dan', ''));
}

/** Menghapus draft milik sendiri (bukan penghapusan inspeksi oleh Admin). */
async function hapusDraftInspeksi(id) {
    if (!confirm(`Hapus draft ${id}? Tindakan ini tidak bisa dibatalkan.`)) return;
    const result = await inspectionService.removeDraft(id, getCurrentUser());
    if (!result.ok) { showToast(pesanGagal(result.reason)); return; }
    if (editingInspection && editingInspection.id === id) resetInspeksiForm();
    await refreshAll();
    showToast(`🗑️ Draft ${id} dihapus`);
}

document.getElementById('submitInspeksi').addEventListener('click', (e) => {
    e.preventDefault();
    saveInspeksi({ submit: false });
});
document.getElementById('submitAjukanInspeksi').addEventListener('click', (e) => {
    e.preventDefault();
    saveInspeksi({ submit: true });
});
document.getElementById('batalEditInspeksi').addEventListener('click', () => resetInspeksiForm());

// ========================================================================
// ========== STATS & REFRESH ==========
// ========================================================================

async function updateStats() {
    // getAll() dipanggil sekali dan dipakai ulang (bukan dua kali seperti
    // sebelumnya) — sejak Phase 14 setiap panggilan adalah request jaringan.
    const [inspections, schedules] = await Promise.all([
        inspectionRepository.getAll(),
        scheduleRepository.getAll(),
    ]);
    const total = inspections.length;
    const totalTemuan = countAllFindings(inspections);
    const selesaiPerbaikan = inspections.filter(allActionsClosed).length;
    const jadwalAktif = scheduleRules.countActive(schedules);
    document.getElementById('statTotalInspeksi').textContent = total;
    document.getElementById('statTotalTemuan').textContent = totalTemuan;
    document.getElementById('statJadwalAktif').textContent = jadwalAktif;
    document.getElementById('statSelesaiPerbaikan').textContent = selesaiPerbaikan;
}

async function refreshAll() {
    document.querySelectorAll('.search-wrapper input').forEach(inp => {
        inp.dispatchEvent(new Event('input'));
    });
    await Promise.all([
        renderCalendar(),
        updateStats(),
        renderTemuanPlantChart(),
        updatePerbaikanChart(),
    ]);
}

// ========================================================================
// ========== NAVIGASI ==========
// ========================================================================

document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', function(e) {
        e.preventDefault();
        switchTab(this.dataset.panel);
    });
});

// ========================================================================
// ========== EVENT LISTENERS EXPORT ==========
// ========================================================================

document.getElementById('exportSpreadsheet').addEventListener('click', async () => {
    try {
        exportToExcel(await inspectionRepository.getAll(), 'Inspeksi_K3.xlsx');
    } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
            showToast(reportError('export spreadsheet', error, '⚠️ Gagal mengekspor data. Coba ulangi beberapa saat lagi.'));
        }
    }
});
document.getElementById('exportAllTemuan').addEventListener('click', async () => {
    try {
        await exportAllTemuan();
    } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
            showToast(reportError('export semua temuan', error, '⚠️ Gagal mengekspor data. Coba ulangi beberapa saat lagi.'));
        }
    }
});

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
        excelExporter.downloadInspectionsWorkbook(await inspectionRepository.getAll());
        showToast('✅ File Excel siap! Upload ke Google Sheets.');
    } catch (error) {
        showToast(reportError('siapkan file Excel', error, '⚠️ Gagal menyiapkan file Excel. Coba ulangi beberapa saat lagi.'));
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Sync';
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

// D-3 (docs/KNOWN-ISSUES.md): initApp() dipanggil ulang setiap login berhasil,
// termasuk logout lalu login lagi di sesi yang sama — bukan cuma sekali per
// pemuatan halaman. initPlantSelect(), setupSearch(), dan setInterval() di
// bawah MEMASANG listener/timer baru pada pemanggilan pertama; kalau diulang
// akan menumpuk duplikat (listener dobel, interval dobel) tanpa pernah
// dibersihkan, karena elemen DOM-nya sendiri tidak pernah dibuat ulang (login
// hanya mengganti class CSS, bukan membongkar #mainApp). Penjaga ini membuat
// bagian yang memasang listener/timer hanya berjalan sekali per pemuatan
// halaman; bagian yang menyegarkan tampilan (form default, chart, tabel)
// tetap berjalan di setiap login.
let appInitialized = false;

async function initApp() {
    if (!appInitialized) {
        appInitialized = true;

        initPlantSelect();

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

        setInterval(() => {
            // Refresh berkala di latar belakang — kegagalan (mis. sesi
            // kedaluwarsa saat tab dibiarkan idle) sudah ditangani
            // notifySessionExpired() di session.js; di sini cukup jangan
            // sampai jadi unhandled rejection yang mencemari console.
            Promise.all([renderJadwalTable(), renderCalendar()]).catch(() => {});
        }, 10000);
    }

    document.getElementById('formTanggal').value = new Date().toISOString().split('T')[0];
    const defaultDueDate = new Date();
    defaultDueDate.setDate(defaultDueDate.getDate() + 14);
    document.getElementById('formDueDate').value = defaultDueDate.toISOString().split('T')[0];

    renderTemuanList();
    await initCharts();
    await refreshAll();

    const [totalInspeksi, totalJadwal, totalPlant] = await Promise.all([
        inspectionRepository.count(),
        scheduleRepository.count(),
        plantRepository.count(),
    ]);
    console.log('🚀 SHE Sasa K3 System - PHASE 14 (backend sungguhan) ACTIVE');
    console.log(`📊 ${totalInspeksi} inspeksi, ${totalJadwal} jadwal mingguan`);
    console.log(`🏭 ${totalPlant} Plant terdaftar`);
    console.log(`📋 ${APPROVAL_STAGES.length} Tahap Pengesahan: ${APPROVAL_STAGES.map(s => s.title).join(' → ')}`);
    console.log(`📅 Jadwal mingguan setiap plant - ${totalJadwal} total jadwal`);
}

// Enter di #loginPassword dulu men-dispatch submit lagi secara manual di sini
// (D-2) — dihapus, submit form asli sudah cukup (lihat catatan di LOGIN SYSTEM).

document.getElementById('loginUsername').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        // preventDefault: tanpa ini, submit form asli TETAP jalan (dengan
        // password yang mungkin masih kosong) bersamaan dengan pemindahan
        // fokus — persis pola berlebihan yang sama seperti D-2.
        e.preventDefault();
        document.getElementById('loginPassword').focus();
    }
});

/* ---------------------------------------------------------------------------
   Pendaftaran aksi klik (event delegation).

   Elemen yang dulu memakai onclick="handler(${jsArg(id)})" sekarang memakai
   data-action="handler" data-id="...". Baris di bawah memetakan setiap nama
   data-action ke handler-nya, sekaligus mengonversi tipe: dataset SELALU
   berisi string, sedangkan sebagian handler mengharapkan number (delta bulan,
   index array). Tanpa Number(...) di sini, changeCalendarMonth akan
   menggabung string alih-alih menghitung bulan. Kode tahap pengesahan sejak
   Phase 17.2 adalah string ('koordinator_k3l', ...), jadi TIDAK dikonversi.

   Menggantikan src/compat/global-bridge.js, yang sudah dihapus. -------------- */
registerAction('logout', () => logout());
registerAction('switchTab', (el) => switchTab(el.dataset.panel));
registerAction('openJadwalModal', () => openJadwalModal());
registerAction('setRealisasiHariIni', () => setRealisasiHariIni());
registerAction('changeCalendarMonth', (el) => changeCalendarMonth(Number(el.dataset.delta)));
registerAction('showDayEvents', (el) => showDayEvents(el.dataset.date));
registerAction('openLightbox', (el) => openLightbox(JSON.parse(el.dataset.images), Number(el.dataset.index)));
registerAction('approveStage', (el) => approveStage(el.dataset.id, el.dataset.stage));
registerAction('rejectStage', (el) => rejectStage(el.dataset.id, el.dataset.stage));
registerAction('exportTemuanPerItem', (el) => exportTemuanPerItem(el.dataset.id));
registerAction('cetakPDF', (el) => cetakPDF(el.dataset.id));
registerAction('openApprovalModal', (el) => openApprovalModal(el.dataset.id));
registerAction('openDetailModal', (el) => openDetailModal(el.dataset.id));
registerAction('openPerbaikanModal', (el) => openPerbaikanModal(el.dataset.id));
registerAction('editJadwal', (el) => editJadwal(el.dataset.id));
registerAction('hapusJadwal', (el) => hapusJadwal(el.dataset.id));
registerAction('tambahPerbaikanCustom', (el) => tambahPerbaikanCustom(el.dataset.id));
registerAction('hapusTemuan', (el) => hapusTemuan(Number(el.dataset.index)));
registerAction('editInspeksi', (el) => editInspeksi(el.dataset.id));
registerAction('ajukanInspeksi', (el) => ajukanInspeksi(el.dataset.id));
registerAction('hapusDraftInspeksi', (el) => hapusDraftInspeksi(el.dataset.id));
registerAction('confirmReject', () => confirmReject());
initActionDispatcher();

/* Ekspor murni untuk pengujian (lihat scratchpad test-*.mjs) — BUKAN untuk
   jembatan window lagi, itu sudah tidak ada. Runtime aplikasi memanggil
   fungsi-fungsi ini lewat pendaftaran aksi di atas atau lewat pemanggilan
   langsung antar fungsi, bukan lewat ekspor ini. */
export {
    ajukanInspeksi,
    approveStage,
    cetakPDF,
    changeCalendarMonth,
    confirmReject,
    editInspeksi,
    editJadwal,
    exportTemuanPerItem,
    handleLogin,
    hapusDraftInspeksi,
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
