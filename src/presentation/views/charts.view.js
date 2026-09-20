/* charts.view.js — satu-satunya modul yang menyentuh Chart.js.
 *
 * Dipindah dari legacy-app.js (Phase 8) — sebelumnya didokumentasikan di
 * docs/SECURITY.md sebagai satu-satunya library pihak ketiga yang belum
 * terisolasi (XLSX dan html2pdf sudah sejak Phase 6).
 *
 * Kedua chart instance (`temuanPlantChart`, `perbaikanChart`) sengaja TIDAK
 * diekspor — dienkapsulasi penuh di sini. Pemanggil dari luar (refreshAll di
 * legacy-app.js) hanya memanggil initCharts()/updatePerbaikanChart(), tidak
 * pernah menyentuh instance chart-nya sendiri.
 */

import * as plantRepository from '../../repositories/plant-repository.js';
import * as inspectionRepository from '../../repositories/inspection-repository.js';
import { allActionsClosed, hasActionInProgress, hasActionOpen } from '../../domain/inspection-rules.js';

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

let temuanPlantChart = null;

export function renderTemuanPlantChart() {
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

let perbaikanChart;

export function initCharts() {
    renderTemuanPlantChart();

    // D-3 (docs/KNOWN-ISSUES.md): Chart.js melempar "Canvas is already in use"
    // kalau instance lama di canvas yang sama belum di-destroy. renderTemuanPlantChart()
    // di atas sudah benar (destroy sebelum new Chart); ini menyamakan perbaikanChart
    // dengan pola yang sama, supaya initCharts() aman dipanggil ulang (mis. logout lalu
    // login lagi) tanpa melempar exception yang membatalkan sisa initApp().
    if (perbaikanChart) {
        perbaikanChart.destroy();
    }

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

/** Menyegarkan data perbaikanChart tanpa membuat ulang instance-nya. Dipanggil dari refreshAll(). */
export function updatePerbaikanChart() {
    if (!perbaikanChart) return;
    const counts = countRepairStatuses();
    perbaikanChart.data.datasets[0].data = [counts.selesai, counts.perbaikan, counts.tinjau];
    perbaikanChart.update();
}
