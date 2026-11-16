import axios from '@/api/axios';

// Helpers around the exam admin API (/api/v2/exam-admin).

export const ex = (path) => `/exam-admin${path}`;

export async function exGet(path, params) {
    const res = await axios.get(ex(path), { params });
    return res.data.data;
}

export async function exSend(method, path, body) {
    const res = await axios({ method, url: ex(path), data: body });
    return res.data;
}

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'very_hard'];

// The link students open; the code is the last part.
export const examLink = (code) => `${window.location.origin}/e/${code}`;

// "2026-11-11T20:30" for <input type="datetime-local"> in local time.
export function toLocalInput(value) {
    if (!value) return '';
    const d = new Date(value);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const formatMark = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
