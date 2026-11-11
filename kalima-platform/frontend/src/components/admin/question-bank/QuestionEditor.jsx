import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ClipboardPaste, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import MathInput from './MathInput';
import MediaField from './MediaField';
import { DIFFICULTIES, columnLetter } from './api';
import { emptyOption, newKey, withPaste } from './questionForm';
import { parseSmartPaste, pastedText } from './smartPaste';
import { FONT_KEYS, QUESTION_FONTS, QuestionFontContext, loadFonts, useQuestionFont } from './fonts';

const NONE = 'none';

function Section({ title, children, hint }) {
    return (
        <section className="rounded-lg border bg-card p-4 space-y-3">
            <div>
                <h3 className="font-semibold">{title}</h3>
                {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
            </div>
            {children}
        </section>
    );
}

function SmartPasteDialog({ open, onOpenChange, onApply }) {
    const { t } = useTranslation('questionBank');
    const [text, setText] = useState('');
    const parsed = parseSmartPaste(text);
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('smartPaste.title')}</DialogTitle>
                    <DialogDescription>{t('smartPaste.description')}</DialogDescription>
                </DialogHeader>
                <Textarea
                    rows={8}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onPaste={(e) => {
                        // A copy from Word: underlined options become marked correct.
                        const plain = e.clipboardData.getData('text/plain');
                        const marked = pastedText({ text: plain, html: e.clipboardData.getData('text/html') });
                        if (marked === plain) return;
                        e.preventDefault();
                        setText(marked);
                    }}
                    placeholder={t('smartPaste.placeholder')}
                    className="max-h-72"
                />
                {text.trim() && (
                    <div className="rounded-md border p-3 text-sm space-y-1 max-h-48 overflow-y-auto">
                        <p><span className="text-muted-foreground">{t('smartPaste.question')}: </span>{parsed.stem}</p>
                        <ol className="list-decimal ps-5">
                            {parsed.options.map((o, i) => (
                                <li key={i} className={o.is_correct ? 'text-green-600 font-medium' : ''}>{o.text}</li>
                            ))}
                        </ol>
                        <p className="text-xs text-muted-foreground">{t('smartPaste.found', { count: parsed.options.length })}</p>
                    </div>
                )}
                <DialogFooter>
                    <Button
                        disabled={!parsed.stem || parsed.options.length < 2}
                        onClick={() => {
                            onApply(parsed);
                            setText('');
                            onOpenChange(false);
                        }}
                    >
                        {t('smartPaste.apply')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function OptionsEditor({ value, set, bankId }) {
    const { t } = useTranslation('questionBank');
    const { type, options, explanation_mode } = value;
    const single = type === 'mcq_single' || type === 'true_false';
    const fixed = type === 'true_false';

    const update = (key, patch) => set({
        options: options.map((o) => {
            if (o.key === key) return { ...o, ...patch };
            // One correct answer: picking one clears the others.
            if (single && patch.is_correct) return { ...o, is_correct: false };
            return o;
        }),
    });
    const move = (index, dir) => {
        const next = [...options];
        const [item] = next.splice(index, 1);
        next.splice(index + dir, 0, item);
        set({ options: next });
    };

    return (
        <div className="space-y-3">
            {options.map((o, i) => (
                <div key={o.key} className={`rounded-md border p-3 space-y-2 ${o.is_correct ? 'border-green-500 bg-green-50/50 dark:bg-green-950/20' : ''}`}>
                    <div className="flex items-start gap-2">
                        <label className="flex items-center gap-2 pt-2 shrink-0 cursor-pointer">
                            {single ? (
                                <input
                                    type="radio"
                                    className="h-4 w-4 accent-green-600"
                                    checked={o.is_correct}
                                    onChange={() => update(o.key, { is_correct: true })}
                                />
                            ) : (
                                <Checkbox checked={o.is_correct} onCheckedChange={(v) => update(o.key, { is_correct: v === true })} />
                            )}
                            <span className="text-sm font-medium w-5">{i + 1}</span>
                        </label>
                        {/* True/false keeps its two options; their wording can change (e.g. True/False in an English bank). */}
                        <MathInput
                            className="flex-1"
                            multiline={false}
                            value={o.text}
                            onChange={(text) => update(o.key, { text })}
                            placeholder={t('editor.optionText')}
                        />
                        {!fixed && (
                            <div className="flex shrink-0">
                                <Button type="button" variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)}>
                                    <ArrowUp className="h-4 w-4" />
                                </Button>
                                <Button type="button" variant="ghost" size="icon" disabled={i === options.length - 1} onClick={() => move(i, 1)}>
                                    <ArrowDown className="h-4 w-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    disabled={options.length <= 2}
                                    onClick={() => set({ options: options.filter((x) => x.key !== o.key) })}
                                    title={t('editor.removeOption')}
                                >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </div>
                        )}
                    </div>
                    {!fixed && (
                        <div className="flex flex-wrap items-center gap-3 ps-12">
                            <MediaField compact kind="image" bankId={bankId} value={o.image} onChange={(image) => update(o.key, { image })} />
                            <div className="flex items-center gap-2">
                                <Label className="text-xs text-muted-foreground">{t('editor.optionLabel')}</Label>
                                <Input
                                    className="h-8 w-20"
                                    value={o.label}
                                    maxLength={20}
                                    onChange={(e) => update(o.key, { label: e.target.value })}
                                />
                                <span className="text-xs text-muted-foreground">{t('editor.optionLabelHint')}</span>
                            </div>
                        </div>
                    )}
                    {explanation_mode === 'per_option' && (
                        <div className="ps-12">
                            <MathInput
                                rows={2}
                                value={o.explanation_text}
                                onChange={(explanation_text) => update(o.key, { explanation_text })}
                                placeholder={t('editor.optionExplanation')}
                            />
                        </div>
                    )}
                </div>
            ))}
            {!fixed && (
                <Button type="button" variant="outline" onClick={() => set({ options: [...options, emptyOption()] })}>
                    <Plus className="h-4 w-4" />
                    {t('editor.addOption')}
                </Button>
            )}
        </div>
    );
}

