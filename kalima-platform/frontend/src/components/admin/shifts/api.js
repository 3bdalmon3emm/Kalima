import axios from '@/api/axios';

// Staff shifts (/api/v2/staff-shifts): the SubAdmin and the Moderator start
// and end their shifts; the Admin sees and corrects everyone's hours.

export const shiftsApi = {
    get: async (path, params) => (await axios.get(`/staff-shifts${path}`, { params })).data.data,
    send: async (method, path, body) => (await axios({ method, url: `/staff-shifts${path}`, data: body })).data.data,
};

export const TZ = 'Africa/Cairo';
const locale = (lang) => (lang === 'ar' ? 'ar-EG' : 'en-GB');

// 27000 seconds -> "7س 30د" / "7h 30m".
export function formatDuration(seconds, t) {
    const mins = Math.floor((seconds || 0) / 60);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (!h && !m) return t('units.zero');
    if (!h) return t('units.m', { m });
    if (!m) return t('units.h', { h });
    return t('units.hm', { h, m });
}

// Hours with one decimal, for bars and totals.
export const hours = (seconds) => Math.round(((seconds || 0) / 3600) * 10) / 10;

// A running timer: 01:05:09.
export function formatClock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export const formatTime = (v, lang) => (v ? new Date(v).toLocaleTimeString(locale(lang), { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) : '—');
// 24-hour and short, for tight cells: 08:42.
export const formatShort = (v, lang) => (v ? new Date(v).toLocaleTimeString(locale(lang), { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '—');
export const formatDay = (v, lang, opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) =>
    new Date(`${v}T12:00:00Z`).toLocaleDateString(locale(lang), { timeZone: 'UTC', ...opts });
export const formatMonth = (v, lang, opts = { month: 'long', year: 'numeric' }) =>
    new Date(`${v}-15T12:00:00Z`).toLocaleDateString(locale(lang), { timeZone: 'UTC', ...opts });

// Today's date in Cairo as YYYY-MM-DD.
export const cairoToday = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });

// For <input type="datetime-local">: the Cairo wall time of an instant, and back.
export function toLocalInput(v) {
    if (!v) return '';
    const d = new Date(v);
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function fromLocalInput(value) {
    if (!value) return null;
    // Read the typed time as Cairo time whatever the browser's zone.
    const naive = new Date(`${value}:00Z`).getTime();
    const offset = (ms) => {
        const w = toLocalInput(ms);
        return new Date(`${w}:00Z`).getTime() - Math.floor(ms / 60000) * 60000;
    };
    const guess = naive - offset(naive);
    return new Date(naive - offset(guess)).toISOString();
}

// Moves a YYYY-MM-DD date by one period.
export function shiftDate(date, period, step) {
    const [y, m, d] = date.split('-').map(Number);
    const t = period === 'day' ? Date.UTC(y, m - 1, d + step)
        : period === 'week' ? Date.UTC(y, m - 1, d + 7 * step)
            : period === 'month' ? Date.UTC(y, m - 1 + step, 1)
                : Date.UTC(y + step, 0, 1);
    return new Date(t).toISOString().slice(0, 10);
}

// The colour of a day by its hours (month view and the legend).
export function dayTone(seconds) {
    const h = (seconds || 0) / 3600;
    if (h <= 0) return 'bg-muted';
    if (h >= 8) return 'bg-emerald-500';
    if (h >= 6) return 'bg-emerald-300 dark:bg-emerald-700';
    return 'bg-amber-400';
}
