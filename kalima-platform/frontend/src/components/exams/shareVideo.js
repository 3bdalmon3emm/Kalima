import { PALETTES } from './Celebration';

// The celebration as a short video a student can post (a story-sized
// 1080×1920 clip): the band's animation drawn on a canvas, with the
// student's name, the exam, the score and the percent. Recorded in real
// time, so it takes as long as the clip. MP4 where the browser can record
// it (WhatsApp and Instagram take it), otherwise WebM.

const W = 1080;
const H = 1920;
const SECONDS = 6;
const FPS = 30;
const FONT = 'Cairo, "Noto Sans Arabic", sans-serif';

const BACKGROUND = {
    pass: ['#0c4a6e', '#082f49'],
    good: ['#831843', '#3b0764'],
    great: ['#7c2d12', '#431407'],
    perfect: ['#713f12', '#1c1917'],
};
const EMOJI = { pass: '⭐', good: '🎉', great: '🏆', perfect: '👑' };

const rand = (min, max) => min + Math.random() * (max - min);

function particles(band) {
    const colors = PALETTES[band];
    const confetti = Array.from({ length: { pass: 0, good: 90, great: 160, perfect: 260 }[band] }, (_, i) => ({
        color: colors[i % colors.length],
        x: rand(0, W),
        y: rand(-H, 0),
        speed: rand(260, 520),
        drift: rand(-60, 60),
        size: rand(14, 26),
        spin: rand(-6, 6),
        round: Math.random() < 0.35,
    }));
    const stars = band === 'pass' ? Array.from({ length: 26 }, (_, i) => ({
        color: colors[i % colors.length], x: rand(80, W - 80), start: rand(0, SECONDS - 1.5), size: rand(40, 80),
    })) : [];
    const bursts = band === 'great' || band === 'perfect' ? Array.from({ length: band === 'perfect' ? 12 : 7 }, (_, i) => ({
        color: colors[i % colors.length], x: rand(120, W - 120), y: rand(160, 760), start: 0.3 + i * (SECONDS - 1.5) / (band === 'perfect' ? 12 : 7),
    })) : [];
    return { confetti, stars, bursts };
}

function star(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const d = i % 2 ? r * 0.45 : r;
        ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    ctx.closePath();
    ctx.fill();
}

// Shrinks a line until it fits the width.
function fitText(ctx, text, y, maxSize, weight, color, dir = 'rtl') {
    let size = maxSize;
    ctx.direction = dir;
    do {
        ctx.font = `${weight} ${size}px ${FONT}`;
        size -= 4;
    } while (ctx.measureText(text).width > W - 140 && size > 28);
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, y);
}

function drawFrame(ctx, t, band, p, text) {
    const [top, bottom] = BACKGROUND[band];
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, top);
    bg.addColorStop(1, bottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Light rays behind the badge.
    ctx.save();
    ctx.translate(W / 2, 640);
    ctx.rotate(t * 0.25);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 16; i++) {
        ctx.rotate((Math.PI * 2) / 16);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-60, -1400);
        ctx.lineTo(60, -1400);
        ctx.fill();
    }
    ctx.restore();

    for (const s of p.stars) {
        const k = (t - s.start) / 2.2;
        if (k < 0 || k > 1) continue;
        ctx.globalAlpha = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
        star(ctx, s.x, H - k * H * 0.8, s.size * (0.5 + k * 0.5), s.color);
    }
    ctx.globalAlpha = 1;

    for (const b of p.bursts) {
        const k = (t - b.start) / 1.4;
        if (k < 0 || k > 1) continue;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = b.color;
        for (let i = 0; i < 22; i++) {
            const a = (i / 22) * Math.PI * 2;
            const d = k * (band === 'perfect' ? 260 : 190);
            ctx.beginPath();
            ctx.arc(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d + k * k * 80, 9, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.globalAlpha = 1;

    for (const c of p.confetti) {
        const y = (c.y + t * c.speed) % (H + 200);
        if (y < -40) continue;
        ctx.save();
        ctx.translate(c.x + Math.sin(t * 2 + c.x) * c.drift, y);
        ctx.rotate(t * c.spin);
        ctx.fillStyle = c.color;
        if (c.round) {
            ctx.beginPath();
            ctx.arc(0, 0, c.size / 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
        }
        ctx.restore();
    }

    // The badge pops in, then breathes.
    const pop = Math.min(1, t / 0.6);
    const scale = (pop < 1 ? pop * 1.25 : 1) + Math.sin(t * 3) * 0.04;
    ctx.save();
    ctx.translate(W / 2, 640);
    ctx.scale(scale, scale);
    ctx.font = `300px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(EMOJI[band], 0, 0);
    ctx.restore();

    // The card fades in under the badge.
    const show = Math.min(1, Math.max(0, (t - 0.5) / 0.6));
    ctx.globalAlpha = show;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.roundRect(70, 930, W - 140, 760, 48);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    fitText(ctx, text.headline, 1040, 64, 800, '#ffffff');
    fitText(ctx, text.name, 1170, 84, 900, '#fde68a');
    fitText(ctx, text.exam, 1270, 54, 600, 'rgba(255,255,255,0.85)');
    fitText(ctx, text.score, 1480, 170, 900, '#ffffff', 'ltr');
    fitText(ctx, text.percent, 1610, 76, 800, '#86efac', 'ltr');
    ctx.globalAlpha = 1;
    fitText(ctx, text.brand, H - 90, 44, 700, 'rgba(255,255,255,0.7)');
}

function videoType() {
    const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    return types.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || null;
}

// text: { headline, name, exam, score, percent, brand }. Resolves to a File.
export async function makeShareVideo(band, text) {
    const type = videoType();
    if (!type) throw new Error('video recording is not supported');
    await Promise.all([document.fonts.load(`900 80px Cairo`), document.fonts.load(`600 54px Cairo`)]).catch(() => {});

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const p = particles(band);
    drawFrame(ctx, 0, band, p, text);

    const recorder = new MediaRecorder(canvas.captureStream(FPS), { mimeType: type, videoBitsPerSecond: 6_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start(250);

    // A timer, not requestAnimationFrame, so the clip still finishes if the
    // student switches away (it is choppier then).
    const begin = performance.now();
    await new Promise((resolve) => {
        const step = () => {
            const t = (performance.now() - begin) / 1000;
            drawFrame(ctx, Math.min(t, SECONDS), band, p, text);
            if (t >= SECONDS) resolve();
            else setTimeout(step, 1000 / FPS);
        };
        step();
    });
    recorder.stop();
    await done;

    const mime = type.split(';')[0];
    return new File(chunks, `kalima-${Date.now()}.${mime === 'video/mp4' ? 'mp4' : 'webm'}`, { type: mime });
}

// Opens the phone's share sheet with the file, or downloads it where
// sharing files is not possible (most desktops).
export async function shareOrDownload(file) {
    if (navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ files: [file] });
            return 'shared';
        } catch (err) {
            if (err?.name === 'AbortError') return 'cancelled';
        }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'downloaded';
}
