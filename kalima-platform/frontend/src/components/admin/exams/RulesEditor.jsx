import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { qbGet } from '@/components/admin/question-bank/api';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import { FolderTree, useBanks, useBankTree } from './BankPicker';
import { DIFFICULTIES, exSend, formatMark } from './api';

const emptyRule = () => ({
    key: Math.random().toString(36).slice(2),
    bank_id: null,
    folder_ids: [],
    category_id: null,
    subcategory_id: null,
    ...Object.fromEntries(DIFFICULTIES.flatMap((d) => [[`${d}_count`, 0], [`${d}_mark`, 1]])),
});

const countOf = (rule) => DIFFICULTIES.reduce((s, d) => s + (Number(rule[`${d}_count`]) || 0), 0);
// The marks a rule adds: each difficulty's count times its mark.
const marksOf = (rule) => DIFFICULTIES.reduce((s, d) => s + (Number(rule[`${d}_count`]) || 0) * (Number(rule[`${d}_mark`]) || 0), 0);

// One draw rule: bank folders (with everything under them), an optional
// category, and how many questions of each difficulty at what mark.
function RuleCard({ rule, onChange, onRemove, share, markShare, banks }) {
    const { t } = useTranslation('exams');
    const tq = useTranslation('questionBank').t;
    const tree = useBankTree(rule.bank_id);
    const [categories, setCategories] = useState([]);
    useEffect(() => {
        setCategories([]);
        if (rule.bank_id) qbGet(`/banks/${rule.bank_id}/categories`).then(setCategories).catch(() => {});
    }, [rule.bank_id]);
    const subcategories = categories.find((c) => c.id === rule.category_id)?.subcategories || [];
    const set = (patch) => onChange({ ...rule, ...patch });
    const toggleFolder = (id) => set({
        folder_ids: rule.folder_ids.includes(id) ? rule.folder_ids.filter((f) => f !== id) : [...rule.folder_ids, id],
    });

    return (
        <div className="rounded-md border p-3 space-y-3 bg-background">
            <div className="flex items-center gap-2">
                <Select value={rule.bank_id ? String(rule.bank_id) : ''} onValueChange={(v) => set({ bank_id: Number(v), folder_ids: [], category_id: null, subcategory_id: null })}>
                    <SelectTrigger className="max-w-xs"><SelectValue placeholder={t('rules.bank')} /></SelectTrigger>
                    <SelectContent>{banks.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
                <span className="flex-1" />
                <Button variant="ghost" size="icon" onClick={onRemove} title={t('common.delete')}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>

            {rule.bank_id && (
                <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                        <Label className="text-xs">{t('rules.folders')}</Label>
                        <div className="max-h-48 overflow-y-auto rounded border p-1">
                            <FolderTree
                                folders={tree}
                                renderFolder={(f, depth) => (
                                    <label className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted cursor-pointer" style={{ paddingInlineStart: 4 + depth * 14 }}>
                                        <Checkbox checked={rule.folder_ids.includes(f.id)} onCheckedChange={() => toggleFolder(f.id)} />
                                        <span className="truncate">{f.name}</span>
                                    </label>
                                )}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">{t('rules.foldersHint')}</p>
                    </div>
                    <div className="space-y-2">
                        <div className="space-y-1">
                            <Label className="text-xs">{t('rules.category')}</Label>
                            <Select value={rule.category_id ? String(rule.category_id) : 'any'} onValueChange={(v) => set({ category_id: v === 'any' ? null : Number(v), subcategory_id: null })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="any">{t('rules.anyCategory')}</SelectItem>
                                    {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        {subcategories.length > 0 && (
                            <div className="space-y-1">
                                <Label className="text-xs">{t('rules.subcategory')}</Label>
                                <Select value={rule.subcategory_id ? String(rule.subcategory_id) : 'any'} onValueChange={(v) => set({ subcategory_id: v === 'any' ? null : Number(v) })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="any">{t('rules.anySubcategory')}</SelectItem>
                                        {subcategories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">{t('rules.categoryHint')}</p>
                    </div>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-xs text-muted-foreground">
                            <th className="text-start font-normal p-1" />
                            {DIFFICULTIES.map((d) => <th key={d} className="font-normal p-1">{tq(`difficulty.${d}`)}</th>)}
                            <th className="font-normal p-1">{t('rules.total')}</th>
                            <th className="font-normal p-1">{t('rules.share')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="p-1 text-xs text-muted-foreground whitespace-nowrap">{t('rules.count')}</td>
                            {DIFFICULTIES.map((d) => (
                                <td key={d} className="p-1"><Input type="number" min={0} className="h-8 w-20 mx-auto" value={rule[`${d}_count`]} onChange={(e) => set({ [`${d}_count`]: e.target.value })} /></td>
                            ))}
                            <td className="p-1 text-center font-medium">{countOf(rule)}</td>
                            <td className="p-1 text-center text-muted-foreground">{share}%</td>
                        </tr>
                        <tr>
                            <td className="p-1 text-xs text-muted-foreground whitespace-nowrap">{t('rules.mark')}</td>
                            {DIFFICULTIES.map((d) => (
                                <td key={d} className="p-1"><Input type="number" min={0.25} step={0.25} className="h-8 w-20 mx-auto" value={rule[`${d}_mark`]} onChange={(e) => set({ [`${d}_mark`]: e.target.value })} /></td>
                            ))}
                            <td className="p-1 text-center font-medium">{formatMark(marksOf(rule))}</td>
                            <td className="p-1 text-center text-muted-foreground">{markShare}%</td>
                        </tr>
                    </tbody>
                </table>
                <p className="text-xs text-muted-foreground mt-1">{t('rules.matchingHint')}</p>
            </div>
        </div>
    );
}

// The draw rules of one section of a random exam.
export default function RulesEditor({ section, onSaved }) {
    const { t } = useTranslation('exams');
    const banks = useBanks(true);
    const [rules, setRules] = useState([]);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    // A saved rule names folders only; its bank is the bank of the first one.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const loaded = await Promise.all(section.rules.map(async (r) => {
                let bankId = null;
                if (r.folder_ids[0]) {
                    try {
                        const folder = await qbGet(`/folders/${r.folder_ids[0]}`);
                        bankId = folder.bank_id;
                    } catch { /* folder gone */ }
                }
                return { ...emptyRule(), ...r, bank_id: bankId, easy_mark: Number(r.easy_mark), medium_mark: Number(r.medium_mark), hard_mark: Number(r.hard_mark), very_hard_mark: Number(r.very_hard_mark) };
            }));
            if (!cancelled) { setRules(loaded); setDirty(false); }
        })();
        return () => { cancelled = true; };
    }, [section.id, section.rules]);

    const total = rules.reduce((s, r) => s + countOf(r), 0);
    const totalMarks = rules.reduce((s, r) => s + marksOf(r), 0);
    const update = (list) => { setRules(list); setDirty(true); };

    const save = async () => {
        setSaving(true);
        try {
            await exSend('put', `/sections/${section.id}/rules`, {
                rules: rules.map(({ key, bank_id, id, section_id, sort_order, ...r }) => r),
            });
            toast.success(t('rules.saved'));
            setDirty(false);
            onSaved();
        } catch (err) {
            showError(err, t('errors.save'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-2">
            {rules.map((rule, i) => (
                <RuleCard
                    key={rule.key}
                    rule={rule}
                    banks={banks}
                    share={total ? Math.round((countOf(rule) / total) * 100) : 0}
                    markShare={totalMarks ? Math.round((marksOf(rule) / totalMarks) * 100) : 0}
                    onChange={(r) => update(rules.map((x, j) => (j === i ? r : x)))}
                    onRemove={() => update(rules.filter((_, j) => j !== i))}
                />
            ))}
            <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => update([...rules, emptyRule()])}><Plus className="h-4 w-4" />{t('rules.add')}</Button>
                <Button size="sm" onClick={save} disabled={saving || !dirty}>
                    {saving ? <LoadingSpinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}{t('rules.save')}
                </Button>
                {dirty && <span className="text-xs text-amber-600 self-center">{t('rules.unsaved')}</span>}
            </div>
        </div>
    );
}
