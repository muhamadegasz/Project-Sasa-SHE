/* signature-modal.view.js — modal tanda tangan persetujuan (Phase 17.4B).
 *
 * Dibuka dari tombol "Setujui" (legacy-app.js approveStage) hanya untuk
 * peninjau yang boleh memutuskan tahap itu. View ini mengurus pilihan cara
 * tanda tangan, validasi cepat di browser, pratinjau, dan keadaan tombol;
 * pengiriman (approval-service) tetap di controller legacy-app.js
 * confirmApprove. Server memeriksa ulang semuanya.
 *
 * Dua cara, istilah sama dengan backend: 'upload' (PNG/JPG) dan 'canvas'
 * (PNG). Tanda tangan yang siap dikirim SELALU berkas yang sama persis
 * dengan pratinjaunya. Berganti cara membuang data cara sebelumnya.
 * Tidak ada innerHTML di sini — seluruh teks lewat textContent.
 *
 * Phase 17.4D: watermark opsional ("Tambahkan watermark") di atas pratinjau,
 * digeser dengan mouse/sentuh (Pointer Events). Yang dikirim hanya posisi
 * tengahnya, ternormalisasi 0..1 terhadap gambar tanda tangan (lihat
 * domain/signature-rules.js checkWatermark); berkas tanda tangan tidak diubah.
 * Gambarnya logo perusahaan (aset lokal, components/watermark.js).
 */

import { SIGNATURE_MAX_BYTES, SIGNATURE_MIME_TYPES, WATERMARK_DEFAULT_POSITION } from '../../domain/signature-rules.js';
import { SIGNATURE_METHOD } from '../../domain/statuses.js';
import { bindModalClose, closeModal, openModal } from '../components/modal.js';
import { createSignaturePad, detectImageType } from '../components/signature-pad.js';
import { WATERMARK_LOGO_URL } from '../components/watermark.js';

const MODAL_ID = 'signatureModal';

const el = {
    info: document.getElementById('signatureModalInfo'),
    methods: document.querySelectorAll('input[name="signatureMethod"]'),
    uploadPanel: document.getElementById('signatureUploadPanel'),
    fileInput: document.getElementById('signatureFile'),
    canvasPanel: document.getElementById('signatureCanvasPanel'),
    canvas: document.getElementById('signatureCanvas'),
    previewBox: document.getElementById('signaturePreviewBox'),
    preview: document.getElementById('signaturePreview'),
    stage: document.getElementById('signatureStage'),
    watermark: document.getElementById('signatureWatermark'),
    watermarkToggle: document.getElementById('signatureWatermarkToggle'),
    watermarkHint: document.getElementById('signatureWatermarkHint'),
    removeFile: document.getElementById('signatureRemoveFile'),
    error: document.getElementById('signatureError'),
    confirm: document.getElementById('confirmApproveBtn'),
};

// Logo watermark dari satu sumber (components/watermark.js). Pembatasan posisi
// mengukur ukuran logo di layar, jadi baru dilakukan setelah logo siap
// (keepWatermarkInside menunggu janji ini).
el.watermark.src = WATERMARK_LOGO_URL;
const watermarkLogoReady = el.watermark.decode().catch(() => {});

const state = {
    pending: null, // { inspectionId, stageId }
    method: null,
    signature: null, // { method, file, mimeType, size } — siap dikirim
    previewUrl: null,
    watermark: { enabled: false, ...WATERMARK_DEFAULT_POSITION },
    submitting: false,
    messageFor: (reason) => reason,
    // Menandai hasil pemeriksaan async (baca berkas, ekspor kanvas) yang sudah
    // basi karena pengguna keburu mengganti berkas/cara/coretan.
    version: 0,
};

const pad = createSignaturePad(el.canvas, { onChange: handleCanvasChange });

function updateConfirm() {
    el.confirm.disabled = !state.signature || state.submitting;
    el.confirm.textContent = state.submitting ? 'Mengirim…' : 'Setujui';
}

function setSignature(signature) {
    state.signature = signature;
    updateConfirm();
}

function showError(message) {
    el.error.textContent = message || '';
}

function clearPreview() {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
    el.preview.removeAttribute('src');
    el.previewBox.hidden = true;
}

