/* support/api.js — Phase 14.1-D/H: setup data eksplisit lewat API.
 *
 * Dipakai supaya test yang butuh "sebuah inspeksi dalam keadaan tertentu"
 * TIDAK bergantung pada:
 *   - urutan test lain (mis. variabel global newInspectionId dari test
 *     sebelumnya — pola yang eksplisit dilarang Phase 14.1-D), atau
 *   - "apa pun yang kebetulan ada di database" (Phase 14.1-H).
 *
 * Setiap fixture diberi tag unik (timestamp + random) di keteranganLokasi/
 * deskripsi temuan, supaya dua test yang jalan bersamaan (fullyParallel:true)
 * tidak pernah membuat data yang bisa disalahartikan tertukar.
 *
 * Ini APIRequestContext terpisah dari cookie jar browser (page.request) —
 * dipakai untuk SETUP data, bukan untuk aksi yang sedang diuji (aksi yang
 * diuji tetap lewat UI sungguhan di masing-masing spec).
 */

import { request as playwrightRequest } from '@playwright/test';

const API_BASE = 'http://project-sasa-she.test:3001';

function uniqueTag() {
    return `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** Login lewat API (bukan UI) — dipakai untuk membangun fixture, bukan untuk mengklaim "login sudah teruji" (itu tugas auth.spec.js). */
export async function apiLogin(username, password = username) {
    const context = await playwrightRequest.newContext({ baseURL: API_BASE });
    const res = await context.post('/api/auth/login', { data: { username, password } });
    if (!res.ok()) {
        throw new Error(`apiLogin(${username}) gagal: HTTP ${res.status()} ${await res.text()}`);
    }
    const body = await res.json();
    return { context, csrfToken: body.csrfToken, user: body.user };
}

/**
 * Membuat inspeksi lewat API sebagai fixture. Kegagalan MELEMPAR ERROR
 * (bukan mengembalikan null/undefined) — sesuai Phase 14.1-H: kegagalan
 * prasyarat harus menggagalkan test, bukan diam-diam di-skip.
 */
export async function createInspectionFixture(session, overrides = {}) {
    const tag = uniqueTag();
    const today = new Date().toISOString().slice(0, 10);
    const res = await session.context.post('/api/inspections', {
        headers: { 'X-CSRF-Token': session.csrfToken },
        data: {
            plantId: 1,
            keteranganLokasi: tag,
            tanggal: today,
            status: 'proses',
            dueDate: today,
            temuan: [{ deskripsi: `Temuan fixture ${tag}`, kategori: 'Lainnya' }],
            ...overrides,
        },
    });
    if (!res.ok()) {
        throw new Error(`createInspectionFixture gagal: HTTP ${res.status()} ${await res.text()}`);
    }
    const body = await res.json();
    return { ...body.inspection, tag };
}

/** Menyetujui satu tahap lewat API — dipakai untuk MENYIAPKAN state (mis. "tahap 2 sudah disetujui" sebelum menguji tahap 3), bukan untuk menguji approve itu sendiri. */
export async function approveViaApi(session, inspectionId, stageId) {
    const res = await session.context.post(`/api/inspections/${inspectionId}/approve`, {
        headers: { 'X-CSRF-Token': session.csrfToken },
        data: { stageId },
    });
    if (!res.ok()) {
        throw new Error(`approveViaApi(${inspectionId}, ${stageId}) gagal: HTTP ${res.status()} ${await res.text()}`);
    }
    return res.json();
}
