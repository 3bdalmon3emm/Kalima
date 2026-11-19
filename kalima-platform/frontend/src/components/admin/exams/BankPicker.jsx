import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import LoadingSpinner from '@/components/ui/loading-spinner';
import MathText from '@/components/admin/question-bank/MathText';
import { qbGet } from '@/components/admin/question-bank/api';
import QuestionPreview from '@/components/admin/question-bank/QuestionPreview';
import { showError } from '@/components/admin/question-bank/BankDialogs';

// Folders of a bank as a nested list; `renderFolder` draws one row.
export function FolderTree({ folders, renderFolder }) {
    const children = useMemo(() => {
        const map = new Map();
        for (const f of folders) map.set(f.parent_id, [...(map.get(f.parent_id) || []), f]);
        return map;
    }, [folders]);
    const root = folders.find((f) => f.parent_id === null);
    const walk = (folder, depth) => (
        <div key={folder.id}>
            {renderFolder(folder, depth)}
            {(children.get(folder.id) || []).map((c) => walk(c, depth + 1))}
        </div>
    );
    return root ? walk(root, 0) : null;
}

export function useBanks(open) {
    const [banks, setBanks] = useState([]);
    useEffect(() => { if (open) qbGet('/banks').then(setBanks).catch(() => setBanks([])); }, [open]);
    return banks;
}

export function useBankTree(bankId) {
    const [tree, setTree] = useState([]);
    useEffect(() => {
        setTree([]);
        if (bankId) qbGet(`/banks/${bankId}/tree`).then(setTree).catch(() => setTree([]));
    }, [bankId]);
    return tree;
}

// Picks bank questions for a manual exam. The picks keep the order they were
// ticked in; from a passage the admin ticks the children they want. Each
// question shows in full (options and the correct answer) so the admin can
// judge it without opening the bank.
export default function BankPicker({ open, onOpenChange, onAdd, existing = [] }) {
    const { t } = useTranslation('exams');
    const tq = useTranslation('questionBank').t;
    const banks = useBanks(open);
    const [bankId, setBankId] = useState(null);
    const tree = useBankTree(bankId);
    const [folderId, setFolderId] = useState(null);
    const [questions, setQuestions] = useState(null);
    const [picked, setPicked] = useState([]);
    const [adding, setAdding] = useState(false);
    const already = useMemo(() => new Set(existing), [existing]);

    useEffect(() => { if (open) { setPicked([]); setFolderId(null); setQuestions(null); } }, [open]);
    useEffect(() => { if (!bankId && banks.length) setBankId(banks[0].id); }, [banks, bankId]);
    useEffect(() => {
        if (!folderId) return;
        setQuestions(null);
        qbGet(`/folders/${folderId}/questions`).then(setQuestions).catch((err) => { setQuestions([]); showError(err, t('errors.load')); });
    }, [folderId]); // eslint-disable-line react-hooks/exhaustive-deps

    const selectable = (questions || []).flatMap((q) => (q.type === 'passage' ? q.children : [q])).filter((q) => !already.has(q.id));
    const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    const allPicked = selectable.length > 0 && selectable.every((q) => picked.includes(q.id));
    const toggleAll = () => setPicked((p) => (allPicked
        ? p.filter((id) => !selectable.some((q) => q.id === id))
        : [...p, ...selectable.map((q) => q.id).filter((id) => !p.includes(id))]));

    const add = async () => {
        setAdding(true);
        try {
            await onAdd(picked);
            onOpenChange(false);
        } finally {
            setAdding(false);
        }
    };

    const row = (q, child = false) => {
        const taken = already.has(q.id);
        const on = taken || picked.includes(q.id);
        return (
            // A click anywhere on the card ticks it, except on its own buttons
            // (the checkbox, "show details").
            <div
                key={q.id}
                onClick={(e) => { if (!taken && !e.target.closest('button, a, audio, video')) toggle(q.id); }}
                className={`flex items-start gap-3 rounded-lg border p-3 ${child ? 'ms-6' : ''} ${on && !taken ? 'border-primary bg-primary/5' : ''} ${taken ? 'opacity-50' : 'cursor-pointer hover:bg-muted/40'}`}
            >
                <Checkbox checked={on} disabled={taken} onCheckedChange={() => toggle(q.id)} className="mt-1" />
                <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap gap-1 text-xs">
                        <Badge variant="outline" className="font-mono" dir="ltr">{q.serial}</Badge>
                        <Badge variant="secondary">{tq(`types.${q.type}`)}</Badge>
                        {q.difficulty && <Badge variant="outline">{tq(`difficulty.${q.difficulty}`)}</Badge>}
                        {q.category && <Badge variant="outline">{q.category.name}</Badge>}
                        {taken && <Badge>{t('picker.inExam')}</Badge>}
                    </div>
                    <QuestionPreview q={q} />
                </div>
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[92vh] w-[96vw] max-w-[96vw] flex-col sm:max-w-[min(96vw,1400px)]">
                <DialogHeader><DialogTitle>{t('picker.title')}</DialogTitle></DialogHeader>
                <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[280px_1fr]">
                    <div className="flex min-h-0 flex-col gap-2 md:border-e md:pe-3">
                        <Select value={bankId ? String(bankId) : ''} onValueChange={(v) => { setBankId(Number(v)); setFolderId(null); setQuestions(null); }}>
                            <SelectTrigger><SelectValue placeholder={t('picker.bank')} /></SelectTrigger>
                            <SelectContent>{banks.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
                            <FolderTree
                                folders={tree}
                                renderFolder={(f, depth) => (
                                    <button
                                        type="button"
                                        onClick={() => setFolderId(f.id)}
                                        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-start hover:bg-muted ${folderId === f.id ? 'bg-primary/10 text-primary font-medium' : ''}`}
                                        style={{ paddingInlineStart: 8 + depth * 14 }}
                                    >
                                        {folderId === f.id ? <FolderOpen className="h-4 w-4 shrink-0" /> : <Folder className="h-4 w-4 shrink-0" />}
                                        <span className="truncate">{f.name}</span>
                                    </button>
                                )}
                            />
                        </div>
                    </div>
                    <div className="flex min-h-0 min-w-0 flex-col gap-2">
                        {!folderId ? (
                            <p className="text-sm text-muted-foreground py-8 text-center">{t('picker.pickFolder')}</p>
                        ) : questions === null ? (
                            <div className="flex justify-center py-12"><LoadingSpinner /></div>
                        ) : (
                            <>
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox checked={allPicked} onCheckedChange={toggleAll} disabled={!selectable.length} />
                                    {t('picker.selectAll')}
                                </label>
                                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pe-1">
                                    {questions.length === 0 && <p className="text-sm text-muted-foreground">{t('picker.empty')}</p>}
                                    {questions.map((q) => (q.type === 'passage' ? (
                                        <div key={q.id} className="space-y-2 rounded-md bg-muted/40 p-3">
                                            <div className="text-sm font-medium leading-7"><MathText text={q.stem_text || tq('types.passage')} /></div>
                                            {q.children.map((c) => row(c, true))}
                                        </div>
                                    ) : row(q)))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={add} disabled={!picked.length || adding}>
                        {adding && <LoadingSpinner className="h-4 w-4" />}{t('picker.add', { count: picked.length })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
