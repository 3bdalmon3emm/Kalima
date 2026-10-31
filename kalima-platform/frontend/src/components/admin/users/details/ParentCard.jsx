import LevelSelectItems from "@/components/LevelSelectItems";
import { levelTitle } from "@/lib/levelUtils";
import React from 'react';
import { User, MapPin, GraduationCap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useTranslation } from 'react-i18next';
import InfoRow from './InfoRow';

export default function ParentCard({
    parents = [],
    isEditing,
    formData,
    setFormData,
    t,
    levels = [],
    governments = [],
    zones = [],
    zonesLoading = false,
    getZonesByGovernment
}) {
    const { i18n } = useTranslation();
    const na = t('common:na', 'N/A');

    return (
        <Card className="shadow-sm" data-testid="user-detail-parents-card">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    {t('details.parents', 'Parents')}
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-0">
                {isEditing ? (
                    <div className="space-y-3 py-2">
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">{t('details.level', 'Level')}</label>
                            <Select
                                dir={i18n.dir()}
                                value={String(formData.parents?.level_id || '')}
                                onValueChange={(val) => setFormData({
                                    ...formData,
                                    parents: { ...formData.parents, level_id: parseInt(val) }
                                })}
                            >
                                <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder={t('details.selectLevel', 'Select Level')} />
                                </SelectTrigger>
                                <SelectContent position="popper">
                                    <LevelSelectItems levels={levels} />
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">{t('details.government', 'Government')}</label>
                            <Select
                                dir={i18n.dir()}
                                value={String(formData.parents?.government_id || '')}
                                onValueChange={(val) => {
                                    setFormData({
                                        ...formData,
                                        parents: { ...formData.parents, government_id: parseInt(val), zone_id: null }
                                    });
                                    getZonesByGovernment(val);
                                }}
                            >
                                <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder={t('details.selectGovernment', 'Select Government')} />
                                </SelectTrigger>
                                <SelectContent position="popper">
                                    {governments.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.title}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">{t('details.zone', 'Zone')}</label>
                            <Select
                                dir={i18n.dir()}
                                value={formData.parents?.zone_id !== null && formData.parents?.zone_id !== undefined ? String(formData.parents.zone_id) : ""}
                                onValueChange={(val) => setFormData({
                                    ...formData,
                                    parents: { ...formData.parents, zone_id: val ? parseInt(val) : null }
                                })}
                                disabled={zonesLoading || !formData.parents?.government_id}
                            >
                                <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder={zonesLoading ? t('common:loading', 'Loading...') : t('details.selectZone', 'Select Zone')} />
                                </SelectTrigger>
                                <SelectContent position="popper">
                                    {zones.map(z => <SelectItem key={z.id} value={String(z.id)}>{z.title}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                ) : (
                    <div className="divide-y divide-border/50">
                        {parents.length > 0 ? parents.map((parent) => (
                            <div key={parent.id} className="py-2 space-y-1">
                                <InfoRow
                                    icon={GraduationCap}
                                    label={t('details.level')}
                                    value={levelTitle(parent.level || parent.levels) || na}
                                />
                                <InfoRow
                                    icon={MapPin}
                                    label={t('details.government')}
                                    value={parent.government?.title || parent.governments?.title || na}
                                />
                                <InfoRow
                                    icon={MapPin}
                                    label={t('details.zone')}
                                    value={parent.zone?.title || parent.zones?.title || na}
                                />
                            </div>
                        )) : (
                            <div className="py-2 space-y-1 opacity-60">
                                <InfoRow icon={GraduationCap} label={t('details.level')} value={na} />
                                <InfoRow icon={MapPin} label={t('details.government')} value={na} />
                                <InfoRow icon={MapPin} label={t('details.zone')} value={na} />
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
