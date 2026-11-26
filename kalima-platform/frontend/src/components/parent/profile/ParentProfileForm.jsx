import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { PhoneInput, egyptPhoneSchema } from '@/components/ui/phone-input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import LoadingSpinner from '../../ui/loading-spinner';

const getProfileSchema = (t) => z.object({
    name: z.string().min(1, t('common:validation.required', 'Required')).max(255),
    phone: egyptPhoneSchema(t).optional(),
    secondary_phone: egyptPhoneSchema(t).optional(),
    gender: z.enum(['male', 'female']).optional(),
    government_id: z.coerce.number().optional(),
    zone_id: z.coerce.number().optional(),
});

export default function ParentProfileForm({
    defaultValues,
    onSubmit,
    loading,
    governments,
    zones,
    zonesLoading,
    onGovernmentChange
}) {
    const { t, i18n } = useTranslation('parent');

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        control,
        formState: { errors, isDirty },
    } = useForm({
        resolver: zodResolver(getProfileSchema(t)),
        defaultValues
    });

    const gender = watch('gender');
    const governmentId = watch('government_id');

    useEffect(() => {
        if (governmentId) {
            onGovernmentChange(governmentId);
            setValue('zone_id', undefined);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [governmentId]);

    const handleFormSubmit = (data) => {
        onSubmit(data);
    };

    return (
        <Card className="shadow-sm">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    {t('profile.personalInfo', 'Personal Information')}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
                    {/* Name */}
                    <div>
                        <Label htmlFor="name">{t('profile.name', 'Full Name')} *</Label>
                        <Input id="name" {...register('name')} className="mt-1" data-testid="parent-profile-name-input" />
                        {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div dir="ltr">
                            <Label htmlFor="phone">{t('profile.phone', 'Phone')}</Label>
                            <Controller
                                name="phone"
                                control={control}
                                render={({ field }) => (
                                    <div className="space-y-1">
                                        <PhoneInput
                                            id="phone"
                                            data-testid="parent-profile-phone-input"
                                            disabled={loading}
                                            className="mt-1"
                                            {...field}
                                        />
                                        {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
                                    </div>
                                )}
                            />
                        </div>
                        <div dir="ltr">
                            <Label htmlFor="secondary_phone">{t('profile.secondaryPhone', 'Secondary Phone')}</Label>
                            <Controller
                                name="secondary_phone"
                                control={control}
                                render={({ field }) => (
                                    <div className="space-y-1">
                                        <PhoneInput
                                            id="secondary_phone"
                                            data-testid="parent-profile-secondary-phone-input"
                                            disabled={loading}
                                            className="mt-1"
                                            {...field}
                                        />
                                        {errors.secondary_phone && <p className="text-xs text-destructive">{errors.secondary_phone.message}</p>}
                                    </div>
                                )}
                            />
                        </div>
                    </div>

                    {/* Gender */}
                    <div>
                        <Label>{t('profile.gender', 'Gender')}</Label>
                        <Select dir={i18n.dir()} value={gender || ''} onValueChange={(v) => setValue('gender', v, { shouldDirty: true })}>
                            <SelectTrigger className="mt-1" data-testid="parent-profile-gender-select">
                                <SelectValue placeholder={t('profile.selectGender', 'Select gender')} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="male" data-testid="parent-profile-gender-option-male">{t('profile.male', 'Male')}</SelectItem>
                                <SelectItem value="female" data-testid="parent-profile-gender-option-female">{t('profile.female', 'Female')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <Separator />

                    {/* Government / Zone */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <Label>{t('profile.government', 'Governorate')}</Label>
                            <Select
                                dir={i18n.dir()}
                                value={watch('government_id') ? String(watch('government_id')) : ''}
                                onValueChange={(v) => setValue('government_id', Number(v), { shouldDirty: true })}
                            >
                                <SelectTrigger className="mt-1" data-testid="parent-profile-government-select">
                                    <SelectValue placeholder={t('profile.selectGovernment', 'Select governorate')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {governments.map((g) => (
                                        <SelectItem key={g.id} value={String(g.id)} data-testid={`parent-profile-government-option-${g.id}`}>{g.title}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>{t('profile.zone', 'Zone')}</Label>
                            <Select
                                dir={i18n.dir()}
                                value={watch('zone_id') ? String(watch('zone_id')) : ''}
                                onValueChange={(v) => setValue('zone_id', Number(v), { shouldDirty: true })}
                                disabled={!watch('government_id') || zonesLoading}
                            >
                                <SelectTrigger className="mt-1" data-testid="parent-profile-zone-select">
                                    <SelectValue placeholder={zonesLoading ? t('profile.loading') : t('profile.selectZone')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {zones.map((z) => (
                                        <SelectItem key={z.id} value={String(z.id)} data-testid={`parent-profile-zone-option-${z.id}`}>{z.title}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex justify-end pt-2">
                        <Button
                            type="submit"
                            disabled={loading || !isDirty}
                            data-testid="parent-profile-save-button"
                        >
                            {loading && <LoadingSpinner className="h-4 w-4" />}
                            {t('profile.save', 'Save Changes')}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}
