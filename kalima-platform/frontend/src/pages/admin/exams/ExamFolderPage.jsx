import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Archive, ChevronLeft, FileText, FolderOpen, FolderPlus, MoreVertical, Pencil, Plus, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import LoadingSpinner from '@/components/ui/loading-spinner';
import SortableList from '@/components/admin/question-bank/SortableList';
import { NameDialog, showError } from '@/components/admin/question-bank/BankDialogs';
import { exGet, exSend } from '@/components/admin/exams/api';
import { AddFolderTeacherDialog, FolderTeachersDialog } from '@/components/admin/exams/FolderTeachersPanel';

// Name, exam or homework, and manual or random. The way it is built cannot
// change later; everything else is in the exam's settings.
function NewExamDialog({ open, onOpenChange, folderId }) {
    const { t } = useTranslation('exams');
    const navigate = useNavigate();
    const [form, setForm] = useState({ name: '', type: 'exam', mode: 'manual' });
    const [saving, setSaving] = useState(false);
    useEffect(() => { if (open) setForm({ name: '', type: 'exam', mode: 'manual' }); }, [open]);

    const submit = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            const res = await exSend('post', `/folders/${folderId}/exams`, form);
            toast.success(t('exam.created'));
            navigate(`/admin/exams/${res.data.id}`);
        } catch (err) {
            showError(err, t('errors.save'));
        } finally {
            setSaving(false);
        }
    };

    const choice = (field, values) => (
        <RadioGroup value={form[field]} onValueChange={(v) => setForm((f) => ({ ...f, [field]: v }))} className="grid gap-2">
            {values.map((v) => (
                <label key={v} className="flex items-start gap-3 rounded-md border p-3 cursor-pointer has-[[data-state=checked]]:border-primary">
                    <RadioGroupItem value={v} className="mt-1" />
                    <span>
                        <span className="font-medium block">{t(`${field}s.${v}`)}</span>
                        <span className="text-xs text-muted-foreground">{t(`${field}s.${v}Hint`)}</span>
                    </span>
                </label>
            ))}
        </RadioGroup>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <form onSubmit={submit} className="space-y-4">
                    <DialogHeader><DialogTitle>{t('exam.new')}</DialogTitle></DialogHeader>
                    <div className="space-y-1">
                        <Label>{t('settings.name')}</Label>
                        <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
                    </div>
                    <div className="space-y-1"><Label>{t('settings.type')}</Label>{choice('type', ['exam', 'homework'])}</div>
                    <div className="space-y-1"><Label>{t('settings.mode')}</Label>{choice('mode', ['manual', 'random'])}</div>
                    <DialogFooter>
                        <Button type="submit" disabled={saving || !form.name.trim()}>
                            {saving && <LoadingSpinner className="h-4 w-4" />}{t('common.create')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default function ExamFolderPage() {
    const { id } = useParams();
    const { t } = useTranslation('exams');
    const [folder, setFolder] = useState(null);
    const [dialog, setDialog] = useState(null);
    const [teachers, setTeachers] = useState(null);

    const load = () => exGet(`/folders/${id}`).then(setFolder).catch((err) => showError(err, t('errors.load')));
    useEffect(() => { setFolder(null); load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    const act = async (fn, message) => {
        try {
            await fn();
            if (message) toast.success(message);
            load();
        } catch (err) {
            showError(err, t('errors.save'));
            load();
        }
    };

    if (!folder) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;

    return (
        <div className="space-y-6">
            <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                <Link to="/admin/exams" className="hover:text-foreground">{t('title')}</Link>
                {folder.breadcrumb.map((b) => (
                    <span key={b.id} className="flex items-center gap-1">
                        <ChevronLeft className="h-4 w-4" />
                        <Link to={`/admin/exams/folders/${b.id}`} className="hover:text-foreground">{b.name}</Link>
                    </span>
                ))}
            </nav>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold">{folder.name}</h1>
                    <Button variant="ghost" size="icon" onClick={() => setDialog('rename')} title={t('common.rename')}><Pencil className="h-4 w-4" /></Button>
                    {folder.hidden && <Badge variant="destructive">{t('common.archived')}</Badge>}
                </div>
                <div className="flex flex-wrap gap-2">
                    {/* The teachers open in a side list, so a long list never pushes the exams down. */}
                    <Button variant="outline" onClick={() => setTeachers({ type: 'list', folder })}><Users className="h-4 w-4" />{t('teachers.folderTitle')}</Button>
                    {!folder.hidden && (
                        <>
                            <Button variant="outline" onClick={() => setDialog('folder')}><FolderPlus className="h-4 w-4" />{t('folder.newSub')}</Button>
                            <Button onClick={() => setDialog('exam')}><Plus className="h-4 w-4" />{t('exam.new')}</Button>
                        </>
                    )}
                </div>
            </div>

            {folder.children.length > 0 && (
                <SortableList
                    items={folder.children}
                    onReorder={(ids) => {
                        setFolder((f) => ({ ...f, children: ids.map((cid) => f.children.find((c) => c.id === cid)) }));
                        act(() => exSend('post', '/folders/reorder', { parent_id: folder.id, ids }));
                    }}
                    className="space-y-2"
                    renderItem={(child, handle) => (
                        <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
                            {handle}
                            <FolderOpen className="h-5 w-5 text-primary shrink-0" />
                            <Link to={`/admin/exams/folders/${child.id}`} className="flex-1 truncate font-medium">{child.name}</Link>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setTeachers({ type: 'add', folder: child })}>
                                        <UserPlus className="h-4 w-4" />{t('teachers.add')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setTeachers({ type: 'list', folder: child })}>
                                        <Users className="h-4 w-4" />{t('teachers.folderTitle')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive"
                                        onClick={() => window.confirm(t('folder.archiveConfirm', { name: child.name })) && act(() => exSend('post', `/folders/${child.id}/archive`), t('common.archived'))}>
                                        <Archive className="h-4 w-4" />{t('common.archive')}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )}
                />
            )}

            {folder.exams.length === 0 && folder.children.length === 0 ? (
                <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />{t('folder.emptyFolder')}
                </div>
            ) : folder.exams.length > 0 && (
                <SortableList
                    items={folder.exams}
                    onReorder={(ids) => {
                        setFolder((f) => ({ ...f, exams: ids.map((eid) => f.exams.find((e) => e.id === eid)) }));
                        act(() => exSend('post', `/folders/${folder.id}/exams/reorder`, { ids }));
                    }}
                    className="space-y-2"
                    renderItem={(exam, handle) => (
                        <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
                            {handle}
                            <FileText className="h-5 w-5 text-primary shrink-0" />
                            <Link to={`/admin/exams/${exam.id}`} className="flex-1 min-w-0">
                                <p className="font-medium truncate">{exam.name}</p>
                                <div className="flex flex-wrap gap-1.5 mt-1 text-xs">
                                    <Badge variant="secondary">{t(`types.${exam.type}`)}</Badge>
                                    <Badge variant="outline">{t(`modes.${exam.mode}`)}</Badge>
                                    {exam.serial && <Badge variant="outline" dir="ltr">{exam.serial}</Badge>}
                                    {exam.subjects && <Badge variant="outline">{exam.subjects.title}</Badge>}
                                    <Badge className={exam.published_at ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-muted text-muted-foreground'}>
                                        {exam.published_at ? t('exam.published') : t('exam.draft')}
                                    </Badge>
                                    <span className="text-muted-foreground">{t('exam.questionCount', { count: exam.question_count })}</span>
                                </div>
                            </Link>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem className="text-destructive"
                                        onClick={() => window.confirm(t('exam.archiveConfirm', { name: exam.name })) && act(() => exSend('post', `/exams/${exam.id}/archive`), t('common.archived'))}>
                                        <Archive className="h-4 w-4" />{t('common.archive')}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )}
                />
            )}

            <NameDialog
                open={dialog === 'folder'}
                onOpenChange={(o) => !o && setDialog(null)}
                title={t('folder.newSub')}
                confirmLabel={t('common.create')}
                onSubmit={async ({ name }) => { await exSend('post', '/folders', { parent_id: folder.id, name }); toast.success(t('folder.created')); load(); }}
            />
            <NameDialog
                open={dialog === 'rename'}
                onOpenChange={(o) => !o && setDialog(null)}
                title={t('common.rename')}
                initialName={folder.name}
                confirmLabel={t('common.save')}
                onSubmit={async ({ name }) => { await exSend('patch', `/folders/${folder.id}`, { name }); load(); }}
            />
            <AddFolderTeacherDialog folder={teachers?.folder} open={teachers?.type === 'add'} onOpenChange={(o) => !o && setTeachers(null)} />
            <FolderTeachersDialog folder={teachers?.folder} open={teachers?.type === 'list'} onOpenChange={(o) => !o && setTeachers(null)} />
            <NewExamDialog open={dialog === 'exam'} onOpenChange={(o) => !o && setDialog(null)} folderId={folder.id} />
        </div>
    );
}
