import { Fragment, useMemo } from 'react';
import { splitMath, latexToHtml } from './math';
import { useQuestionFontContext } from './fonts';
import { cn } from '@/lib/utils';

// Shows question text with its equations rendered, in the question's font and
// size when inside a QuestionFontContext.
export default function MathText({ text, className }) {
    const parts = useMemo(() => splitMath(text || ''), [text]);
    const look = useQuestionFontContext();
    if (!text) return null;
    const content = parts.map((part, i) => {
        if (part.type === 'text') return <Fragment key={i}>{part.value}</Fragment>;
        const html = latexToHtml(part.value);
        return html ? (
            <span key={i} dir="ltr" className="inline-block align-middle mx-0.5" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
            <code key={i} dir="ltr">{part.value}</code>
        );
    });
    return (
        <span className={cn('whitespace-pre-wrap break-words', className)}>
            {look ? (
                <span style={{ fontFamily: look.family || undefined, fontSize: look.scale !== 1 ? `${look.scale}em` : undefined, lineHeight: 1.9 }}>
                    {content}
                </span>
            ) : content}
        </span>
    );
}
