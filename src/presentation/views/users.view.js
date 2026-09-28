/* users.view.js — panel Admin: tabel akun dan modal tambah/ubah (Phase 18).
 *
 * View saja: merender dan membaca formulir. Pemanggilan service (buat, ubah,
 * aktif/nonaktif, hapus permanen) ada di controller legacy-app.js. Tombol
 * mengikuti pengaman yang sama dengan server (akun sendiri tidak bisa
 * dinonaktifkan/dihapus; hapus permanen hanya untuk akun nonaktif) — ini
 * kenyamanan, server tetap memeriksa ulang semuanya.
 *
 * Seluruh teks dari data lewat escapeHtml (tabel) atau textContent/value
 * (formulir) — tidak ada innerHTML dengan isian pengguna tanpa escape.
 */

import { escapeHtml } from '../../shared/html.js';
import { formatRole } from '../../shared/labels.js';
import { ROLE } from '../../config/constants.js';
import { bindModalClose, closeModal, openModal } from '../components/modal.js';

const MODAL_ID = 'userModal';

const el = {
    tbody: document.getElementById('usersTableBody'),
    title: document.getElementById('userModalTitle'),
    id: document.getElementById('userFormId'),
    username: document.getElementById('userFormUsername'),
    displayName: document.getElementById('userFormDisplayName'),
    role: document.getElementById('userFormRole'),
    plantGroup: document.getElementById('userFormPlantGroup'),
    plant: document.getElementById('userFormPlant'),
    password: document.getElementById('userFormPassword'),
    passwordLabel: document.getElementById('userFormPasswordLabel'),
};

function plantName(plants, plantId) {
    if (plantId == null) return '-';
    const plant = plants.find((item) => Number(item.id) === Number(plantId));
    return plant ? `${plant.name} (${plant.code})` : `#${plantId}`;
}

function actionButtons(user, currentUser) {
    const id = escapeHtml(user.id);
    const name = escapeHtml(user.username);
    const edit = `<button class="btn-sm warning" data-action="editUser" data-id="${id}" data-testid="user-edit-btn" title="Ubah"><i class="fas fa-edit"></i></button>`;
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

/** Merender tabel akun. `plants` untuk nama plant Koordinator; `currentUser` untuk menandai akun sendiri. */
export function renderUsersTable(users, plants, currentUser) {
    if (!el.tbody) return;
    if (users.length === 0) {
        el.tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#8a6a6a;">Belum ada pengguna</td></tr>';
        return;
    }
    el.tbody.innerHTML = users.map((user) => `
        <tr class="${user.isActive ? '' : 'user-row-inactive'}" data-testid="user-row" data-username="${escapeHtml(user.username)}">
            <td><strong>${escapeHtml(user.username)}</strong></td>
            <td>${escapeHtml(user.displayName)}</td>
            <td>${escapeHtml(formatRole(user.role))}</td>
            <td>${escapeHtml(plantName(plants, user.plantId))}</td>
            <td><span class="status-badge ${user.isActive ? 'selesai' : 'terlambat'}">${user.isActive ? 'Aktif' : 'Nonaktif'}</span></td>
            <td><div class="user-actions">${actionButtons(user, currentUser)}</div></td>
        </tr>`).join('');
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
