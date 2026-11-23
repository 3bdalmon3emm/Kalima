import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AArrowDown, AArrowUp, BookOpen, ChevronLeft, ChevronRight, Clock, Flag, LayoutGrid, Maximize, Send, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import LoadingSpinner from '@/components/ui/loading-spinner';
import MathText from '@/components/admin/question-bank/MathText';
import { QuestionFontContext, useQuestionFont } from '@/components/admin/question-bank/fonts';
import { translateBackendMessage } from '@/lib/utils';
import { formatMark } from '@/components/admin/exams/api';
import QuestionView, { Media } from '@/components/exams/QuestionView';
import { playBeep } from '@/components/exams/defaultSounds';
import {
    TEXT_SCALES, examGet, examSend, fullscreenSupported, isAnswered, isFullscreen,
    numbering, passageNumbers, requestFullscreen, saveScale, savedScale, setAttemptToken, uploadAnswerPhoto,
} from '@/components/exams/api';

const SAVE_EVERY_MS = 10_000;

function useCountdown(deadline, offset) {
    const [left, setLeft] = useState(null);
    useEffect(() => {
        if (!deadline) return undefined;
        const tick = () => setLeft(Math.max(0, new Date(deadline).getTime() - (Date.now() + offset)));
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [deadline, offset]);
    return left;
}

const clock = (ms) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const pad = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

// The passage stays in view next to its questions (a panel that opens and
// closes on phones).
function PassagePanel({ passage, scale, n }) {
    const { t } = useTranslation('exams');
    const [open, setOpen] = useState(true);
    const look = useQuestionFont(passage.font, scale);
    return (
        <QuestionFontContext.Provider value={look}>
            <aside className="rounded-lg border bg-card lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
                <button type="button" className="flex w-full items-center gap-2 p-3 font-medium lg:pointer-events-none" onClick={() => setOpen((o) => !o)}>
                    <BookOpen className="h-4 w-4 text-primary" />{n ? t('take.passageN', { n }) : t('take.passage')}
                    <span className="ms-auto text-xs text-muted-foreground lg:hidden">{open ? t('take.hide') : t('take.show')}</span>
                </button>
                <div className={`space-y-3 px-3 pb-3 ${open ? '' : 'hidden lg:block'}`}>
                    {passage.stem_text && <div className="leading-loose"><MathText text={passage.stem_text} className="block" /></div>}
                    <Media image={passage.stem_image} audio={passage.stem_audio} />
                </div>
            </aside>
        </QuestionFontContext.Provider>
    );
}

// A faint repeated stamp with the student's serial and the teacher's name,
// so a screenshot or photo of the screen shows whose it is. One tilted tile,
// repeated as a background, covers the whole screen at any size.
function Watermark({ text }) {
    const tile = useMemo(() => {
        if (!text) return null;
        const safe = text.replace(/[<>&"']/g, '');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="130"><text x="130" y="65" text-anchor="middle" dominant-baseline="middle" transform="rotate(-24 130 65)" font-family="sans-serif" font-size="19" font-weight="800" fill="#000" fill-opacity="0.09">${safe}</text></svg>`;
        return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    }, [text]);
    if (!tile) return null;
    // Above the question too (clicks pass through), so a photo of the
    // question always carries the stamp.
    return <div className="pointer-events-none fixed inset-0 z-[35] select-none dark:invert" style={{ backgroundImage: tile }} aria-hidden="true" />;
}

export default function ExamAttemptPage() {
    const { code, attemptId } = useParams();
    const id = Number(attemptId);
    const { t, i18n } = useTranslation('exams');
    const navigate = useNavigate();
    const [attempt, setAttempt] = useState(null);
    const [answers, setAnswers] = useState({});
    const [index, setIndex] = useState(0);
    const [panel, setPanel] = useState(false);
    const [scale, setScale] = useState(savedScale);
    const [takenOver, setTakenOver] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [files, setFiles] = useState([]);
    const [outOfFullscreen, setOutOfFullscreen] = useState(false);
    const [offset, setOffset] = useState(0);
    const dirty = useRef(new Set());
    const answersRef = useRef({});
    const alerted = useRef({ half: false, minute: false, tenMinutes: false, tick: null });
    const finished = useRef(false);
    answersRef.current = answers;

    // ---------- Loading ----------
    useEffect(() => {
        examGet(`/attempts/${id}`, id).then((data) => {
            if (data.status !== 'in_progress') { navigate(`/e/${code}/result/${id}`, { replace: true }); return; }
            setAttemptToken(id, data.session_token);
            setOffset(new Date(data.server_time).getTime() - Date.now());
            setAnswers(Object.fromEntries(data.answers.map((a) => [a.question_id, { answer: a.answer, flagged: a.flagged }])));
            setFiles(data.files);
            setAttempt(data);
        }).catch((err) => {
            toast.error(translateBackendMessage(err.response?.data?.message) || t('errors.load'));
            navigate(`/e/${code}`, { replace: true });
        });
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    const questionsById = useMemo(() => new Map((attempt?.questions || []).map((q) => [q.id, q])), [attempt]);
    const passagesById = useMemo(() => new Map((attempt?.passages || []).map((p) => [p.id, p])), [attempt]);
    const order = useMemo(() => (attempt?.sections || []).flatMap((s) => s.question_ids.map((qid) => ({ qid, section: s }))), [attempt]);
    const labels = useMemo(() => (attempt ? numbering(attempt.sections) : new Map()), [attempt]);
    const passageInfo = useMemo(() => passageNumbers(order.map((o) => o.qid), (qid) => questionsById.get(qid)?.passage_id), [order, questionsById]);
    const current = order[index];
    const q = current && questionsById.get(current.qid);
    const look = useQuestionFont(q?.font, scale);

    // ---------- Saving ----------
    // Extra minutes given while the exam is open arrive with every save.
    const takeDeadline = (deadline) => {
        if (deadline) setAttempt((prev) => (prev && prev.deadline_at !== deadline ? { ...prev, deadline_at: deadline } : prev));
    };

    const save = useCallback(async () => {
        if (!dirty.current.size || takenOver || finished.current) return true;
        const ids = [...dirty.current];
        dirty.current.clear();
        const batch = ids.map((qid) => ({ question_id: qid, answer: answersRef.current[qid]?.answer || {}, flagged: !!answersRef.current[qid]?.flagged }));
        try {
            const res = await examSend('put', `/attempts/${id}/answers`, { answers: batch }, id);
            takeDeadline(res?.deadline_at);
            return true;
        } catch (err) {
            ids.forEach((qid) => dirty.current.add(qid));
            if (err.response?.status === 409) setTakenOver(true);
            else if (err.response?.data?.message?.includes('Time is up')) { finished.current = true; navigate(`/e/${code}/result/${id}`, { replace: true }); }
            return false;
        }
    }, [id, takenOver]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!attempt) return undefined;
        const timer = setInterval(save, SAVE_EVERY_MS);
        return () => clearInterval(timer);
    }, [attempt, save]);

    const setAnswer = (qid, patch) => {
        setAnswers((prev) => ({ ...prev, [qid]: { ...prev[qid], ...patch } }));
        dirty.current.add(qid);
    };

    // ---------- Submitting ----------
    const submit = useCallback(async (auto = false) => {
        if (finished.current) return;
        setSubmitting(true);
        const pending = [...new Set([...dirty.current])].map((qid) => ({ question_id: qid, answer: answersRef.current[qid]?.answer || {}, flagged: !!answersRef.current[qid]?.flagged }));
        try {
            await examSend('post', `/attempts/${id}/submit`, pending.length ? { answers: pending } : {}, id);
            finished.current = true;
            setAttemptToken(id, null);
            if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
            navigate(`/e/${code}/result/${id}`, { replace: true });
        } catch (err) {
            if (err.response?.status === 409) setTakenOver(true);
            else if (auto || err.response?.data?.message?.includes('submitted')) {
                finished.current = true;
                navigate(`/e/${code}/result/${id}`, { replace: true });
            } else toast.error(translateBackendMessage(err.response?.data?.message) || t('errors.save'));
            setSubmitting(false);
        }
    }, [id, code]); // eslint-disable-line react-hooks/exhaustive-deps

    // ---------- Timer ----------
    // At zero, ask the server first: the deadline may have moved later.
    const checking = useRef(false);
    const checkDeadline = async () => {
        if (checking.current || finished.current) return;
        checking.current = true;
        try {
            const res = await examSend('put', `/attempts/${id}/answers`, { answers: [] }, id);
            if (res?.deadline_at && new Date(res.deadline_at).getTime() > Date.now() + offset) {
                takeDeadline(res.deadline_at);
                return;
            }
        } catch {
            // Time is up on the server too, or the network is down: submit.
        } finally {
            checking.current = false;
        }
        submit(true);
    };
    const left = useCountdown(attempt?.deadline_at, offset);
    useEffect(() => {
        if (left === null || !attempt) return;
        const total = new Date(attempt.deadline_at) - new Date(attempt.started_at);
        if (!alerted.current.half && attempt.exam.duration_minutes && total > 120_000 && left <= total / 2 && left > 60_000) {
            alerted.current.half = true;
            toast.info(t('take.halfTime'));
        }
        if (!alerted.current.minute && left <= 60_000 && left > 0) {
            alerted.current.minute = true;
            toast.warning(t('take.lastMinute'), { duration: 8000 });
            playBeep(660, 0.25);
        }
        if (!alerted.current.tenMinutes && total > 600_000 && left <= 600_000 && left > 60_000) {
            alerted.current.tenMinutes = true;
            playBeep(660, 0.25);
        }
        // The last 20 seconds tick like a clock, higher for the last five.
        const seconds = Math.ceil(left / 1000);
        if (seconds > 0 && seconds <= 20 && alerted.current.tick !== seconds) {
            alerted.current.tick = seconds;
            playBeep(seconds <= 5 ? 1320 : 880);
        }
        if (left === 0) checkDeadline();
    }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

    // ---------- Leaving the page or full screen (counted quietly) ----------
    useEffect(() => {
        if (!attempt) return undefined;
        const report = (type) => examSend('post', `/attempts/${id}/events`, { type }, id).catch(() => {});
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') { report('tab_leave'); save(); }
        };
        const onFullscreen = () => {
            const inside = isFullscreen();
            setOutOfFullscreen(!inside && fullscreenSupported());
            if (!inside && !finished.current) report('fullscreen_exit');
        };
        const block = (e) => e.preventDefault();
        // Copy, cut and paste are blocked and counted; holding the keys fires
        // many events, so one count per two seconds at most.
        let lastCopy = 0;
        const blockCopy = (e) => {
            e.preventDefault();
            if (Date.now() - lastCopy < 2000) return;
            lastCopy = Date.now();
            report('copy_paste');
        };
        document.addEventListener('visibilitychange', onVisibility);
        document.addEventListener('fullscreenchange', onFullscreen);
        document.addEventListener('webkitfullscreenchange', onFullscreen);
        document.addEventListener('copy', blockCopy);
        document.addEventListener('cut', blockCopy);
        document.addEventListener('paste', blockCopy);
        document.addEventListener('contextmenu', block);
        setOutOfFullscreen(!isFullscreen() && fullscreenSupported());
        const beforeUnload = () => { save(); };
        window.addEventListener('pagehide', beforeUnload);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            document.removeEventListener('fullscreenchange', onFullscreen);
            document.removeEventListener('webkitfullscreenchange', onFullscreen);
            document.removeEventListener('copy', blockCopy);
            document.removeEventListener('cut', blockCopy);
            document.removeEventListener('paste', blockCopy);
            document.removeEventListener('contextmenu', block);
            window.removeEventListener('pagehide', beforeUnload);
        };
    }, [attempt, save]); // eslint-disable-line react-hooks/exhaustive-deps

    const upload = async (file, done) => {
        setUploading(true);
        try {
            const uploaded = await uploadAnswerPhoto(id, file);
            setFiles((f) => [...f, uploaded]);
            done(uploaded);
        } catch (err) {
            if (err.response?.status === 409) setTakenOver(true);
            else toast.error(translateBackendMessage(err.response?.data?.message) || t('errors.save'));
        } finally {
            setUploading(false);
        }
    };

    const changeScale = (dir) => {
        const i = TEXT_SCALES.indexOf(scale) + dir;
        if (i < 0 || i >= TEXT_SCALES.length) return;
        setScale(TEXT_SCALES[i]);
        saveScale(TEXT_SCALES[i]);
    };

    if (!attempt) return <div className="flex justify-center py-24"><LoadingSpinner /></div>;

    const unanswered = order.filter(({ qid }) => !isAnswered(questionsById.get(qid), answers[qid]?.answer)).length;
    const flagged = !!answers[current?.qid]?.flagged;
    const passage = q?.passage_id ? passagesById.get(q.passage_id) : null;
    const go = (i) => { setIndex(Math.max(0, Math.min(order.length - 1, i))); setPanel(false); window.scrollTo({ top: 0 }); };
    const Prev = i18n.dir() === 'rtl' ? ChevronRight : ChevronLeft;
    const Next = i18n.dir() === 'rtl' ? ChevronLeft : ChevronRight;
    // The teacher's name and the student's serial; the admin test link has no
    // teacher, so the student's name stands in.
    const stamp = [attempt.teacher_name || attempt.student?.name, attempt.student?.serial && `#${attempt.student.serial}`].filter(Boolean).join(' · ');

    const answeredCount = order.length - unanswered;
    const showNotice = left !== null && left > 0 && left <= 600_000;
    // Without a duration the exam runs until the link ends (often days away):
    // the end time shows instead of a long countdown, until the last hour.
    const showEndTime = !attempt.exam.duration_minutes && left !== null && left > 3_600_000;
    const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';
    const endTime = new Date(attempt.deadline_at).toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    const shortEnd = new Date(attempt.deadline_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

    // The question numbers in two columns (more for long exams, so they all
    // stay in view), grouped by section; the strip scrolls if they still
    // don't fit.
    const stripColumns = order.length > 80 ? 4 : order.length > 40 ? 3 : 2;
    const stripWidth = { 2: 'lg:w-36', 3: 'lg:w-48', 4: 'lg:w-60' }[stripColumns];
    const square = (qid) => {
        const i = order.findIndex((o) => o.qid === qid);
        const a = answers[qid];
        const color = a?.flagged ? 'bg-amber-400 text-amber-950 border-amber-500'
            : isAnswered(questionsById.get(qid), a?.answer) ? 'bg-green-500 text-white border-green-600'
                : 'bg-background text-muted-foreground border-border hover:border-primary/50';
        return (
            <button key={qid} type="button" onClick={() => go(i)}
                className={`h-10 w-12 shrink-0 rounded-lg border-2 text-sm font-bold transition ${color} ${i === index ? 'ring-2 ring-primary ring-offset-2 ring-offset-card scale-105' : ''}`}>
                {labels.get(qid)}
            </button>
        );
    };
    // A section's numbers, with each passage's questions boxed together
    // under its name.
    const blocksOf = (ids) => ids.reduce((list, qid) => {
        const pid = questionsById.get(qid)?.passage_id || null;
        const prev = list[list.length - 1];
        if (pid && prev?.pid === pid) prev.ids.push(qid);
        else list.push({ pid, ids: [qid] });
        return list;
    }, []);
    const columns = { gridTemplateColumns: `repeat(${stripColumns}, 3rem)` };
    const squares = (
        <div className="space-y-4">
            {attempt.sections.map((s, si) => (
                <div key={s.id} className="space-y-1.5">
                    {(s.name || attempt.sections.length > 1) && <p className="truncate text-center text-[11px] font-semibold text-muted-foreground" title={s.name || ''}>{s.name || t('take.section', { n: si + 1 })}</p>}
                    <div className="grid justify-center gap-1.5" style={columns}>
                        {blocksOf(s.question_ids).map((b) => (b.pid ? (
                            <div key={`p${b.ids[0]}`} className="col-span-full my-1 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-1.5">
                                <p className="mb-1 flex items-center justify-center gap-1 text-[11px] font-semibold text-primary">
                                    <BookOpen className="h-3 w-3" />{t('take.passageN', { n: passageInfo.get(b.ids[0])?.n })}
                                </p>
                                <div className="grid justify-center gap-1.5" style={columns}>{b.ids.map(square)}</div>
                            </div>
                        ) : b.ids.map(square)))}
                    </div>
                </div>
            ))}
            <div className="space-y-1.5 border-t pt-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 shrink-0 rounded border-2 bg-background" />{t('take.legend.unanswered')}</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 shrink-0 rounded bg-green-500" />{t('take.legend.answered')}</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 shrink-0 rounded bg-amber-400" />{t('take.legend.flagged')}</span>
            </div>
        </div>
    );

    return (
        <div className={`min-h-screen bg-muted/30 select-none ${showNotice ? "[--exam-header:7.25rem]" : "[--exam-header:5rem]"}`} dir={i18n.dir()} onCopy={(e) => e.preventDefault()}>
            <Watermark text={stamp} />

            <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
                <div className="flex items-center gap-2 px-3 py-2 sm:px-5">
                    <Button variant="outline" size="icon" className="lg:hidden" onClick={() => setPanel(true)} aria-label={t('take.questions')}><LayoutGrid className="h-4 w-4" /></Button>
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center">
                            {attempt.student?.profile_pic_url ? <img src={attempt.student.profile_pic_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5 text-muted-foreground" />}
                        </div>
                        <div className="min-w-0 leading-tight">
                            <p className="truncate text-sm font-semibold">{attempt.student?.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{attempt.student?.serial ? `ID ${attempt.student.serial}` : attempt.exam.name}</p>
                        </div>
                    </div>
                    <span className="flex-1" />
                    <div className="flex items-center rounded-md border">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeScale(-1)} disabled={scale === TEXT_SCALES[0]} aria-label={t('take.smaller')}><AArrowDown className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeScale(1)} disabled={scale === TEXT_SCALES[TEXT_SCALES.length - 1]} aria-label={t('take.bigger')}><AArrowUp className="h-4 w-4" /></Button>
                    </div>
                    <div className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-semibold tabular-nums ${left !== null && left <= 60_000 ? 'bg-destructive text-destructive-foreground animate-pulse' : 'bg-muted'}`} dir={showEndTime ? undefined : 'ltr'}>
                        <Clock className="h-4 w-4 shrink-0" />
                        {showEndTime
                            ? <>
                                <span className="hidden whitespace-nowrap sm:inline">{t('take.endsAt', { time: endTime })}</span>
                                <span className="whitespace-nowrap text-xs sm:hidden">{shortEnd}</span>
                            </>
                            : <span className="font-mono">{left === null ? '--:--' : clock(left)}</span>}
                    </div>
                    <Button size="sm" onClick={async () => { await save(); setConfirming(true); }} disabled={submitting}><Send className="h-4 w-4" /><span className="hidden sm:inline">{t('take.submit')}</span></Button>
                </div>
                <div className="flex items-center gap-3 px-3 pb-2 sm:px-5">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-green-500 transition-all duration-500" style={{ width: `${order.length ? (answeredCount / order.length) * 100 : 0}%` }} />
                    </div>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">{t('take.progress', { done: answeredCount, total: order.length })}</span>
                </div>
                {/* The last ten minutes: a notice that stays until the end. */}
                {showNotice && (
                    <div className={`flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-semibold ${left <= 60_000 ? 'bg-destructive text-destructive-foreground' : 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200'}`}>
                        <Clock className="h-4 w-4 shrink-0" />
                        {t('take.autoSubmitNotice', { time: clock(left) })}
                    </div>
                )}
            </header>

            <div className="relative z-10 flex">
                <aside className={`order-last sticky top-[var(--exam-header)] hidden h-[calc(100vh-var(--exam-header))] ${stripWidth} shrink-0 overflow-y-auto border-s bg-card/90 px-2 py-4 backdrop-blur lg:block`}>
                    {squares}
                </aside>

                <main className="min-w-0 flex-1 px-3 py-5 sm:px-6">
                    {outOfFullscreen && (
                        <div className="mx-auto mb-4 flex max-w-5xl items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                            <span className="flex-1">{t('take.backToFullscreen')}</span>
                            <Button size="sm" variant="outline" onClick={requestFullscreen}><Maximize className="h-4 w-4" />{t('take.fullscreen')}</Button>
                        </div>
                    )}
                    <div className={`mx-auto ${passage ? 'grid max-w-6xl gap-4 lg:grid-cols-2' : 'max-w-4xl'}`}>
                        {passage && <PassagePanel passage={passage} scale={scale} n={passageInfo.get(q.id)?.n} />}
                        <QuestionFontContext.Provider value={look}>
                            <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-muted/40 px-4 py-3 sm:px-6">
                                    <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-primary px-2 text-base font-bold text-primary-foreground">{labels.get(q.id)}</span>
                                    <div className="min-w-0 leading-tight">
                                        {current.section.name && <p className="truncate text-xs font-semibold text-primary">{current.section.name}</p>}
                                        {passageInfo.get(q.id) && (
                                            <p className="text-xs font-medium text-muted-foreground">
                                                {t('take.passagePart', { n: passageInfo.get(q.id).n, index: passageInfo.get(q.id).index, size: passageInfo.get(q.id).size })}
                                            </p>
                                        )}
                                        <p className="mt-0.5 inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary">
                                            {t('take.markLabel')}
                                            <span className="text-base font-bold tabular-nums" dir="ltr">{formatMark(q.mark)}</span>
                                        </p>
                                    </div>
                                    <span className="flex-1" />
                                    {/* The code to quote when reporting a problem with this question. */}
                                    <span className="flex items-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-2 py-1 text-xs" title={t('take.serialHint')}>
                                        <span className="text-muted-foreground">{t('take.serial')}</span>
                                        <span className="font-mono font-bold tracking-wider" dir="ltr">{q.serial}</span>
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className={flagged
                                            ? 'border-amber-500 bg-amber-400 font-semibold text-amber-950 hover:bg-amber-500'
                                            : 'border-amber-400 font-semibold text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40'}
                                        onClick={() => setAnswer(q.id, { flagged: !flagged })}
                                        title={flagged ? t('take.unflagHint') : t('take.flagHint')}
                                    >
                                        <Flag className="h-4 w-4" fill={flagged ? 'currentColor' : 'none'} />{flagged ? t('take.flagged') : t('take.flag')}
                                    </Button>
                                </div>
                                <div className="p-4 sm:p-6">
                                    <QuestionView
                                        q={q}
                                        answer={answers[q.id]?.answer}
                                        onChange={(answer) => setAnswer(q.id, { answer })}
                                        files={files}
                                        onUpload={upload}
                                        uploading={uploading}
                                    />
                                </div>
                                <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-4 py-3 sm:px-6">
                                    <Button variant="outline" onClick={() => go(index - 1)} disabled={index === 0}><Prev className="h-4 w-4" />{t('take.prev')}</Button>
                                    <span className="text-sm text-muted-foreground tabular-nums">{index + 1} / {order.length}</span>
                                    {index < order.length - 1
                                        ? <Button onClick={() => go(index + 1)}>{t('take.next')}<Next className="h-4 w-4" /></Button>
                                        : <Button onClick={async () => { await save(); setConfirming(true); }}><Send className="h-4 w-4" />{t('take.submit')}</Button>}
                                </div>
                            </section>
                        </QuestionFontContext.Provider>
                    </div>
                </main>
            </div>

            {panel && (
                <div className="fixed inset-0 z-40 lg:hidden">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setPanel(false)} />
                    <div className="absolute inset-y-0 start-0 w-72 max-w-[85vw] overflow-y-auto bg-background p-4 shadow-xl">
                        <div className="mb-3 flex items-center justify-between">
                            <p className="font-semibold">{t('take.questions')}</p>
                            <Button variant="ghost" size="icon" onClick={() => setPanel(false)}><X className="h-4 w-4" /></Button>
                        </div>
                        {squares}
                    </div>
                </div>
            )}

            <Dialog open={confirming} onOpenChange={setConfirming}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('take.submitTitle')}</DialogTitle>
                        <DialogDescription>{unanswered ? t('take.submitUnanswered', { count: unanswered }) : t('take.submitAll')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setConfirming(false)}>{t('take.keepGoing')}</Button>
                        <Button onClick={() => submit(false)} disabled={submitting}>{submitting && <LoadingSpinner className="h-4 w-4" />}{t('take.submitNow')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={takenOver}>
                <DialogContent onInteractOutside={(e) => e.preventDefault()} className="[&>button]:hidden">
                    <DialogHeader>
                        <DialogTitle>{t('take.takenOverTitle')}</DialogTitle>
                        <DialogDescription>{t('take.takenOver')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button onClick={() => { setAttemptToken(id, null); window.location.reload(); }}>{t('take.continueHere')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

