import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2, Check, X, Folder } from 'lucide-react';
import axios from '@/api/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { groupLevelsByStage, levelTitle } from '@/lib/levelUtils';
import { translateBackendMessage } from '@/lib/utils';
import { qbGet, qbSend } from './api';

export const showError = (err, fallback) =>
    toast.error(translateBackendMessage(err?.response?.data?.errors?.[0] || err?.response?.data?.message) || fallback);

// One text field (+ optional subject) dialog, used for banks and folders.
export function NameDialog({ open, onOpenChange, title, initialName = '', withSubject = false, initialSubject = null, confirmLabel, onSubmit }) {
    const { t } = useTranslation('questionBank');
    const [name, setName] = useState(initialName);
    const [subject, setSubject] = useState(initialSubject);
    const [subjects, setSubjects] = useState([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setName(initialName);
        setSubject(initialSubject);
        if (withSubject) axios.get('/subjects').then((r) => setSubjects(r.data?.data || [])).catch(() => {});
    }, [open, initialName, initialSubject, withSubject]);

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await onSubmit({ name: name.trim(), subject_id: subject });
            onOpenChange(false);
        } catch (err) {
            showError(err, t('errors.save'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <form onSubmit={submit} className="space-y-4">
                    <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
                    <div className="space-y-1">
                        <Label>{t('common.name')}</Label>
                        <Input autoFocus value={name} maxLength={255} onChange={(e) => setName(e.target.value)} />
                    </div>
                    {withSubject && (
                        <div className="space-y-1">
                            <Label>{t('bank.subject')}</Label>
                            <Select value={subject ? String(subject) : 'none'} onValueChange={(v) => setSubject(v === 'none' ? null : Number(v))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">{t('bank.noSubject')}</SelectItem>
                                    {subjects.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <DialogFooter>
                        <Button type="submit" disabled={!name.trim() || saving}>
                            {saving && <LoadingSpinner className="h-4 w-4 border-primary-foreground" />}
                            {confirmLabel || t('common.save')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// Levels of a folder, picked by stage. Empty = take the parent's levels.
export function LevelsDialog({ open, onOpenChange, folder, onSaved }) {
    const { t, i18n } = useTranslation('questionBank');
    const [levels, setLevels] = useState([]);
    const [picked, setPicked] = useState(new Set());
    const [saving, setSaving] = useState(false);
    const own = folder?.levels?.inherited_from === null;

    useEffect(() => {
        if (!open) return;
        axios.get('/levels').then((r) => setLevels((r.data?.data || []).filter((l) => l.active !== false))).catch(() => {});
        setPicked(new Set(own ? folder.levels.levels.map((l) => l.id) : []));
    }, [open, folder, own]);

    const toggle = (ids, on) => setPicked((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
        return next;
    });

    const save = async () => {
        setSaving(true);
        try {
            await qbSend('patch', `/folders/${folder.id}`, { level_ids: [...picked] });
            toast.success(t('folder.levelsSaved'));
            onSaved();
            onOpenChange(false);
        } catch (err) {
            showError(err, t('errors.save'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('folder.levels')}</DialogTitle>
                    <DialogDescription>{t('folder.levelsHint')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 max-h-[55vh] overflow-y-auto pe-1">
                    {groupLevelsByStage(levels).map((group) => {
                        const ids = group.levels.map((l) => l.id);
                        const all = ids.every((id) => picked.has(id));
                        return (
                            <div key={group.stage?.id ?? 'none'} className="space-y-2">
                                <label className="flex items-center gap-2 font-medium cursor-pointer">
                                    <Checkbox checked={all} onCheckedChange={(v) => toggle(ids, v === true)} />
                                    {group.stage ? levelTitle(group.stage, i18n.language) : t('folder.otherLevels')}
                                </label>
                                <div className="grid grid-cols-2 gap-2 ps-6">
                                    {group.levels.map((l) => (
                                        <label key={l.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                            <Checkbox checked={picked.has(l.id)} onCheckedChange={(v) => toggle([l.id], v === true)} />
                                            {levelTitle(l, i18n.language)}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <DialogFooter className="gap-2">
                    {picked.size > 0 && (
                        <Button variant="ghost" onClick={() => setPicked(new Set())}>{t('folder.clearLevels')}</Button>
                    )}
                    <Button onClick={save} disabled={saving}>
                        {saving && <LoadingSpinner className="h-4 w-4 border-primary-foreground" />}
                        {t('common.save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function CategoryRow({ category, onRename, onDelete }) {
    const { t } = useTranslation('questionBank');
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(category.name);
    return (
        <div className="flex items-center gap-2">
            {editing ? (
                <>
                    <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                    <Button size="icon" variant="ghost" onClick={async () => { await onRename(category, name); setEditing(false); }}>
                        <Check className="h-4 w-4 no-flip" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => { setName(category.name); setEditing(false); }}>
                        <X className="h-4 w-4" />
                    </Button>
                </>
            ) : (
                <>
                    <span className="flex-1">{category.name}</span>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(true)} title={t('common.rename')}>
                        <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => onDelete(category)} title={t('common.delete')}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                </>
            )}
        </div>
    );
}

// Categories and subcategories of a bank.
export function CategoriesDialog({ open, onOpenChange, bankId, onChanged }) {
    const { t } = useTranslation('questionBank');
    const [categories, setCategories] = useState([]);
    const [newName, setNewName] = useState('');
    const [newSub, setNewSub] = useState({});

    const load = () => qbGet(`/banks/${bankId}/categories`).then(setCategories).catch((err) => showError(err, t('errors.load')));
    useEffect(() => { if (open) load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const run = async (fn) => {
        try {
            await fn();
            await load();
            onChanged?.();
        } catch (err) {
            showError(err, t('errors.save'));
        }
    };
    const add = (parentId, name) => run(() => qbSend('post', `/banks/${bankId}/categories`, { name, parent_id: parentId }));
    const rename = (c, name) => run(() => qbSend('patch', `/categories/${c.id}`, { name }));
    const remove = (c) => {
        if (!window.confirm(t('categories.deleteConfirm', { name: c.name }))) return;
        run(() => qbSend('delete', `/categories/${c.id}`));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('categories.title')}</DialogTitle>
                    <DialogDescription>{t('categories.description')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 max-h-[55vh] overflow-y-auto pe-1">
                    {categories.length === 0 && <p className="text-sm text-muted-foreground">{t('categories.empty')}</p>}
                    {categories.map((c) => (
                        <div key={c.id} className="rounded-md border p-2 space-y-2">
                            <CategoryRow category={c} onRename={rename} onDelete={remove} />
                            <div className="ps-5 space-y-1 border-s ms-2">
                                {c.subcategories.map((s) => (
                                    <CategoryRow key={s.id} category={s} onRename={rename} onDelete={remove} />
                                ))}
                                <form
                                    className="flex gap-2"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        if (!newSub[c.id]?.trim()) return;
                                        add(c.id, newSub[c.id].trim());
                                        setNewSub((p) => ({ ...p, [c.id]: '' }));
                                    }}
                                >
                                    <Input
                                        className="h-8"
                                        placeholder={t('categories.newSub')}
                                        value={newSub[c.id] || ''}
                                        onChange={(e) => setNewSub((p) => ({ ...p, [c.id]: e.target.value }))}
                                    />
                                    <Button type="submit" size="icon" variant="outline" className="h-8 w-8"><Plus className="h-4 w-4" /></Button>
                                </form>
                            </div>
                        </div>
                    ))}
                </div>
                <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!newName.trim()) return;
                        add(null, newName.trim());
                        setNewName('');
                    }}
                >
                    <Input placeholder={t('categories.new')} value={newName} onChange={(e) => setNewName(e.target.value)} />
                    <Button type="submit"><Plus className="h-4 w-4" />{t('categories.add')}</Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// Picks a folder that can hold questions, in any bank.
export function CopyToDialog({ open, onOpenChange, currentBankId, count, onCopy }) {
    const { t } = useTranslation('questionBank');
    const [banks, setBanks] = useState([]);
    const [bankId, setBankId] = useState(currentBankId);
    const [tree, setTree] = useState([]);
    const [target, setTarget] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setBankId(currentBankId);
        setTarget(null);
        qbGet('/banks').then(setBanks).catch(() => {});
    }, [open, currentBankId]);
    useEffect(() => {
        if (!open || !bankId) return;
        qbGet(`/banks/${bankId}/tree`).then(setTree).catch(() => setTree([]));
    }, [open, bankId]);

    const hasChildren = new Set(tree.map((f) => f.parent_id).filter(Boolean));
    const childrenOf = (id) => tree.filter((f) => f.parent_id === id);
    const renderNode = (f, depth) => (
        <div key={f.id}>
            <button
                type="button"
                disabled={hasChildren.has(f.id)}
                onClick={() => setTarget(f.id)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-sm text-start disabled:opacity-60 disabled:cursor-default ${target === f.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                style={{ paddingInlineStart: `${depth * 16 + 8}px` }}
            >
                <Folder className="h-4 w-4 shrink-0" />
                {f.name}
            </button>
            {childrenOf(f.id).map((c) => renderNode(c, depth + 1))}
        </div>
    );
    const root = tree.find((f) => f.parent_id === null);

    const submit = async () => {
        setSaving(true);
        try {
            await onCopy(target);
            onOpenChange(false);
        } catch (err) {
            showError(err, t('errors.save'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('copy.title', { count })}</DialogTitle>
                    <DialogDescription>{t('copy.description')}</DialogDescription>
                </DialogHeader>
                <Select value={bankId ? String(bankId) : ''} onValueChange={(v) => { setBankId(Number(v)); setTarget(null); }}>
                    <SelectTrigger><SelectValue placeholder={t('copy.pickBank')} /></SelectTrigger>
                    <SelectContent>
                        {banks.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                <div className="max-h-[45vh] overflow-y-auto rounded-md border p-1">
                    {root ? renderNode(root, 0) : <p className="p-2 text-sm text-muted-foreground">{t('common.loading')}</p>}
                </div>
                <DialogFooter>
                    <Button onClick={submit} disabled={!target || saving}>
                        {saving && <LoadingSpinner className="h-4 w-4 border-primary-foreground" />}
                        {t('copy.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