/** Menampilkan `file` sebagai pratinjau; false bila browser tidak bisa menampilkannya sebagai gambar. */
async function showPreview(file) {
    clearPreview();
    state.previewUrl = URL.createObjectURL(file);
    el.preview.src = state.previewUrl;
    el.previewBox.hidden = false;
    try {
        await el.preview.decode();
        // Ukuran gambar bisa berubah: watermark tetap utuh di dalamnya.
        if (state.watermark.enabled) keepWatermarkInside();
        return true;
    } catch {
        return false;
    }
}

/** 4 desimal — sama dengan kolom watermark_x/y DECIMAL(5,4). */
const roundPosition = (value) => Math.round(value * 10000) / 10000;

function placeWatermark() {
    el.watermark.style.left = `${state.watermark.x * 100}%`;
    el.watermark.style.top = `${state.watermark.y * 100}%`;
}

/**
 * Posisi tengah watermark (0..1) untuk titik layar (clientX, clientY), dibatasi
 * supaya watermark tetap utuh di dalam gambar tanda tangan (area = gambar,
 * bingkainya di .signature-stage). Watermark yang lebih besar dari gambar
 * (gambar sangat pipih) ditaruh di tengah sumbu itu.
 */
function positionAt(clientX, clientY) {
    const area = el.stage.getBoundingClientRect();
    const mark = el.watermark.getBoundingClientRect();
    const axis = (point, start, size, markSize) => {
        const half = Math.min(markSize, size) / 2;
        const centre = Math.min(Math.max(point - start, half), size - half);
        return roundPosition(centre / size);
    };
    return {
        x: axis(clientX, area.left + el.stage.clientLeft, el.stage.clientWidth, mark.width),
        y: axis(clientY, area.top + el.stage.clientTop, el.stage.clientHeight, mark.height),
    };
}

function moveWatermarkTo(clientX, clientY) {
    Object.assign(state.watermark, positionAt(clientX, clientY));
    placeWatermark();
}

/** Memastikan logo utuh di dalam gambar — diukur setelah logo selesai dimuat. */
async function keepWatermarkInside() {
    await watermarkLogoReady;
    if (!state.watermark.enabled || el.previewBox.hidden) return;
    const area = el.stage.getBoundingClientRect();
    moveWatermarkTo(
        area.left + el.stage.clientLeft + state.watermark.x * el.stage.clientWidth,
        area.top + el.stage.clientTop + state.watermark.y * el.stage.clientHeight,
    );
}

function setWatermarkEnabled(enabled) {
    state.watermark.enabled = enabled;
    el.watermarkToggle.checked = enabled;
    el.watermark.toggleAttribute('hidden', !enabled);
    el.watermarkHint.hidden = !enabled;
    el.stage.classList.toggle('watermark-on', enabled);
    if (enabled && !el.previewBox.hidden) keepWatermarkInside();
}

function resetWatermark() {
    Object.assign(state.watermark, WATERMARK_DEFAULT_POSITION);
    placeWatermark();
    setWatermarkEnabled(false);
}

// Menggeser: menggenggam watermark mempertahankan titik genggamnya; mengetuk
// di luar watermark memindahkan tengahnya ke titik itu.
let drag = null; // { pointerId, dx, dy }

el.stage.addEventListener('pointerdown', (event) => {
    if (!state.watermark.enabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    el.stage.setPointerCapture(event.pointerId);
    const mark = el.watermark.getBoundingClientRect();
    const onMark = event.clientX >= mark.left && event.clientX <= mark.right
        && event.clientY >= mark.top && event.clientY <= mark.bottom;
    drag = {
        pointerId: event.pointerId,
        dx: onMark ? event.clientX - (mark.left + mark.width / 2) : 0,
        dy: onMark ? event.clientY - (mark.top + mark.height / 2) : 0,
    };
    el.stage.classList.add('watermark-dragging');
    moveWatermarkTo(event.clientX - drag.dx, event.clientY - drag.dy);
});

el.stage.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    moveWatermarkTo(event.clientX - drag.dx, event.clientY - drag.dy);
});

function endDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    el.stage.classList.remove('watermark-dragging');
}
el.stage.addEventListener('pointerup', endDrag);
el.stage.addEventListener('pointercancel', endDrag);

function resetSignatureData() {
    state.version++;
    setSignature(null);
    clearPreview();
    showError('');
    el.fileInput.value = '';
    el.removeFile.hidden = true;
}

