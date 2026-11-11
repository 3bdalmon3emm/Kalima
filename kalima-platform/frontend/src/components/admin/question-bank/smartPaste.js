// Splits a question copied from Word or a PDF into the question text and its
// options. Options are lines that start with a marker such as "أ)", "ب-",
// "a.", "B)", "1-", "(2)", "-" or "•"; when no line has a marker, the first
// line is the question and every other line is an option, but only if one of
// them is marked correct (otherwise the whole paste is the question, as in an
// essay question). A trailing "*" or "(صح)" / "(correct)" on an option marks
// it correct.

const ARABIC_LETTERS = 'أابجدهوزحطيكلمنسعفصقرشتثخذضظغ';
const MARKER = new RegExp(
    String.raw`^\s*(?:[(\[]?\s*(?:[${ARABIC_LETTERS}]|[a-zA-Z]|\d{1,2}|[٠-٩]{1,2})\s*[)\].\-:ـ–]|[-•●▪◦*–])\s*`,
);
const CORRECT = /\s*(?:\*|\(\s*(?:صح|صحيح|الإجابة|correct|answer)\s*\)|✓|✔)\s*$/i;
const QUESTION_PREFIX = /^\s*(?:س\s*\d*\s*[:/\-.)]|سؤال\s*\d*\s*[:/\-.)]|Q\s*\d*\s*[:.)\-]|\d{1,3}\s*[).\-])\s*/i;

// A paste on the folder page ({ text, image }), kept here for the new question
// page it opens. That page reads it only when it was opened by the paste.
let pendingPaste = null;
export const setPendingPaste = (paste) => { pendingPaste = paste; };
export const getPendingPaste = () => pendingPaste;

// Teachers underline the correct answer in Word. A copy from Word carries
// HTML where underlined text sits in <u> or has text-decoration: underline;
// an option line that is mostly underlined gets the "*" correct mark. The
// question line is never marked (it may underline a word being asked about).
const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'TR', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'TABLE', 'BLOCKQUOTE']);

function isUnderlined(el) {
    if (el.tagName === 'U' || el.tagName === 'INS') return true;
    const style = (el.getAttribute('style') || '').toLowerCase();
    return /text-decoration[^;]*underline/.test(style) || /text-underline\s*:\s*(?!none)[a-z]/.test(style);
}

function htmlLines(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const lines = [];
    let line = { text: '', under: [] };
    const flush = () => {
        if (line.text.trim()) lines.push(line);
        line = { text: '', under: [] };
    };
    const walk = (node, under) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const value = node.nodeValue.replace(/[\s ]+/g, ' ');
            line.text += value;
            line.under.push(...Array.from(value, () => under));
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE || ['STYLE', 'SCRIPT'].includes(node.tagName)) return;
        if (node.tagName === 'BR') return flush();
        const block = BLOCK_TAGS.has(node.tagName);
        if (block) flush();
        node.childNodes.forEach((child) => walk(child, under || isUnderlined(node)));
        if (block) flush();
    };
    walk(doc.body, false);
    flush();
    return lines;
}

// The pasted text, with "*" after each underlined option line. Plain text when
// the paste has no HTML or nothing in it is underlined.
export function pastedText({ text, html }) {
    if (!html) return text || '';
    const lines = htmlLines(html);
    let found = false;
    const marked = lines.map((line, i) => {
        const raw = line.text.trim();
        if (i === 0) return raw;
        // Measure only the option itself, not its "أ)" marker.
        const start = line.text.length - line.text.trimStart().length + (raw.match(MARKER)?.[0].length || 0);
        const chars = Array.from(line.text).slice(start);
        const flags = line.under.slice(start);
        const visible = chars.filter((c) => c.trim()).length;
        const underlined = chars.filter((c, j) => c.trim() && flags[j]).length;
        if (!visible || underlined / visible < 0.5) return raw;
        found = true;
        return `${raw.replace(CORRECT, '')} *`;
    });
    return found ? marked.join('\n') : text || marked.join('\n');
}

// The question type a paste points to: no options is an essay, two options
// with one marked is true/false, more than one marked is multiple answers,
// else a single answer.
export function pastedType({ options }) {
    if (!options.length) return 'essay';
    const correct = options.filter((o) => o.is_correct).length;
    if (options.length === 2 && correct === 1) return 'true_false';
    if (correct > 1) return 'mcq_multi';
    return 'mcq_single';
}

export function parseSmartPaste(raw) {
    const lines = String(raw || '')
        .replace(/\r/g, '')
        .split('\n')
        .map((l) => l.replace(/ /g, ' ').trim())
        .filter(Boolean);
    if (!lines.length) return { stem: '', options: [] };

    // The first line is always the question, even if it is numbered "1-".
    const optionStart = lines.findIndex((l, i) => i > 0 && MARKER.test(l));
    let stemLines;
    let optionLines;
    if (optionStart > 0) {
        stemLines = lines.slice(0, optionStart);
        optionLines = [];
        for (const line of lines.slice(optionStart)) {
            if (MARKER.test(line) || !optionLines.length) optionLines.push(line);
            else optionLines[optionLines.length - 1] += ` ${line}`; // wrapped option
        }
    } else if (lines.slice(1).some((l) => CORRECT.test(l))) {
        stemLines = [lines[0]];
        optionLines = lines.slice(1);
    } else {
        stemLines = lines;
        optionLines = [];
    }

    const stem = stemLines.join('\n').replace(QUESTION_PREFIX, '').trim();
    const options = optionLines.map((line) => {
        const is_correct = CORRECT.test(line);
        const text = line.replace(CORRECT, '').replace(MARKER, '').trim();
        return { text, is_correct };
    }).filter((o) => o.text);

    return { stem, options };
}
