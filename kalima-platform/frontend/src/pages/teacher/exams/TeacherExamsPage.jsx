import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, FileText, Folder, QrCode, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import LinkQrDialog from '@/components/exams/LinkQrDialog';
import { STATE_STYLE } from '@/components/admin/exams/ExamTeachersTab';
import { teacherApi } from '@/components/admin/exams/api';

// "My exams": the folders the admin gave this teacher as cards (open one to
// see its subfolders and exams), with the teacher's own link on every exam.
// A search finds an exam in any folder. An assistant sees their teachers'
// exams. ?folder= keeps the open folder in the address.
export default function TeacherExamsPage() {
    const { t } = useTranslation('exams');
    const [data, setData] = useState(null);
    const [params, setParams] = useSearchParams();
    const [search, setSearch] = useState('');
    const [qr, setQr] = useState(null);

    useEffect(() => { teacherApi.get('/exams').then(setData).catch((err) => { setData({ folders: [], exams: [], teachers: [] }); showError(err, t('errors.load')); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const tree = useMemo(() => {
        if (!data) return null;
        const ids = new Set(data.folders.map((f) => f.id));
        const kids = new Map();
        for (const f of data.folders) {
            const parent = ids.has(f.parent_id) ? f.parent_id : null;
            kids.set(parent, [...(kids.get(parent) || []), f]);
        }
        for (const list of kids.values()) list.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
        const exams = new Map();
        for (const e of data.exams) exams.set(e.folder_id, [...(exams.get(e.folder_id) || []), e]);
        const byId = new Map(data.folders.map((f) => [f.id, f]));
        // Each folder's totals count everything under it.
        const totals = new Map();
        const sum = (id) => {
            if (totals.has(id)) return totals.get(id);
            const own = exams.get(id) || [];
            const total = { exams: own.length, pending: own.reduce((s, e) => s + e.pending, 0), appeals: own.reduce((s, e) => s + e.appeals, 0) };
            for (const c of kids.get(id) || []) {
                const sub = sum(c.id);
                total.exams += sub.exams;
                total.pending += sub.pending;
                total.appeals += sub.appeals;
            }
            totals.set(id, total);
            return total;
        };
        for (const f of data.folders) sum(f.id);
        return { ids, kids, exams, byId, totals };
    }, [data]);

    if (!data) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
    const many = data.teachers.length > 1;
    const teacherName = (id) => data.teachers.find((u) => u.id === id)?.name;

    const examRow = (e) => (
        <div key={`${e.id}-${e.teacher_id}`} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
            <FileText className="h-5 w-5 shrink-0 text-primary" />
            <Link to={`/teacher/exams/${e.id}`} className="min-w-0 flex-1">
                <p className="truncate font-medium">{e.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge variant="secondary">{t(`types.${e.type}`)}</Badge>
                    <Badge className={STATE_STYLE[e.state]}>{t(`teachers.states.${e.state}`)}</Badge>
                    {many && <Badge variant="outline">{teacherName(e.teacher_id)}</Badge>}
                    <span className="text-muted-foreground">{t('teacher.attemptsCount', { count: e.attempts })}</span>
                    {e.pending > 0 && <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">{t('teacher.pendingCount', { count: e.pending })}</Badge>}
                    {e.appeals > 0 && <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200">{t('teacher.appealsCount', { count: e.appeals })}</Badge>}
                </div>
            </Link>
            <Button variant="outline" size="sm" onClick={() => setQr(e)}><QrCode className="h-4 w-4" />QR</Button>
        </div>
    );

    const wanted = Number(params.get('folder'));
    const current = tree.byId.get(wanted) ?? null;
    const open = (id) => { setSearch(''); setParams(id ? { folder: String(id) } : {}); };

    // The way from the top folder down to the open one.
    const trail = [];
    for (let f = current; f; f = tree.ids.has(f.parent_id) ? tree.byId.get(f.parent_id) : null) trail.unshift(f);

    const folderCard = (f) => {
        const total = tree.totals.get(f.id);
        return (
            <button key={f.id} type="button" onClick={() => open(f.id)}
                className="flex items-start gap-3 rounded-xl border bg-card p-4 text-start transition-colors hover:border-primary/50 hover:bg-muted/40">
                <Folder className="h-8 w-8 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{f.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">{t('teacher.examsCount', { count: total.exams })}</span>
                        {total.pending > 0 && <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">{t('teacher.pendingCount', { count: total.pending })}</Badge>}
                        {total.appeals > 0 && <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200">{t('teacher.appealsCount', { count: total.appeals })}</Badge>}
                    </div>
                </div>
            </button>
        );
    };

    const q = search.trim().toLowerCase();
    const found = q ? data.exams.filter((e) => e.name.toLowerCase().includes(q) || (e.serial || '').toLowerCase().includes(q)) : null;
    const folders = tree.kids.get(current ? current.id : null) || [];
    const exams = current ? tree.exams.get(current.id) || [] : [];

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold">{t('teacher.title')}</h1>
                <p className="text-sm text-muted-foreground">{t('teacher.subtitle')}</p>
            </div>
            {data.exams.length === 0 ? (
                <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
                    <FileText className="mx-auto mb-3 h-10 w-10 opacity-50" />{t('teacher.empty')}
                </div>
            ) : (
                <>
                    <div className="relative">
                        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('teacher.search')} className="ps-9" />
                    </div>
                    {found ? (
                        <div className="space-y-2">
                            {found.length ? found.map(examRow) : <p className="py-8 text-center text-sm text-muted-foreground">{t('teacher.noMatch')}</p>}
                        </div>
                    ) : (
                        <>
                            {current && (
                                <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                                    <button type="button" onClick={() => open(null)} className="hover:text-foreground">{t('teacher.title')}</button>
                                    {trail.map((f) => (
                                        <span key={f.id} className="flex items-center gap-1">
                                            <ChevronLeft className="h-4 w-4 ltr:rotate-180" />
                                            <button type="button" onClick={() => open(f.id)} className={f.id === current.id ? 'font-semibold text-foreground' : 'hover:text-foreground'}>{f.name}</button>
                                        </span>
                                    ))}
                                </nav>
                            )}
                            {folders.length > 0 && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{folders.map(folderCard)}</div>}
                            {exams.length > 0 && <div className="space-y-2">{exams.map(examRow)}</div>}
                        </>
                    )}
                </>
            )}
            <LinkQrDialog
                open={!!qr}
                onOpenChange={(o) => !o && setQr(null)}
                code={qr?.link.code}
                pngPath={qr && teacherApi.url(`/links/${qr.link.id}/qr.png`)}
                fileName={qr?.name}
            />
        </div>
    );
}