function MatchingEditor({ value, set, bankId }) {
    const { t, i18n } = useTranslation('questionBank');
    const items = value.matching_items;
    const left = items.filter((m) => m.side === 'left');
    const right = items.filter((m) => m.side === 'right');
    const paired = new Set(left.map((l) => l.match_key).filter(Boolean));

    const update = (key, patch) => set({ matching_items: items.map((m) => (m.key === key ? { ...m, ...patch } : m)) });
    const add = (side) => set({
        matching_items: [...items, { id: null, key: newKey(), side, text: '', image: null, audio: null, match_key: null }],
    });
    const remove = (key) => set({
        matching_items: items
            .filter((m) => m.key !== key)
            .map((m) => (m.match_key === key ? { ...m, match_key: null } : m)),
    });
    // A right item can belong to one left item only.
    const pair = (leftKey, rightKey) => set({
        matching_items: items.map((m) => {
            if (m.key === leftKey) return { ...m, match_key: rightKey === NONE ? null : rightKey };
            if (m.side === 'left' && rightKey !== NONE && m.match_key === rightKey) return { ...m, match_key: null };
            return m;
        }),
    });

    // A plain function, not a component, so inputs keep focus while typing.
    const itemFields = (m) => (
        <div className="space-y-2">
            <MathInput multiline={false} value={m.text} onChange={(text) => update(m.key, { text })} placeholder={t('editor.itemText')} />
            <div className="flex flex-wrap gap-2">
                <MediaField compact kind="image" bankId={bankId} value={m.image} onChange={(image) => update(m.key, { image })} />
                <MediaField compact kind="audio" bankId={bankId} value={m.audio} onChange={(audio) => update(m.key, { audio })} />
            </div>
        </div>
    );

    return (
        <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
                <h4 className="text-sm font-semibold">{t('editor.leftColumn')}</h4>
                {left.map((m, i) => (
                    <div key={m.key} className="rounded-md border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                            <Badge variant="secondary">{i + 1}</Badge>
                            <Button type="button" variant="ghost" size="icon" onClick={() => remove(m.key)} disabled={left.length <= 1}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        </div>
                        {itemFields(m)}
                        <div className="flex items-center gap-2">
                            <Label className="text-xs shrink-0">{t('editor.pairsWith')}</Label>
                            <Select value={m.match_key || NONE} onValueChange={(v) => pair(m.key, v)}>
                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>{t('editor.noPair')}</SelectItem>
                                    {right.map((r, ri) => (
                                        <SelectItem key={r.key} value={r.key}>
                                            {columnLetter(ri, i18n.language)}{r.text ? ` - ${r.text.slice(0, 30)}` : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => add('left')}>
                    <Plus className="h-4 w-4" />
                    {t('editor.addItem')}
                </Button>
            </div>
            <div className="space-y-3">
                <h4 className="text-sm font-semibold">{t('editor.rightColumn')}</h4>
                {right.map((m, i) => (
                    <div key={m.key} className="rounded-md border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary">{columnLetter(i, i18n.language)}</Badge>
                                {!paired.has(m.key) && <Badge variant="outline">{t('editor.decoy')}</Badge>}
                            </div>
                            <Button type="button" variant="ghost" size="icon" onClick={() => remove(m.key)} disabled={right.length <= 1}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        </div>
                        {itemFields(m)}
                    </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => add('right')}>
                    <Plus className="h-4 w-4" />
                    {t('editor.addItem')}
                </Button>
            </div>
            <p className="text-xs text-muted-foreground md:col-span-2">
                {t('editor.matchingHint', { count: paired.size })}
            </p>
        </div>
    );
}

// Font of the whole question. Children of a passage follow the passage, so
// they only see a note.
function FontFields({ value, set, locked }) {
    const { t } = useTranslation('questionBank');
    useEffect(() => { if (!locked) loadFonts(FONT_KEYS); }, [locked]);
    if (locked) return <p className="text-sm text-muted-foreground self-end">{t('font.followsPassage')}</p>;
    return (
        <div className="space-y-1">
                <Label>{t('font.font')}</Label>
                <Select value={value.font} onValueChange={(font) => set({ font })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {FONT_KEYS.map((f) => (
                            <SelectItem key={f} value={f} style={{ fontFamily: QUESTION_FONTS[f]?.family }}>{t(`font.fonts.${f}`)}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
        </div>
    );
}

// The whole question form. `value` is the editor state from questionForm.js.
// `fontLocked` is set for passage children, which take the passage's font.
export default function QuestionEditor({ value, onChange, bankId, categories = [], fontLocked = false }) {
    const { t } = useTranslation('questionBank');
    const [pasteOpen, setPasteOpen] = useState(false);
    const look = useQuestionFont(value.font);
    const set = (patch) => onChange({ ...value, ...patch });
    const { type } = value;
    const isPassage = type === 'passage';
    const hasOptions = ['mcq_single', 'mcq_multi', 'true_false'].includes(type);
    const subcategories = categories.find((c) => c.id === value.category_id)?.subcategories || [];

    const applyPaste = (parsed) => onChange(withPaste(value, parsed));

    return (
        <QuestionFontContext.Provider value={look}>
        <div className="space-y-4">
            {/* Basics */}
            <Section title={t('editor.basics')}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {!isPassage && (
                        <div className="space-y-1">
                            <Label>{t('editor.difficulty')} *</Label>
                            <Select value={value.difficulty || ''} onValueChange={(difficulty) => set({ difficulty })}>
                                <SelectTrigger><SelectValue placeholder={t('editor.pickDifficulty')} /></SelectTrigger>
                                <SelectContent>
                                    {DIFFICULTIES.map((d) => <SelectItem key={d} value={d}>{t(`difficulty.${d}`)}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    {!isPassage && (
                        <div className="space-y-1">
                            <Label>{t('editor.category')}</Label>
                            <Select
                                value={value.category_id ? String(value.category_id) : NONE}
                                onValueChange={(v) => set({ category_id: v === NONE ? null : Number(v), subcategory_id: null })}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>{t('editor.noCategory')}</SelectItem>
                                    {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    {!isPassage && (
                        <div className="space-y-1">
                            <Label>{t('editor.subcategory')}</Label>
                            <Select
                                value={value.subcategory_id ? String(value.subcategory_id) : NONE}
                                onValueChange={(v) => set({ subcategory_id: v === NONE ? null : Number(v) })}
                                disabled={!subcategories.length}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>{t('editor.noSubcategory')}</SelectItem>
                                    {subcategories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="space-y-1">
                        <Label>{t('editor.referenceNo')}</Label>
                        <Input
                            value={value.reference_no}
                            maxLength={50}
                            onChange={(e) => set({ reference_no: e.target.value })}
                            placeholder={t('editor.referenceNoHint')}
                        />
                    </div>
                    <FontFields value={value} set={set} locked={fontLocked} />
                </div>
            </Section>

            {/* Stem */}
            <Section title={isPassage ? t('editor.passageText') : t('editor.questionText')} hint={t('editor.stemHint')}>
                {hasOptions && type !== 'true_false' && (
                    <Button type="button" variant="secondary" size="sm" onClick={() => setPasteOpen(true)}>
                        <ClipboardPaste className="h-4 w-4" />
                        {t('smartPaste.button')}
                    </Button>
                )}
                <MathInput rows={isPassage ? 8 : 3} value={value.stem_text} onChange={(stem_text) => set({ stem_text })} />
                <div className="flex flex-wrap gap-4">
                    <MediaField kind="image" bankId={bankId} value={value.stem_image} onChange={(stem_image) => set({ stem_image })} />
                    <MediaField kind="audio" bankId={bankId} value={value.stem_audio} onChange={(stem_audio) => set({ stem_audio })} />
                </div>
            </Section>

            {/* Answers */}
            {hasOptions && (
                <Section
                    title={t('editor.options')}
                    hint={type === 'mcq_multi' ? t('editor.multiHint') : type === 'true_false' ? t('editor.tfHint') : t('editor.singleHint')}
                >
                    <OptionsEditor value={value} set={set} bankId={bankId} />
                </Section>
            )}
            {type === 'matching' && (
                <Section title={t('editor.matching')} hint={t('editor.matchingIntro')}>
                    <MatchingEditor value={value} set={set} bankId={bankId} />
                </Section>
            )}
            {type === 'essay' && (
                <Section title={t('editor.modelAnswer')} hint={t('editor.modelAnswerHint')}>
                    <MathInput rows={4} value={value.model_answer_text} onChange={(model_answer_text) => set({ model_answer_text })} />
                    <MediaField kind="image" bankId={bankId} value={value.model_answer_image} onChange={(model_answer_image) => set({ model_answer_image })} />
                </Section>
            )}

            {/* Explanation */}
            {!isPassage && (
                <Section title={t('editor.explanation')} hint={t('editor.explanationHint')}>
                    <Select value={value.explanation_mode} onValueChange={(explanation_mode) => set({ explanation_mode })}>
                        <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">{t('explanation.none')}</SelectItem>
                            <SelectItem value="combined_text">{t('explanation.combined_text')}</SelectItem>
                            {hasOptions && <SelectItem value="per_option">{t('explanation.per_option')}</SelectItem>}
                            <SelectItem value="image">{t('explanation.image')}</SelectItem>
                        </SelectContent>
                    </Select>
                    {value.explanation_mode === 'combined_text' && (
                        <MathInput rows={4} value={value.explanation_text} onChange={(explanation_text) => set({ explanation_text })} />
                    )}
                    {value.explanation_mode === 'image' && (
                        <MediaField kind="image" bankId={bankId} value={value.explanation_image} onChange={(explanation_image) => set({ explanation_image })} />
                    )}
                    {value.explanation_mode === 'per_option' && (
                        <p className="text-sm text-muted-foreground">{t('editor.perOptionHint')}</p>
                    )}
                </Section>
            )}

            <SmartPasteDialog open={pasteOpen} onOpenChange={setPasteOpen} onApply={applyPaste} />
        </div>
        </QuestionFontContext.Provider>
    );
}