function selectMethod(method) {
    state.method = method;
    resetSignatureData();
    el.uploadPanel.hidden = method !== SIGNATURE_METHOD.UPLOAD;
    el.canvasPanel.hidden = method !== SIGNATURE_METHOD.CANVAS;
    // Ukuran piksel kanvas baru bisa dihitung setelah panelnya tampil.
    if (method === SIGNATURE_METHOD.CANVAS) pad.resize();
}

function rejectFile(reason) {
    state.version++;
    setSignature(null);
    clearPreview();
    el.fileInput.value = '';
    el.removeFile.hidden = true;
    showError(state.messageFor(reason));
}

async function handleFileChange() {
    const version = ++state.version;
    setSignature(null);
    clearPreview();
    showError('');
    const file = el.fileInput.files[0];
    el.removeFile.hidden = !file;
    if (!file) return;

    if (file.size > SIGNATURE_MAX_BYTES) return rejectFile('SIGNATURE_TOO_LARGE');
    // Format dari isi berkas, bukan nama/tipe yang dilaporkan browser.
    const mimeType = detectImageType(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
    if (version !== state.version) return;
    if (!SIGNATURE_MIME_TYPES[SIGNATURE_METHOD.UPLOAD].includes(mimeType)) return rejectFile('SIGNATURE_CONTENT_INVALID');

    const displayable = await showPreview(file);
    if (version !== state.version) return;
    if (!displayable) return rejectFile('SIGNATURE_CONTENT_INVALID');
    setSignature({ method: SIGNATURE_METHOD.UPLOAD, file, mimeType, size: file.size });
}

async function handleCanvasChange() {
    const version = ++state.version;
    setSignature(null);
    if (state.method !== SIGNATURE_METHOD.CANVAS || pad.isEmpty()) {
        clearPreview();
        return;
    }
    showError('');
    const file = await pad.toFile();
    if (version !== state.version) return;
    if (file.size > SIGNATURE_MAX_BYTES) {
        clearPreview();
        showError(state.messageFor('SIGNATURE_TOO_LARGE'));
        return;
    }
    await showPreview(file);
    if (version !== state.version) return;
    setSignature({ method: SIGNATURE_METHOD.CANVAS, file, mimeType: 'image/png', size: file.size });
}

for (const input of el.methods) {
    input.addEventListener('change', () => { if (input.checked) selectMethod(input.value); });
}
el.fileInput.addEventListener('change', handleFileChange);
el.removeFile.addEventListener('click', () => resetSignatureData());
el.watermarkToggle.addEventListener('change', () => setWatermarkEnabled(el.watermarkToggle.checked));
document.getElementById('signatureClearCanvas').addEventListener('click', () => pad.clear());
bindModalClose(MODAL_ID, 'closeSignatureModal');

/**
 * Membuka modal untuk menyetujui `stage` pada inspeksi `inspectionId`, dalam
 * keadaan kosong (belum ada cara/tanda tangan terpilih). `messageFor(reason)`
 * menerjemahkan kode alasan menjadi pesan pengguna.
 */
export function openSignatureModal({ inspectionId, stage, messageFor }) {
    state.pending = { inspectionId, stageId: stage.id };
    state.messageFor = messageFor;
    state.submitting = false;
    state.method = null;
    for (const input of el.methods) input.checked = false;
    el.uploadPanel.hidden = true;
    el.canvasPanel.hidden = true;
    resetSignatureData();
    resetWatermark();
    el.info.textContent = `${stage.title} menyetujui inspeksi ${inspectionId}. Pilih cara tanda tangan, periksa pratinjaunya, lalu tekan Setujui.`;
    openModal(MODAL_ID);
}

/**
 * Persetujuan yang siap dikirim, atau null bila tanda tangan belum sah.
 * Watermark tidak aktif -> tanpa posisi.
 */
export function getPendingApproval() {
    if (!state.pending || !state.signature) return null;
    const { enabled, x, y } = state.watermark;
    return { ...state.pending, signature: state.signature, watermark: enabled ? { enabled, x, y } : { enabled: false } };
}

/** Mengunci tombol selama pengiriman (mencegah persetujuan ganda). */
export function setSignatureSubmitting(submitting) {
    state.submitting = submitting;
    updateConfirm();
}

export function showSignatureError(message) {
    showError(message);
}

export function closeSignatureModal() {
    closeModal(MODAL_ID);
    state.pending = null;
    resetSignatureData();
}
