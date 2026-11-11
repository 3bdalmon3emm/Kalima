import { createContext, useContext, useEffect } from 'react';

// Fonts a teacher can pick for a question. All are free fonts (SIL Open Font
// License / Apache) served from Google Fonts, and a font is loaded only when a
// question on the page uses it. "times" looks like Times New Roman without
// using it: Tinos (same shapes and widths) for Latin letters and digits, and
// Noto Naskh Arabic for Arabic, which Tinos does not have.
export const QUESTION_FONTS = {
    default: null,
    amiri: { family: "'Amiri', serif", load: 'Amiri:ital,wght@0,400;0,700;1,400' },
    scheherazade: { family: "'Scheherazade New', serif", load: 'Scheherazade+New:wght@400;700' },
    naskh: { family: "'Noto Naskh Arabic', serif", load: 'Noto+Naskh+Arabic:wght@400;700' },
    times: { family: "'Tinos', 'Noto Naskh Arabic', serif", load: 'Tinos:ital,wght@0,400;0,700;1,400' },
};
export const FONT_KEYS = Object.keys(QUESTION_FONTS);

const loaded = new Set();
export function loadFonts(keys) {
    const families = [...new Set(keys.flatMap((key) => (key === 'times' ? ['times', 'naskh'] : [key])))]
        .filter((key) => QUESTION_FONTS[key]?.load && !loaded.has(key));
    if (!families.length) return;
    families.forEach((key) => loaded.add(key));
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${families.map((key) => `family=${QUESTION_FONTS[key].load}`).join('&')}&display=swap`;
    document.head.appendChild(link);
}

// The look of a question: { family, scale }, or null for the platform font at
// the normal size. The teacher picks the font; the scale is the text size the
// student picks in the exam (1 = normal).
export function questionFont(font, scale = 1) {
    const family = QUESTION_FONTS[font]?.family || null;
    return family || scale !== 1 ? { family, scale } : null;
}

export function useQuestionFont(font, scale = 1) {
    useEffect(() => { if (font) loadFonts([font]); }, [font]);
    return questionFont(font, scale);
}

// Question text (MathText) and the editor fields inside a provider show in
// the question's font, at the size the provider gives.
export const QuestionFontContext = createContext(null);
export const useQuestionFontContext = () => useContext(QuestionFontContext);

// Style for a text field (whose own size is 0.875rem) in the current font.
export function fieldFontStyle(look, single) {
    if (!look) return undefined;
    return {
        fontFamily: look.family || undefined,
        fontSize: look.scale !== 1 ? `${0.875 * look.scale}rem` : undefined,
        lineHeight: look.family || look.scale !== 1 ? 1.9 : undefined,
        height: single ? 'auto' : undefined,
    };
}
