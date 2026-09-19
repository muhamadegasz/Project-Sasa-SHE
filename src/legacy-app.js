/* legacy-app.js — seluruh JavaScript aplikasi, dipindahkan apa adanya dari
   index.html baris 522-3138 pada Phase 2.

   Berkas ini SEMENTARA. Isinya akan dipecah bertahap pada Phase 3-9 menjadi
   shared/ domain/ repositories/ services/ presentation/. Jangan menambah kode
   baru di sini — tambahkan di modul tujuannya.

   Catatan: berkas ini kini dimuat sebagai ES module, sehingga berjalan dalam
   strict mode. Sudah dipindai: tidak ada assignment ke variabel tak
   terdeklarasi dan tidak ada deklarasi function di dalam blok. */

import { escapeHtml, highlight, jsArg, svgText } from './shared/html.js';
import { formatDate, isOverdue } from './shared/date.js';
import { reportError } from './shared/errors.js';

import { APPROVAL_STAGES, PERIODE_LIST } from './config/constants.js';
import { isValidDemoLogin, DEMO_DISPLAY_NAME } from './config/demo-auth.js';
import { getRandomOfficer } from './data/officers.js';
import * as inspectionRepository from './repositories/inspection-repository.js';
import * as scheduleRepository from './repositories/schedule-repository.js';
import * as plantRepository from './repositories/plant-repository.js';

import {
    getProgress,
    getRepairStatus,
    allActionsClosed,
    hasActionInProgress,
    hasActionOpen,
    countAllFindings,
} from './domain/inspection-rules.js';
import {
    findStage,
    canApproveStage,
    isFullyApproved,
    countApproved,
    totalStages,
} from './domain/approval-rules.js';
import * as scheduleRules from './domain/schedule-rules.js';

import { formatApprovalStatus } from './shared/labels.js';
import * as approvalService from './services/approval-service.js';
import * as correctiveActionService from './services/corrective-action-service.js';
import * as inspectionService from './services/inspection-service.js';
import * as scheduleService from './services/schedule-service.js';
import { filterByFields } from './services/search-service.js';
import * as excelExporter from './infrastructure/excel-exporter.js';
import * as pdfExporter from './infrastructure/pdf-exporter.js';

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
// Berikutnya: komponen UI (Phase 7), presenter + view (Phase 8), controller (Phase 9).
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

// Efek visual saat plant belum dipilih: fokus + border merah selama 3 detik.
// Ini murni urusan tampilan, karena itu tetap di sini, bukan di service.
function tandaiPlantBelumDipilih() {
    const input = document.getElementById('plantSearchInput');
    input.focus();
    input.classList.add('error');
    setTimeout(() => { input.classList.remove('error'); }, 3000);
}

