import axios from '@/api/axios';
import { shrinkImage } from '@/lib/imageFile';

// Helpers around the student exam API (/api/v2/exams). The tab that opened
// an attempt last keeps its token in sessionStorage and sends it with every
// save, so a second tab or device takes over and this one stops saving.

const tokenKey = (attemptId) => `exam-attempt-token-${attemptId}`;

export function getAttemptToken(attemptId) {
    try { return sessionStorage.getItem(tokenKey(attemptId)); } catch { return null; }
}

export function setAttemptToken(attemptId, token) {
    try {
        if (token) sessionStorage.setItem(tokenKey(attemptId), token);
        else sessionStorage.removeItem(tokenKey(attemptId));
    } catch { /* private mode */ }
}

const headers = (attemptId) => {
    const token = getAttemptToken(attemptId);
    return token ? { 'X-Attempt-Token': token } : {};
};

export async function examGet(path, attemptId) {
    const res = await axios.get(`/exams${path}`, { headers: attemptId ? headers(attemptId) : {} });
    return res.data.data;
}

export async function examSend(method, path, body, attemptId) {
    const res = await axios({ method, url: `/exams${path}`, data: body, headers: attemptId ? headers(attemptId) : {} });
    return res.data.data;
}

export async function uploadAnswerPhoto(attemptId, file) {
    const form = new FormData();
    // Shrunk in the browser first: faster on mobile data and lighter on the server.
    form.append('file', await shrinkImage(file));
    const res = await axios.post(`/exams/attempts/${attemptId}/files`, form, { headers: headers(attemptId) });
    return res.data.data;
}

// Text sizes the student can pick for the whole exam.
export const TEXT_SCALES = [0.9, 1, 1.15, 1.3, 1.5];
const SCALE_KEY = 'exam-text-scale';
export function savedScale() {
    try {
        const v = Number(localStorage.getItem(SCALE_KEY));
        return TEXT_SCALES.includes(v) ? v : 1;
    } catch { return 1; }
}
export function saveScale(v) {
    try { localStorage.setItem(SCALE_KEY, String(v)); } catch { /* ignore */ }
}

export function requestFullscreen() {
    const el = document.documentElement;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fn && !document.fullscreenElement) fn.call(el).catch?.(() => {});
}

export const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
export const fullscreenSupported = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);

// Numbers shown to the student: 1, 2, 3... in order, passage questions
// included, so the last number is the question count.
export function numbering(sections) {
    const labels = new Map();
    let n = 0;
    for (const s of sections) {
        for (const id of s.question_ids) labels.set(id, String(++n));
    }
    return labels;
}

// Passage questions sit together: for each, which passage it belongs to
// (1, 2, 3 in exam order), its place in that passage and the passage's size.
export function passageNumbers(ids, passageOf) {
    const info = new Map();
    let count = 0;
    let last = null;
    let group = [];
    const close = () => group.forEach((id, i) => info.set(id, { ...info.get(id), index: i + 1, size: group.length }));
    for (const id of ids) {
        const pid = passageOf(id);
        if (pid && pid === last) { group.push(id); info.set(id, { n: count }); continue; }
        close();
        group = [];
        last = pid || null;
        if (pid) { count += 1; group = [id]; info.set(id, { n: count }); }
    }
    close();
    return info;
}

export const isAnswered = (q, answer) => {
    if (!answer) return false;
    if (q.type === 'essay') return !!(answer.text?.trim() || answer.file_ids?.length);
    if (q.type === 'matching') return (answer.pairs?.length || 0) > 0;
    return (answer.option_ids?.length || 0) > 0;
};
