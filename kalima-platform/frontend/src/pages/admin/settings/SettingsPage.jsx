import { useTranslation } from 'react-i18next';
import { Settings, User, Lock, Shield, Mail, History, Settings2, Users, GraduationCap } from 'lucide-react';

import ProfileSection from '@/components/admin/settings/ProfileSection';
import PasswordSection from '@/components/admin/settings/PasswordSection';
import AccountSection from '@/components/admin/settings/AccountSection';
import SecuritySection from '@/components/admin/settings/SecuritySection';
import SessionSection from '@/components/admin/settings/SessionSection';
import AccountReviewSection from '@/components/admin/settings/AccountReviewSection';
import GeneralSettingsSection from '@/components/admin/settings/GeneralSettingsSection';
import LevelsSection from '@/components/admin/settings/LevelsSection';
import SettingsSearch from '@/components/admin/settings/SettingsSearch';

export default function SettingsPage() {
    const { t, i18n } = useTranslation('admin');
    const isRtl = i18n.dir() === 'rtl';

    const sections = [
        { id: 'profile', dataKey: 'profile', translationKey: 'settings.profile.title', icon: User, component: ProfileSection },
        { id: 'password', dataKey: 'password', translationKey: 'settings.password.title', icon: Lock, component: PasswordSection },
        { id: 'account', dataKey: 'account', translationKey: 'settings.account.title', icon: Shield, component: AccountSection },
        { id: 'security', dataKey: 'email', subKeys: ['account.delete', 'account.dangerZone'], translationKey: 'settings.email.title', icon: Mail, component: SecuritySection },
        { id: 'session', dataKey: 'session', translationKey: 'settings.session.title', icon: History, component: SessionSection },
        { id: 'general', dataKey: 'general', translationKey: 'settings.general.title', icon: Settings2, component: GeneralSettingsSection },
        { id: 'levels', dataKey: 'levels', translationKey: 'settings.levels.title', icon: GraduationCap, component: LevelsSection },
        { id: 'review', dataKey: 'accountReview', translationKey: 'settings.accountReview.title', icon: Users, component: AccountReviewSection },
    ];

    return (
        <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'} data-testid="admin-settings-page">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-2 sm:p-3 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Settings className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-3xl font-black tracking-tight text-foreground">
                            {t('settings.title')}
                        </h1>
                        <p className="text-xs sm:text-base text-muted-foreground mt-0.5 sm:mt-1 font-medium">
                            {t('settings.description')}
                        </p>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="w-full md:w-80">
                    <SettingsSearch sections={sections} />
                </div>
            </div>

            {/* Sections */}
            <div className="grid gap-6">
                {sections.map((section) => (
                    <div key={section.id} id={section.id} className="scroll-mt-6">
                        <section.component />
                    </div>
                ))}
            </div>
        </div>
    );
}
