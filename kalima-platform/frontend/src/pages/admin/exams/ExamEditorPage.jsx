import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, Archive, ChevronLeft, Copy, Dices, ExternalLink, Plus, Save, Trash2, Undo2, Upload } from 'lucide-react';
import axios from '@/api/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import LoadingSpinner from '@/components/ui/loading-spinner';
import MathText from '@/components/admin/question-bank/MathText';
import SortableList from '@/components/admin/question-bank/SortableList';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import BankPicker from '@/components/admin/exams/BankPicker';
import RulesEditor from '@/components/admin/exams/RulesEditor';
import { examLink, exGet, exSend, formatMark, toLocalInput } from '@/components/admin/exams/api';

const SETTING_FIELDS = ['name', 'description', 'serial', 'subject_id', 'type', 'target_total', 'duration_minutes', 'pass_percent', 'redo_percent', 'max_redos', 'redo_required', 'redo_new_questions', 'shuffle', 'show_answers'];

function SettingsTab({ exam, onSaved }) {
    const { t } = useTranslation('exams');
    const [form, setForm] = useState({});
    const [subjects, setSubjects] = useState([]);
    const [saving, setSaving] = useState(false);
    useEffect(() => { setForm(Object.fromEntries(SETTING_FIELDS.map((f) => [f, exam[f] ?? '']))); }, [exam]);
    useEffect(() => { axios.get('/subjects').then((r) => setSubjects(r.data?.data || [])).catch(() => {}); }, []);
    const set = (patch) => setForm((f) => ({ ...f, ...patch }));

    const save = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const blank = (v) => (v === '' || v === null ? null : v);
            await exSend('patch', `/exams/${exam.id}`, {
                ...form,
                description: blank(form.description),
                serial: blank(form.serial),
                subject_id: blank(form.subject_id),
                target_total: blank(form.target_total),
                duration_minutes: blank(form.duration_minutes),
                redo_percent: blank(form.redo_percent),
                max_redos: form.max_redos === '' ? 0 : form.max_redos,
            });
            toast.success(t('settings.saved'));
            onSaved();
        } catch (err) {
            showError(err, t('errors.save'));
        } finally {
            setSaving(false);
        }
    };

    const field = (name, label, props = {}, hint) => (
        <div className="space-y-1">
            <Label>{label}</Label>
            <Input value={form[name] ?? ''} onChange={(e) => set({ [name]: e.target.value })} {...props} />
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
    );
    const toggle = (name, label, hint, disabled) => (
        <label className={`flex items-start justify-between gap-4 rounded-md border p-3 ${disabled ? 'opacity-50' : ''}`}>
            <span><span className="font-medium block text-sm">{label}</span><span className="text-xs text-muted-foreground">{hint}</span></span>
            <Switch checked={!!form[name]} disabled={disabled} onCheckedChange={(v) => set({ [name]: v })} />
        </label>
    );

    return (
        <form onSubmit={save} className="space-y-6 max-w-3xl">
            <div className="grid gap-4 sm:grid-cols-2">
                {field('name', t('settings.name'))}
                {field('serial', t('settings.serial'), { dir: 'ltr' }, t('settings.serialHint'))}
                <div className="space-y-1 sm:col-span-2">
                    <Label>{t('settings.description')}</Label>
                    <Textarea rows={3} value={form.description ?? ''} onChange={(e) => set({ description: e.target.value })} />
                </div>
                <div className="space-y-1">
                    <Label>{t('settings.subject')}</Label>
                    <Select value={form.subject_id ? String(form.subject_id) : 'none'} onValueChange={(v) => set({ subject_id: v === 'none' ? '' : Number(v) })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">{t('settings.noSubject')}</SelectItem>
                            {subjects.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <Label>{t('settings.type')}</Label>
                    <Select value={form.type || 'exam'} onValueChange={(v) => set({ type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="exam">{t('types.exam')}</SelectItem>
                            <SelectItem value="homework">{t('types.homework')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {field('duration_minutes', t('settings.duration'), { type: 'number', min: 1 }, t('settings.durationHint'))}
                {field('target_total', t('settings.targetTotal'), { type: 'number', min: 0, step: 0.5 }, t('settings.targetTotalHint'))}
                {field('pass_percent', t('settings.passPercent'), { type: 'number', min: 0, max: 100 })}
                {field('redo_percent', t('settings.redoPercent'), { type: 'number', min: 1, max: 100 }, t('settings.redoPercentHint'))}
                {field('max_redos', t('settings.maxRedos'), { type: 'number', min: 0 }, t('settings.maxRedosHint'))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                {toggle('shuffle', t('settings.shuffle'), t('settings.shuffleHint'))}
                {toggle('redo_required', t('settings.redoRequired'), t('settings.redoRequiredHint'))}
                {toggle('redo_new_questions', t('settings.redoNew'), t(exam.mode === 'random' ? 'settings.redoNewHint' : 'settings.redoNewManual'), exam.mode !== 'random')}
            </div>
            <div className="space-y-1.5 sm:max-w-md">
                <Label>{t('settings.showAnswers')}</Label>
                <Select value={form.show_answers || 'after_last'} onValueChange={(v) => set({ show_answers: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {['after_last', 'immediately', 'after_end', 'never'].map((v) => <SelectItem key={v} value={v}>{t(`settings.showAnswersOptions.${v}`)}</SelectItem>)}
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('settings.showAnswersHint')}</p>
            </div>
            <Button type="submit" disabled={saving}>{saving ? <LoadingSpinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}{t('common.save')}</Button>
        </form>
    );
}

// A question row: serial, type, a short look at the text and its mark.
function QuestionRow({ row, handle, manual, onMark, onRemove }) {
    const { t } = useTranslation('exams');
    const tq = useTranslation('questionBank').t;
    const [mark, setMark] = useState(String(row.mark));
    useEffect(() => setMark(String(row.mark)), [row.mark]);
    const q = row.question;
    return (
        <div className="flex items-start gap-2 rounded-md border bg-card p-2">
            {handle}
            <div className="flex-1 min-w-0 space-y-1">
                <div className="line-clamp-2 text-sm">{q ? <MathText text={q.stem_text || tq(`types.${q.type}`)} /> : t('questions.missing')}</div>
                {q && (
                    <div className="flex flex-wrap gap-1 text-xs">
                        <Badge variant="outline" className="font-mono" dir="ltr">{q.serial}</Badge>
                        <Badge variant="secondary">{tq(`types.${q.type}`)}</Badge>
                        {q.difficulty && <Badge variant="outline">{tq(`difficulty.${q.difficulty}`)}</Badge>}
                        {q.archived_at && <Badge variant="destructive">{t('common.archived')}</Badge>}
                    </div>
                )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
                <Input
                    type="number"
                    step={0.5}
                    min={0.5}
                    className="h-8 w-20"
                    value={mark}
                    title={q?.type === 'matching' ? t('questions.matchingMark') : t('questions.mark')}
                    onChange={(e) => setMark(e.target.value)}
                    onBlur={() => Number(mark) !== row.mark && onMark(Number(mark))}
                />
                <span className="text-xs text-muted-foreground">{t('questions.marks')}</span>
                {manual && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRemove} title={t('questions.remove')}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
            </div>
        </div>
    );
}

function QuestionsTab({ exam, passages, reload }) {
    const { t } = useTranslation('exams');
    const [pickerFor, setPickerFor] = useState(null);
    const [drawing, setDrawing] = useState(false);
    const [shortages, setShortages] = useState(null);
    const manual = exam.mode === 'manual';
    const passageById = useMemo(() => new Map(passages.map((p) => [p.id, p])), [passages]);
    const existing = exam.sections.flatMap((s) => s.questions.map((q) => q.question_id));

    const act = async (fn, message) => {
        try {
            const res = await fn();
            if (message) toast.success(message);
            await reload();
            return res;
        } catch (err) {
            showError(err, t('errors.save'));
            await reload();
            return null;
        }
    };

    const draw = async () => {
        if (existing.length && !window.confirm(t('questions.redrawConfirm'))) return;
        setDrawing(true);
        const res = await act(() => exSend('post', `/exams/${exam.id}/draw`));
        setDrawing(false);
        if (res) {
            setShortages(res.data.shortages);
            toast.success(t('questions.drawn', { count: res.data.drawn }));
        }
    };

    // Rows grouped for display: consecutive children of one passage sit
    // under that passage's text.
    const blocks = (rows) => {
        const out = [];
        for (const row of rows) {
            const pid = row.question?.passage_id ?? null;
            const last = out[out.length - 1];
            if (pid && last?.passageId === pid) last.rows.push(row);
            else out.push({ key: row.id, passageId: pid, rows: [row] });
        }
        return out;
    };

    const sectionName = (s, i) => s.name || (exam.sections.length > 1 ? t('sections.unnamed', { n: i + 1 }) : null);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                <span>{t('questions.total')}: <b>{formatMark(exam.total)}</b>{exam.target_total !== null && <> / {formatMark(Number(exam.target_total))}</>}</span>
                {exam.target_total !== null && Math.abs(Number(exam.target_total) - exam.total) > 0.001 && (
                    <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="h-4 w-4" />{t('questions.totalMismatch')}</span>
                )}
                <span className="text-muted-foreground">{t('exam.questionCount', { count: existing.length })}</span>
                <span className="flex-1" />
                {!manual && (
                    <Button size="sm" onClick={draw} disabled={drawing}>
                        {drawing ? <LoadingSpinner className="h-4 w-4" /> : <Dices className="h-4 w-4" />}{existing.length ? t('questions.redraw') : t('questions.draw')}
                    </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => act(() => exSend('post', `/exams/${exam.id}/sections`, { name: t('sections.newName', { n: exam.sections.length + 1 }) }))}>
                    <Plus className="h-4 w-4" />{t('sections.add')}
                </Button>
            </div>

            {shortages?.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    <p className="font-medium flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{t('questions.notEnough')}</p>
                    <ul className="mt-1 list-disc ps-5">
                        {shortages.map((s, i) => {
                            const sec = exam.sections.findIndex((x) => x.id === s.section_id);
                            const rule = exam.sections[sec]?.rules.findIndex((r) => r.id === s.rule_id);
                            return (
                                <li key={i}>{t('questions.shortage', {
                                    section: sectionName(exam.sections[sec], sec) || t('sections.whole'),
                                    rule: rule + 1,
                                    difficulty: t(`difficulty.${s.difficulty}`),
                                    wanted: s.wanted,
                                    available: s.available,
                                })}</li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {exam.sections.map((section, i) => (
                <div key={section.id} className="rounded-lg border p-3 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <Input
                            key={section.name}
                            defaultValue={section.name || ''}
                            placeholder={exam.sections.length > 1 ? t('sections.unnamed', { n: i + 1 }) : t('sections.optional')}
                            className="max-w-xs font-medium"
                            onBlur={(e) => e.target.value.trim() !== (section.name || '') && act(() => exSend('patch', `/sections/${section.id}`, { name: e.target.value.trim() || null }))}
                        />
                        <span className="text-xs text-muted-foreground">
                            {formatMark(section.questions.reduce((s, q) => s + q.mark, 0))} {t('questions.marks')}
                        </span>
                        <span className="flex-1" />
                        {manual && <Button size="sm" onClick={() => setPickerFor(section.id)}><Plus className="h-4 w-4" />{t('questions.add')}</Button>}
                        {exam.sections.length > 1 && (
                            <Button size="icon" variant="ghost" title={t('sections.delete')}
                                onClick={() => window.confirm(t('sections.deleteConfirm')) && act(() => exSend('delete', `/sections/${section.id}`))}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        )}
                    </div>

                    {!manual && (
                        <>
                            <p className="text-sm font-semibold">{t('rules.title')}</p>
                            <RulesEditor section={section} onSaved={reload} />
                            {/* The rules above, the questions they drew below. */}
                            <div className="flex items-center gap-3 pt-3">
                                <span className="h-px flex-1 bg-border" />
                                <span className="rounded-full border bg-muted/50 px-3 py-1 text-sm font-semibold">
                                    {t('rules.drawnTitle', { count: section.questions.length })}
                                </span>
                                <span className="h-px flex-1 bg-border" />
                            </div>
                            <p className="text-center text-xs text-muted-foreground">{t('rules.drawnHint')}</p>
                        </>
                    )}

                    {section.questions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{manual ? t('questions.emptyManual') : t('questions.emptyRandom')}</p>
                    ) : (
                        <SortableList
                            items={blocks(section.questions)}
                            getId={(b) => b.key}
                            onReorder={(keys) => {
                                const byKey = new Map(blocks(section.questions).map((b) => [b.key, b]));
                                const ids = keys.flatMap((k) => byKey.get(k).rows.map((r) => r.id));
                                act(() => exSend('post', `/sections/${section.id}/questions/reorder`, { ids }));
                            }}
                            className="space-y-2"
                            renderItem={(block, handle) => (
                                block.passageId ? (
                                    <div className="rounded-md border border-dashed p-2 space-y-2">
                                        <div className="flex items-start gap-2">
                                            {handle}
                                            <div className="text-sm text-muted-foreground line-clamp-2 flex-1">
                                                <Badge variant="outline" className="me-1">{t('questions.passage')}</Badge>
                                                <MathText text={passageById.get(block.passageId)?.stem_text || ''} />
                                            </div>
                                        </div>
                                        {block.rows.map((row) => (
                                            <QuestionRow key={row.id} row={row} manual={manual}
                                                onMark={(m) => act(() => exSend('patch', `/exam-questions/${row.id}`, { mark: m }))}
                                                onRemove={() => act(() => exSend('post', `/exams/${exam.id}/questions/remove`, { ids: [row.id] }))} />
                                        ))}
                                    </div>
                                ) : (
                                    <QuestionRow row={block.rows[0]} handle={handle} manual={manual}
                                        onMark={(m) => act(() => exSend('patch', `/exam-questions/${block.rows[0].id}`, { mark: m }))}
                                        onRemove={() => act(() => exSend('post', `/exams/${exam.id}/questions/remove`, { ids: [block.rows[0].id] }))} />
                                )
                            )}
                        />
                    )}
                </div>
            ))}

            <BankPicker
                open={pickerFor !== null}
                onOpenChange={(o) => !o && setPickerFor(null)}
                existing={existing}
                onAdd={async (ids) => {
                    const res = await act(() => exSend('post', `/sections/${pickerFor}/questions`, { question_ids: ids }));
                    if (res) toast.success(t('questions.added', { count: res.data.added }));
                }}
            />
        </div>
    );
}

function TestLinkTab({ exam, reload }) {
    const { t } = useTranslation('exams');
    const link = exam.test_link;
    const [dates, setDates] = useState({ starts_at: '', ends_at: '' });
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        const start = link?.starts_at || new Date();
        const end = link?.ends_at || new Date(Date.now() + 7 * 864e5);
        setDates({ starts_at: toLocalInput(start), ends_at: toLocalInput(end) });
    }, [link]);
    const open = link && !link.closed_at;

    const save = async () => {
        setSaving(true);
        try {
            await exSend('put', `/exams/${exam.id}/test-link`, {
                starts_at: new Date(dates.starts_at).toISOString(),
                ends_at: new Date(dates.ends_at).toISOString(),
            });
            toast.success(t('testLink.saved'));
            reload();
        } catch (err) {
            showError(err, t('errors.save'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4 max-w-2xl">
            <p className="text-sm text-muted-foreground">{t('testLink.intro')}</p>
            {!exam.published_at && <p className="text-sm text-amber-600 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{t('testLink.publishFirst')}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>{t('testLink.starts')}</Label><Input type="datetime-local" value={dates.starts_at} onChange={(e) => setDates((d) => ({ ...d, starts_at: e.target.value }))} /></div>
                <div className="space-y-1"><Label>{t('testLink.ends')}</Label><Input type="datetime-local" value={dates.ends_at} onChange={(e) => setDates((d) => ({ ...d, ends_at: e.target.value }))} /></div>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button onClick={save} disabled={saving || !dates.starts_at || !dates.ends_at}>
                    {saving && <LoadingSpinner className="h-4 w-4" />}{open ? t('testLink.update') : t('testLink.create')}
                </Button>
                {open && <Button variant="outline" onClick={async () => { await exSend('delete', `/exams/${exam.id}/test-link`); reload(); }}>{t('testLink.close')}</Button>}
            </div>
            {open && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                    <code className="flex-1 truncate text-sm" dir="ltr">{examLink(link.code)}</code>
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(examLink(link.code)); toast.success(t('testLink.copied')); }}><Copy className="h-4 w-4" />{t('testLink.copy')}</Button>
                    <Button size="sm" variant="outline" asChild><a href={`/e/${link.code}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />{t('testLink.open')}</a></Button>
                </div>
            )}
        </div>
    );
}

export default function ExamEditorPage() {
    const { examId } = useParams();
    const { t } = useTranslation('exams');
    const [params, setParams] = useSearchParams();
    const [exam, setExam] = useState(null);
    // Settings come first: an exam is set up, then filled with questions.
    const tab = params.get('tab') || 'settings';

    const load = () => exGet(`/exams/${examId}`).then(setExam).catch((err) => showError(err, t('errors.load')));
    useEffect(() => { setExam(null); load(); }, [examId]); // eslint-disable-line react-hooks/exhaustive-deps

    const publish = async () => {
        try {
            const res = await exSend('post', `/exams/${exam.id}/publish`);
            if (res.data.total_mismatch) toast.warning(t('exam.publishedMismatch', { total: formatMark(res.data.total), target: formatMark(res.data.target) }));
            else toast.success(t('exam.publishedOk'));
            load();
        } catch (err) {
            showError(err, t('errors.save'));
        }
    };

    if (!exam) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;

    return (
        <div className="space-y-6">
            <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                <Link to="/admin/exams" className="hover:text-foreground">{t('title')}</Link>
                {exam.breadcrumb.map((b) => (
                    <span key={b.id} className="flex items-center gap-1">
                        <ChevronLeft className="h-4 w-4" />
                        <Link to={`/admin/exams/folders/${b.id}`} className="hover:text-foreground">{b.name}</Link>
                    </span>
                ))}
            </nav>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold">{exam.name}</h1>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                        <Badge variant="secondary">{t(`types.${exam.type}`)}</Badge>
                        <Badge variant="outline">{t(`modes.${exam.mode}`)}</Badge>
                        {exam.serial && <Badge variant="outline" dir="ltr">{exam.serial}</Badge>}
                        <Badge className={exam.published_at ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-muted text-muted-foreground'}>
                            {exam.published_at ? t('exam.published') : t('exam.draft')}
                        </Badge>
                        {exam.archived_at && <Badge variant="destructive">{t('common.archived')}</Badge>}
                        {exam.attempt_count > 0 && <Badge variant="outline">{t('exam.attempts', { count: exam.attempt_count })}</Badge>}
                    </div>
                </div>
                {!exam.archived_at && (
                    <div className="flex flex-wrap gap-2">
                        {exam.published_at
                            ? <Button variant="outline" onClick={async () => { await exSend('post', `/exams/${exam.id}/unpublish`); load(); }}><Undo2 className="h-4 w-4" />{t('exam.unpublish')}</Button>
                            : <Button onClick={publish}><Upload className="h-4 w-4" />{t('exam.publish')}</Button>}
                        <Button variant="outline" onClick={async () => {
                            if (!window.confirm(t('exam.archiveConfirm', { name: exam.name }))) return;
                            await exSend('post', `/exams/${exam.id}/archive`);
                            toast.success(t('common.archived'));
                            load();
                        }}><Archive className="h-4 w-4" />{t('common.archive')}</Button>
                    </div>
                )}
            </div>

            <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
                <TabsList>
                    <TabsTrigger value="settings">{t('tabs.settings')}</TabsTrigger>
                    <TabsTrigger value="questions">{t('tabs.questions')}</TabsTrigger>
                    <TabsTrigger value="test">{t('tabs.testLink')}</TabsTrigger>
                </TabsList>
                <TabsContent value="questions" className="pt-2"><QuestionsTab exam={exam} passages={exam.passages} reload={load} /></TabsContent>
                <TabsContent value="settings" className="pt-2"><SettingsTab exam={exam} onSaved={load} /></TabsContent>
                <TabsContent value="test" className="pt-2"><TestLinkTab exam={exam} reload={load} /></TabsContent>
            </Tabs>
        </div>
    );
}
