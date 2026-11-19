import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Award, Crown, PartyPopper, Sparkles, Star, Trophy } from 'lucide-react';
import { playDefaultSound } from './defaultSounds';

// The animation shown with a result, by score band:
// pass = a few rising stars, good = a confetti burst, great = confetti rain
// with a trophy, perfect = a golden flash, a big crown, two waves of
// fireworks and heavy gold rain. "fail" shows no celebration. `sound` (a
// URL) plays once when given.

export const PALETTES = {
    pass: ['#60a5fa', '#34d399', '#fbbf24'],
    good: ['#f472b6', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa'],
    great: ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7'],
    perfect: ['#facc15', '#fde68a', '#f59e0b', '#fff7ed', '#eab308'],
};

const ICONS = { pass: Star, good: PartyPopper, great: Trophy, perfect: Crown };

function rand(min, max) {
    return min + Math.random() * (max - min);
}

function Confetti({ band }) {
    const pieces = useMemo(() => {
        const count = { pass: 0, good: 70, great: 140, perfect: 320 }[band] || 0;
        const colors = PALETTES[band];
        return Array.from({ length: count }, (_, i) => ({
            id: i,
            color: colors[i % colors.length],
            left: rand(0, 100),
            delay: band === 'good' ? rand(0, 0.3) : rand(0, band === 'perfect' ? 4.5 : 2.2),
            duration: rand(2.4, 4.2),
            size: rand(6, 11),
            drift: rand(-60, 60),
            spin: rand(-540, 540),
            round: Math.random() < 0.35,
        }));
    }, [band]);

    return pieces.map((p) => (
        <motion.span
            key={p.id}
            className="absolute top-0"
            style={{
                left: `${p.left}%`,
                width: p.size,
                height: p.round ? p.size : p.size * 0.45,
                background: p.color,
                borderRadius: p.round ? '9999px' : '2px',
            }}
            initial={{ y: band === 'good' ? '45vh' : -20, x: 0, opacity: 1, rotate: 0 }}
            animate={band === 'good'
                ? { y: ['45vh', `${rand(-5, 20)}vh`, '105vh'], x: [0, p.drift * 2, p.drift * 3], rotate: p.spin, opacity: [1, 1, 0] }
                : { y: '105vh', x: p.drift, rotate: p.spin, opacity: [1, 1, 0.9, 0] }}
            transition={{ duration: p.duration, delay: p.delay, ease: band === 'good' ? 'easeOut' : 'linear' }}
        />
    ));
}

function RisingStars() {
    const stars = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
        id: i, left: rand(10, 90), delay: rand(0, 1.2), size: rand(14, 26), color: PALETTES.pass[i % 3],
    })), []);
    return stars.map((s) => (
        <motion.span
            key={s.id}
            className="absolute bottom-0"
            style={{ left: `${s.left}%`, color: s.color }}
            initial={{ y: 0, opacity: 0, scale: 0.4 }}
            animate={{ y: '-70vh', opacity: [0, 1, 1, 0], scale: [0.4, 1, 1, 0.6] }}
            transition={{ duration: 2.6, delay: s.delay, ease: 'easeOut' }}
        >
            <Star style={{ width: s.size, height: s.size }} fill="currentColor" />
        </motion.span>
    ));
}

// Bursts of sparks. Full marks get more, bigger and brighter bursts, in two
// waves.
function Fireworks({ band, wave = 1 }) {
    const perfect = band === 'perfect';
    const bursts = useMemo(() => Array.from({ length: perfect ? 9 : 6 }, (_, i) => ({
        id: i,
        x: rand(10, 90),
        y: rand(10, 50),
        delay: (wave === 2 ? 3 : 0.3) + i * (perfect ? 0.3 : 0.45),
        color: perfect ? ['#facc15', '#f97316', '#fde68a', '#ef4444', '#a855f7', '#22c55e'][i % 6] : PALETTES.great[i % 6],
    })), [perfect, wave]);
    const sparks = perfect ? 22 : 14;
    const reach = perfect ? 150 : 90;
    return bursts.map((b) => (
        <span key={b.id} className="absolute" style={{ left: `${b.x}%`, top: `${b.y}%` }}>
            {Array.from({ length: sparks }, (_, k) => {
                const angle = (k / sparks) * Math.PI * 2;
                return (
                    <motion.span
                        key={k}
                        className={`absolute rounded-full ${perfect ? 'h-2.5 w-2.5' : 'h-2 w-2'}`}
                        style={{ background: b.color, boxShadow: `0 0 ${perfect ? 14 : 8}px ${b.color}` }}
                        initial={{ x: 0, y: 0, opacity: 0, scale: 1 }}
                        animate={{ x: Math.cos(angle) * reach, y: Math.sin(angle) * reach + 40, opacity: [0, 1, 0], scale: [1, 1, 0.3] }}
                        transition={{ duration: perfect ? 1.8 : 1.4, delay: b.delay, ease: 'easeOut' }}
                    />
                );
            })}
        </span>
    ));
}

