import { levelTitle } from "@/lib/levelUtils";
import React from 'react';
import { GraduationCap, Hash, BookOpen, MapPin, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import InfoRow from './InfoRow';
import { useTranslation } from 'react-i18next';

export default function TeacherCard({
    teachers = [],
    isEditing,
    formData,
    setFormData,
    t,
    levels = [],
    governments = [],
    zones = [],
    zonesLoading = false,
    subjects = [],
    getZonesByGovernment
}) {
    const { i18n } = useTranslation();
    const na = t('common:na', 'N/A');

    return (
        <Card className="shadow-sm" data-testid="user-detail-teachers-card">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    {t('details.teachers', 'Teachers')}
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-0">
                {isEditing ? (
                    <div className="space-y-4 py-2">
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">{t('details.serial', 'Serial')}</label>
                            <Input
                                value={formData.teachers?.serial || ''}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    teachers: { ...formData.teachers, serial: e.target.value }
                                })}
                                className="h-8 text-sm"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">{t('details.subject', 'Subject')}</label>
                            <Select
                                dir={i18n.dir()}
                                value={String(formData.teachers?.subject_id || '')}
                                onValueChange={(val) => setFormData({
                                    ...formData,
                                    teachers: { ...formData.teachers, subject_id: parseInt(val) }
                                })}
                            >
                                <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder={t('details.selectSubject', 'Select Subject')} />
                                </SelectTrigger>
                                <SelectContent position="popper">
                                    {subjects.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">{t('details.government', 'Government')}</label>
                            <Select
                                dir={i18n.dir()}
                                value={String(formData.teachers?.government_id || '')}
                                onValueChange={(val) => {
                                    setFormData({
                                        ...formData,
                                        teachers: { ...formData.teachers, government_id: parseInt(val), zone_id: null }
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
                                value={formData.teachers?.zone_id !== null && formData.teachers?.zone_id !== undefined ? String(formData.teachers.zone_id) : ""}
                                onValueChange={(val) => setFormData({
                                    ...formData,
                                    teachers: { ...formData.teachers, zone_id: val ? parseInt(val) : null }
                                })}
                                disabled={zonesLoading || !formData.teachers?.government_id}
                            >
                                <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder={zonesLoading ? t('common:loading', 'Loading...') : t('details.selectZone', 'Select Zone')} />
                                </SelectTrigger>
                                <SelectContent position="popper">
                                    {zones.map(z => <SelectItem key={z.id} value={String(z.id)}>{z.title}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">{t('details.teachingLevels', 'Teaching Levels')}</label>
                            <div className="flex flex-col gap-2 rounded-md border p-3">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="is_primary"
                                        checked={!!formData.teachers?.is_primary}
                                        onCheckedChange={(checked) => setFormData({
                                            ...formData,
                                            teachers: { ...formData.teachers, is_primary: !!checked }
                                        })}
                                        className={i18n.dir() === 'rtl' ? 'scale-x-[-1]' : ''}
                                    />
                                    <label htmlFor="is_primary" className="text-sm">{t('details.primary', 'Primary')}</label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="is_preparatory"
                                        checked={!!formData.teachers?.is_preparatory}
                                        onCheckedChange={(checked) => setFormData({
                                            ...formData,
                                            teachers: { ...formData.teachers, is_preparatory: !!checked }
                                        })}
                                        className={i18n.dir() === 'rtl' ? 'scale-x-[-1]' : ''}
                                    />
                                    <label htmlFor="is_preparatory" className="text-sm">{t('details.preparatory', 'Preparatory')}</label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="is_secondary"
                                        checked={!!formData.teachers?.is_secondary}
                                        onCheckedChange={(checked) => setFormData({
                                            ...formData,
                                            teachers: { ...formData.teachers, is_secondary: !!checked }
                                        })}
                                        className={i18n.dir() === 'rtl' ? 'scale-x-[-1]' : ''}
                                    />
                                    <label htmlFor="is_secondary" className="text-sm">{t('details.secondary', 'Secondary')}</label>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="divide-y divide-border/50">
                        {teachers.length > 0 ? teachers.map((teacher) => {
                            const activeLevels = [
                                teacher.is_primary && t('details.primary'),
                                teacher.is_preparatory && t('details.preparatory'),
                                teacher.is_secondary && t('details.secondary'),
                                levelTitle(teacher.level || teacher.levels),
                            ].filter(Boolean);

                            return (
                                <div key={teacher.id} className="py-3 space-y-1">
                                    <InfoRow
                                        icon={Hash}
                                        label={t('details.serial')}
                                        value={teacher.serial || na}
                                    />
                                    <InfoRow
                                        icon={BookOpen}
                                        label={t('details.subject')}
                                        value={teacher.subject?.title || teacher.subjects?.title || na}
                                    />
                                    <InfoRow
                                        icon={MapPin}
                                        label={t('details.government')}
                                        value={teacher.government?.title || teacher.governments?.title || na}
                                    />
                                    <InfoRow
                                        icon={MapPin}
                                        label={t('details.zone')}
                                        value={teacher.zone?.title || teacher.zones?.title || na}
                                    />
                                    <div className="ps-0 pt-2">
                                        <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1.5">{t('details.teachingLevels')}</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {activeLevels.length > 0 ? activeLevels.map((lvl) => (
                                                <Badge key={lvl} variant="secondary" className="text-[10px] px-2 py-0 h-5 font-medium">
                                                    {lvl}
                                                </Badge>
                                            )) : (
                                                <span className="text-xs text-muted-foreground italic">{na}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        }) : (
                            <div className="py-3 space-y-1 opacity-60">
                                <InfoRow icon={Hash} label={t('details.serial')} value={na} />
                                <InfoRow icon={BookOpen} label={t('details.subject')} value={na} />
                                <InfoRow icon={MapPin} label={t('details.government')} value={na} />
                                <InfoRow icon={MapPin} label={t('details.zone')} value={na} />
                                <div className="ps-0 pt-2">
                                    <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1.5">{t('details.teachingLevels')}</p>
                                    <span className="text-xs text-muted-foreground italic">{na}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
