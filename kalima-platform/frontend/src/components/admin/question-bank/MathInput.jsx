import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sigma, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { MATH_OPEN, MATH_CLOSE } from './math';
import MathText from './MathText';
import { fieldFontStyle, useQuestionFontContext } from './fonts';

// The equation under the cursor, if the cursor sits inside \( ... \).
function equationAt(text, pos) {
    const start = text.lastIndexOf(MATH_OPEN, pos);
    if (start < 0) return null;
    const end = text.indexOf(MATH_CLOSE, start + 2);
    if (end < 0 || pos > end + 2) return null;
    const closedBefore = text.lastIndexOf(MATH_CLOSE, pos - 1);
    if (closedBefore > start && closedBefore + 2 <= pos && closedBefore !== end) return null;
    return { start, end: end + 2, latex: text.slice(start + 2, end) };
}

// Text field with an equation editor: the math keyboard writes LaTeX that is
// stored inside the text between \( and \), and a preview shows the result.
export default function MathInput({ value, onChange, placeholder, multiline = true, rows = 3, className }) {
    const { t } = useTranslation('questionBank');
    const fieldRef = useRef(null);
    const mathRef = useRef(null);
    const panelRef = useRef(null);
    const [editing, setEditing] = useState(null); // { start, end, latex }
    const look = useQuestionFontContext();

    const openEditor = () => {
        const el = fieldRef.current;
        const text = value || '';
        const pos = el ? el.selectionStart ?? text.length : text.length;
        setEditing(equationAt(text, pos) || { start: pos, end: pos, latex: '' });
    };

    useEffect(() => {
        if (!editing || !mathRef.current) return;
        const mf = mathRef.current;
        mf.value = editing.latex;
        mf.mathVirtualKeyboardPolicy = 'manual';
        const show = () => window.mathVirtualKeyboard?.show();
        // A click anywhere outside the editor and the keyboard hides the
        // keyboard; a click back on the equation shows it again.
        const hideOutside = (e) => {
            const inside = e.composedPath().some((el) => el === panelRef.current || el.classList?.contains('ML__keyboard'));
            if (!inside) window.mathVirtualKeyboard?.hide();
        };
        mf.addEventListener('focusin', show);
        mf.addEventListener('pointerdown', show);
        document.addEventListener('pointerdown', hideOutside, true);
        const timer = setTimeout(() => {
            mf.focus();
            show();
        }, 0);
        return () => {
            clearTimeout(timer);
            mf.removeEventListener('focusin', show);
            mf.removeEventListener('pointerdown', show);
            document.removeEventListener('pointerdown', hideOutside, true);
            window.mathVirtualKeyboard?.hide();
        };
    }, [editing]);

    const insert = () => {
        const latex = (mathRef.current?.value || '').trim();
        const text = value || '';
        const piece = latex ? `${MATH_OPEN}${latex}${MATH_CLOSE}` : '';
        onChange(text.slice(0, editing.start) + piece + text.slice(editing.end));
        setEditing(null);
    };

    const Field = multiline ? Textarea : Input;
    const hasMath = (value || '').includes(MATH_OPEN);

    return (
        <div className={className}>
            <div className="flex gap-2 items-start">
                <Field
                    ref={fieldRef}
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    dir="auto"
                    rows={multiline ? rows : undefined}
                    className="flex-1"
                    style={fieldFontStyle(look, !multiline)}
                />
                <Button type="button" variant="outline" size="icon" onClick={openEditor} title={t('math.insert')}>
                    <Sigma className="h-4 w-4" />
                </Button>
            </div>

            {editing && (
                <div ref={panelRef} className="mt-2 rounded-md border bg-muted/40 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">{t('math.hint')}</p>
                    <math-field
                        ref={mathRef}
                        dir="ltr"
                        style={{
                            display: 'block',
                            width: '100%',
                            fontSize: '1.25rem',
                            padding: '0.5rem',
                            borderRadius: '0.375rem',
                            background: 'var(--background)',
                            // The equation follows the theme's text color (light in dark mode).
                            color: 'var(--foreground)',
                            '--caret-color': 'var(--foreground)',
                        }}
                    />
                    <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={insert}>
                            <Check className="h-4 w-4 no-flip" />
                            {editing.latex ? t('math.update') : t('math.add')}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                            <X className="h-4 w-4" />
                            {t('common.cancel')}
                        </Button>
                    </div>
                </div>
            )}

            {hasMath && !editing && (
                <div className="mt-2 rounded-md border border-dashed p-2 text-sm">
                    <span className="text-xs text-muted-foreground block mb-1">{t('math.preview')}</span>
                    <MathText text={value} />
                </div>
            )}
        </div>
    );
}