export function CelebrationBadge({ band, className = '' }) {
    const Icon = ICONS[band] || Award;
    const color = { pass: 'text-sky-500', good: 'text-pink-500', great: 'text-amber-500', perfect: 'text-yellow-400' }[band];
    return (
        <motion.div
            className={`relative inline-flex ${className}`}
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: [0, 1.25, 1], rotate: [-20, 8, 0] }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
        >
            {band === 'perfect' && (
                <motion.span
                    className="absolute inset-0 rounded-full bg-yellow-300/40 blur-xl"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                />
            )}
            <Icon className={`relative h-20 w-20 ${color} no-flip`} strokeWidth={1.6} />
            {band !== 'pass' && (
                <Sparkles className="absolute -top-2 -end-3 h-7 w-7 text-amber-400 no-flip" />
            )}
        </motion.div>
    );
}

// Full marks only: a golden flash over the screen, light rays and a big
// crown that drops in the middle, then a second wave of fireworks.
function PerfectShow() {
    return (
        <>
            <motion.div
                className="absolute inset-0"
                style={{ background: 'radial-gradient(circle at 50% 40%, rgba(253,224,71,0.55), rgba(250,204,21,0.15) 45%, transparent 70%)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0.5, 0.8, 0] }}
                transition={{ duration: 4.5, times: [0, 0.1, 0.4, 0.6, 1] }}
            />
            <div className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2">
                <motion.div
                    className="absolute left-1/2 top-1/2 h-[140vmax] w-[140vmax] -translate-x-1/2 -translate-y-1/2"
                    style={{ background: 'repeating-conic-gradient(from 0deg, rgba(253,224,71,0.28) 0deg 8deg, transparent 8deg 22deg)', maskImage: 'radial-gradient(circle, black 0%, transparent 45%)', WebkitMaskImage: 'radial-gradient(circle, black 0%, transparent 45%)' }}
                    initial={{ opacity: 0, rotate: 0 }}
                    animate={{ opacity: [0, 1, 1, 0], rotate: 90 }}
                    transition={{ duration: 4.5, ease: 'linear' }}
                />
                <motion.div
                    className="relative"
                    initial={{ y: '-60vh', scale: 0.4, opacity: 0 }}
                    animate={{ y: [null, 0, -14, 0, 0], scale: [0.4, 1.5, 1.3, 1.4, 0], opacity: [0, 1, 1, 1, 0] }}
                    transition={{ duration: 3.6, times: [0, 0.22, 0.32, 0.42, 1], ease: 'easeOut' }}
                >
                    <Crown className="h-40 w-40 text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.9)] no-flip" fill="#fde047" strokeWidth={1.2} />
                </motion.div>
            </div>
        </>
    );
}

// Full-screen layer over the page; it does not block clicks. With no
// uploaded sound for the band, a built-in one plays (`defaultSound`).
export default function Celebration({ band, sound, playKey = 0, defaultSound = true }) {
    const audio = useRef(null);

    useEffect(() => {
        if (!band || band === 'fail') return undefined;
        if (!sound) return defaultSound ? playDefaultSound(band) : undefined;
        const player = new Audio(sound);
        audio.current = player;
        player.play().catch(() => {});
        return () => player.pause();
    }, [sound, band, playKey, defaultSound]);

    if (!band || band === 'fail') return null;
    return (
        <div key={playKey} className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
            {band === 'perfect' && <PerfectShow />}
            {band === 'pass' && <RisingStars />}
            {band !== 'pass' && <Confetti band={band} />}
            {(band === 'great' || band === 'perfect') && <Fireworks band={band} />}
            {band === 'perfect' && <Fireworks band={band} wave={2} />}
        </div>
    );
}
