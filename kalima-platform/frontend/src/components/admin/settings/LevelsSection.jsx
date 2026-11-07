import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GraduationCap, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import axios from '@/api/axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { levelTitle } from '@/lib/levelUtils';
import { translateBackendMessage } from '@/lib/utils';

const EMPTY_FORM = { title_ar: '', title: '', stage_id: '', sort_order: '', active: true };
const EMPTY_STAGE_FORM = { title_ar: '', title: '', sort_order: '' };

// Stages and their school levels, in both languages and ordered. Promotion
// follows the stage order, then the level order inside the stage.
export default function LevelsSection() {
    const { t, i18n } = useTranslation('admin');
    const [levels, setLevels] = useState([]);
    const [stages, setStages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null); // null = closed, {} = new, level = edit
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [editingStage, setEditingStage] = useState(null); // same convention as editing
    const [stageForm, setStageForm] = useState(EMPTY_STAGE_FORM);

    const load = useCallback(async () => {
        try {
            const [levelsRes, stagesRes] = await Promise.all([
                axios.get('/levels'),
                axios.get('/levels/stages'),
            ]);
            setLevels(levelsRes.data.data || []);
            setStages(stagesRes.data.data || []);
        } catch (err) {
            toast.error(translateBackendMessage(err.response?.data?.message) || t('settings.levels.loadError'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { load(); }, [load]);

    const openNew = (stage) => {
        const nextOrder = Math.max(0, ...levels.map((l) => l.sort_order || 0)) + 1;
        setForm({ ...EMPTY_FORM, stage_id: stage ? String(stage.id) : '', sort_order: String(nextOrder) });
        setEditing({});
    };

    const openNewStage = () => {
        const nextOrder = Math.max(0, ...stages.map((s) => s.sort_order || 0)) + 1;
        setStageForm({ ...EMPTY_STAGE_FORM, sort_order: String(nextOrder) });
        setEditingStage({});
    };

    const openEditStage = (stage) => {
        setStageForm({
            title_ar: stage.title_ar || '',
            title: stage.title || '',
            sort_order: stage.sort_order ? String(stage.sort_order) : '',
        });
        setEditingStage(stage);
    };

    const canSaveStage = stageForm.title_ar.trim() && stageForm.title.trim() && Number(stageForm.sort_order) >= 1;

    const saveStage = async () => {
        if (!canSaveStage) return;
        setSaving(true);
        const payload = {
            title_ar: stageForm.title_ar.trim(),
            title: stageForm.title.trim(),
            sort_order: Number(stageForm.sort_order),
        };
        try {
            if (editingStage?.id) await axios.patch(`/levels/stages/${editingStage.id}`, payload);
            else await axios.post('/levels/stages', payload);
            toast.success(t('settings.levels.stageSaved'));
            setEditingStage(null);
            await load();
        } catch (err) {
            toast.error(translateBackendMessage(err.response?.data?.message) || t('settings.levels.saveError'));
        } finally {
            setSaving(false);
        }
    };

    const deleteStage = async () => {
        if (!editingStage?.id || !window.confirm(t('settings.levels.deleteStageConfirm'))) return;
        setSaving(true);
        try {
            await axios.delete(`/levels/stages/${editingStage.id}`);
            toast.success(t('settings.levels.stageDeleted'));
            setEditingStage(null);
            await load();
        } catch (err) {
            toast.error(translateBackendMessage(err.response?.data?.message) || t('settings.levels.saveError'));
        } finally {
            setSaving(false);
        }
    };

    // Every stage shows, even one with no levels yet, so a new stage can be filled.
    const groups = [
        ...stages.map((stage) => ({ stage, levels: levels.filter((l) => l.stage_id === stage.id) })),
        { stage: null, levels: levels.filter((l) => !stages.some((s) => s.id === l.stage_id)) },
    ].filter((g) => g.stage || g.levels.length);
    const stageLevelCount = editingStage?.id ? levels.filter((l) => l.stage_id === editingStage.id).length : 0;

    const openEdit = (level) => {
        setForm({
            title_ar: level.title_ar || '',
            title: level.title || '',
            stage_id: level.stage_id ? String(level.stage_id) : '',
            sort_order: level.sort_order ? String(level.sort_order) : '',
            active: level.active !== false,
        });
        setEditing(level);
    };

    const canSave = form.title_ar.trim() && form.title.trim() && form.stage_id && Number(form.sort_order) >= 1;

    const save = async () => {
        if (!canSave) return;
        setSaving(true);
        const payload = {
            title_ar: form.title_ar.trim(),
            title: form.title.trim(),
            stage_id: Number(form.stage_id),
            sort_order: Number(form.sort_order),
            active: form.active,
        };
        try {
            if (editing?.id) await axios.patch(`/levels/${editing.id}`, payload);
            else await axios.post('/levels', payload);
            toast.success(t('settings.levels.saved'));
            setEditing(null);
            await load();
        } catch (err) {
            toast.error(translateBackendMessage(err.response?.data?.message) || t('settings.levels.saveError'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        <GraduationCap className="h-5 w-5 text-primary" />
                        {t('settings.levels.title')}
                    </CardTitle>
                    <CardDescription className="mt-1">{t('settings.levels.description')}</CardDescription>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={openNewStage} disabled={loading}>
                        <Layers className="h-4 w-4" />
                        {t('settings.levels.addStage')}
                    </Button>
                    <Button size="sm" onClick={() => openNew()} disabled={loading}>
                        <Plus className="h-4 w-4" />
                        {t('settings.levels.add')}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-5">
                {loading ? (
                    <div className="flex justify-center py-6"><LoadingSpinner className="w-8 h-8 border-primary" /></div>
                ) : (
                    groups.map(({ stage, levels: items }) => (
                        <div key={stage?.id ?? 'none'} className="space-y-2">
                            <div className="flex items-center gap-2">
                                {stage && <Badge variant="secondary" className="shrink-0">{stage.sort_order}</Badge>}
                                <p className="flex-1 text-sm font-bold text-muted-foreground">
                                    {stage ? levelTitle(stage, i18n.language) : t('settings.levels.noStage')}
                                </p>
                                {stage && (
                                    <>
                                        <Button variant="ghost" size="sm" onClick={() => openNew(stage)}>
                                            <Plus className="h-4 w-4" />
                                            {t('settings.levels.addToStage')}
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => openEditStage(stage)} aria-label={t('settings.levels.editStage')}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                    </>
                                )}
                            </div>
                            {items.length === 0 ? (
                                <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                                    {t('settings.levels.emptyStage')}
                                </p>
                            ) : (
                            <div className="divide-y rounded-xl border">
                                {items.map((level) => (
                                    <div key={level.id} className="flex items-center gap-3 p-3">
                                        <Badge variant="outline" className="shrink-0">{level.sort_order ?? '—'}</Badge>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-semibold">{level.title_ar || '—'}</p>
                                            <p className="truncate text-xs text-muted-foreground" dir="ltr">{level.title}</p>
                                        </div>
                                        {level.active === false && (
                                            <Badge variant="secondary">{t('settings.levels.inactive')}</Badge>
                                        )}
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(level)} aria-label={t('settings.levels.edit')}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                            )}
                        </div>
                    ))
                )}
            </CardContent>

            <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
                <DialogContent dir={i18n.dir()}>
                    <DialogHeader>
                        <DialogTitle>
                            {editing?.id ? t('settings.levels.edit') : t('settings.levels.add')}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="level-title-ar">{t('settings.levels.titleAr')}</Label>
                            <Input id="level-title-ar" dir="rtl" value={form.title_ar}
                                onChange={(e) => setForm({ ...form, title_ar: e.target.value })} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="level-title-en">{t('settings.levels.titleEn')}</Label>
                            <Input id="level-title-en" dir="ltr" value={form.title}
                                onChange={(e) => setForm({ ...form, title: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>{t('settings.levels.stage')}</Label>
                                <Select dir={i18n.dir()} value={form.stage_id}
                                    onValueChange={(v) => setForm({ ...form, stage_id: v })}>
                                    <SelectTrigger><SelectValue placeholder={t('settings.levels.selectStage')} /></SelectTrigger>
                                    <SelectContent>
                                        {stages.map((s) => (
                                            <SelectItem key={s.id} value={String(s.id)}>{levelTitle(s, i18n.language)}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="level-order">{t('settings.levels.order')}</Label>
                                <Input id="level-order" type="number" min={1} value={form.sort_order}
                                    onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">{t('settings.levels.orderHint')}</p>
                        <div className="flex items-center justify-between rounded-lg border p-3">
                            <Label htmlFor="level-active">{t('settings.levels.active')}</Label>
                            <Switch id="level-active" checked={form.active}
                                onCheckedChange={(v) => setForm({ ...form, active: v })} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditing(null)}>{t('settings.levels.cancel')}</Button>
                        <Button onClick={save} disabled={!canSave || saving}>
                            {saving && <LoadingSpinner className="h-4 w-4 border-primary-foreground" />}
                            {t('settings.levels.save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={editingStage !== null} onOpenChange={(open) => !open && setEditingStage(null)}>
                <DialogContent dir={i18n.dir()}>
                    <DialogHeader>
                        <DialogTitle>
                            {editingStage?.id ? t('settings.levels.editStage') : t('settings.levels.addStage')}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="stage-title-ar">{t('settings.levels.titleAr')}</Label>
                            <Input id="stage-title-ar" dir="rtl" value={stageForm.title_ar}
                                onChange={(e) => setStageForm({ ...stageForm, title_ar: e.target.value })} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="stage-title-en">{t('settings.levels.titleEn')}</Label>
                            <Input id="stage-title-en" dir="ltr" value={stageForm.title}
                                onChange={(e) => setStageForm({ ...stageForm, title: e.target.value })} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="stage-order">{t('settings.levels.order')}</Label>
                            <Input id="stage-order" type="number" min={1} value={stageForm.sort_order}
                                onChange={(e) => setStageForm({ ...stageForm, sort_order: e.target.value })} />
                        </div>
                        <p className="text-xs text-muted-foreground">{t('settings.levels.stageOrderHint')}</p>
                    </div>
                    <DialogFooter className="gap-2">
                        {editingStage?.id && stageLevelCount === 0 && (
                            <Button variant="destructive" onClick={deleteStage} disabled={saving} className="sm:me-auto">
                                <Trash2 className="h-4 w-4" />
                                {t('settings.levels.deleteStage')}
                            </Button>
                        )}
                        <Button variant="outline" onClick={() => setEditingStage(null)}>{t('settings.levels.cancel')}</Button>
                        <Button onClick={saveStage} disabled={!canSaveStage || saving}>
                            {saving && <LoadingSpinner className="h-4 w-4 border-primary-foreground" />}
                            {t('settings.levels.save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
