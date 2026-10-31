import { levelTitle } from "@/lib/levelUtils";
import { useTranslation } from 'react-i18next';
import { User, BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

function ProfileField({ label, value }) {
    return (
        <div className="rounded-xl border bg-muted/30 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-1 min-h-6 break-words text-sm font-semibold text-foreground">
                {value || '—'}
            </div>
        </div>
    );
}

export default function StudentProfileForm({
    defaultValues,
    governments,
    levels,
    zones,
}) {
    const { t } = useTranslation(['student', 'common']);
    const government = governments.find((item) => item.id === defaultValues.government_id)?.title;
    const zone = zones.find((item) => item.id === defaultValues.zone_id)?.title;
    const level = levelTitle(levels.find((item) => item.id === defaultValues.level_id));
    const gender = defaultValues.gender ? t(`student:profile.${defaultValues.gender}`, defaultValues.gender) : '';

    return (
        <Card className="shadow-sm">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    {t('student:profile.personalInfo')}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <ProfileField label={t('student:profile.name')} value={defaultValues.name} />
                    <ProfileField label={t('student:profile.phone')} value={defaultValues.phone} />
                    <ProfileField label={t('student:profile.secondaryPhone')} value={defaultValues.secondary_phone} />
                    <ProfileField label={t('student:profile.gender')} value={gender} />
                </div>

                <Separator />

                <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <BookOpen className="h-4 w-4" /> {t('student:profile.studentInfo')}
                </p>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <ProfileField label={t('student:profile.level')} value={level} />
                    <ProfileField label={t('student:profile.faction')} value={defaultValues.faction} />
                    <ProfileField label={t('student:profile.government')} value={government} />
                    <ProfileField label={t('student:profile.zone')} value={zone} />
                    <ProfileField label={t('student:profile.parentPhone')} value={defaultValues.parent_phone_number} />
                </div>
            </CardContent>
        </Card>
    );
}
