/* plant-select.js — dropdown pencarian plant dengan filter.
 *
 * Dipakai dua kali dengan state terpisah: form inspeksi dan form jadwal.
 * Sebelum Phase 7, logikanya diduplikasi persis (~200 baris, dua salinan)
 * langsung di initPlantSelect() di legacy-app.js, dan diduplikasi LAGI
 * secara parsial di tiga tempat lain yang menset/mereset pilihan plant
 * secara manual (openJadwalModal, submitJadwal, submitInspeksi). Faktor
 * ini menyatukan seluruhnya jadi satu implementasi.
 *
 * Perilaku dipertahankan persis — lihat docs/DECISIONS.md K-11.
 * "Terpilih" ditandai lewat hiddenInput.value (kosong = belum ada pilihan),
 * menggantikan variabel modul `selectedPlant`/`selectedPlantJadwal` yang lama;
 * keduanya sama-sama hanya diubah oleh select()/clear(), jadi tidak ada
 * perbedaan perilaku.
 */

import { escapeHtml, highlight } from '../../shared/html.js';
import * as plantRepository from '../../repositories/plant-repository.js';

/**
 * @param {object} ids id elemen DOM untuk satu instance select
 * @param {string} ids.inputId
 * @param {string} ids.dropdownId
 * @param {string} ids.hiddenInputId
 * @param {string} ids.displayId
 * @param {string} ids.clearBtnId
 * @param {string} ids.wrapperId
 * @returns {{select: Function, clear: Function, markInvalid: Function}}
 */
export function createPlantSelect({ inputId, dropdownId, hiddenInputId, displayId, clearBtnId, wrapperId }) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    const hiddenInput = document.getElementById(hiddenInputId);
    const display = document.getElementById(displayId);
    const clearBtn = document.getElementById(clearBtnId);
    const wrapper = document.getElementById(wrapperId);

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
                select(id, name, code);
            });
        });
    }

    /** Menandai sebuah plant terpilih dan memperbarui seluruh elemen tampilannya. */
    function select(id, name, code) {
        hiddenInput.value = id;
        input.value = name;
        display.innerHTML = `<span class="selected-value"><i class="fas fa-check-circle"></i> ${escapeHtml(name)} (${escapeHtml(code)})</span>`;
        clearBtn.classList.add('visible');
        dropdown.classList.remove('show');
        input.classList.remove('error');
    }

    /** Mengosongkan pilihan. Tidak memindah fokus — pemanggil yang memutuskan itu. */
    function clear() {
        hiddenInput.value = '';
        input.value = '';
        display.innerHTML = '';
        clearBtn.classList.remove('visible');
        dropdown.classList.remove('show');
    }

    /** Efek visual saat plant wajib diisi tapi belum dipilih: fokus + border merah 3 detik. */
    function markInvalid() {
        input.focus();
        input.classList.add('error');
        setTimeout(() => { input.classList.remove('error'); }, 3000);
    }

    input.addEventListener('input', function() {
        const value = this.value.trim();
        if (value === '') {
            dropdown.classList.remove('show');
            if (hiddenInput.value === '') {
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
        if (!wrapper.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });

    clearBtn.addEventListener('click', function() {
        clear();
        input.focus();
    });

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

    renderDropdown('');

    return { select, clear, markInvalid };
}