function pesanGagal(reason) {
    return PESAN_GAGAL[reason] || '⚠️ Terjadi kesalahan';
}

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
        const filtered = plantRepository.search(filter);

        if (filtered.length === 0) {
            dropdown.innerHTML = `<div class="dropdown-item" style="color:#8a6a6a;">Tidak ada plant ditemukan</div>`;
        } else {
            dropdown.innerHTML = filtered.map(p => {
                const nameHighlight = highlight(p.name, filter, 'highlight-match');
                const codeHighlight = highlight(p.code, filter, 'highlight-match');
                return `
                    <div class="dropdown-item" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}" data-code="${escapeHtml(p.code)}">
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
        display.innerHTML = `<span class="selected-value"><i class="fas fa-check-circle"></i> ${escapeHtml(name)} (${escapeHtml(code)})</span>`;
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
        const filtered = plantRepository.search(filter);

        if (filtered.length === 0) {
            dropdownJ.innerHTML = `<div class="dropdown-item" style="color:#8a6a6a;">Tidak ada plant ditemukan</div>`;
        } else {
            dropdownJ.innerHTML = filtered.map(p => {
                const nameHighlight = highlight(p.name, filter, 'highlight-match');
                const codeHighlight = highlight(p.code, filter, 'highlight-match');
                return `
                    <div class="dropdown-item" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}" data-code="${escapeHtml(p.code)}">
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
        displayJ.innerHTML = `<span class="selected-value"><i class="fas fa-check-circle"></i> ${escapeHtml(name)} (${escapeHtml(code)})</span>`;
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

// ========================================================================
// ========== LOGIN SYSTEM ==========
// ========================================================================

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
        `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400'%3E%3Crect width='600' height='400' fill='%232a2a2a'/%3E%3Ctext x='50%25' y='45%25' text-anchor='middle' fill='%23666' font-size='40' font-family='sans-serif'%3E📷%3C/text%3E%3Ctext x='50%25' y='60%25' text-anchor='middle' fill='%23888' font-size='20' font-family='sans-serif'%3E${svgText(images[index])}%3C/text%3E%3C/svg%3E`;
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
        `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400'%3E%3Crect width='600' height='400' fill='%232a2a2a'/%3E%3Ctext x='50%25' y='45%25' text-anchor='middle' fill='%23666' font-size='40' font-family='sans-serif'%3E📷%3C/text%3E%3Ctext x='50%25' y='60%25' text-anchor='middle' fill='%23888' font-size='20' font-family='sans-serif'%3E${svgText(lightboxImages[currentLightboxIndex])}%3C/text%3E%3C/svg%3E`;
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
                         onclick="openLightbox(${jsArg(images)}, ${idx})"
                         title="Klik untuk preview: ${escapeHtml(img)}"
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
            ${APPROVAL_STAGES.map((stage) => {
                const approval = approvals[stage.id] || { approved: false, by: null, jabatan: stage.title, tanggal: null };
                const isCompleted = approval.approved === true;
                const isCurrent = canApproveStage(item, stage);

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
                        <button class="stage-action-btn approve" onclick="approveStage(${jsArg(item.id)}, ${stage.id})">
                            <i class="fas fa-check"></i> Setujui
                        </button>
                        <button class="stage-action-btn reject" onclick="rejectStage(${jsArg(item.id)}, ${stage.id})">
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
                            <div class="stage-title">${escapeHtml(stage.title)}</div>
                            <div class="stage-detail">
                                ${isCompleted ? `${escapeHtml(approval.by)} · ${escapeHtml(approval.tanggal)}` : (isCurrent ? 'Menunggu persetujuan' : 'Belum mencapai tahap ini')}
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
    const result = approvalService.approve(inspeksiId, stageId);
    if (!result.ok) { showToast(pesanGagal(result.reason)); return; }

    const { stage, fullyApproved } = result.data;
    showToast(fullyApproved
        ? '🎉 Semua tahap pengesahan telah disetujui! Inspeksi selesai.'
        : `✅ ${stage.title} telah menyetujui inspeksi ${inspeksiId}`);

    refreshAll();
    openApprovalModal(inspeksiId);
};

window.rejectStage = function(inspeksiId, stageId) {
    const stage = findStage(stageId);
    if (!stage) { showToast(pesanGagal('STAGE_NOT_FOUND')); return; }
    if (!confirm(`Tolak inspeksi ${inspeksiId} oleh ${stage.title}?`)) return;

    const result = approvalService.reject(inspeksiId, stageId);
    if (!result.ok) { showToast(pesanGagal(result.reason)); return; }

    showToast(`❌ ${result.data.stage.title} menolak inspeksi ${inspeksiId}`);
    refreshAll();
    openApprovalModal(inspeksiId);
};

// ========================================================================
// ========== APPROVAL MODAL ==========
// ========================================================================

function openApprovalModal(inspeksiId) {
    const item = inspectionRepository.findById(inspeksiId);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }

    const modal = document.getElementById('approvalModal');
    const content = document.getElementById('approvalContent');

    content.innerHTML = `
        <div class="detail-container">
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="label">ID Inspeksi</span>
                    <span class="value" style="color:#b31b1b;font-weight:700;">${escapeHtml(item.id)}</span>
                </div>
                <div class="detail-item">
                    <span class="label">Lokasi / Plant</span>
                    <span class="value">${escapeHtml(item.lokasi)}</span>
                </div>
                <div class="detail-item">
                    <span class="label">Safety Officer</span>
                    <span class="value">${escapeHtml(item.petugas)}</span>
                </div>
                <div class="detail-item">
                    <span class="label">Status</span>
                    <span class="value"><span class="status-badge ${escapeHtml(item.status)}">${escapeHtml(item.status.charAt(0).toUpperCase() + item.status.slice(1))}</span></span>
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
                        ${item.temuan.map(t => `<li><span>${escapeHtml(t.deskripsi)}</span><span class="temuan-kategori">${escapeHtml(t.kategori)}</span></li>`).join('')}
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
    const item = inspectionRepository.findById(id);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }

    const allApproved = isFullyApproved(item);
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
            `<tr><td>${idx + 1}</td><td>${escapeHtml(t.deskripsi)}</td><td><span style="background:#f0e8e8;padding:0.1rem 0.5rem;border-radius:4px;font-size:0.7rem;">${escapeHtml(t.kategori)}</span></td></tr>`
        ).join('') :
        '<tr><td colspan="3" style="text-align:center;color:#888;">Tidak ada temuan</td></tr>';

    const perbaikanRows = item.perbaikan && item.perbaikan.length > 0 ?
        item.perbaikan.map(p => {
            const statusMap = {
                'closed': '✅ Selesai',
                'on-progress': '🔄 Progres',
                'open': '⏳ Pending'
            };
            return `<tr><td>${escapeHtml(p.tgl)}</td><td>${escapeHtml(p.action)}</td><td>${escapeHtml(p.pic)}</td><td><span style="background:${p.status === 'closed' ? '#e8f5e9' : p.status === 'on-progress' ? '#fff3e0' : '#fce4ec'};padding:0.1rem 0.5rem;border-radius:4px;font-size:0.7rem;">${escapeHtml(statusMap[p.status] || p.status)}</span></td></tr>`;
        }).join('') :
        '<tr><td colspan="4" style="text-align:center;color:#888;">Belum ada tindakan perbaikan</td></tr>';

    const approvalSignatures = APPROVAL_STAGES.map(s => {
        const approval = item.approvals && item.approvals[s.id];
        if (approval && approval.approved) {
            return `
                <div class="sign-item">
                    <div style="font-size:0.7rem;color:#888;">${escapeHtml(s.title)}</div>
                    <div class="sign-name">${escapeHtml(approval.by)}</div>
                    <div style="font-size:0.7rem;color:#666;">${escapeHtml(approval.jabatan)}</div>
                    <div class="sign-line"></div>
                    <div style="font-size:0.6rem;color:#888;">${escapeHtml(approval.tanggal)}</div>
                </div>
            `;
        }
        return `
            <div class="sign-item">
                <div style="font-size:0.7rem;color:#888;">${escapeHtml(s.title)}</div>
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
                        <div class="value" style="color:#b31b1b;font-weight:700;">${escapeHtml(item.id)}</div>
                    </div>
                    <div class="item">
                        <div class="label">Status</div>
                        <div class="value"><span style="background:${item.status === 'selesai' ? '#e8f5e9' : item.status === 'proses' ? '#fff3e0' : '#fce4ec'};padding:0.1rem 0.6rem;border-radius:60px;font-size:0.75rem;">${escapeHtml(item.status.charAt(0).toUpperCase() + item.status.slice(1))}</span></div>
                    </div>
                    <div class="item">
                        <div class="label">Lokasi / Plant</div>
                        <div class="value">${escapeHtml(item.lokasi)}</div>
                    </div>
                    <div class="item">
                        <div class="label">Keterangan Lokasi</div>
                        <div class="value">${escapeHtml(item.keteranganLokasi || '-')}</div>
                    </div>
                    <div class="item">
                        <div class="label">Tanggal Inspeksi</div>
                        <div class="value">${escapeHtml(item.tanggal)}</div>
                    </div>
                    <div class="item">
                        <div class="label">Safety Officer</div>
                        <div class="value">${escapeHtml(item.petugas)}</div>
                    </div>
                    <div class="item">
                        <div class="label">Due Date ke Plant</div>
                        <div class="value">${escapeHtml(item.dueDate || '-')}</div>
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

    showToast('📄 Sedang membuat PDF...');

    pdfExporter.savePdf(pdfContainer, pdfExporter.reportFilename(item.id)).then(() => {
        showToast(`✅ PDF Laporan ${item.id} berhasil dicetak!`);
    }).catch((err) => {
        showToast(reportError('cetak PDF ' + item.id, err, '⚠️ Gagal membuat PDF. Coba ulangi beberapa saat lagi.'));
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
    scheduleRepository.getAll().forEach(j => {
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
                 ${hasEvent ? `onclick="showDayEvents(${jsArg(dateKey)})"` : ''}>
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
    scheduleRepository.getAll().forEach(j => {
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
                <div class="event-title"><strong>${escapeHtml(e.plant)}</strong></div>
                <div class="event-meta">
                    <span class="event-status ${e.status.includes('Realisasi') || e.status.includes('dilaksanakan') ? 'completed' : 'scheduled'}">${escapeHtml(e.status)}</span>
                    ${e.periode ? `<span class="event-meta-item">📅 Periode ${escapeHtml(e.periode)}</span>` : ''}
                    ${e.minggu ? `<span class="event-meta-item">📌 Minggu ke-${escapeHtml(e.minggu)}</span>` : ''}
                    ${e.officer ? `<span class="event-meta-item">👤 ${escapeHtml(e.officer)}</span>` : ''}
                </div>
            </div>
        </div>
    `).join('');

    content.innerHTML = `
        <div style="margin-bottom:1rem;font-size:0.9rem;color:#7a4a4a;">
            <i class="fas fa-calendar-day" style="color:#d42a2a;"></i> 
            <strong>${escapeHtml(formatDate(dateKey))}</strong>
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
        const filtered = filterByFields(data, query, searchFields);
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
        const statusPerbaikan = getRepairStatus(item);
        const statusLabel = statusPerbaikan === 'selesai_perbaikan' ? '✅ Selesai' :
            statusPerbaikan === 'perbaikan' ? '🔄 Perbaikan' : '⏳ Tinjau';
        const overdue = isOverdue(item.dueDate);
        const jmlTemuan = item.temuan ? item.temuan.length : 0;
        const temuanPreview = item.temuan && item.temuan.length > 0 ? item.temuan[0].deskripsi : '-';
        const moreTemuan = jmlTemuan > 1 ? ` +${jmlTemuan - 1} lagi` : '';

        const lokasiDisplay = highlight(item.lokasi, highlightQuery);
        const temuanDisplay = highlight(temuanPreview, highlightQuery);

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
            `<button class="btn-export-temuan" onclick="exportTemuanPerItem(${jsArg(item.id)})" title="Export temuan ke Excel"><i class="fas fa-file-excel"></i></button>` :
            '';

        const allApproved = isFullyApproved(item);
        const pdfBtn = allApproved ?
            `<button class="btn-pdf" onclick="cetakPDF(${jsArg(item.id)})" title="Cetak PDF Laporan"><i class="fas fa-file-pdf"></i></button>` :
            `<button class="btn-pdf" disabled title="Harus disetujui semua tahap terlebih dahulu"><i class="fas fa-file-pdf"></i></button>`;

        let approvalStatus = 'Belum';
        let approvalColor = 'menunggu';
        if (allApproved) {
            approvalStatus = '✅ Lengkap';
            approvalColor = 'selesai';
        } else {
            const approvedCount = countApproved(item);
            if (approvedCount > 0) {
                approvalStatus = `${approvedCount}/${totalStages()}`;
                approvalColor = 'proses';
            }
        }

        if (isFull) {
            return `
                    <tr>
                        <td><strong>${escapeHtml(item.id)}</strong></td>
                        <td>${lokasiDisplay}</td>
                        <td>${escapeHtml(item.keteranganLokasi || '-')}</td>
                        <td>${escapeHtml(item.tanggal)}</td>
                        <td>${escapeHtml(item.petugas)}</td>
                        <td>${jmlTemuan}</td>
                        <td><span class="status-badge ${escapeHtml(item.status)}">${escapeHtml(item.status.charAt(0).toUpperCase() + item.status.slice(1))}</span></td>
                        <td>
                            <span class="status-badge ${approvalColor}">${approvalStatus}</span>
                            <button class="btn-sm info" onclick="openApprovalModal(${jsArg(item.id)})" style="margin-top:0.2rem;"><i class="fas fa-stamp"></i></button>
                        </td>
                        <td>${exportBtn} ${pdfBtn}</td>
                    </tr>
                `;
        } else {
            return `
                    <tr>
                        <td><strong>${escapeHtml(item.id)}</strong></td>
                        <td>${lokasiDisplay}</td>
                        <td>${temuanDisplay}${moreTemuan}</td>
                        <td>${escapeHtml(item.dueDate || '-')} ${overdueBadge}</td>
                        <td><span class="status-badge ${escapeHtml(item.status)}">${escapeHtml(item.status.charAt(0).toUpperCase() + item.status.slice(1))}</span></td>
                        <td>${progressBar}</td>
                        <td>
                            <button class="btn-sm info" onclick="openDetailModal(${jsArg(item.id)})"><i class="fas fa-eye"></i></button>
                            <button class="btn-sm primary" onclick="openPerbaikanModal(${jsArg(item.id)})"><i class="fas fa-tools"></i></button>
                            <button class="btn-sm warning" onclick="openApprovalModal(${jsArg(item.id)})"><i class="fas fa-stamp"></i></button>
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
    const displayData = data !== null ? data : scheduleRepository.getAll();
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
        const plant = plantRepository.findById(item.plantId);
        
        const plantDisplay = highlight(item.plantName, highlightQuery);
        const officerDisplay = highlight(item.officer, highlightQuery);
        const periodeDisplay = highlight(periode ? periode.name : 'Periode ' + item.periode, highlightQuery);
        const tanggalJadwalDisplay = item.tanggalJadwal ? formatDate(item.tanggalJadwal) : '-';
        const tanggalRealisasiDisplay = item.tanggalRealisasi ? formatDate(item.tanggalRealisasi) : '-';
        const mingguDisplay = item.minggu ? `Minggu ${item.minggu}` : '-';

        const isOverdueSchedule = scheduleRules.isOverdue(item);

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
                    <td>${plantDisplay} ${plant ? '<span style="font-size:0.6rem;color:#8a6a6a;">(' + escapeHtml(plant.code) + ')</span>' : ''}</td>
                    <td>${periodeDisplay}</td>
                    <td>${escapeHtml(mingguDisplay)}</td>
                    <td>${escapeHtml(tanggalJadwalDisplay)} ${isOverdueSchedule ? '<span class="overdue-badge"><i class="fas fa-exclamation-circle"></i> OVERDUE</span>' : ''}</td>
                    <td>${escapeHtml(tanggalRealisasiDisplay)}</td>
                    <td>${officerDisplay}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>
                        <button class="btn-sm warning" onclick="editJadwal(${jsArg(item.id)})"><i class="fas fa-edit"></i></button>
                        <button class="btn-sm danger" onclick="hapusJadwal(${jsArg(item.id)})"><i class="fas fa-trash"></i></button>
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
    const sourceData = data !== null ? data : inspectionRepository.getAll();
    const displayData = sourceData.filter(item => item.perbaikan && item.perbaikan.length > 0);

    if (displayData.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="9" style="text-align:center;padding:2rem;color:#8a6a6a;">Tidak ada data ditemukan</td></tr>';
        return;
    }

    tbody.innerHTML = displayData.map(item => {
        const progress = getProgress(item);
        const statusPerbaikan = getRepairStatus(item);
        const lastAction = item.perbaikan[item.perbaikan.length - 1];
        const temuanText = item.temuan && item.temuan.length > 0 ? item.temuan[0].deskripsi : '-';
        const overdue = isOverdue(item.dueDate);

        const lokasiDisplay = highlight(item.lokasi, highlightQuery);
        const temuanDisplay = highlight(temuanText, highlightQuery);
        const actionDisplay = highlight(lastAction ? lastAction.action : '-', highlightQuery);
        const picDisplay = highlight(lastAction ? lastAction.pic : '-', highlightQuery);

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
                    <td><strong>${escapeHtml(item.id)}</strong></td>
                    <td>${lokasiDisplay}</td>
                    <td>${temuanDisplay}</td>
                    <td>${escapeHtml(item.dueDate || '-')} ${overdueBadge}</td>
                    <td>${actionDisplay}</td>
                    <td>${picDisplay}</td>
                    <td>${progressBar}</td>
                    <td><span class="status-badge ${statusPerbaikan}">${statusMap[statusPerbaikan] || statusPerbaikan}</span></td>
                    <td>
                        <button class="btn-sm primary" onclick="openPerbaikanModal(${jsArg(item.id)})"><i class="fas fa-edit"></i></button>
                        <button class="btn-sm info" onclick="openDetailModal(${jsArg(item.id)})"><i class="fas fa-eye"></i></button>
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
    plantRepository.getAll().forEach(p => {
        plantCounts[p.name] = 0;
    });

    inspectionRepository.getAll().forEach(item => {
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
    const item = inspectionRepository.findById(id);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }
    if (!item.temuan || item.temuan.length === 0) { showToast('⚠️ Tidak ada temuan'); return; }

    const { count } = excelExporter.exportFindingsOf(item);
    showToast(`📊 ${count} temuan dari ${item.id} diekspor`);
};


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
// ========== DETAIL MODAL ==========
// ========================================================================

window.openDetailModal = function(id) {
    const item = inspectionRepository.findById(id);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }
    const modal = document.getElementById('detailModal');
    const content = document.getElementById('detailContent');

    const statusMap = { 'selesai': 'Selesai', 'proses': 'Proses', 'tinjau': 'Tinjau' };

    const temuanHtml = item.temuan && item.temuan.length > 0 ?
        item.temuan.map(t =>
            `<li><span>${escapeHtml(t.deskripsi)}</span><span class="temuan-kategori">${escapeHtml(t.kategori)}</span></li>`
        ).join('') :
        '<li style="color:#8a6a6a;">Tidak ada temuan</li>';

    const allPhotos = [...(item.fotoDekat || []), ...(item.fotoJauh || [])];
    const galleryHtml = allPhotos.length > 0 && allPhotos[0] !== '-' ?
        allPhotos.map((img, idx) =>
                `<div class="gallery-item" onclick="openLightbox(${jsArg(allPhotos)}, ${idx})" title="Klik untuk preview">
                    <span class="preview-icon">📷</span>
                    <span class="file-name">${escapeHtml(img)}</span>
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
                        <span class="value" style="color:#b31b1b;font-weight:700;">${escapeHtml(item.id)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label"><i class="fas fa-map-marker-alt"></i> Status</span>
                        <span class="value"><span class="status-badge ${escapeHtml(item.status)}">${escapeHtml(statusMap[item.status] || item.status)}</span></span>
                    </div>
                    <div class="detail-item">
                        <span class="label"><i class="fas fa-building"></i> Lokasi / Plant</span>
                        <span class="value">${escapeHtml(item.lokasi)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label"><i class="fas fa-tag"></i> Keterangan Lokasi</span>
                        <span class="value">${escapeHtml(item.keteranganLokasi || '-')}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label"><i class="fas fa-calendar-day"></i> Tanggal Inspeksi</span>
                        <span class="value">${escapeHtml(item.tanggal)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label"><i class="fas fa-user"></i> Safety Officer</span>
                        <span class="value">${escapeHtml(item.petugas)}</span>
                    </div>
                    <div class="detail-item" style="grid-column:1/3;">
                        <span class="label"><i class="fas fa-clock"></i> Due Date ke Plant</span>
                        <span class="value">${escapeHtml(item.dueDate || '-')} ${overdueBadge}</span>
                    </div>
                </div>

                <div class="detail-section">
                    <div class="section-title"><i class="fas fa-list"></i> Temuan (${item.temuan ? item.temuan.length : 0})</div>
                    <ul class="temuan-list-detail">${temuanHtml}</ul>
                    ${item.temuan && item.temuan.length > 0 ? `
                        <div style="margin-top:0.5rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
                            <button class="btn-export-temuan" onclick="exportTemuanPerItem(${jsArg(item.id)})">
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
                        <button class="btn-sm primary" onclick="openApprovalModal(${jsArg(item.id)})"><i class="fas fa-stamp"></i> Kelola Pengesahan</button>
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
        const plant = plantRepository.findById(data.plantId);
        if (plant) {
            document.getElementById('plantSearchInputJadwal').value = plant.name;
            document.getElementById('selectedPlantJadwal').value = plant.id;
            document.getElementById('selectedPlantDisplayJadwal').innerHTML = 
                `<span class="selected-value"><i class="fas fa-check-circle"></i> ${escapeHtml(plant.name)} (${escapeHtml(plant.code)})</span>`;
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
    const item = scheduleRepository.findById(id);
    if (item) openJadwalModal(item);
};

window.hapusJadwal = function(id) {
    if (!confirm(`Hapus jadwal ${id}?`)) return;

    scheduleService.remove(id);
    refreshAll();
    showToast(`🗑️ Jadwal ${id} dihapus`);
};

document.getElementById('closeJadwalModal').addEventListener('click', function() {
    document.getElementById('jadwalModal').classList.remove('show');
});
document.getElementById('jadwalModal').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('show');
});

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
    const item = inspectionRepository.findById(id);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }
    const modal = document.getElementById('perbaikanModal');
    const content = document.getElementById('modalContent');

    const progress = getProgress(item);
    const statusPerbaikan = getRepairStatus(item);

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
                    <div class="thumb-mini" onclick="openLightbox(${jsArg(fotoList)}, ${fotoList.indexOf(f)})" title="${escapeHtml(f)}">
                        📷
                    </div>
                `).join('') :
                '<span style="font-size:0.6rem;color:#c62828;">⚠️ Belum ada foto</span>';
            return `
                    <div class="perbaikan-item">
                        <span class="date">${escapeHtml(p.tgl)}</span>
                        <span class="action">${escapeHtml(p.action)}</span>
                        <span class="status-mini ${escapeHtml(p.status)}">${escapeHtml(statusMap[p.status] || p.status)}</span>
                        <span class="pic-name">- ${escapeHtml(p.pic)}</span>
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

    const allApproved = isFullyApproved(item);

    content.innerHTML = `
            <div class="perbaikan-info-box">
                <div class="info-row">
                    <span class="label">ID Inspeksi</span>
                    <span class="value"><strong>${escapeHtml(item.id)}</strong></span>
                </div>
                <div class="info-row">
                    <span class="label">Lokasi / Plant</span>
                    <span class="value">${escapeHtml(item.lokasi)}</span>
                </div>
                <div class="info-row">
                    <span class="label">Due Date Plant</span>
                    <span class="value">${escapeHtml(item.dueDate || '-')} ${isOverdue(item.dueDate) ? '<span class="overdue-badge"><i class="fas fa-exclamation-circle"></i> OVERDUE</span>' : ''}</span>
                </div>
                <div class="info-row">
                    <span class="label">Status</span>
                    <span class="value"><span class="status-badge ${escapeHtml(item.status)}">${escapeHtml(item.status.charAt(0).toUpperCase() + item.status.slice(1))}</span></span>
                </div>
                <div class="info-row" style="margin-top:0.3rem;padding-top:0.5rem;border-top:2px solid #f0e0e0;">
                    <span class="label">Pengesahan</span>
                    <span class="value">
                        <span class="status-badge ${allApproved ? 'selesai' : 'proses'}">
                            ${allApproved ? '✅ Lengkap (4/4)' : formatApprovalStatus(item)}
                        </span>
                        ${!allApproved ? `<button class="btn-sm info" onclick="openApprovalModal(${jsArg(item.id)})" style="margin-left:0.3rem;font-size:0.55rem;"><i class="fas fa-stamp"></i></button>` : ''}
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
                        <input type="text" id="newPIC" placeholder="Nama PIC" value="${escapeHtml(getRandomOfficer())}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Foto Perbaikan <span style="color:#c62828;">*</span></label>
                    <div class="file-input-wrapper">
                        <input type="file" id="newFoto" accept="image/*" multiple>
                        <span class="file-count" id="newFotoCount">Belum ada file</span>
                    </div>
                </div>
                <button class="btn-sm primary" onclick="tambahPerbaikanCustom(${jsArg(item.id)})" style="margin-top:0.5rem;padding:0.5rem 1.5rem;">
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
                    <span><span class="status-badge" style="font-size:0.6rem;">${escapeHtml(item.kategori)}</span> ${escapeHtml(item.deskripsi)}</span>
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
            tandaiPlantBelumDipilih();
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

// Dipakai dua tempat: saat chart dibuat dan saat di-refresh. Dulu ekspresinya
// ditulis dua kali dan sempat berbeda formatnya.
function countRepairStatuses() {
    const inspections = inspectionRepository.getAll();
    return {
        selesai: inspections.filter(allActionsClosed).length,
        perbaikan: inspections.filter(hasActionInProgress).length,
        tinjau: inspections.filter(hasActionOpen).length,
    };
}

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
    renderDashboardJadwal();
    updateStats();
    renderTemuanPlantChart();

    if (perbaikanChart) {
        const counts = countRepairStatuses();
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
    const counts = countRepairStatuses();
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
        renderDashboardJadwal();
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
