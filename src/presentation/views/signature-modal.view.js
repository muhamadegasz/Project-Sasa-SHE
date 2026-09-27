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
 */

import { SIGNATURE_MAX_BYTES, SIGNATURE_MIME_TYPES } from '../../domain/signature-rules.js';
import { SIGNATURE_METHOD } from '../../domain/statuses.js';
import { bindModalClose, closeModal, openModal } from '../components/modal.js';
import { createSignaturePad, detectImageType } from '../components/signature-pad.js';

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
    removeFile: document.getElementById('signatureRemoveFile'),
    error: document.getElementById('signatureError'),
    confirm: document.getElementById('confirmApproveBtn'),
};

const state = {
    pending: null, // { inspectionId, stageId }
    method: null,
    signature: null, // { method, file, mimeType, size } — siap dikirim
    previewUrl: null,
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
        return true;
    } catch {
        return false;
    }
}

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
    el.info.textContent = `${stage.title} menyetujui inspeksi ${inspectionId}. Pilih cara tanda tangan, periksa pratinjaunya, lalu tekan Setujui.`;
    openModal(MODAL_ID);
}

/** Persetujuan yang siap dikirim, atau null bila tanda tangan belum sah. */
export function getPendingApproval() {
    if (!state.pending || !state.signature) return null;
    return { ...state.pending, signature: state.signature };
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
