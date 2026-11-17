import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { User } from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';
import useLookups from '@/hooks/useLookups';
import TeachingLocations from '@/components/teacher/profile/TeachingLocations';
import SocialMedia from '@/components/teacher/profile/SocialMedia';
import LoadingSpinner from '@/components/ui/loading-spinner';
import TeacherProfileForm from '@/components/teacher/profile/TeacherProfileForm';
import TeacherAvatarCard from '@/components/teacher/profile/TeacherAvatarCard';
import TeacherCoverCard from '@/components/teacher/profile/TeacherCoverCard';

export default function TeacherProfilePage() {
    const { t } = useTranslation('teacher');
    const { profile, uploadAvatar, fetchProfile, loading } = useProfile();
    const { governments, subjects, getZonesByGovernment, zones } = useLookups();

    const [formReady, setFormReady] = useState(false);
    const [defaultValues, setDefaultValues] = useState({});

    useEffect(() => {
        const load = async () => {
            const p = await fetchProfile();
            if (p) {
                setDefaultValues({
                    name: p.name || '',
                    phone: p.phone || '',
                    secondary_phone: p.secondary_phone || '',
                    gender: p.gender || undefined,
                    government_id: p.teachers?.government_id || undefined,
                    zone_id: p.teachers?.zone_id || undefined,
                    subject_id: p.teachers?.subject_id || undefined,
                });

                if (p.teachers?.government_id) {
                    getZonesByGovernment(p.teachers.government_id);
                }
                setFormReady(true);
            }
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (loading && !profile) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <LoadingSpinner className="h-8 w-8 text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6" data-testid="teacher-profile-page">
            {/* Page Header */}
            <div className="flex items-center gap-3">
                <User className="h-8 w-8 text-primary" />
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('profile.title', 'My Profile')}</h1>
                    <p className="text-muted-foreground">{t('profile.description', 'Manage your personal info and teaching details')}</p>
                </div>
            </div>

            {/* Avatar + Hero */}
            <TeacherAvatarCard
                profile={profile}
                uploadAvatar={uploadAvatar}
                fetchProfile={fetchProfile}
            />

            <TeacherCoverCard profile={profile} onChanged={fetchProfile} />

            {/* Read-only Profile Details */}
            {formReady && (
                <TeacherProfileForm
                    defaultValues={defaultValues}
                    governments={governments}
                    subjects={subjects}
                    zones={zones}
                />
            )}

            <TeachingLocations />
            <SocialMedia />
        </div>
    );
}
