import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Archive, FolderOpen, MoreVertical, Plus, Search, FileText, MessageSquareWarning, Download, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import LoadingSpinner from '@/components/ui/loading-spinner';
import SortableList from '@/components/admin/question-bank/SortableList';
import { NameDialog, showError } from '@/components/admin/question-bank/BankDialogs';
import SoundsPanel from '@/components/admin/exams/SoundsPanel';
import { AddFolderTeacherDialog, FolderTeachersDialog } from '@/components/admin/exams/FolderTeachersPanel';
import { exGet, exSend } from '@/components/admin/exams/api';

// Search exams by name or serial anywhere in the tree.
function ExamSearch() {
    const { t } = useTranslation('exams');
    const [term, setTerm] = useState('');
    const [results, setResults] = useState(null);
    const submit = async (e) => {
        e.preventDefault();
        try {
            setResults(await exGet('/exams', { q: term.trim() }));
        } catch (err) {
            showError(err, t('errors.load'));
        }
    };
    return (
        <div className="space-y-2">
            <form onSubmit={submit} className="flex gap-2">
                <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('search.placeholder')} className="sm:w-72" />
                <Button type="submit" variant="outline"><Search className="h-4 w-4" />{t('search.button')}</Button>
            </form>
            {results && (
                <div className="rounded-lg border bg-card divide-y">
                    {results.length === 0 && <p className="p-3 text-sm text-muted-foreground">{t('search.none')}</p>}
                    {results.map((e) => (
                        <Link key={e.id} to={`/admin/exams/${e.id}`} className="flex items-center gap-2 p-3 hover:bg-muted/50">
                            <FileText className="h-4 w-4 text-primary" />
                            <span className="flex-1 truncate">{e.name}</span>
                            {e.serial && <Badge variant="outline" dir="ltr">{e.serial}</Badge>}
                            <Badge variant="secondary">{t(`types.${e.type}`)}</Badge>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function ExamsPage() {
    const { t } = useTranslation('exams');
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [folders, setFolders] = useState(null);
    const [creating, setCreating] = useState(false);
    const [teachers, setTeachers] = useState(null);
    const tab = params.get('tab') || 'exams';

    const load = () => exGet('/folders').then(setFolders).catch((err) => { setFolders([]); showError(err, t('errors.load')); });
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reorder = async (ids) => {
        setFolders((prev) => ids.map((id) => prev.find((f) => f.id === id)));
        try {
            await exSend('post', '/folders/reorder', { parent_id: null, ids });
        } catch (err) {
            showError(err, t('errors.save'));
            load();
        }
    };

    const archive = async (folder) => {
        if (!window.confirm(t('folder.archiveConfirm', { name: folder.name }))) return;
        try {
            await exSend('post', `/folders/${folder.id}/archive`);
            toast.success(t('common.archived'));
            load();
        } catch (err) {
            showError(err, t('errors.save'));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold">{t('title')}</h1>
                    <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" asChild>
                        <Link to="/admin/exams/export"><Download className="h-4 w-4" />{t('export.title')}</Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link to="/admin/exams/appeals"><MessageSquareWarning className="h-4 w-4" />{t('appeals.title')}</Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link to="/admin/exams/archive"><Archive className="h-4 w-4" />{t('archive.title')}</Link>
                    </Button>
                </div>
            </div>

            <Tabs value={tab} onValueChange={(v) => setParams(v === 'exams' ? {} : { tab: v }, { replace: true })}>
                <TabsList>
                    <TabsTrigger value="exams">{t('tabs.exams')}</TabsTrigger>
                    <TabsTrigger value="celebrations">{t('tabs.celebrations')}</TabsTrigger>
                </TabsList>

                <TabsContent value="exams" className="space-y-4 pt-2">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <ExamSearch />
                        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />{t('folder.new')}</Button>
                    </div>
                    {folders === null ? (
                        <div className="flex justify-center py-16"><LoadingSpinner /></div>
                    ) : folders.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
                            <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-50" />
                            {t('folder.empty')}
                        </div>
                    ) : (
                        <SortableList
                            items={folders}
                            onReorder={reorder}
                            className="space-y-2"
                            renderItem={(folder, handle) => (
                                <div className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:border-primary/50 transition-colors">
                                    {handle}
                                    <FolderOpen className="h-5 w-5 text-primary shrink-0" />
                                    <Link to={`/admin/exams/folders/${folder.id}`} className="flex-1 min-w-0 font-semibold truncate">{folder.name}</Link>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => setTeachers({ type: 'add', folder })}>
                                                <UserPlus className="h-4 w-4" />{t('teachers.add')}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setTeachers({ type: 'list', folder })}>
                                                <Users className="h-4 w-4" />{t('teachers.folderTitle')}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => archive(folder)} className="text-destructive">
                                                <Archive className="h-4 w-4" />{t('common.archive')}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            )}
                        />
                    )}
                </TabsContent>

                <TabsContent value="celebrations" className="pt-2">
                    <SoundsPanel />
                </TabsContent>
            </Tabs>

            <AddFolderTeacherDialog folder={teachers?.folder} open={teachers?.type === 'add'} onOpenChange={(o) => !o && setTeachers(null)} />
            <FolderTeachersDialog folder={teachers?.folder} open={teachers?.type === 'list'} onOpenChange={(o) => !o && setTeachers(null)} />
            <NameDialog
                open={creating}
                onOpenChange={setCreating}
                title={t('folder.new')}
                confirmLabel={t('common.create')}
                onSubmit={async ({ name }) => {
                    const res = await exSend('post', '/folders', { name });
                    toast.success(t('folder.created'));
                    navigate(`/admin/exams/folders/${res.data.id}`);
                }}
            />
        </div>
    );
}
