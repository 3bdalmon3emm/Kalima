import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { CheckCircle2, Hourglass, RotateCcw, XCircle, Volume2, HeartHandshake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/ui/loading-spinner';
import MathText from '@/components/admin/question-bank/MathText';
import { QuestionFontContext, useQuestionFont } from '@/components/admin/question-bank/fonts';
import { columnLetter } from '@/components/admin/question-bank/api';
import { formatMark } from '@/components/admin/exams/api';
import { translateBackendMessage } from '@/lib/utils';
import Celebration, { CelebrationBadge } from '@/components/exams/Celebration';
import { Media } from '@/components/exams/QuestionView';
import AppealBox from '@/components/exams/AppealBox';
import { examGet, examSend, passageNumbers, requestFullscreen, savedScale, setAttemptToken } from '@/components/exams/api';

function Tag({ tone, children }) {
    const tones = {
        right: 'bg-green-600 text-white',
        wrong: 'bg-red-600 text-white',
        muted: 'bg-muted text-muted-foreground',
    };
    return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}

// One question after the result: what the student answered and, when the
// exam shows them, the right answer, the explanation or model answer. In
// preview there is no student: only the question, its marks and the key.
export function ReviewItem({ item, label, passage, passageN, shown, extra, grader = false, preview = false }) {
    const { t, i18n } = useTranslation('exams');
    // The grader reads "the student's answer" where the student reads "your answer".
    const mine = (key) => t(grader ? `grading.${key}` : `result.${key}`);
    const q = item.question;
    const look = useQuestionFont(q?.font, savedScale());
    const passageLook = useQuestionFont(passage?.font, savedScale());
    if (!q) return null;
    const chosen = new Set(item.answer.option_ids || []);
    const pairs = item.answer.pairs || [];
    const answered = q.type === 'matching' ? pairs.length > 0
        : q.type === 'essay' ? !!(item.answer.text || '').trim() || (item.answer.files || []).length > 0
            : chosen.size > 0;
    const pending = item.earned === null;
    const full = !pending && item.earned >= item.mark;
    const partial = !pending && !full && item.earned > 0;
    const right = q.matching_items.filter((m) => m.side === 'right');
    const left = q.matching_items.filter((m) => m.side === 'left');
    const studentPair = new Map(pairs.map(([l, r]) => [l, r]));
    const pairText = (it) => (it
        ? <span className="inline-flex flex-wrap items-center gap-1.5">{it.text && <MathText text={it.text} />}<Media image={it.image} className="max-h-16" /></span>
        : '—');

    return (
        <div className={`overflow-hidden rounded-xl border-2 bg-card ${preview || pending ? 'border-border' : full ? 'border-green-500' : partial ? 'border-amber-400' : 'border-red-400'}`}>
            <div className={`flex flex-wrap items-center gap-2 px-4 py-2.5 ${preview || pending ? 'bg-muted/50' : full ? 'bg-green-50 dark:bg-green-950/40' : partial ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-red-50 dark:bg-red-950/30'}`}>
                <span className="rounded-md bg-primary px-2 py-0.5 text-sm font-bold text-primary-foreground">{label}</span>
                {preview ? null : pending ? <Tag tone="muted">{t('result.waiting')}</Tag>
                    : full ? <Tag tone="right">{t('result.correct')}</Tag>
                        : !answered ? <Tag tone="wrong">{t('result.notAnswered')}</Tag>
                            : partial ? <Tag tone="muted">{t('result.partial')}</Tag>
                                : <Tag tone="wrong">{t('result.wrong')}</Tag>}
                <span className="ms-auto flex items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 text-xs">
                    <span className="text-muted-foreground">{t('take.serial')}</span>
                    <span className="font-mono font-bold tracking-wider" dir="ltr">{q.serial}</span>
                </span>
                {preview
                    ? <span className="text-sm font-semibold">{t('teacher.marks', { count: item.mark })}</span>
                    : <span className="text-sm font-semibold tabular-nums" dir="ltr">{pending ? '—' : formatMark(item.earned)} / {formatMark(item.mark)}</span>}
            </div>

            <div className="space-y-4 p-4">
                {passage && (
                    <QuestionFontContext.Provider value={passageLook}>
                        <details className="rounded-lg border bg-muted/30 p-3 text-sm" open>
                            <summary className="cursor-pointer font-medium text-primary">{passageN ? t('take.passageN', { n: passageN }) : t('take.passage')}</summary>
                            <div className="mt-2 space-y-2 leading-loose">
                                {passage.stem_text && <MathText text={passage.stem_text} className="block" />}
                                <Media image={passage.stem_image} audio={passage.stem_audio} />
                            </div>
                        </details>
                    </QuestionFontContext.Provider>
                )}
                <QuestionFontContext.Provider value={look}>
                    {q.stem_text && <div className="text-lg font-medium leading-relaxed"><MathText text={q.stem_text} className="block" /></div>}
                    <div className="flex flex-wrap gap-3"><Media image={q.stem_image} audio={q.stem_audio} /></div>

                    {q.options.length > 0 && (
                        <ul className="space-y-2">
                            {q.options.map((o, i) => {
                                const picked = chosen.has(o.id);
                                const correct = shown && o.is_correct;
                                const wrongPick = picked && shown && !o.is_correct;
                                const tone = correct ? 'border-green-500 bg-green-50 dark:bg-green-950/40'
                                    : wrongPick ? 'border-red-500 bg-red-50 dark:bg-red-950/40'
                                        : picked ? 'border-primary bg-primary/5' : 'border-border';
                                return (
                                    <li key={o.id} className={`flex items-start gap-3 rounded-lg border-2 px-3 py-2.5 ${tone}`}>
                                        <span className={`flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${correct ? 'bg-green-600 text-white' : wrongPick ? 'bg-red-600 text-white' : picked ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                                            {correct ? <CheckCircle2 className="h-4 w-4 no-flip" /> : wrongPick ? <XCircle className="h-4 w-4" /> : (o.label || columnLetter(i, i18n.language))}
                                        </span>
                                        <div className="flex-1 space-y-1">
                                            {o.text && <MathText text={o.text} />}
                                            <Media image={o.image} className="max-h-32" />
                                            {o.explanation_text && q.explanation_mode === 'per_option' && <p className="text-xs text-muted-foreground"><MathText text={o.explanation_text} /></p>}
                                        </div>
                                        <div className="flex shrink-0 flex-col items-end gap-1">
                                            {picked && <Tag tone={wrongPick ? 'wrong' : correct ? 'right' : 'muted'}>{mine('yourChoice')}</Tag>}
                                            {correct && !picked && <Tag tone="right">{t('result.rightAnswer')}</Tag>}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {q.type === 'matching' && (
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 text-xs text-muted-foreground">
                                    <tr>
                                        <th className="p-2 text-start font-medium">{t('result.item')}</th>
                                        {!preview && <th className="p-2 text-start font-medium">{mine('yourPair')}</th>}
                                        {shown && <th className="p-2 text-start font-medium">{t('result.rightPair')}</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {left.map((l) => {
                                        const paired = studentPair.get(l.id);
                                        const ok = !preview && shown && paired !== undefined && paired === l.match_item_id;
                                        const bad = !preview && shown && !ok;
                                        return (
                                            <tr key={l.id} className={`border-t ${ok ? 'bg-green-50 dark:bg-green-950/30' : bad ? 'bg-red-50 dark:bg-red-950/30' : ''}`}>
                                                <td className="p-2 align-top font-medium">{pairText(l)}</td>
                                                {!preview && (
                                                    <td className={`p-2 align-top ${ok ? 'text-green-700 dark:text-green-400' : bad ? 'text-red-700 dark:text-red-400' : ''}`}>
                                                        <span className="inline-flex items-center gap-1.5">
                                                            {ok ? <CheckCircle2 className="h-4 w-4 shrink-0 no-flip" /> : bad ? <XCircle className="h-4 w-4 shrink-0" /> : null}
                                                            {paired === undefined ? t('result.notConnected') : pairText(right.find((r) => r.id === paired))}
                                                        </span>
                                                    </td>
                                                )}
                                                {shown && <td className="p-2 align-top text-green-700 dark:text-green-400">{ok ? '' : pairText(right.find((r) => r.id === l.match_item_id))}</td>}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {q.type === 'essay' && (
                        <div className="space-y-2 text-sm">
                            {!preview && <div className="rounded-lg border bg-muted/40 p-3">
                                <p className="mb-1 font-medium">{mine('yourAnswer')}</p>
                                <p className="whitespace-pre-wrap">{item.answer.text || t('result.notAnswered')}</p>
                                <div className="mt-2 flex flex-wrap gap-2">{(item.answer.files || []).map((f) => f.url && <Media key={f.id} image={{ url: f.url }} className="max-h-40" />)}</div>
                            </div>}
                            {(q.model_answer_text || q.model_answer_image) && (
                                <div className="rounded-lg border border-green-300 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
                                    <p className="mb-1 font-medium text-green-800 dark:text-green-300">{t('result.modelAnswer')}</p>
                                    {q.model_answer_text && <MathText text={q.model_answer_text} className="block" />}
                                    <Media image={q.model_answer_image} />
                                </div>
                            )}
                        </div>
                    )}

                    {q.explanation_mode === 'combined_text' && q.explanation_text && (
                        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm dark:border-sky-900 dark:bg-sky-950/30"><p className="mb-1 font-medium">{t('result.explanation')}</p><MathText text={q.explanation_text} className="block" /></div>
                    )}
                    {q.explanation_mode === 'image' && q.explanation_image && (
                        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm dark:border-sky-900 dark:bg-sky-950/30"><p className="mb-1 font-medium">{t('result.explanation')}</p><Media image={q.explanation_image} /></div>
                    )}
                </QuestionFontContext.Provider>
                {extra}
            </div>
        </div>
    );
}

export default function ExamResultPage() {
    const { code, attemptId } = useParams();
    const { t, i18n } = useTranslation('exams');
    const navigate = useNavigate();
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [replay, setReplay] = useState(0);
    const [starting, setStarting] = useState(false);

    const load = () => examGet(`/attempts/${attemptId}/result`).then(setResult).catch((err) => setError(translateBackendMessage(err.response?.data?.message) || t('errors.load')));
    useEffect(() => { load(); }, [attemptId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Numbers as in the exam: 1, 2, 3 in order, and passages counted apart.
    const labels = useMemo(() => new Map((result?.review || []).map((item, i) => [item.question_id, String(i + 1)])), [result]);
    const passageInfo = useMemo(() => {
        const byId = new Map((result?.review || []).map((item) => [item.question_id, item.question?.passage_id]));
        return passageNumbers([...byId.keys()], (id) => byId.get(id));
    }, [result]);

    const passages = useMemo(() => new Map((result?.passages || []).map((p) => [p.id, p])), [result]);

    const redo = async () => {
        requestFullscreen();
        setStarting(true);
        try {
            const attempt = await examSend('post', `/links/${code}/start`);
            setAttemptToken(attempt.id, attempt.session_token);
            navigate(`/e/${code}/attempt/${attempt.id}`);
        } catch (err) {
            setError(translateBackendMessage(err.response?.data?.message) || t('errors.save'));
            setStarting(false);
        }
    };

    if (error && !result) return <div className="mx-auto max-w-xl p-8 text-center text-destructive">{error}</div>;
    if (!result) return <div className="flex justify-center py-24"><LoadingSpinner /></div>;

    if (result.score === null) {
        return (
            <div className="mx-auto max-w-xl p-8 text-center space-y-4" dir={i18n.dir()}>
                <Hourglass className="mx-auto h-14 w-14 text-primary" />
                <h1 className="text-2xl font-bold">{t('result.pendingTitle')}</h1>
                <p className="text-muted-foreground">{t('result.pending')}</p>
                {result.auto_submitted && <p className="text-sm text-muted-foreground">{t('result.autoSubmitted')}</p>}
                <Button variant="outline" asChild><Link to={`/e/${code}`}>{t('result.back')}</Link></Button>
            </div>
        );
    }

    const failed = result.band === 'fail';
    return (
        <div className="min-h-screen bg-muted/20" dir={i18n.dir()}>
            <Celebration band={result.band} sound={result.sound} playKey={replay} />
            <div className="mx-auto max-w-3xl p-4 space-y-6">
                <motion.div
                    className="rounded-2xl border bg-card p-6 text-center space-y-3"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    {failed ? <HeartHandshake className="mx-auto h-16 w-16 text-primary" /> : <CelebrationBadge band={result.band} />}
                    <h1 className="text-2xl font-bold">{t(`result.headline.${result.band}`)}</h1>
                    <p className="text-muted-foreground">{t(`result.message.${result.band}`)}</p>
                    <motion.p
                        className="text-5xl font-extrabold tabular-nums"
                        dir="ltr"
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.3, type: 'spring' }}
                    >
                        {formatMark(result.score)} <span className="text-2xl text-muted-foreground">/ {formatMark(result.total)}</span>
                    </motion.p>
                    <div className="flex flex-wrap justify-center gap-2 text-sm">
                        <Badge variant="outline">{result.percent}%</Badge>
                        <Badge className={result.passed ? 'bg-green-600' : 'bg-destructive'}>{result.passed ? t('result.passed') : t('result.notPassed')}</Badge>
                        <Badge variant="outline">{t('result.attempt', { n: result.attempt_no })}</Badge>
                        {result.attempt_no > 1 && <Badge variant="outline">{t('result.best', { score: formatMark(result.best_score) })}</Badge>}
                    </div>
                    {result.auto_submitted && <p className="text-xs text-muted-foreground">{t('result.autoSubmitted')}</p>}
                    <div className="flex flex-wrap justify-center gap-2 pt-2">
                        {result.redo?.available && (
                            <Button onClick={redo} disabled={starting}>
                                {starting ? <LoadingSpinner className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                                {result.redo.required ? t('result.redoRequired') : t('result.redo')}
                            </Button>
                        )}
                        {!failed && <Button variant="outline" onClick={() => setReplay((r) => r + 1)}><Volume2 className="h-4 w-4" />{t('result.replay')}</Button>}
                        <Button variant="outline" asChild><Link to={`/e/${code}`}>{t('result.back')}</Link></Button>
                    </div>
                    {result.redo?.available && <p className="text-xs text-muted-foreground">{t('result.redosLeft', { count: result.redo.left })}</p>}
                </motion.div>

                <div className="space-y-3">
                    <h2 className="text-lg font-semibold">{t('result.review')}</h2>
                    {!result.answers_shown && (
                        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                            {t(result.redo?.available ? 'result.answersHiddenRedo' : 'result.answersHiddenLater')}
                        </p>
                    )}
                    {result.review.map((item, i) => {
                        const pid = item.question?.passage_id;
                        // The passage shows once, above its first question.
                        const first = pid && result.review[i - 1]?.question?.passage_id !== pid;
                        return (
                            <ReviewItem
                                key={item.question_id}
                                item={item}
                                label={labels.get(item.question_id)}
                                passage={first ? passages.get(pid) : null}
                                passageN={passageInfo.get(item.question_id)?.n}
                                shown={result.answers_shown}
                                extra={<AppealBox attemptId={attemptId} item={item} allowed={result.answers_shown} onSent={load} />}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
