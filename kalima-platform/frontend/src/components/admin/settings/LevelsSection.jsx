import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GraduationCap, Pencil, Plus } from 'lucide-react';
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
import { groupLevelsByStage, levelTitle } from '@/lib/levelUtils';
import { translateBackendMessage } from '@/lib/utils';

const EMPTY_FORM = { title_ar: '', title: '', stage_id: '', sort_order: '', active: true };

// School levels in both languages, each placed in a stage with an order.
// The order is what the yearly promotion follows.
export default function LevelsSection() {
    const { t, i18n } = useTranslation('admin');
    const [levels, setLevels] = useState([]);
    const [stages, setStages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null); // null = closed, {} = new, level = edit
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

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

    const openNew = () => {
        const nextOrder = Math.max(0, ...levels.map((l) => l.sort_order || 0)) + 1;
        setForm({ ...EMPTY_FORM, sort_order: String(nextOrder) });
        setEditing({});
    };

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
                <Button size="sm" onClick={openNew} disabled={loading}>
                    <Plus className="h-4 w-4" />
                    {t('settings.levels.add')}
                </Button>
            </CardHeader>
            <CardContent className="space-y-5">
                {loading ? (
                    <div className="flex justify-center py-6"><LoadingSpinner className="w-8 h-8 border-primary" /></div>
                ) : (
                    groupLevelsByStage(levels).map(({ stage, levels: items }) => (
                        <div key={stage?.id ?? 'none'} className="space-y-2">
                            <p className="text-sm font-bold text-muted-foreground">
                                {stage ? levelTitle(stage, i18n.language) : t('settings.levels.noStage')}
                            </p>
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
        </Card>
    );
}
