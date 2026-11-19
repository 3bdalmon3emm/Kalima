import { PALETTES } from './Celebration';
import { defaultSoundInto } from './defaultSounds';
import { __iconNode as starIcon } from 'lucide-react/dist/esm/icons/star.js';
import { __iconNode as partyIcon } from 'lucide-react/dist/esm/icons/party-popper.js';
import { __iconNode as trophyIcon } from 'lucide-react/dist/esm/icons/trophy.js';
import { __iconNode as crownIcon } from 'lucide-react/dist/esm/icons/crown.js';
import { __iconNode as sparklesIcon } from 'lucide-react/dist/esm/icons/sparkles.js';

// The celebration as a short video a student can post (a story-sized
// 1080×1920 clip): the band's animation drawn on a canvas, with the
// student's name, the exam, the score and the percent. Recorded in real
// time, so it takes as long as the clip. MP4 where the browser can record
// it (WhatsApp and Instagram take it), otherwise WebM. The sound is the one
// the page plays: the band's uploaded sound, else the built-in one.

const W = 1080;
const H = 1920;
// The clip lasts at least this long, and longer when the sound does.
const MIN_SECONDS = 6;
const FPS = 30;
const FONT = 'Cairo, "Noto Sans Arabic", sans-serif';

const BACKGROUND = {
    pass: ['#0c4a6e', '#082f49'],
    good: ['#831843', '#3b0764'],
    great: ['#7c2d12', '#431407'],
    perfect: ['#713f12', '#1c1917'],
};

// The same icons and colors as the badge on the result page (CelebrationBadge).
const BADGE = {
    pass: { icon: starIcon, color: '#0ea5e9' },
    good: { icon: partyIcon, color: '#ec4899' },
    great: { icon: trophyIcon, color: '#f59e0b' },
    perfect: { icon: crownIcon, color: '#facc15', fill: '#fde047' },
};

// Draws a lucide icon (24×24 units) centred on the origin, `size` px wide.
function drawIcon(ctx, nodes, size, { color, fill, width = 1.6 }) {
    ctx.save();
    ctx.scale(size / 24, size / 24);
    ctx.translate(-12, -12);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [tag, attrs] of nodes) {
        const path = new Path2D();
        if (tag === 'circle') path.arc(Number(attrs.cx), Number(attrs.cy), Number(attrs.r), 0, Math.PI * 2);
        else path.addPath(new Path2D(attrs.d));
        if (fill) {
            ctx.fillStyle = fill;
            ctx.fill(path);
        }
        ctx.stroke(path);
    }
    ctx.restore();
}

function drawBadge(ctx, band, t) {
    const { icon, color, fill } = BADGE[band];
    // A soft glow in the band's color; full marks pulse in gold.
    const pulse = band === 'perfect' ? 1 + Math.sin(t * 4) * 0.15 : 1;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 300 * pulse);
    glow.addColorStop(0, `${color}66`);
    glow.addColorStop(1, `${color}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(-320, -320, 640, 640);
    if (band === 'perfect') {
        ctx.shadowColor = 'rgba(250,204,21,0.9)';
        ctx.shadowBlur = 60;
    }
    drawIcon(ctx, icon, 360, { color, fill, width: band === 'perfect' ? 1.2 : 1.6 });
    ctx.shadowBlur = 0;
    if (band !== 'pass') {
        ctx.save();
        ctx.translate(170, -170);
        ctx.rotate(Math.sin(t * 2) * 0.15);
        drawIcon(ctx, sparklesIcon, 110, { color: '#fbbf24', width: 2 });
        ctx.restore();
    }
}

const rand = (min, max) => min + Math.random() * (max - min);

function particles(band, seconds) {
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
        color: colors[i % colors.length], x: rand(80, W - 80), start: rand(0, seconds - 1.5), size: rand(40, 80),
    })) : [];
    const bursts = band === 'great' || band === 'perfect' ? Array.from({ length: band === 'perfect' ? 12 : 7 }, (_, i) => ({
        color: colors[i % colors.length], x: rand(120, W - 120), y: rand(160, 760), start: 0.3 + i * (seconds - 1.5) / (band === 'perfect' ? 12 : 7),
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
    drawBadge(ctx, band, t);
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
    const types = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
    return types.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || null;
}

// The sound as an audio track, started when `play` is called; it plays into
// the recording only, not out loud. No sound (or no Web Audio) gives no track.
async function soundTrack(band, soundUrl, audio) {
    if (!audio) return { tracks: [], play: () => {}, length: 0 };
    const out = audio.createMediaStreamDestination();
    let buffer = null;
    if (soundUrl) {
        try {
            const res = await fetch(soundUrl);
            buffer = await audio.decodeAudioData(await res.arrayBuffer());
        } catch {
            buffer = null; // not readable from here: use the built-in sound
        }
    }
    const play = () => {
        const at = audio.currentTime + 0.05;
        if (buffer) {
            const src = audio.createBufferSource();
            src.buffer = buffer;
            src.connect(out);
            src.start(at);
        } else {
            defaultSoundInto(band, audio, out, at);
        }
    };
    // Built-in lengths are known only once played; these match defaultSounds.
    const length = buffer ? buffer.duration : { pass: 1.4, good: 2.8, great: 4.4, perfect: 7.2 }[band] || 0;
    return { tracks: out.stream.getAudioTracks(), play, length };
}

// text: { headline, name, exam, score, percent, brand }; soundUrl: the band's
// uploaded sound, if any. Resolves to a File.
export async function makeShareVideo(band, text, soundUrl = null) {
    const type = videoType();
    if (!type) throw new Error('video recording is not supported');
    // Made before any wait, while the tap still counts, or phones keep it
    // muted.
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const audio = Ctx ? new Ctx() : null;
    audio?.resume().catch(() => {});
    try {
        await Promise.all([document.fonts.load(`900 80px Cairo`), document.fonts.load(`600 54px Cairo`)]).catch(() => {});
        const sound = await soundTrack(band, soundUrl, audio);
        return await record(band, text, type, sound);
    } finally {
        setTimeout(() => audio?.close().catch(() => {}), 500);
    }
}

async function record(band, text, type, sound) {
    const seconds = Math.max(MIN_SECONDS, Math.min(sound.length + 0.5, 15));
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const p = particles(band, seconds);
    drawFrame(ctx, 0, band, p, text);

    const stream = new MediaStream([...canvas.captureStream(FPS).getVideoTracks(), ...sound.tracks]);
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((resolve) => { recorder.onstop = resolve; });
    // One piece at the end: Safari's MP4 breaks when recorded in slices.
    recorder.start();
    sound.play();

    // A timer, not requestAnimationFrame, so the clip still finishes if the
    // student switches away (it is choppier then).
    const begin = performance.now();
    await new Promise((resolve) => {
        const step = () => {
            const t = (performance.now() - begin) / 1000;
            drawFrame(ctx, Math.min(t, seconds), band, p, text);
            if (t >= seconds) resolve();
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
// sharing files is not possible (most desktops). Call it straight from a
// tap: phones (iPhone above all) open the share sheet only then, so the
// video is made first and shared on a second tap.
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
