import 'mathlive/fonts.css';
import 'mathlive/static.css';
import { MathfieldElement, convertLatexToMarkup } from 'mathlive';

// Question text is plain text with equations written as LaTeX between \( and \).
// The same format is used by the stem, options, explanations, model answers
// and smart paste, and the student screen will render it the same way.

// Fonts come from the imported CSS (bundled by Vite); no runtime fetching.
MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

export const MATH_OPEN = '\\(';
export const MATH_CLOSE = '\\)';

// Splits text into [{ type: 'text' | 'math', value }].
export function splitMath(text = '') {
    const parts = [];
    let rest = text;
    while (rest) {
        const start = rest.indexOf(MATH_OPEN);
        if (start < 0) {
            parts.push({ type: 'text', value: rest });
            break;
        }
        const end = rest.indexOf(MATH_CLOSE, start + 2);
        if (end < 0) {
            parts.push({ type: 'text', value: rest });
            break;
        }
        if (start > 0) parts.push({ type: 'text', value: rest.slice(0, start) });
        parts.push({ type: 'math', value: rest.slice(start + 2, end) });
        rest = rest.slice(end + 2);
    }
    return parts;
}

export function latexToHtml(latex) {
    try {
        return convertLatexToMarkup(latex);
    } catch {
        return null;
    }
}
