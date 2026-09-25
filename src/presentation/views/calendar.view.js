/* calendar.view.js — kalender bulanan dan modal detail hari.
 *
 * Dipindah apa adanya dari legacy-app.js (Phase 8). Menyimpan sendiri bulan/tahun
 * yang sedang ditampilkan (state presentasi murni, bukan data aplikasi).
 */

import { escapeHtml } from '../../shared/html.js';
import { formatDate } from '../../shared/date.js';
import * as scheduleRepository from '../../repositories/schedule-repository.js';
import { bindModalClose } from '../components/modal.js';
import { showToast } from '../components/toast.js';

let currentCalendarMonth = new Date().getMonth();
let currentCalendarYear = new Date().getFullYear();

/** Mengelompokkan seluruh jadwal per tanggal (kunci `YYYY-MM-DD`) untuk pewarnaan dot kalender. */
async function collectMonthEvents() {
    const events = {};
    (await scheduleRepository.getAll()).forEach(j => {
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
    return events;
}

export async function renderCalendar() {
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

    const events = await collectMonthEvents();

    let html = `
        <div class="calendar-header">
            <button class="nav-btn" data-action="changeCalendarMonth" data-delta="-1"><i class="fas fa-chevron-left"></i></button>
            <span class="month-year">${monthNames[currentCalendarMonth]} ${currentCalendarYear}</span>
            <button class="nav-btn" data-action="changeCalendarMonth" data-delta="1"><i class="fas fa-chevron-right"></i></button>
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
                 ${hasEvent ? `data-action="showDayEvents" data-date="${escapeHtml(dateKey)}"` : ''}>
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

export async function changeCalendarMonth(delta) {
    currentCalendarMonth += delta;
    if (currentCalendarMonth > 11) {
        currentCalendarMonth = 0;
        currentCalendarYear++;
    } else if (currentCalendarMonth < 0) {
        currentCalendarMonth = 11;
        currentCalendarYear--;
    }
    await renderCalendar();
}

export async function showDayEvents(dateKey) {
    const events = [];
    (await scheduleRepository.getAll()).forEach(j => {
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

bindModalClose('calendarModal', 'closeCalendarModal');
