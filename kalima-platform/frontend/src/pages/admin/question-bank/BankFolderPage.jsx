import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
    Archive, ChevronLeft, ChevronRight, Copy, CopyPlus, Folder, FolderOpen, FolderPlus, GraduationCap,
    Library, MoreVertical, Pencil, Plus, Tags, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { levelTitle } from '@/lib/levelUtils';
import SortableList from '@/components/admin/question-bank/SortableList';
import QuestionPreview, { QuestionBadges } from '@/components/admin/question-bank/QuestionPreview';
import {
    CategoriesDialog, CopyToDialog, LevelsDialog, NameDialog, showError,
} from '@/components/admin/question-bank/BankDialogs';
import { QUESTION_TYPES, qbGet, qbSend } from '@/components/admin/question-bank/api';
import { parseSmartPaste, pastedText, pastedType, setPendingPaste } from '@/components/admin/question-bank/smartPaste';
import { SerialSearch } from './QuestionBankPage';

const NONE = 'all';
const UNCATEGORIZED = 'none';

// Typing places where a paste belongs to the field, not to the page.
const isTypingTarget = (el) => !!el?.closest?.('input, textarea, select, [contenteditable="true"], math-field');

function FolderTree({ tree, currentId }) {
    const childrenOf = (id) => tree.filter((f) => f.parent_id === id);
    const root = tree.find((f) => f.parent_id === null);
    const node = (f, depth) => (
        <div key={f.id}>
            <Link
                to={`/admin/question-bank/folders/${f.id}`}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${f.id === currentId ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'}`}
                style={{ paddingInlineStart: `${depth * 14 + 8}px` }}
            >
                {depth === 0 ? <Library className="h-4 w-4 shrink-0" /> : f.id === currentId ? <FolderOpen className="h-4 w-4 shrink-0" /> : <Folder className="h-4 w-4 shrink-0" />}
                <span className="truncate">{f.name}</span>
            </Link>
            {childrenOf(f.id).map((c) => node(c, depth + 1))}
        </div>
    );
    return root ? node(root, 0) : null;
}

function NewQuestionMenu({ folderId, passageId, size = 'default', variant = 'default', label }) {
    const { t } = useTranslation('questionBank');
    const navigate = useNavigate();
    const go = (type) => navigate(`/admin/question-bank/folders/${folderId}/questions/new?type=${type}${passageId ? `&passage=${passageId}` : ''}`);
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button size={size} variant={variant}><Plus className="h-4 w-4" />{label || t('question.new')}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
                <DropdownMenuLabel>{t('question.pickType')}</DropdownMenuLabel>
                {QUESTION_TYPES.map((type) => (
                    <DropdownMenuItem key={type} onClick={() => go(type)}>{t(`types.${type}`)}</DropdownMenuItem>
                ))}
                {!passageId && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => go('passage')}>{t('types.passage')}</DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function QuestionActions({ q, onDuplicate, onCopy, onArchive }) {
    const { t } = useTranslation('questionBank');
    return (
        <div className="flex items-center">
            <Button variant="ghost" size="icon" asChild title={t('common.edit')}>
                <Link to={`/admin/question-bank/questions/${q.id}/edit`}><Pencil className="h-4 w-4" /></Link>
            </Button>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onDuplicate(q)}><CopyPlus className="h-4 w-4" />{t('question.duplicate')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onCopy([q.id])}><Copy className="h-4 w-4" />{t('question.copyTo')}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onArchive([q.id])} className="text-destructive">
                        <Archive className="h-4 w-4" />{t('common.archive')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}

export default function BankFolderPage() {
    const { id } = useParams();
    const folderId = Number(id);
    const { t, i18n } = useTranslation('questionBank');
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [folder, setFolder] = useState(null);
    const [tree, setTree] = useState([]);
    const [categories, setCategories] = useState([]);
    const [questions, setQuestions] = useState(null);
    const [selected, setSelected] = useState(new Set());
    const [filters, setFilters] = useState({ category_id: null, subcategory_id: null, reference_no: '' });
    const [dialog, setDialog] = useState(null); // 'newFolder' | 'rename' | 'levels' | 'categories' | 'copyBank'
    const [copyIds, setCopyIds] = useState(null);
    const [treeOpen, setTreeOpen] = useState(false);
    const focusId = Number(params.get('focus')) || null;

    const loadFolder = useCallback(async () => {
        try {
            const details = await qbGet(`/folders/${folderId}`);
            setFolder(details);
            const [bankTree, bankCategories] = await Promise.all([
                qbGet(`/banks/${details.bank_id}/tree`),
                qbGet(`/banks/${details.bank_id}/categories`),
            ]);
            setTree(bankTree);
            setCategories(bankCategories);
        } catch (err) {
            showError(err, t('errors.load'));
        }
    }, [folderId, t]);

    const loadQuestions = useCallback(async () => {
        try {
            const list = await qbGet(`/folders/${folderId}/questions`, {
                category_id: filters.category_id || undefined,
                subcategory_id: filters.subcategory_id || undefined,
                reference_no: filters.reference_no.trim() || undefined,
            });
            setQuestions(list);
        } catch (err) {
            showError(err, t('errors.load'));
            setQuestions([]);
        }
    }, [folderId, filters, t]);

    useEffect(() => {
        setFolder(null);
        setQuestions(null);
        setSelected(new Set());
        setFilters({ category_id: null, subcategory_id: null, reference_no: '' });
        setTreeOpen(false);
        loadFolder();
    }, [loadFolder]);
    useEffect(() => {
        const timer = setTimeout(loadQuestions, filters.reference_no ? 300 : 0);
        return () => clearTimeout(timer);
    }, [loadQuestions, filters.reference_no]);

    // A bank being filled by "copy bank": refresh until it is ready.
    useEffect(() => {
        if (folder?.copy_status !== 'copying') return;
        const timer = setInterval(refresh, 3000);
        return () => clearInterval(timer);
    }, [folder?.copy_status]); // eslint-disable-line react-hooks/exhaustive-deps

    // Ctrl+V on the page (outside any field) opens a new question with the
    // pasted text split into its fields, or the pasted picture as the question
    // image. The type follows the underlined answers (see pastedType). Nothing
    // is saved until the admin saves.
    useEffect(() => {
        const onPaste = (e) => {
            if (!folder || folder.copy_status || folder.hidden || dialog || copyIds) return;
            if (isTypingTarget(e.target) || document.querySelector('[role="dialog"]')) return;
            const text = pastedText({
                text: e.clipboardData?.getData('text/plain')?.trim(),
                html: e.clipboardData?.getData('text/html'),
            }).trim();
            // Word also puts a picture of the copied text on the clipboard,
            // so a picture counts only when nothing else was copied.
            const image = text ? null : [...(e.clipboardData?.files || [])].find((file) => file.type.startsWith('image/')) || null;
            if (!text && !image) return;
            e.preventDefault();
            setPendingPaste({ text, image });
            const type = text ? pastedType(parseSmartPaste(text)) : 'mcq_single';
            navigate(`/admin/question-bank/folders/${folderId}/questions/new?type=${type}`, { state: { pasted: true } });
        };
        document.addEventListener('paste', onPaste);
        return () => document.removeEventListener('paste', onPaste);
    }, [folder, folderId, dialog, copyIds, navigate]);

    // Coming from a serial search: scroll to the question and light it up.
    useEffect(() => {
        if (!focusId || !questions?.length) return;
        const el = document.getElementById(`q-${focusId}`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const timer = setTimeout(() => setParams({}, { replace: true }), 4000);
        return () => clearTimeout(timer);
    }, [focusId, questions, setParams]);

    const filtered = !!(filters.category_id || filters.reference_no.trim());
    const allIds = useMemo(() => (questions || []).map((q) => q.id), [questions]);
    const subcategories = categories.find((c) => c.id === filters.category_id)?.subcategories || [];

    const refresh = () => Promise.all([loadFolder(), loadQuestions()]);
    const act = async (fn, success) => {
        try {
            await fn();
            if (success) toast.success(success);
            setSelected(new Set());
            await refresh();
        } catch (err) {
            showError(err, t('errors.save'));
        }
    };

    const duplicate = (q) => act(() => qbSend('post', `/questions/${q.id}/duplicate`), t('question.duplicated'));
    const archiveQuestions = (ids) => {
        if (!window.confirm(t('question.archiveConfirm', { count: ids.length }))) return;
        act(() => qbSend('post', '/questions/archive', { ids }), t('common.archived'));
    };
    const reorderQuestions = async (ids, passageId = null) => {
        if (passageId) {
            setQuestions((prev) => prev.map((q) => (q.id === passageId ? { ...q, children: ids.map((cid) => q.children.find((c) => c.id === cid)) } : q)));
        } else {
            setQuestions((prev) => ids.map((qid) => prev.find((q) => q.id === qid)));
        }
        try {
            await qbSend('post', '/questions/reorder', { folder_id: folderId, passage_id: passageId, ids });
        } catch (err) {
            showError(err, t('errors.save'));
            loadQuestions();
        }
    };
    const reorderFolders = async (ids) => {
        setFolder((prev) => ({ ...prev, children: ids.map((fid) => prev.children.find((c) => c.id === fid)) }));
        try {
            await qbSend('post', '/folders/reorder', { parent_id: folderId, ids });
            loadFolder();
        } catch (err) {
            showError(err, t('errors.save'));
            loadFolder();
        }
    };
    const archiveFolder = async () => {
        if (!window.confirm(t(folder.is_bank ? 'bank.archiveConfirm' : 'folder.archiveConfirm', { name: folder.name }))) return;
        try {
            await qbSend('post', `/folders/${folderId}/archive`);
            toast.success(t('common.archived'));
            const parent = folder.breadcrumb[folder.breadcrumb.length - 2];
            navigate(parent ? `/admin/question-bank/folders/${parent.id}` : '/admin/question-bank');
        } catch (err) {
            showError(err, t('errors.save'));
        }
    };

    const toggle = (qid, on) => setSelected((prev) => {
        const next = new Set(prev);
        if (on) next.add(qid); else next.delete(qid);
        return next;
    });

    if (!folder) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;

    const Chevron = i18n.dir() === 'rtl' ? ChevronLeft : ChevronRight;
    const levels = folder.levels.levels;

    const questionCard = (q, handle, { child = false } = {}) => (
        <div
            id={`q-${q.id}`}
            className={`rounded-lg border bg-card p-4 space-y-3 transition-shadow ${focusId === q.id ? 'ring-2 ring-primary shadow-lg' : ''} ${child ? 'bg-muted/30' : ''}`}
        >
            <div className="flex items-start gap-2">
                {!filtered && handle}
                {!child && (
                    <Checkbox className="mt-1.5" checked={selected.has(q.id)} onCheckedChange={(v) => toggle(q.id, v === true)} />
                )}
                <div className="flex-1 min-w-0"><QuestionBadges q={q} /></div>
                <QuestionActions q={q} onDuplicate={duplicate} onCopy={setCopyIds} onArchive={archiveQuestions} />
            </div>
            <QuestionPreview q={q} />
            {q.type === 'passage' && (
                <div className="space-y-2 border-s-2 border-primary/30 ps-3">
                    <SortableList
                        items={q.children || []}
                        disabled={filtered}
                        onReorder={(ids) => reorderQuestions(ids, q.id)}
                        className="space-y-2"
                        renderItem={(c, h) => (
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-1">
                                    {t('passage.child', { n: `${(questions.findIndex((x) => x.id === q.id) + 1)}.${q.children.indexOf(c) + 1}` })}
                                </p>
                                {questionCard(c, h, { child: true })}
                            </div>
                        )}
                    />
                    {(q.children || []).length === 0 && <p className="text-sm text-muted-foreground">{t('passage.empty')}</p>}
                    <NewQuestionMenu folderId={folderId} passageId={q.id} size="sm" variant="outline" label={t('passage.addQuestion')} />
                </div>
            )}
        </div>
    );

    return (
        <div className="flex gap-6">
            {/* Tree */}
            <aside className={`${treeOpen ? 'fixed inset-0 z-40 bg-background p-4 overflow-y-auto' : 'hidden'} lg:static lg:block lg:w-64 lg:shrink-0`}>
                <div className="flex items-center justify-between lg:hidden mb-2">
                    <span className="font-semibold">{t('folder.tree')}</span>
                    <Button variant="ghost" size="icon" onClick={() => setTreeOpen(false)}><X className="h-4 w-4" /></Button>
                </div>
                <div className="lg:sticky lg:top-4 rounded-lg border bg-card p-2 max-h-[calc(100vh-6rem)] overflow-y-auto">
                    <FolderTree tree={tree} currentId={folderId} />
                </div>
            </aside>

            <div className="flex-1 min-w-0 space-y-5">
                {/* Breadcrumb + header */}
                <div className="space-y-3">
                    <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                        <Link to="/admin/question-bank" className="hover:text-foreground">{t('title')}</Link>
                        {folder.breadcrumb.map((b) => (
                            <span key={b.id} className="flex items-center gap-1">
                                <Chevron className="h-3.5 w-3.5" />
                                {b.id === folderId
                                    ? <span className="text-foreground font-medium">{b.name}</span>
                                    : <Link to={`/admin/question-bank/folders/${b.id}`} className="hover:text-foreground">{b.name}</Link>}
                            </span>
                        ))}
                    </nav>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-1.5">
                            <h1 className="text-2xl font-bold flex items-center gap-2">
                                {folder.is_bank ? <Library className="h-6 w-6 text-primary" /> : <FolderOpen className="h-6 w-6 text-primary" />}
                                {folder.name}
                            </h1>
                            <div className="flex flex-wrap items-center gap-1.5">
                                {folder.subjects && <Badge variant="secondary">{folder.subjects.title}</Badge>}
                                {levels.length > 0 ? levels.map((l) => (
                                    <Badge key={l.id} variant="outline">{levelTitle(l, i18n.language)}</Badge>
                                )) : <span className="text-xs text-muted-foreground">{t('folder.noLevels')}</span>}
                                {folder.levels.inherited_from && <span className="text-xs text-muted-foreground">({t('folder.inherited')})</span>}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setTreeOpen(true)}>
                                <Folder className="h-4 w-4" />{t('folder.tree')}
                            </Button>
                            <SerialSearch />
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline"><MoreVertical className="h-4 w-4" />{t('folder.actions')}</Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setDialog('rename')}><Pencil className="h-4 w-4" />{t('common.rename')}</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setDialog('levels')}><GraduationCap className="h-4 w-4" />{t('folder.levels')}</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setDialog('categories')}><Tags className="h-4 w-4" />{t('categories.title')}</DropdownMenuItem>
                                    {folder.is_bank && (
                                        <DropdownMenuItem onClick={() => setDialog('copyBank')}><Copy className="h-4 w-4" />{t('bank.copy')}</DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={archiveFolder} className="text-destructive">
                                        <Archive className="h-4 w-4" />{t('common.archive')}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </div>

                {folder.copy_status && (
                    <div className={`rounded-lg border p-3 text-sm ${folder.copy_status === 'failed' ? 'border-destructive text-destructive' : 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'}`}>
                        {folder.copy_status === 'failed' ? t('bank.copyFailedHint') : t('bank.copyingHint')}
                    </div>
                )}

                {/* Subfolders, then questions */}
                {folder.children.length === 0 && folder.question_count === 0 && (
                    <p className="text-sm text-muted-foreground">{t('folder.emptyHint')}</p>
                )}
                <section className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="font-semibold">{t('folder.subfolders')}</h2>
                        <Button size="sm" variant="outline" onClick={() => setDialog('newFolder')}>
                            <FolderPlus className="h-4 w-4" />{t('folder.new')}
                        </Button>
                    </div>
                    {folder.children.length > 0 && (
                        <SortableList
                            items={folder.children}
                            onReorder={reorderFolders}
                            className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
                            renderItem={(f, handle) => (
                                <div className="flex items-center gap-2 rounded-lg border bg-card p-3 hover:border-primary/50">
                                    {handle}
                                    <Link to={`/admin/question-bank/folders/${f.id}`} className="flex flex-1 items-center gap-2 min-w-0">
                                        <Folder className="h-5 w-5 text-primary shrink-0" />
                                        <span className="truncate font-medium">{f.name}</span>
                                    </Link>
                                </div>
                            )}
                        />
                    )}
                </section>

                <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="font-semibold">
                            {t('question.list')}
                            {questions && <span className="text-muted-foreground font-normal"> ({folder.question_count})</span>}
                        </h2>
                        <NewQuestionMenu folderId={folderId} />
                    </div>
                    <p className="text-xs text-muted-foreground">{t('question.pasteHint')}</p>

                    {(folder.question_count > 0 || filtered) && (
                        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
                            <label className="flex items-center gap-2 px-2 text-sm cursor-pointer">
                                <Checkbox
                                    checked={allIds.length > 0 && allIds.every((qid) => selected.has(qid))}
                                    onCheckedChange={(v) => setSelected(v === true ? new Set(allIds) : new Set())}
                                />
                                {t('question.selectAll')}
                            </label>
                            <Select
                                value={filters.category_id ? String(filters.category_id) : NONE}
                                onValueChange={(v) => setFilters((f) => ({
                                    ...f,
                                    category_id: v === NONE ? null : v === UNCATEGORIZED ? UNCATEGORIZED : Number(v),
                                    subcategory_id: null,
                                }))}
                            >
                                <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>{t('filters.allCategories')}</SelectItem>
                                    <SelectItem value={UNCATEGORIZED}>{t('filters.noCategory')}</SelectItem>
                                    {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            {subcategories.length > 0 && (
                                <Select
                                    value={filters.subcategory_id ? String(filters.subcategory_id) : NONE}
                                    onValueChange={(v) => setFilters((f) => ({ ...f, subcategory_id: v === NONE ? null : Number(v) }))}
                                >
                                    <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>{t('filters.allSubcategories')}</SelectItem>
                                        {subcategories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            )}
                            <Input
                                className="h-8 w-44"
                                value={filters.reference_no}
                                onChange={(e) => setFilters((f) => ({ ...f, reference_no: e.target.value }))}
                                placeholder={t('filters.referenceNo')}
                            />
                            {selected.size > 0 && (
                                <div className="flex gap-2 ms-auto">
                                    <Badge variant="secondary">{t('question.selected', { count: selected.size })}</Badge>
                                    <Button size="sm" variant="outline" onClick={() => setCopyIds([...selected])}>
                                        <Copy className="h-4 w-4" />{t('question.copyTo')}
                                    </Button>
                                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => archiveQuestions([...selected])}>
                                        <Archive className="h-4 w-4" />{t('common.archive')}
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                    {filtered && <p className="text-xs text-muted-foreground">{t('filters.noReorder')}</p>}

                    {questions === null ? (
                        <div className="flex justify-center py-10"><LoadingSpinner className="h-8 w-8 border-primary" /></div>
                    ) : questions.length === 0 ? (
                        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                            {filtered ? t('filters.noResults') : t('question.empty')}
                        </p>
                    ) : (
                        <SortableList
                            items={questions}
                            disabled={filtered}
                            onReorder={(ids) => reorderQuestions(ids)}
                            className="space-y-3"
                            renderItem={(q, handle) => questionCard(q, handle)}
                        />
                    )}
                </section>
            </div>

            <NameDialog
                open={dialog === 'newFolder'}
                onOpenChange={(o) => !o && setDialog(null)}
                title={t('folder.new')}
                confirmLabel={t('common.create')}
                onSubmit={async ({ name }) => {
                    await qbSend('post', '/folders', { parent_id: folderId, name });
                    toast.success(t('folder.created'));
                    loadFolder();
                }}
            />
            <NameDialog
                open={dialog === 'rename'}
                onOpenChange={(o) => !o && setDialog(null)}
                title={t('common.rename')}
                initialName={folder.name}
                withSubject={folder.is_bank}
                initialSubject={folder.subject_id}
                onSubmit={async ({ name, subject_id }) => {
                    await qbSend('patch', `/folders/${folderId}`, folder.is_bank ? { name, subject_id } : { name });
                    toast.success(t('common.saved'));
                    loadFolder();
                }}
            />
            <NameDialog
                open={dialog === 'copyBank'}
                onOpenChange={(o) => !o && setDialog(null)}
                title={t('bank.copyTitle', { name: folder.name })}
                initialName={t('bank.copyName', { name: folder.name })}
                confirmLabel={t('bank.copy')}
                onSubmit={async ({ name }) => {
                    const res = await qbSend('post', `/banks/${folderId}/copy`, { name });
                    toast.success(t('bank.copyStarted'));
                    navigate(`/admin/question-bank/folders/${res.data.bank.id}`);
                }}
            />
            <LevelsDialog open={dialog === 'levels'} onOpenChange={(o) => !o && setDialog(null)} folder={folder} onSaved={loadFolder} />
            <CategoriesDialog
                open={dialog === 'categories'}
                onOpenChange={(o) => !o && setDialog(null)}
                bankId={folder.bank_id}
                onChanged={refresh}
            />
            <CopyToDialog
                open={!!copyIds}
                onOpenChange={(o) => !o && setCopyIds(null)}
                currentBankId={folder.bank_id}
                count={copyIds?.length || 0}
                onCopy={async (target) => {
                    await qbSend('post', '/questions/copy', { ids: copyIds, folder_id: target });
                    toast.success(t('copy.done', { count: copyIds.length }));
                    setSelected(new Set());
                    if (target === folderId) refresh();
                }}
            />
        </div>
    );
}
