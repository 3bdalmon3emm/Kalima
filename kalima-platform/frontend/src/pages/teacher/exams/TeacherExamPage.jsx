import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronLeft, Copy, FileSpreadsheet, QrCode, RotateCcw, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import ExamPreview from '@/components/exams/ExamPreview';
import LinkQrDialog from '@/components/exams/LinkQrDialog';
import ReopenDialog from '@/components/exams/ReopenDialog';
import { formatDate } from '@/components/admin/exams/FolderTeachersPanel';
import { examLink, formatMark, teacherApi } from '@/components/admin/exams/api';
import { useExport } from '@/hooks/useExport';
import Pager, { usePagedList } from '@/components/exams/Pager';
import ResultsSummary from '@/components/exams/ResultsSummary';

const STATUS_STYLE = {
    pending: 'border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
    done: 'border-green-400 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300',
};

// One exam for its teacher: the link and QR, the students who came through
// it (open a paper, grade it, reopen for one student), and the exam itself
// read-only with the right answers.
export default function TeacherExamPage() {
    const { id } = useParams();
    const { t, i18n } = useTranslation('exams');
    const [params, setParams] = useSearchParams();
    const tab = params.get('tab') || 'students';
    const [data, setData] = useState(null);
    const [qr, setQr] = useState(null);
    const [reopen, setReopen] = useState(null);
    const { exportData, loading: exporting } = useExport();

    // The exam, its links and the summary; the students come a page at a
    // time, searched on the server.
    const load = () => teacherApi.get(`/exams/${id}`).then(setData).catch((err) => showError(err, t('errors.load')));
    useEffect(() => { setData(null); load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
    const list = usePagedList(({ q, page }) => teacherApi.get(`/exams/${id}/students`, { q, page }), [id], (err) => showError(err, t('errors.load')));
    const students = list.data?.items || [];
    const search = list.term;
    const setSearch = list.setTerm;

    if (!data) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
    const { exam } = data;
    const when = (d) => (d ? new Date(d).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');

    const exportExcel = () => exportData({
        resource: 'exam-teacher/results',
        format: 'xlsx',
        lang: i18n.language === 'ar' ? 'ar' : 'en',
        serializedFilters: true,
        filters: { exam_id: exam.id },
    });

    return (
        <div className="mx-auto max-w-5xl space-y-5">
            <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                <Link to="/teacher/exams" className="hover:text-foreground">{t('teacher.title')}</Link>
                <ChevronLeft className="h-4 w-4" />
                <span className="text-foreground">{exam.name}</span>
            </nav>

            <div className="space-y-2">
                <h1 className="text-2xl font-bold">{exam.name}</h1>
                <div className="flex flex-wrap gap-1.5 text-xs">
                    <Badge variant="secondary">{t(`types.${exam.type}`)}</Badge>
                    {exam.serial && <Badge variant="outline" dir="ltr">{exam.serial}</Badge>}
                    {exam.duration_minutes && <Badge variant="outline">{t('teacher.minutes', { count: exam.duration_minutes })}</Badge>}
                    <Badge variant="outline">{t('teacher.totalMarks', { total: formatMark(exam.total) })}</Badge>
                    <Badge variant="outline">{t('teacher.passAt', { percent: exam.pass_percent })}</Badge>
                </div>
            </div>

            {data.links.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
                    <div className="min-w-0 flex-1 space-y-1">
                        <code className="block truncate text-sm" dir="ltr">{examLink(l.code)}</code>
                        <p className="text-xs text-muted-foreground">{formatDate(l.starts_at)} ← {formatDate(l.ends_at)}{l.closed_at && <> · <span className="text-destructive">{t('teachers.states.closed')}</span></>}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(examLink(l.code)); toast.success(t('testLink.copied')); }}><Copy className="h-4 w-4" />{t('testLink.copy')}</Button>
                    <Button variant="outline" size="sm" onClick={() => setQr(l)}><QrCode className="h-4 w-4" />QR</Button>
                </div>
            ))}

            <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
                <TabsList>
                    <TabsTrigger value="students">{t('teacher.students', { count: data.summary?.students ?? 0 })}</TabsTrigger>
                    <TabsTrigger value="preview">{t('teacher.preview')}</TabsTrigger>
                </TabsList>

                <TabsContent value="students" className="space-y-3 pt-2">
                    <ResultsSummary summary={data.summary} passPercent={exam.pass_percent} />
                    <div className="flex flex-wrap items-center gap-2">
                        <Input className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('teacher.searchStudents')} />
                        <Button size="sm" variant="outline" className="ms-auto" onClick={exportExcel} disabled={exporting || !data.summary?.students}>
                            {exporting ? <LoadingSpinner className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4" />}{t('results.export')}
                        </Button>
                    </div>
                    {!list.data ? <div className="flex justify-center py-10"><LoadingSpinner /></div> : !students.length ? (
                        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t('results.empty')}</p>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 text-xs text-muted-foreground">
                                    <tr>
                                        <th className="p-2 text-start font-medium">{t('results.student')}</th>
                                        <th className="p-2 text-start font-medium">{t('teacher.level')}</th>
                                        <th className="p-2 text-start font-medium">{t('teacher.attempts')}</th>
                                        <th className="p-2 text-start font-medium">{t('teacher.best')}</th>
                                        <th className="p-2 text-start font-medium">{t('results.status')}</th>
                                        <th className="p-2" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {students.map((s) => {
                                        const last = s.attempts[s.attempts.length - 1];
                                        return (
                                            <tr key={s.student.id} className="border-t align-middle">
                                                <td className="p-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                                                            {s.student.profile_pic_url ? <img src={s.student.profile_pic_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-4 w-4 text-muted-foreground" />}
                                                        </div>
                                                        <div className="min-w-0 leading-tight">
                                                            <p className="truncate font-medium">{s.student.name || '—'}</p>
                                                            <p className="text-xs text-muted-foreground" dir="ltr">{[s.student.serial && `#${s.student.serial}`, s.student.phone].filter(Boolean).join(' · ')}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-2 text-xs">{s.student.level || '—'}</td>
                                                <td className="p-2">
                                                    <div className="flex flex-wrap gap-1">
                                                        {s.attempts.map((a) => (
                                                            <Link key={a.id} to={`/teacher/exams/attempts/${a.id}`} title={when(a.submitted_at)}
                                                                className={`rounded border px-1.5 py-0.5 text-xs tabular-nums hover:bg-muted ${STATUS_STYLE[a.status] || ''}`}>
                                                                {a.attempt_no}: {a.score === null ? t(`results.state.${a.status}`) : `${formatMark(a.score)}/${formatMark(a.total)}`}
                                                            </Link>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="p-2 tabular-nums">
                                                    {s.best === null ? '—' : <span className={s.band === 'fail' ? 'font-semibold text-destructive' : 'font-semibold'}>{formatMark(s.best)} / {formatMark(s.total)} <span className="text-xs text-muted-foreground">({s.percent}%)</span></span>}
                                                </td>
                                                <td className="p-2"><Badge variant="outline" className={STATUS_STYLE[s.last_status] || ''}>{t(`results.state.${s.last_status}`)}</Badge></td>
                                                <td className="p-2">
                                                    <div className="flex justify-end gap-1">
                                                        <Button size="sm" variant={last.status === 'pending' ? 'default' : 'outline'} asChild>
                                                            <Link to={`/teacher/exams/attempts/${last.id}`}>{last.status === 'pending' ? t('results.grade') : t('results.open')}</Link>
                                                        </Button>
                                                        <Button size="icon" variant="ghost" title={t('reopen.button')} onClick={() => setReopen({ attemptId: last.id, name: s.student.name })}><RotateCcw className="h-4 w-4" /></Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <Pager data={list.data} onPage={list.setPage} />
                </TabsContent>

                <TabsContent value="preview" className="pt-2">
                    {tab === 'preview' && <ExamPreview api={teacherApi} examId={exam.id} />}
                </TabsContent>
            </Tabs>

            <LinkQrDialog
                open={!!qr}
                onOpenChange={(o) => !o && setQr(null)}
                code={qr?.code}
                pngPath={qr && teacherApi.url(`/links/${qr.id}/qr.png`)}
                fileName={exam.name}
            />
            <ReopenDialog
                open={!!reopen}
                onOpenChange={(o) => !o && setReopen(null)}
                studentName={reopen?.name}
                send={async (body) => { await teacherApi.send('post', `/attempts/${reopen.attemptId}/reopen`, body); load(); list.reload(); }}
            />
        </div>
    );
}
