import axios from '@/api/axios';
import { getImageUrl } from '@/lib/storeUtils';

// Small helpers around the question bank API (/api/v2/question-bank).

export const qb = (path) => `/question-bank${path}`;

export async function qbGet(path, params) {
    const res = await axios.get(qb(path), { params });
    return res.data.data;
}

export async function qbSend(method, path, body) {
    const res = await axios({ method, url: qb(path), data: body });
    return res.data;
}

// Uploads an image or audio file to a bank; returns { id, url }.
export async function uploadMedia(file, bankId) {
    const form = new FormData();
    form.append('bank_id', String(bankId));
    form.append('file', file);
    const res = await axios.post(qb('/media'), form);
    return res.data.data;
}

// In R2 mode the API gives signed links; locally it gives /uploads/... on the
// backend's origin.
export const mediaUrl = getImageUrl;

// Labels of the second matching column: أ ب ج ... in Arabic, A B C ... otherwise.
const ARABIC_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي', 'ك', 'ل', 'م', 'ن', 'س', 'ع', 'ف', 'ص', 'ق', 'ر'];
export const columnLetter = (i, lang) => (
    lang?.startsWith('ar') ? ARABIC_LETTERS[i] ?? String(i + 1) : String.fromCharCode(65 + i)
);

export const QUESTION_TYPES = ['mcq_single', 'mcq_multi', 'true_false', 'essay', 'matching'];
export const DIFFICULTIES = ['easy', 'medium', 'hard', 'very_hard'];
