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

// The same helpers for the teacher's side (/api/v2/exam-teacher).
export const teacherApi = {
    url: (path) => `/exam-teacher${path}`,
    get: async (path, params) => (await axios.get(`/exam-teacher${path}`, { params })).data.data,
    send: async (method, path, body) => (await axios({ method, url: `/exam-teacher${path}`, data: body })).data,
};
export const adminApi = { url: ex, get: exGet, send: exSend };

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'very_hard'];

// The public address students open (printed QR codes point here), never
// the address this page happens to run on.
export const PUBLIC_APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL || 'https://kalima-edu.com').replace(/\/+$/, '');
export const examLink = (code) => `${PUBLIC_APP_URL}/e/${code}`;

// "2026-11-11T20:30" for <input type="datetime-local"> in local time.
export function toLocalInput(value) {
    if (!value) return '';
    const d = new Date(value);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const formatMark = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
