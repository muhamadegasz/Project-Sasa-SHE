/* signature-pad.js — area gambar tanda tangan (Phase 17.4B) dan deteksi
 * format gambar untuk umpan balik cepat di browser.
 *
 * Kanvas memakai Pointer Events: satu jalur untuk mouse, sentuh, dan pena.
 * `touch-action: none` (08-approval.css) mencegah halaman ikut bergulir saat
 * menggambar. Ukuran piksel kanvas ditetapkan sekali saat diaktifkan
 * (resize()); bila ukuran tampilan berubah sesudahnya, koordinat tetap
 * dipetakan lewat getBoundingClientRect, jadi coretan tidak bergeser.
 *
 * Hasil ekspor selalu PNG (latar transparan), dikirim sebagai berkas biasa —
 * tidak pernah base64. Server tetap memeriksa ulang isinya.
 */

/** Panjang coretan minimum (px layar) supaya kanvas dianggap berisi — satu ketukan tidak sah sebagai tanda tangan. */
const MIN_INK_LENGTH = 20;

/**
 * Format gambar dari byte awal berkas: 'image/png' | 'image/jpeg' | null.
 * Hanya untuk umpan balik di browser (nama/tipe berkas dari browser tidak
 * dipakai); server mendeteksi ulang dan tetap otoritatif.
 */
export function detectImageType(bytes) {
    if (!bytes || bytes.length < 12) return null;
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (png.every((byte, index) => bytes[index] === byte)) return 'image/png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    return null;
}

/**
 * Memasang perilaku menggambar pada `canvas`. `onChange` dipanggil setiap
 * kali satu coretan selesai atau kanvas dikosongkan.
 */
export function createSignaturePad(canvas, { onChange }) {
    const context = canvas.getContext('2d');
    let drawing = false;
    let last = null;
    let inkLength = 0;
    let scale = 1;

    function toCanvasPoint(event) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) * (canvas.width / rect.width),
            y: (event.clientY - rect.top) * (canvas.height / rect.height),
            screenScale: canvas.width / rect.width,
        };
    }

    function applyPenStyle() {
        context.lineWidth = 2.5 * scale;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.strokeStyle = '#1a1a2e';
        context.fillStyle = '#1a1a2e';
    }

    canvas.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        drawing = true;
        last = toCanvasPoint(event);
        context.beginPath();
        context.arc(last.x, last.y, context.lineWidth / 2, 0, Math.PI * 2);
        context.fill();
    });

    canvas.addEventListener('pointermove', (event) => {
        if (!drawing) return;
        event.preventDefault();
        const point = toCanvasPoint(event);
        context.beginPath();
        context.moveTo(last.x, last.y);
        context.lineTo(point.x, point.y);
        context.stroke();
        inkLength += Math.hypot(point.x - last.x, point.y - last.y) / point.screenScale;
        last = point;
    });

    function endStroke() {
        if (!drawing) return;
        drawing = false;
        last = null;
        onChange();
    }
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', endStroke);

    return {
        /** Menyesuaikan ukuran piksel kanvas dengan ukuran tampilnya (dan kepadatan layar), lalu mengosongkannya. */
        resize() {
            const rect = canvas.getBoundingClientRect();
            scale = window.devicePixelRatio || 1;
            canvas.width = Math.max(1, Math.round(rect.width * scale));
            canvas.height = Math.max(1, Math.round(rect.height * scale));
            this.clear();
        },
        clear() {
            context.clearRect(0, 0, canvas.width, canvas.height);
            applyPenStyle();
            drawing = false;
            last = null;
            inkLength = 0;
            onChange();
        },
        isEmpty() {
            return inkLength < MIN_INK_LENGTH;
        },
        /** Isi kanvas sebagai berkas PNG. */
        toFile() {
            return new Promise((resolve, reject) => {
                canvas.toBlob((blob) => {
                    if (blob) resolve(new File([blob], 'tanda-tangan.png', { type: 'image/png' }));
                    else reject(new Error('Kanvas tidak bisa diekspor sebagai PNG'));
                }, 'image/png');
            });
        },
    };
}
