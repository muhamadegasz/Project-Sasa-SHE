/* toast.test.js — isi toast dari pesan (presentation/components/toast.js toastContent). Murni, tanpa DOM. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toastContent } from '../../src/presentation/components/toast.js';

test('toast: jenis diturunkan dari prefiks emoji lama; emoji tidak ditampilkan', () => {
    assert.deepEqual(toastContent('✅ Jadwal SCH-001 berhasil ditambahkan'),
        { variant: 'success', title: 'Jadwal SCH-001 berhasil ditambahkan', description: '' });
    assert.equal(toastContent('🎉 Semua tahap pengesahan telah disetujui! Inspeksi selesai.').variant, 'success');
    assert.equal(toastContent('❌ Koordinator K3L Bagian menolak inspeksi INS-001').variant, 'error');
    assert.equal(toastContent('⛔ Anda tidak berwenang untuk aksi ini').variant, 'error');
    assert.equal(toastContent('⚠️ Silakan pilih Plant terlebih dahulu!').variant, 'warning');
    assert.equal(toastContent('🗑️ Jadwal SCH-001 dihapus').variant, 'info');
    assert.equal(toastContent('Tanpa emoji').variant, 'info');
    assert.equal(toastContent('🗑️ Jadwal SCH-001 dihapus').title, 'Jadwal SCH-001 dihapus', 'emoji + variation selector ikut dibuang');
});

test('toast: "⚠️ Gagal …" adalah error, bukan sekadar peringatan', () => {
    assert.deepEqual(toastContent('⚠️ Gagal menyimpan jadwal. Coba ulangi beberapa saat lagi.'),
        { variant: 'error', title: 'Gagal menyimpan jadwal.', description: 'Coba ulangi beberapa saat lagi.' });
});

test('toast: kalimat pertama jadi judul, sisanya deskripsi — teks pesan tetap utuh', () => {
    const message = 'Server tidak dapat dihubungi. Sesi Anda belum tentu berakhir. Muat ulang setelah server aktif kembali.';
    const content = toastContent(`⚠️ ${message}`);
    assert.deepEqual(content, {
        variant: 'warning',
        title: 'Server tidak dapat dihubungi.',
        description: 'Sesi Anda belum tentu berakhir. Muat ulang setelah server aktif kembali.',
    });
    assert.equal(`${content.title} ${content.description}`, message, 'tidak ada tanda baca/kata yang hilang');
    assert.equal(toastContent('📄 Sedang membuat PDF...').title, 'Sedang membuat PDF...');
    assert.equal(toastContent('✅ Draft INS-012 berhasil disimpan.').title, 'Draft INS-012 berhasil disimpan.', 'id tetap di judul');
});

test('toast: teks isian pengguna dalam kutipan tidak dipecah di titiknya', () => {
    const content = toastContent('✅ Temuan "Kabel terkelupas. Bahaya" ditambahkan');
    assert.equal(content.title, 'Temuan "Kabel terkelupas. Bahaya" ditambahkan');
    assert.equal(content.description, '');
});

test('toast: variant & description eksplisit mengalahkan turunan; variant tak dikenal diabaikan', () => {
    assert.deepEqual(toastContent('Gagal menyimpan jadwal', { variant: 'error', description: 'Periksa data dan coba lagi.' }),
        { variant: 'error', title: 'Gagal menyimpan jadwal', description: 'Periksa data dan coba lagi.' });
    assert.equal(toastContent('Jadwal berhasil disimpan. Detail.', { description: 'Deskripsi sendiri.' }).title,
        'Jadwal berhasil disimpan. Detail.', 'dengan description eksplisit, judul tidak dipecah');
    assert.equal(toastContent('Selesai', { variant: 'bukan-jenis' }).variant, 'success');
});
