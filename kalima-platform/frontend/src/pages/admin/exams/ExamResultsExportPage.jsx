import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronLeft, Download, Search } from 'lucide-react';
import axios from '@/api/axios';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import { ex, exGet } from '@/components/admin/exams/api';
import { teacherMatches } from '@/components/admin/exams/FolderTeachersPanel';

// Exporting the results of many exams at once: the admin picks the exams,
// optionally some teachers, and the columns. One row per student, and for
// every exam a column per attempt.
const DEFAULT_STUDENT = ['serial', 'phone', 'level', 'teacher'];

function CheckRow({ checked, onChange, disabled = false, children }) {
    return (
        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
            <Checkbox checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(!!v)} />
            <span className="min-w-0 flex-1">{children}</span>
        </label>
    );
}

export default function ExamResultsExportPage() {
    const { t, i18n } = useTranslation('exams');
    const [opts, setOpts] = useState(null);
    const [search, setSearch] = useState('');
    const [exams, setExams] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [teacherTerm, setTeacherTerm] = useState('');
    const [studentFields, setStudentFields] = useState(DEFAULT_STUDENT);
    const [attemptFields, setAttemptFields] = useState(['score']);
    const [busy, setBusy] = useState(false);

    useEffect(() => { exGet('/results/export-options').then(setOpts).catch((err) => showError(err, t('errors.load'))); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (opts?.exams || []).filter((e) => !q || e.name.toLowerCase().includes(q) || (e.serial || '').toLowerCase().includes(q) || e.folder.toLowerCase().includes(q));
    }, [opts, search]);

    const toggle = (set, id, on) => set((list) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id)));
    const allShown = shown.length > 0 && shown.every((e) => exams.includes(e.id));

    const download = async (format) => {
        if (!exams.length) { toast.error(t('export.pickExam')); return; }
        setBusy(true);
        try {
            // Keep the exams in the order they are listed.
            const ordered = (opts.exams || []).map((e) => e.id).filter((id) => exams.includes(id));
            const res = await axios.post(ex(`/results/export-multi?format=${format}&lang=${i18n.language === 'en' ? 'en' : 'ar'}`), {
                exam_ids: ordered, teacher_ids: teachers, student_fields: studentFields, attempt_fields: attemptFields,
            }, { responseType: 'blob' });
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `exam-results-${new Date().toISOString().slice(0, 10)}.${format}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            showError(err, t('export.failed'));
        } finally {
            setBusy(false);
        }
    };

    if (!opts) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;

    return (
        <div className="space-y-5 pb-24">
            <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                <Link to="/admin/exams" className="hover:text-foreground">{t('title')}</Link>
                <ChevronLeft className="h-4 w-4" />
                <span className="text-foreground">{t('export.title')}</span>
            </nav>
            <div>
                <h1 className="text-2xl font-bold">{t('export.title')}</h1>
                <p className="text-sm text-muted-foreground">{t('export.subtitle')}</p>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
                <section className="space-y-3 rounded-xl border bg-card p-4 lg:col-span-2">
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="font-semibold">{t('export.exams')} <Badge variant="secondary">{exams.length}</Badge></h2>
                        <Button size="sm" variant="ghost" onClick={() => setExams(allShown ? exams.filter((id) => !shown.some((e) => e.id === id)) : [...new Set([...exams, ...shown.map((e) => e.id)])])}>
                            {allShown ? t('export.unselectAll') : t('export.selectAll')}
                        </Button>
                    </div>
                    <div className="relative">
                        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('export.search')} className="ps-9" />
                    </div>
                    <div className="max-h-[28rem] overflow-y-auto rounded-lg border p-1">
                        {shown.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">{t('export.noExams')}</p>}
                        {shown.map((e) => (
                            <CheckRow key={e.id} checked={exams.includes(e.id)} onChange={(on) => toggle(setExams, e.id, on)}>
                                <span className="font-medium">{e.name}</span>
                                <span className="ms-2 text-xs text-muted-foreground">{e.folder}{e.serial ? ` · ${e.serial}` : ''} · {t(`types.${e.type}`)} · {t('export.attempts', { count: e.attempts })}</span>
                                {e.archived && <Badge variant="destructive" className="ms-2">{t('common.archived')}</Badge>}
                            </CheckRow>
                        ))}
                    </div>
                </section>

                <div className="space-y-5">
                    <section className="space-y-2 rounded-xl border bg-card p-4">
                        <h2 className="font-semibold">{t('export.teachers')}</h2>
                        <p className="text-xs text-muted-foreground">{t('export.teachersHint')}</p>
                        {opts.teachers.length > 0 && (
                            <Input value={teacherTerm} onChange={(e) => setTeacherTerm(e.target.value)} placeholder={t('teachers.searchTeachers')} />
                        )}
                        <div className="max-h-48 overflow-y-auto">
                            {opts.teachers.filter((tc) => teacherMatches(tc, teacherTerm)).map((tc) => (
                                <CheckRow key={tc.id} checked={teachers.includes(tc.id)} onChange={(on) => toggle(setTeachers, tc.id, on)}>{tc.name}</CheckRow>
                            ))}
                        </div>
                    </section>
                    <section className="space-y-2 rounded-xl border bg-card p-4">
                        <h2 className="font-semibold">{t('export.columns')}</h2>
                        <CheckRow checked disabled onChange={() => {}}>{t('export.field.student')}</CheckRow>
                        {opts.student_fields.map((f) => (
                            <CheckRow key={f} checked={studentFields.includes(f)} onChange={(on) => toggle(setStudentFields, f, on)}>{t(`export.field.${f}`)}</CheckRow>
                        ))}
                        <p className="pt-2 text-xs font-semibold text-muted-foreground">{t('export.perAttempt')}</p>
                        {opts.attempt_fields.map((f) => (
                            <CheckRow key={f} checked={attemptFields.includes(f)} onChange={(on) => toggle(setAttemptFields, f, on)}>{t(`export.field.${f}`)}</CheckRow>
                        ))}
                    </section>
                </div>
            </div>

            <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur">
                <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
                    <span className="flex-1 text-sm text-muted-foreground">{t('export.summary', { count: exams.length })}</span>
                    <Button variant="outline" onClick={() => download('csv')} disabled={busy || !exams.length}>CSV</Button>
                    <Button onClick={() => download('xlsx')} disabled={busy || !exams.length}>{busy ? <LoadingSpinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}Excel</Button>
                </div>
            </div>
        </div>
    );
}
