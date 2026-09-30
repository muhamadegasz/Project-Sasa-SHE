/* users.view.js — panel Admin: tabel akun, modal tambah/ubah, dan dialog
 * hapus permanen (Phase 18).
 *
 * View saja: merender dan membaca formulir. Pemanggilan service (buat, ubah,
 * aktif/nonaktif, hapus permanen) ada di controller legacy-app.js. Tombol
 * mengikuti pengaman yang sama dengan server (akun sendiri tidak bisa
 * dinonaktifkan/dihapus; hapus permanen hanya untuk akun nonaktif) — ini
 * kenyamanan, server tetap memeriksa ulang semuanya.
 *
 * Tabel: pencarian (setupSearch) berjalan atas SELURUH akun, lalu hasilnya
 * dibagi per halaman dengan pager & navigasi halaman yang sama dengan
 * Penjadwalan/Perbaikan.
 *
 * Seluruh teks dari data lewat escapeHtml/highlight (tabel) atau
 * textContent/value (formulir) — tidak ada innerHTML dengan isian pengguna
 * tanpa escape.
 */

import { escapeHtml, highlight } from '../../shared/html.js';
import { formatRole } from '../../shared/labels.js';
import { createClientPager } from '../../shared/pagination.js';
import { ROLE } from '../../config/constants.js';
import { matchesUsernameConfirmation } from '../../domain/user-rules.js';
import { bindModalClose, closeModal, openModal } from '../components/modal.js';
import { renderPaginationNav } from '../components/pagination-nav.js';
import { toastContent } from '../components/toast.js';

const MODAL_ID = 'userModal';
const DELETE_MODAL_ID = 'deleteUserModal';

const el = {
    tbody: document.getElementById('usersTableBody'),
    pagination: document.getElementById('usersPagination'),
    title: document.getElementById('userModalTitle'),
    id: document.getElementById('userFormId'),
    username: document.getElementById('userFormUsername'),
    displayName: document.getElementById('userFormDisplayName'),
    role: document.getElementById('userFormRole'),
    plantGroup: document.getElementById('userFormPlantGroup'),
    plant: document.getElementById('userFormPlant'),
    password: document.getElementById('userFormPassword'),
    passwordLabel: document.getElementById('userFormPasswordLabel'),
    deleteTarget: document.getElementById('deleteUserTarget'),
    deleteInput: document.getElementById('deleteUserConfirmInput'),
    deleteError: document.getElementById('deleteUserError'),
    deleteConfirm: document.getElementById('confirmDeleteUser'),
};

function plantName(plants, plantId) {
    if (plantId == null) return '';
    const plant = plants.find((item) => Number(item.id) === Number(plantId));
    return plant ? `${plant.name} (${plant.code})` : `#${plantId}`;
}

/** Kolom yang dicari kotak pencarian: teks yang tampil di tabel (mis. "Safety Officer", bukan 'safety_officer'). */
export const USER_SEARCH_FIELDS = ['username', 'displayName', 'roleLabel', 'plantLabel', 'statusLabel'];

/**
 * Akun + teks tampilannya — satu bentuk untuk pencarian dan tabel. Terbaru
 * dibuat di atas (id menurun), sebelum dicari dan dibagi per halaman: akun
 * yang baru dibuat ada di halaman 1. Urutan GET /api/users (id naik) tidak diubah.
 */
export function toUserRows(users, plants) {
    return [...users].sort((a, b) => Number(b.id) - Number(a.id)).map((user) => ({
        ...user,
        roleLabel: formatRole(user.role),
        plantLabel: plantName(plants, user.plantId),
        statusLabel: user.isActive ? 'Aktif' : 'Nonaktif',
    }));
}

function actionButtons(user, currentUser) {
    const id = escapeHtml(user.id);
    const name = escapeHtml(user.username);
    const edit = `<button class="btn-sm warning" data-action="editUser" data-id="${id}" data-testid="user-edit-btn" title="Ubah" aria-label="Ubah ${name}"><i class="fas fa-edit"></i></button>`;
    if (currentUser && Number(currentUser.id) === Number(user.id)) {
        return `${edit} <span class="user-self-note">(akun Anda)</span>`;
    }
    if (user.isActive) {
        return `${edit} <button class="btn-sm" data-action="setUserActive" data-id="${id}" data-active="false" data-username="${name}" data-testid="user-deactivate-btn" title="Nonaktifkan"><i class="fas fa-user-slash"></i> Nonaktifkan</button>`;
    }
    return `${edit}
        <button class="btn-sm success" data-action="setUserActive" data-id="${id}" data-active="true" data-username="${name}" data-testid="user-activate-btn" title="Aktifkan"><i class="fas fa-user-check"></i> Aktifkan</button>
        <button class="btn-sm danger" data-action="hapusUserPermanen" data-id="${id}" data-username="${name}" data-testid="user-delete-btn" title="Hapus permanen"><i class="fas fa-trash"></i> Hapus</button>`;
}

const pager = createClientPager();

/**
 * Merender satu halaman tabel akun dari hasil pencarian `rows` (toUserRows).
 * `query` kosong = tanpa pencarian; berganti kata kunci -> halaman 1.
 * `currentUser` untuk menandai akun sendiri.
 */
