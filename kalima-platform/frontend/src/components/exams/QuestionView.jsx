import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import LoadingSpinner from '@/components/ui/loading-spinner';
import MathText from '@/components/admin/question-bank/MathText';
import { columnLetter, mediaUrl } from '@/components/admin/question-bank/api';

export function Media({ image, audio, className = 'max-h-72' }) {
    return (
        <>
            {image?.url && <img src={mediaUrl(image.url)} alt="" className={`${className} max-w-full rounded border bg-white`} draggable={false} />}
            {audio?.url && <audio src={mediaUrl(audio.url)} controls controlsList="nodownload" className="w-full max-w-md" />}
        </>
    );
}

// Letter or label in front of an option: the option's own label when it has
// one (it points at a numbered shape in the picture), else أ ب ج / A B C.
const marker = (option, i, lang) => option.label || columnLetter(i, lang);

function Choices({ q, answer, onChange }) {
    const { t, i18n } = useTranslation('exams');
    const chosen = new Set(answer?.option_ids || []);
    const multi = q.type === 'mcq_multi' || q.multiple;
    const pick = (id) => {
        if (multi) {
            const next = new Set(chosen);
            if (next.has(id)) next.delete(id); else next.add(id);
            onChange({ option_ids: [...next] });
        } else {
            onChange({ option_ids: chosen.has(id) ? [] : [id] });
        }
    };
    return (
        <div className="space-y-2">
            {multi && (
                <p className="flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                    <AlertCircle className="h-4 w-4 shrink-0" />{t('take.multiWarning')}
                </p>
            )}
            {q.options.map((o, i) => {
                const on = chosen.has(o.id);
                return (
                    <button
                        key={o.id}
                        type="button"
                        onClick={() => pick(o.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-start text-base transition-all ${on ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-background hover:border-primary/40 hover:bg-muted/40'}`}
                    >
                        <span className={`flex h-8 min-w-8 shrink-0 items-center justify-center px-1 font-semibold ${multi ? 'rounded-md' : 'rounded-full'} ${on ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                            {on ? <Check className="h-4 w-4 no-flip" /> : marker(o, i, i18n.language)}
                        </span>
                        <span className="flex-1 space-y-2 pt-0.5">
                            {o.text && <MathText text={o.text} />}
                            <Media image={o.image} className="max-h-40" />
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

const NO_PAIRS = [];

// Matching with lines: tap an item on the right side of the question, then
// its partner; a line joins them. Tapping a joined item undoes its line.
function Matching({ q, answer, onChange }) {
    const { t, i18n } = useTranslation('exams');
    const pairs = answer?.pairs || NO_PAIRS;
    const pairsKey = JSON.stringify(pairs);
    const [active, setActive] = useState(null);
    const box = useRef(null);
    const refs = useRef(new Map());
    const [lines, setLines] = useState([]);
    const partnerOf = (leftId) => pairs.find((p) => p[0] === leftId)?.[1];
    const leftOf = (rightId) => pairs.find((p) => p[1] === rightId)?.[0];

    const connect = (leftId, rightId) => {
        const rest = pairs.filter((p) => p[0] !== leftId && p[1] !== rightId);
        onChange({ pairs: [...rest, [leftId, rightId]] });
    };
    const clickLeft = (id) => {
        if (partnerOf(id) !== undefined) { onChange({ pairs: pairs.filter((p) => p[0] !== id) }); return; }
        if (active?.side === 'right') { connect(id, active.id); setActive(null); } else setActive({ side: 'left', id });
    };
    const clickRight = (id) => {
        if (leftOf(id) !== undefined) { onChange({ pairs: pairs.filter((p) => p[1] !== id) }); return; }
        if (active?.side === 'left') { connect(active.id, id); setActive(null); } else setActive({ side: 'right', id });
    };

    useLayoutEffect(() => {
        const draw = () => {
            const base = box.current?.getBoundingClientRect();
            if (!base) return;
            const rtl = i18n.dir() === 'rtl';
            const next = pairs.map(([l, r]) => {
                const a = refs.current.get(`l${l}`)?.getBoundingClientRect();
                const b = refs.current.get(`r${r}`)?.getBoundingClientRect();
                if (!a || !b) return null;
                const ax = (rtl ? a.left : a.right) - base.left;
                const bx = (rtl ? b.right : b.left) - base.left;
                return { key: `${l}-${r}`, x1: ax, y1: a.top + a.height / 2 - base.top, x2: bx, y2: b.top + b.height / 2 - base.top };
            }).filter(Boolean);
            // Only a real change re-renders; the observer fires on every layout.
            setLines((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
        };
        draw();
        window.addEventListener('resize', draw);
        const obs = new ResizeObserver(draw);
        if (box.current) obs.observe(box.current);
        return () => { window.removeEventListener('resize', draw); obs.disconnect(); };
    }, [pairsKey, i18n]); // eslint-disable-line react-hooks/exhaustive-deps

    const item = (it, side, label) => {
        const linked = side === 'left' ? partnerOf(it.id) !== undefined : leftOf(it.id) !== undefined;
        const on = active?.side === side && active.id === it.id;
        return (
            <button
                key={it.id}
                ref={(el) => refs.current.set(`${side[0]}${it.id}`, el)}
                type="button"
                onClick={() => (side === 'left' ? clickLeft(it.id) : clickRight(it.id))}
                className={`relative z-10 flex w-full items-start gap-2 rounded-lg border-2 bg-background p-2.5 text-start transition-colors ${on ? 'border-primary ring-2 ring-primary/30' : linked ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/40'}`}
            >
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">{label}</span>
                <span className="flex-1 space-y-1.5">
                    {it.text && <MathText text={it.text} />}
                    <Media image={it.image} audio={it.audio} className="max-h-28" />
                </span>
            </button>
        );
    };

    return (
        <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t('take.matchingHint')}</p>
            <div ref={box} className="relative grid grid-cols-2 gap-x-16 sm:gap-x-24 gap-y-0">
                <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                    {lines.map((l) => (
                        <g key={l.key}>
                            <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" />
                            <circle cx={l.x1} cy={l.y1} r="4" fill="var(--primary)" />
                            <circle cx={l.x2} cy={l.y2} r="4" fill="var(--primary)" />
                        </g>
                    ))}
                </svg>
                <div className="space-y-3">{q.matching.left.map((it, i) => item(it, 'left', i + 1))}</div>
                <div className="space-y-3">{q.matching.right.map((it, i) => item(it, 'right', columnLetter(i, i18n.language)))}</div>
            </div>
        </div>
    );
}

function Essay({ q, answer, onChange, files, onUpload, uploading }) {
    const { t } = useTranslation('exams');
    const input = useRef(null);
    const ids = answer?.file_ids || [];
    return (
        <div className="space-y-3">
            <Textarea
                rows={8}
                value={answer?.text || ''}
                placeholder={t('take.essayPlaceholder')}
                onChange={(e) => onChange({ text: e.target.value, file_ids: ids })}
            />
            <div className="flex flex-wrap gap-2">
                {ids.map((fid) => {
                    const f = files.find((x) => x.id === fid);
                    return (
                        <div key={fid} className="relative">
                            {f?.url && <img src={mediaUrl(f.url)} alt="" className="h-24 w-24 rounded border object-cover" />}
                            <button type="button" className="absolute -top-2 -end-2 rounded-full bg-destructive p-0.5 text-white" onClick={() => onChange({ text: answer?.text || '', file_ids: ids.filter((x) => x !== fid) })}>
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    );
                })}
            </div>
            <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) onUpload(file, (uploaded) => onChange({ text: answer?.text || '', file_ids: [...ids, uploaded.id] }));
            }} />
            <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={uploading || ids.length >= 10}>
                {uploading ? <LoadingSpinner className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}{t('take.addPhoto')}
            </Button>
        </div>
    );
}

export default function QuestionView({ q, answer, onChange, files, onUpload, uploading }) {
    return (
        <div className="space-y-5">
            {q.stem_text && <div className="text-xl font-medium leading-relaxed"><MathText text={q.stem_text} className="block" /></div>}
            <div className="flex flex-wrap gap-3"><Media image={q.stem_image} audio={q.stem_audio} /></div>
            {['mcq_single', 'mcq_multi', 'true_false'].includes(q.type) && <Choices q={q} answer={answer} onChange={onChange} />}
            {q.type === 'matching' && <Matching q={q} answer={answer} onChange={onChange} />}
            {q.type === 'essay' && <Essay q={q} answer={answer} onChange={onChange} files={files} onUpload={onUpload} uploading={uploading} />}
        </div>
    );
}
