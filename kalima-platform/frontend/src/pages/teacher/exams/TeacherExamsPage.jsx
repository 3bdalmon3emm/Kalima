import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, FileText, FolderOpen, QrCode } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import LinkQrDialog from '@/components/exams/LinkQrDialog';
import { STATE_STYLE } from '@/components/admin/exams/ExamTeachersTab';
import { teacherApi } from '@/components/admin/exams/api';

// "My exams": the folders the admin gave this teacher, as a tree, with the
// teacher's own link on every exam. An assistant sees their teachers' exams.
export default function TeacherExamsPage() {
    const { t } = useTranslation('exams');
    const [data, setData] = useState(null);
    const [closed, setClosed] = useState(() => new Set());
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
        return { kids, exams };
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
                </div>
            </Link>
            <Button variant="outline" size="sm" onClick={() => setQr(e)}><QrCode className="h-4 w-4" />QR</Button>
        </div>
    );

    const folderNode = (f, depth = 0) => {
        const open = !closed.has(f.id);
        const exams = tree.exams.get(f.id) || [];
        const children = tree.kids.get(f.id) || [];
        return (
            <div key={f.id} className={depth ? 'ms-4 border-s ps-3' : ''}>
                <button type="button" className="flex w-full items-center gap-2 py-2 text-start font-semibold"
                    onClick={() => setClosed((s) => { const n = new Set(s); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n; })}>
                    <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : 'rtl:rotate-90 -rotate-90'}`} />
                    <FolderOpen className="h-5 w-5 text-primary" />{f.name}
                </button>
                {open && (
                    <div className="space-y-2 pb-2">
                        {children.map((c) => folderNode(c, depth + 1))}
                        {exams.map(examRow)}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold">{t('teacher.title')}</h1>
                <p className="text-sm text-muted-foreground">{t('teacher.subtitle')}</p>
            </div>
            {data.exams.length === 0 ? (
                <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
                    <FileText className="mx-auto mb-3 h-10 w-10 opacity-50" />{t('teacher.empty')}
                </div>
            ) : (
                <div className="space-y-1">{(tree.kids.get(null) || []).map((f) => folderNode(f))}</div>
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
