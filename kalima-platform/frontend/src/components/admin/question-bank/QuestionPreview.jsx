import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import MathText from './MathText';
import { columnLetter, mediaUrl } from './api';
import { QuestionFontContext, useQuestionFont } from './fonts';

const DIFFICULTY_STYLE = {
    easy: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    hard: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    very_hard: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export function QuestionBadges({ q }) {
    const { t } = useTranslation('questionBank');
    return (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant="outline" className="font-mono" dir="ltr">{q.serial}</Badge>
            {q.reference_no && <Badge variant="secondary">{t('card.ref')}: {q.reference_no}</Badge>}
            <Badge variant="secondary">{t(`types.${q.type}`)}</Badge>
            {q.difficulty && <Badge className={DIFFICULTY_STYLE[q.difficulty]}>{t(`difficulty.${q.difficulty}`)}</Badge>}
            {q.category && (
                <Badge variant="outline">
                    {q.category.name}{q.subcategory ? ` / ${q.subcategory.name}` : ''}
                </Badge>
            )}
        </div>
    );
}

function Media({ image, audio, small }) {
    return (
        <>
            {image?.url && <img src={mediaUrl(image.url)} alt="" className={small ? 'max-h-16 rounded border' : 'max-h-48 rounded border'} />}
            {audio?.url && <audio src={mediaUrl(audio.url)} controls className="max-w-full h-9" />}
        </>
    );
}

// Read-only view of a question as stored in the bank, in its font.
export default function QuestionPreview({ q }) {
    const { t, i18n } = useTranslation('questionBank');
    const [details, setDetails] = useState(false);
    const left = (q.matching_items || []).filter((m) => m.side === 'left');
    const right = (q.matching_items || []).filter((m) => m.side === 'right');
    const letter = (i) => columnLetter(i, i18n.language);
    const pairs = left
        .map((m, i) => ({ n: i + 1, to: right.findIndex((r) => r.id === m.match_item_id) }))
        .filter((p) => p.to >= 0);
    const pairArrow = i18n.dir() === 'rtl' ? '←' : '→';
    const hasDetails = q.explanation_mode !== 'none' || q.type === 'essay';
    const look = useQuestionFont(q.font);

    return (
        <QuestionFontContext.Provider value={look}>
        <div className="space-y-3">
            <div className="space-y-2">
                <MathText text={q.stem_text} className="block leading-7" />
                <div className="flex flex-wrap gap-3 items-start">
                    <Media image={q.stem_image} audio={q.stem_audio} />
                </div>
            </div>

            {q.options?.length > 0 && (
                <ul className="space-y-1.5">
                    {q.options.map((o, i) => (
                        <li key={o.id} className={`flex items-start gap-2 rounded px-2 py-1 ${o.is_correct ? 'bg-green-50 dark:bg-green-950/30' : ''}`}>
                            {o.is_correct
                                ? <CheckCircle2 className="h-4 w-4 mt-1 text-green-600 shrink-0 no-flip" />
                                : <Circle className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />}
                            {/* An option's label takes the place of its number. */}
                            <span className={`text-sm shrink-0 min-w-4 ${o.label ? 'font-semibold' : 'text-muted-foreground'}`}>{o.label || i + 1}</span>
                            <div className="space-y-1">
                                <MathText text={o.text} className="text-sm" />
                                <Media image={o.image} small />
                                {details && o.explanation_text && (
                                    <p className="text-xs text-muted-foreground"><MathText text={o.explanation_text} /></p>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {q.type === 'matching' && (
                <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                        <ul className="space-y-1.5">
                            {left.map((m, i) => (
                                <li key={m.id} className="flex items-start gap-2">
                                    <Badge variant="secondary">{i + 1}</Badge>
                                    <div className="space-y-1">
                                        <MathText text={m.text} />
                                        <Media image={m.image} audio={m.audio} small />
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <ul className="space-y-1.5 border-s ps-4">
                            {right.map((m, i) => (
                                <li key={m.id} className="flex items-start gap-2">
                                    <Badge variant="secondary">{letter(i)}</Badge>
                                    <div className="space-y-1">
                                        <MathText text={m.text} />
                                        <Media image={m.image} audio={m.audio} small />
                                    </div>
                                    {!left.some((l) => l.match_item_id === m.id) && (
                                        <Badge variant="outline">{t('editor.decoy')}</Badge>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                    {pairs.length > 0 && (
                        <p className="rounded bg-green-50 px-2 py-1 text-green-700 dark:bg-green-950/30 dark:text-green-400">
                            <span className="font-semibold">{t('card.pairs')}</span>{' '}
                            {pairs.map((p) => `${p.n} ${pairArrow} ${letter(p.to)}`).join(i18n.dir() === 'rtl' ? '،  ' : ',  ')}
                        </p>
                    )}
                </div>
            )}

            {hasDetails && (
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setDetails((v) => !v)}>
                    {details ? t('card.hideDetails') : t('card.showDetails')}
                </button>
            )}
            {details && (
                <div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm">
                    {q.type === 'essay' && (
                        <div>
                            <p className="font-medium mb-1">{t('editor.modelAnswer')}</p>
                            <MathText text={q.model_answer_text} />
                            <Media image={q.model_answer_image} />
                        </div>
                    )}
                    {q.explanation_mode === 'combined_text' && (
                        <div>
                            <p className="font-medium mb-1">{t('editor.explanation')}</p>
                            <MathText text={q.explanation_text} />
                        </div>
                    )}
                    {q.explanation_mode === 'image' && (
                        <div>
                            <p className="font-medium mb-1">{t('editor.explanation')}</p>
                            <Media image={q.explanation_image} />
                        </div>
                    )}
                </div>
            )}
        </div>
        </QuestionFontContext.Provider>
    );
}
