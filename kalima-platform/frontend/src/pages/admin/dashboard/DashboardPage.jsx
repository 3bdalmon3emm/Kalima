import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    TrendingUp, Users, ShoppingBag, DollarSign,
    BarChart3, Package, CheckCircle
} from 'lucide-react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import LoadingSpinner from '@/components/ui/loading-spinner';
import StatCard from '@/components/admin/dashboard/StatCard';
import SectionTitle from '@/components/admin/dashboard/SectionTitle';
import { useRole } from '@/hooks/useRole';
import { canAccessAdminAnalytics } from '@/lib/adminAnalyticsAccess';
import MyShiftCard from '@/components/admin/shifts/MyShiftCard';

/* ── main ── */
export default function DashboardPage() {
    const { t } = useTranslation('admin');
    const { storeRoles, academyRoles } = useRole();
    // The SubAdmin and the Moderator start and end their shifts here (the
    // role may sit on either portal; the server accepts any portal).
    const allRoles = [...storeRoles, ...academyRoles];
    const showShift = !allRoles.includes('Admin') && (allRoles.includes('SubAdmin') || allRoles.includes('Moderator'));
    // The Moderator opens the dashboard without the numbers.
    const showStats = canAccessAdminAnalytics(storeRoles);

    const {
        storeStats,
        userStats,
        loading,
        fetchStoreStats,
        fetchUserStats,
    } = useAnalytics();

    useEffect(() => {
        if (!showStats) return;
        fetchStoreStats();
        fetchUserStats();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (showStats && loading && !storeStats && !userStats) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <LoadingSpinner className="h-8 w-8 text-primary" />
            </div>
        );
    }

    const fmt = (n) => (n !== undefined && n !== null) ? Number(n).toLocaleString() : '—';

    /* ── Store stats cards ── */
    const storeCards = [
        {
            icon: DollarSign,
            label: t('dashboard.totalRevenue', 'Total Revenue'),
            value: storeStats ? `${fmt(storeStats.totalRevenue)} ${t('dashboard.currency', 'EGP')}` : '—',
            color: 'text-emerald-500',
        },
        {
            icon: ShoppingBag,
            label: t('dashboard.totalPurchases', 'Total Purchases'),
            value: fmt(storeStats?.totalPurchases),
            color: 'text-primary',
        },
        {
            icon: CheckCircle,
            label: t('dashboard.confirmedPurchases', 'Confirmed Purchases'),
            value: fmt(storeStats?.confirmedPurchases),
            color: 'text-blue-500',
        },
        {
            icon: TrendingUp,
            label: t('dashboard.avgOrderValue', 'Avg. Order Value'),
            value: storeStats ? `${fmt(storeStats.averageOrderValue)} ${t('dashboard.currency', 'EGP')}` : '—',
            color: 'text-violet-500',
        },
    ];

    /* ── User stats cards ── */
    const totalUsers = userStats?.total ?? 0;
    const verifiedUsers = userStats?.verified ?? 0;
    const roleBreakdown = userStats?.byRole ?? {};

    const userCards = [
        {
            icon: Users,
            label: t('dashboard.totalUsers', 'Total Users'),
            value: fmt(totalUsers),
            color: 'text-chart-3',
        },
        {
            icon: CheckCircle,
            label: t('dashboard.verifiedUsers', 'Verified Users'),
            value: fmt(verifiedUsers),
            sub: totalUsers ? `${Math.round((verifiedUsers / totalUsers) * 100)}% ${t('dashboard.ofTotal', 'of total')}` : undefined,
            color: 'text-emerald-500',
        },
    ];

    return (
        <div className="space-y-10" data-testid="admin-dashboard-page">
            {/* Page Header */}
            <div className="flex items-center gap-3">
                <BarChart3 className="h-8 w-8 text-primary" />
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        {t('dashboard.title', 'Dashboard')}
                    </h1>
                    <p className="text-muted-foreground">
                        {showStats ? t('dashboard.description', 'Store performance overview') : t('dashboard.pickSection', 'Pick a section from the menu.')}
                    </p>
                </div>
            </div>

            {showShift && <MyShiftCard />}

            {showStats && (<>
            {/* Store Stats */}
            <section data-testid="dashboard-store-stats-section">
                <SectionTitle icon={ShoppingBag}>{t('dashboard.storeStats', 'Store Statistics')}</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {storeCards.map((c) => (
                        <StatCard key={c.label} {...c} />
                    ))}
                </div>
            </section>

            {/* User Stats */}
            <section data-testid="dashboard-user-stats-section">
                <SectionTitle icon={Users}>{t('dashboard.userStats', 'User Statistics')}</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {userCards.map((c) => (
                        <StatCard key={c.label} {...c} />
                    ))}
                </div>

                {/* Role breakdown table */}
                {Object.keys(roleBreakdown).length > 0 && (
                    <Card className="mt-4 shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Package className="h-4 w-4 text-primary" />
                                {t('dashboard.usersByRole', 'Users by Role')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <div className="divide-y">
                                {Object.entries(roleBreakdown).map(([role, count]) => (
                                    <div key={role} className="flex items-center justify-between py-2.5">
                                        <span className="text-sm text-muted-foreground">{role}</span>
                                        <span className="text-sm font-semibold tabular-nums">{fmt(count)}</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </section>
            </>)}
        </div>
    );
}