export function renderUsersTable(rows, query, currentUser) {
    if (!el.tbody) return;
    const { items, pagination } = pager.take(rows, query);
    renderPaginationNav(el.pagination, pagination, { action: 'usersPage', noun: 'pengguna', testId: 'users-pagination-summary' });

    if (items.length === 0) {
        const message = query ? 'Tidak ada pengguna yang cocok dengan pencarian' : 'Belum ada pengguna';
        el.tbody.innerHTML = `<tr><td colspan="6" data-testid="users-empty" style="text-align:center;padding:2rem;color:#8a6a6a;">${message}</td></tr>`;
        return;
    }
    el.tbody.innerHTML = items.map((user) => `
        <tr class="${user.isActive ? '' : 'user-row-inactive'}" data-testid="user-row" data-username="${escapeHtml(user.username)}">
            <td><strong>${highlight(user.username, query)}</strong></td>
            <td>${highlight(user.displayName, query)}</td>
            <td>${highlight(user.roleLabel, query)}</td>
            <td>${user.plantLabel ? highlight(user.plantLabel, query) : '-'}</td>
            <td><span class="status-badge ${user.isActive ? 'selesai' : 'terlambat'}">${user.statusLabel}</span></td>
            <td class="cell-actions">${actionButtons(user, currentUser)}</td>
        </tr>`).join('');
}

/** Pindah halaman tabel akun (data-action="usersPage") — hasil pencarian yang sama. */
export function goToUsersPage(page, currentUser) {
    const { data, query } = pager.goTo(page);
    renderUsersTable(data, query, currentUser);
}

/** Render berikutnya dimulai dari halaman 1 (setelah akun baru dibuat). */
export function resetUsersPage() {
    pager.goTo(1);
}

/** Pilihan plant hanya relevan untuk Koordinator K3L (satu plant). */
function syncPlantField() {
    el.plantGroup.hidden = el.role.value !== ROLE.KOORDINATOR_K3L;
}

function fillOptions(select, options) {
    select.replaceChildren(...options.map(({ value, label }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
    }));
}

el.role.addEventListener('change', syncPlantField);
bindModalClose(MODAL_ID, 'closeUserModal');

/**
 * Membuka modal: `user` null = akun baru (password wajib), selain itu ubah
 * akun (username tetap, password kosong = tidak diganti).
 */
export function openUserModal(user, plants) {
    fillOptions(el.role, Object.values(ROLE).map((role) => ({ value: role, label: formatRole(role) })));
    fillOptions(el.plant, [{ value: '', label: '— Pilih plant —' },
        ...plants.map((plant) => ({ value: String(plant.id), label: `${plant.name} (${plant.code})` }))]);

    const isNew = !user;
    el.title.textContent = isNew ? 'Tambah Pengguna' : `Ubah Pengguna: ${user.username}`;
    el.id.value = isNew ? '' : String(user.id);
    el.username.value = isNew ? '' : user.username;
    el.username.disabled = !isNew;
    el.displayName.value = isNew ? '' : user.displayName;
    el.role.value = isNew ? ROLE.SAFETY_OFFICER : user.role;
    el.plant.value = !isNew && user.plantId != null ? String(user.plantId) : '';
    el.password.value = '';
    el.passwordLabel.innerHTML = isNew
        ? 'Kata Sandi <span style="color:#c62828;">*</span>'
        : 'Kata Sandi baru <span class="user-form-hint">Kosongkan bila tidak diganti</span>';
    syncPlantField();
    openModal(MODAL_ID);
}

/** Isian formulir apa adanya — validasi di user-service (browser, lalu server). */
export function readUserForm() {
    return {
        id: el.id.value || null,
        input: {
            username: el.username.value,
            displayName: el.displayName.value,
            role: el.role.value,
            // Plant hanya dikirim untuk Koordinator; role lain dinormalisasi null oleh domain.
            plantId: el.role.value === ROLE.KOORDINATOR_K3L ? el.plant.value : null,
            password: el.password.value,
        },
    };
}

export function closeUserModal() {
    closeModal(MODAL_ID);
    el.password.value = '';
}

// ---- Dialog hapus permanen: username target diketik ulang ----

let deleteUsername = '';
let deleteBusy = false;

/** "Hapus Permanen" hanya aktif selama ketikan cocok persis (setelah trim) dan tidak sedang diproses. */
function syncDeleteConfirm() {
    el.deleteConfirm.disabled = deleteBusy || !matchesUsernameConfirmation(el.deleteInput.value, deleteUsername);
}

el.deleteInput.addEventListener('input', () => {
    el.deleteError.hidden = true;
    syncDeleteConfirm();
});
el.deleteInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!el.deleteConfirm.disabled) el.deleteConfirm.click();
});
bindModalClose(DELETE_MODAL_ID, 'closeDeleteUserModal');
document.getElementById('cancelDeleteUser').addEventListener('click', () => closeModal(DELETE_MODAL_ID));

export function openDeleteUserDialog(username) {
    deleteUsername = username;
    deleteBusy = false;
    el.deleteTarget.textContent = username;
    el.deleteInput.value = '';
    el.deleteError.textContent = '';
    el.deleteError.hidden = true;
    syncDeleteConfirm();
    openModal(DELETE_MODAL_ID);
    el.deleteInput.focus();
}

/** Ketikan konfirmasi apa adanya — dicocokkan controller dengan matchesUsernameConfirmation. */
export function readDeleteUserConfirmation() {
    return el.deleteInput.value;
}

/** Alasan gagal di dalam dialog (pesan berprefiks emoji dari PESAN_GAGAL ditampilkan tanpa emoji). */
export function showDeleteUserError(message) {
    const { title, description } = toastContent(message);
    el.deleteError.textContent = description ? `${title} ${description}` : title;
    el.deleteError.hidden = false;
}

export function setDeleteUserBusy(busy) {
    deleteBusy = busy;
    syncDeleteConfirm();
}

export function closeDeleteUserDialog() {
    closeModal(DELETE_MODAL_ID);
}
