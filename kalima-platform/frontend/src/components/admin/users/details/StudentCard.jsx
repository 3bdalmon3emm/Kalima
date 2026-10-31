import LevelSelectItems from "@/components/LevelSelectItems";
import { levelTitle } from "@/lib/levelUtils";
import React from 'react';
import { GraduationCap, User, MapPin, Phone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useTranslation } from 'react-i18next';

import { PhoneInput } from '@/components/ui/phone-input';

import InfoRow from './InfoRow';

export default function StudentCard({
    students = [],
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
        <Card className="shadow-sm" data-testid="user-detail-students-card">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-primary" />
                    {t('details.students', 'Students')}
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-0">
                {isEditing ? (
                    <div className="space-y-3 py-2">
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">{t('details.level', 'Level')}</label>
                            <Select
                                dir={i18n.dir()}
                                value={String(formData.students?.level_id || '')}
                                onValueChange={(val) => setFormData({
                                    ...formData,
                                    students: { ...formData.students, level_id: parseInt(val) }
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
                                value={String(formData.students?.government_id || '')}
                                onValueChange={(val) => {
                                    setFormData({
                                        ...formData,
                                        students: { ...formData.students, government_id: parseInt(val), zone_id: null }
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
                                value={formData.students?.zone_id !== null && formData.students?.zone_id !== undefined ? String(formData.students.zone_id) : ""}
                                onValueChange={(val) => setFormData({
                                    ...formData,
                                    students: { ...formData.students, zone_id: val ? parseInt(val) : null }
                                })}
                                disabled={zonesLoading || !formData.students?.government_id}
                            >
                                <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder={zonesLoading ? t('common:loading', 'Loading...') : t('details.selectZone', 'Select Zone')} />
                                </SelectTrigger>
                                <SelectContent position="popper">
                                    {zones.map(z => <SelectItem key={z.id} value={String(z.id)}>{z.title}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">{t('details.faction', 'Faction')}</label>
                            <Input
                                value={formData.students?.faction || ''}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    students: { ...formData.students, faction: e.target.value }
                                })}
                                className="h-8 text-sm"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">{t('details.parentPhone', 'Parent Phone')}</label>
                            <PhoneInput
                                value={formData.students?.parent_phone_number || ''}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    students: { ...formData.students, parent_phone_number: e.target.value }
                                })}
                                className="h-8 shadow-none"
                            />
                        </div>
                    </div>
                ) : (
                    <div className="divide-y divide-border/50">
                        {students.length > 0 ? students.map((student) => (
                            <div key={student.id} className="py-2 space-y-1">
                                <InfoRow
                                    icon={GraduationCap}
                                    label={t('details.level')}
                                    value={levelTitle(student.level || student.levels) || na}
                                />
                                <InfoRow
                                    icon={MapPin}
                                    label={t('details.government')}
                                    value={student.government?.title || student.governments?.title || na}
                                />
                                <InfoRow
                                    icon={MapPin}
                                    label={t('details.zone')}
                                    value={student.zone?.title || student.zones?.title || na}
                                />
                                <InfoRow
                                    icon={User}
                                    label={t('details.faction')}
                                    value={student.faction || na}
                                />
                                <InfoRow
                                    icon={Phone}
                                    label={t('details.parentPhone')}
                                    value={student.parent_phone_number || na}
                                    dir="ltr"
                                />
                            </div>
                        )) : (
                            <div className="py-2 space-y-1 opacity-60">
                                <InfoRow icon={GraduationCap} label={t('details.level')} value={na} />
                                <InfoRow icon={MapPin} label={t('details.government')} value={na} />
                                <InfoRow icon={MapPin} label={t('details.zone')} value={na} />
                                <InfoRow icon={User} label={t('details.faction')} value={na} />
                                <InfoRow icon={Phone} label={t('details.parentPhone')} value={na} />
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
