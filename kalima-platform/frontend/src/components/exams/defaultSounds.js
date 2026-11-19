// Built-in celebration sounds, made in the browser (no audio files), for a
// band with no uploaded sound: chimes for "pass", chimes and a little
// applause for "good", a fanfare with applause for "great", and a long
// fanfare, cheering applause and firework pops for "perfect".
// playDefaultSound returns a function that stops it.

let shared = null;
const context = () => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!shared || shared.state === 'closed') shared = new Ctx();
    if (shared.state === 'suspended') shared.resume().catch(() => {});
    return shared;
};

function noiseBuffer(ctx, seconds) {
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
}

// A bell-like note: a sine with a soft overtone and a quick decay.
function chime(ctx, out, freq, at, length = 0.6, volume = 0.25) {
    [[1, volume], [2.01, volume * 0.25]].forEach(([mult, vol]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq * mult;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(vol, at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
        osc.connect(gain).connect(out);
        osc.start(at);
        osc.stop(at + length + 0.05);
    });
}

// A brass-like note: two detuned saws through a lowpass that opens up.
function brass(ctx, out, freq, at, length, volume = 0.12) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, at);
    filter.frequency.linearRampToValueAtTime(2600, at + 0.08);
    filter.frequency.linearRampToValueAtTime(1600, at + length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.04);
    gain.gain.setValueAtTime(volume, at + length - 0.08);
    gain.gain.linearRampToValueAtTime(0, at + length);
    filter.connect(gain).connect(out);
    [-6, 6].forEach((detune) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(at);
        osc.stop(at + length + 0.05);
    });
}

// Applause: many short hand claps (filtered noise bursts) at random times,
// swelling in and fading out.
function applause(ctx, out, at, seconds, density, volume = 0.5) {
    const noise = noiseBuffer(ctx, 0.08);
    const total = Math.floor(seconds * density);
    for (let i = 0; i < total; i++) {
        const t = at + Math.random() * seconds;
        const pos = (t - at) / seconds;
        const swell = Math.min(1, pos * 5) * Math.min(1, (1 - pos) * 2.5);
        const src = ctx.createBufferSource();
        src.buffer = noise;
        src.playbackRate.value = 0.8 + Math.random() * 0.5;
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 900 + Math.random() * 1600;
        band.Q.value = 1.2;
        const gain = ctx.createGain();
        const peak = volume * swell * (0.4 + Math.random() * 0.6);
        gain.gain.setValueAtTime(peak, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.04);
        const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        if (pan) pan.pan.value = Math.random() * 1.6 - 0.8;
        src.connect(band).connect(gain);
        (pan ? gain.connect(pan) : gain).connect(out);
        src.start(t);
        src.stop(t + 0.1);
    }
}

// A firework: a soft thump, then a crackle.
function pop(ctx, out, at, volume = 0.5) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.6);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(1800, at);
    low.frequency.exponentialRampToValueAtTime(200, at + 0.4);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
    src.connect(low).connect(gain).connect(out);
    src.start(at);
    applause(ctx, out, at + 0.15, 0.6, 50, volume * 0.35);
}

const NOTES = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5, G4: 392, C4: 261.63, E4: 329.63, G3: 196 };

const SCORES = {
    pass(ctx, out, t) {
        chime(ctx, out, NOTES.C5, t);
        chime(ctx, out, NOTES.E5, t + 0.15);
        chime(ctx, out, NOTES.G5, t + 0.3, 1);
        return 1.4;
    },
    good(ctx, out, t) {
        [NOTES.C5, NOTES.E5, NOTES.G5, NOTES.C6].forEach((f, i) => chime(ctx, out, f, t + i * 0.12, i === 3 ? 1.2 : 0.6));
        applause(ctx, out, t + 0.4, 2.2, 45, 0.35);
        return 2.8;
    },
    great(ctx, out, t) {
        brass(ctx, out, NOTES.G4, t, 0.18);
        brass(ctx, out, NOTES.G4, t + 0.2, 0.18);
        brass(ctx, out, NOTES.C5, t + 0.4, 0.7);
        brass(ctx, out, NOTES.E4, t + 0.4, 0.7, 0.08);
        applause(ctx, out, t + 0.6, 3.6, 90, 0.45);
        return 4.4;
    },
    perfect(ctx, out, t) {
        const melody = [[NOTES.G4, 0.15], [NOTES.C5, 0.15], [NOTES.E5, 0.15], [NOTES.G5, 0.45], [NOTES.E5, 0.15], [NOTES.G5, 1.1]];
        let at = t;
        melody.forEach(([f, len]) => {
            brass(ctx, out, f, at, len);
            brass(ctx, out, f / 2, at, len, 0.07);
            at += len + 0.03;
        });
        chime(ctx, out, NOTES.C6, at - 1.1, 1.6, 0.15);
        chime(ctx, out, NOTES.E6, at - 0.9, 1.6, 0.12);
        applause(ctx, out, t + 0.8, 6, 140, 0.55);
        [1.2, 1.9, 2.5, 3.4, 4.1, 4.8].forEach((d) => pop(ctx, out, t + d, 0.45));
        return 7.2;
    },
};

// A short clock beep for the last seconds of an exam.
export function playBeep(freq = 880, length = 0.12, volume = 0.3) {
    const ctx = context();
    if (!ctx) return;
    const at = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume * 0.4, at + 0.005);
    gain.gain.setValueAtTime(volume * 0.4, at + length - 0.02);
    gain.gain.linearRampToValueAtTime(0, at + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + length + 0.02);
}

// Plays a band's built-in sound into `out` (any node of `ctx`) from `at`;
// returns its length in seconds, or 0 for a band with none. The share
// video records it this way.
export function defaultSoundInto(band, ctx, out, at) {
    return SCORES[band] ? SCORES[band](ctx, out, at) : 0;
}

export function playDefaultSound(band) {
    const make = SCORES[band];
    const ctx = make && context();
    if (!ctx) return () => {};
    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(ctx.destination);
    const length = make(ctx, out, ctx.currentTime + 0.05);
    let stopped = false;
    const stop = () => {
        if (stopped) return;
        stopped = true;
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        setTimeout(() => out.disconnect(), 300);
    };
    setTimeout(stop, (length + 0.5) * 1000);
    return stop;
}
