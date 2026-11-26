import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, CheckCircle, Users, BarChart3, ShoppingBag } from 'lucide-react';
import { useEmployeePerformance } from '@/hooks/admin/useEmployeePerformance';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import DayRangeFilter, { RANGE_PRESETS } from '@/components/admin/DayRangeFilter';
import LoadingSpinner from '@/components/ui/loading-spinner';
import SectionTitle from '@/components/admin/dashboard/SectionTitle';
import StaffAttendanceSection from '@/components/admin/shifts/StaffAttendanceSection';
import HintLabel from '@/components/admin/HintLabel';
import { useRole } from '@/hooks/useRole';

// Roles shown as columns in the created-accounts table (the platform's users;
// staff accounts still count in the total).
const CREATED_ROLES = ['Teacher', 'Student', 'Parent', 'Assistant'];

// The person's name with their email under it, in one cell.
function NameEmail({ name, email }) {
    return (
        <div className="min-w-0 leading-tight">
            <p className="kalima-truncate font-medium" title={name || 'Unknown'}>{name || 'Unknown'}</p>
            {email && <p className="kalima-truncate text-xs text-muted-foreground" dir="ltr" title={email}>{email}</p>}
        </div>
    );
}

export default function EmployeePerformancePage() {
    const navigate = useNavigate();
    const { t } = useTranslation('admin');
    // Staff attendance is the Admin's only.
    const { storeRoles, academyRoles } = useRole();
    const isAdmin = [...storeRoles, ...academyRoles].includes('Admin');
    const {
        loading,
        confirmerStats,
        confirmedCount,
        createdAccounts,
        fetchConfirmerStats,
        fetchConfirmedCount,
        fetchCreatedAccounts
    } = useEmployeePerformance();

    // One day range for every section; this month by default.
    const [range, setRange] = useState(RANGE_PRESETS.month);

    useEffect(() => {
        fetchConfirmerStats(range);
        fetchConfirmedCount(range);
        fetchCreatedAccounts(range);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [range?.from, range?.to, range?.fromTime, range?.toTime, !range]);

    if (loading && !confirmerStats && !confirmedCount && !createdAccounts) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <LoadingSpinner className="h-8 w-8 text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-10" data-testid="employee-performance-page">
            {/* Page Header */}
            <div className="flex items-center gap-3">
                <Activity className="h-8 w-8 text-primary" />
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        {t('nav.employeePerformance', 'Employee Performance')}
                    </h1>
                    <p className="text-muted-foreground">
                        {t('dashboard.employeePerformanceDesc', 'Track admins and sub-admins efficiency')}
                    </p>
                </div>
            </div>
            {/* Shifts have their own period, so they sit above the range that drives the sections below. */}
            {isAdmin && <StaffAttendanceSection />}

            <div className="sticky top-0 z-10 -mx-1 rounded-lg border bg-background/95 p-3 backdrop-blur">
                <DayRangeFilter value={range} onChange={setRange} withTime />
            </div>

            {/* Confirmer Stats (Who handled how many) */}
            <section data-testid="ep-confirmer-stats-section">
                <SectionTitle icon={CheckCircle}>{t('dashboard.confirmerStats', 'Confirmer Statistics')}</SectionTitle>
                <p className="-mt-2 mb-3 text-xs text-muted-foreground">{t('dashboard.confirmerStatsHint', 'Every order a staff member confirmed counts for them, split by where it is now.')}</p>
                <Card className="shadow-sm">
                    <CardContent className="p-0 overflow-x-auto">
                        <table className="kalima-data-table text-start">
                            <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                                <tr>
                                    <th className="px-6 py-3 font-medium text-start"><HintLabel hint={t('hints.nameEmail')}>{t('table.nameEmail', 'Name and email')}</HintLabel></th>
                                    <th className="kalima-number px-6 py-3 font-medium"><HintLabel hint={t('hints.ordersConfirmedBy')}>{t('table.ordersConfirmedBy', 'Orders they confirmed')}</HintLabel></th>
                                    <th className="kalima-number px-6 py-3 font-medium"><HintLabel hint={t('hints.awaitingDelivery')}>{t('table.awaitingDelivery', 'Confirmed, not delivered yet')}</HintLabel></th>
                                    <th className="kalima-number px-6 py-3 font-medium"><HintLabel hint={t('hints.deliveredOrders')}>{t('table.deliveredOrders', 'Delivered')}</HintLabel></th>
                                    <th className="kalima-number px-6 py-3 font-medium"><HintLabel hint={t('hints.returnedOrders')}>{t('table.returnedOrders', 'Returned')}</HintLabel></th>
                                </tr>
                            </thead>
                            <tbody>
                                {confirmerStats && confirmerStats.length > 0 ? (
                                    confirmerStats.map((item, idx) => (
                                        <tr key={item.user?.id || idx}>
                                            <td className="px-6 py-4"><NameEmail name={item.user?.name} email={item.user?.email} /></td>
                                            <td className="kalima-number px-6 py-4 font-semibold">{item.totalHandled || 0}</td>
                                            <td className="kalima-number px-6 py-4 text-amber-600">{item.byStatus?.confirmed || 0}</td>
                                            <td className="kalima-number px-6 py-4 text-emerald-600">{item.byStatus?.delivered || 0}</td>
                                            <td className="kalima-number px-6 py-4 text-destructive">{item.byStatus?.returned || 0}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-8 text-center text-muted-foreground">
                                            {t('table.noData', 'No data available')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            </section>

            {/* Confirmed Purchase Count (Monthly breakdown) */}
            <section data-testid="ep-confirmed-count-section">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <SectionTitle icon={BarChart3}>{t('dashboard.confirmedPurchasesByAdmin', 'Confirmed Purchases by Admin')}</SectionTitle>
                </div>
                {loading && !confirmedCount && <LoadingSpinner className="h-6 w-6 text-primary mb-4" />}
                <Card className="shadow-sm">
                    <CardContent className="p-0 overflow-x-auto">
                        <table className="kalima-data-table text-start">
                            <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                                <tr>
                                    <th className="kalima-number px-6 py-3 font-medium"><HintLabel hint={t('hints.id')}>{t('table.id', 'ID')}</HintLabel></th>
                                    <th className="px-6 py-3 font-medium text-start"><HintLabel hint={t('hints.nameEmail')}>{t('table.nameEmail', 'Name and email')}</HintLabel></th>
                                    <th className="px-6 py-3 font-medium text-start"><HintLabel hint={t('hints.phone')}>{t('table.phone', 'Phone')}</HintLabel></th>
                                    <th className="px-6 py-3 font-medium text-start"><HintLabel hint={t('hints.role')}>{t('table.role', 'Role')}</HintLabel></th>
                                    <th className="kalima-number px-6 py-3 font-medium"><HintLabel hint={t('hints.confirmedCount')}>{t('table.confirmedCount', 'Store Sales')}</HintLabel></th>
                                    <th className="kalima-number px-6 py-3 font-medium"><HintLabel hint={t('hints.productsSold')}>{t('table.productsSold', 'Products Sold')}</HintLabel></th>
                                    <th className="kalima-number px-6 py-3 font-medium"><HintLabel hint={t('hints.eBookletsDelivered')}>{t('table.eBookletsDelivered', 'E-Booklets Delivered')}</HintLabel></th>
                                    <th className="px-6 py-3 font-medium text-center"><HintLabel hint={t('hints.actions')}>{t('table.actions', 'Actions')}</HintLabel></th>
                                </tr>
                            </thead>
                            <tbody>
                                {confirmedCount && confirmedCount.length > 0 ? (
                                    confirmedCount.map((item, idx) => {
                                        return (
                                            <tr key={idx}>
                                                <td className="kalima-number px-6 py-4">{item.id}</td>
                                                <td className="px-6 py-4"><NameEmail name={item.name} email={item.email} /></td>
                                                <td className="px-6 py-4">{item.phone || '—'}</td>
                                                <td className="px-6 py-4">{t(`roles.${item.role}`, item.role)}</td>
                                                <td className="kalima-number px-6 py-4 text-primary">{item.count || 0}</td>
                                                <td className="kalima-number px-6 py-4 text-primary">{item.productsSold || 0}</td>
                                                <td className="kalima-number px-6 py-4 text-primary">{item.eBookletsDelivered || 0}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 gap-1.5 text-xs font-medium"
                                                        onClick={() => {
                                                            const query = range ? `?${new URLSearchParams({ from: range.from || '', to: range.to || '', ...(range.fromTime && { from_time: range.fromTime }), ...(range.toTime && { to_time: range.toTime }) })}` : '';
                                                            navigate(`/admin/employee-performance/${item.id}${query}`);
                                                        }}
                                                    >
                                                        <ShoppingBag className="h-3.5 w-3.5" />
                                                        <span>{t('employeePerformanceDetails.viewSales', 'View Sales')}</span>
                                                    </Button>
                                                </td>
                                            </tr>
                                        )
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan="8" className="px-6 py-8 text-center text-muted-foreground">
                                            {t('table.noData', 'No data available')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            </section>

            {/* Created Accounts Stats */}
            <section data-testid="ep-created-accounts-section">
                <SectionTitle icon={Users}>{t('dashboard.createdAccounts', 'Created Accounts Statistics')}</SectionTitle>
                <Card className="shadow-sm">
                    <CardContent className="p-0 overflow-x-auto">
                        <table className="kalima-data-table text-start">
                            <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                                <tr>
                                    <th className="px-6 py-3 font-medium text-start"><HintLabel hint={t('hints.adminName')}>{t('table.adminName', 'Admin Name')}</HintLabel></th>
                                    <th className="px-6 py-3 font-medium text-start"><HintLabel hint={t('hints.email')}>{t('table.email', 'Email')}</HintLabel></th>
                                    {CREATED_ROLES.map((r) => <th key={r} className="kalima-number px-4 py-3 font-medium"><HintLabel hint={t('hints.createdRole', { role: t(`roles.${r}`, r) })}>{t(`roles.${r}`, r)}</HintLabel></th>)}
                                    <th className="kalima-number px-6 py-3 font-medium"><HintLabel hint={t('hints.createdAccounts')}>{t('table.createdAccounts', 'Accounts Created')}</HintLabel></th>
                                </tr>
                            </thead>
                            <tbody>
                                {createdAccounts && createdAccounts.length > 0 ? (
                                    createdAccounts.map((item, idx) => (
                                        <tr key={item.user?.id || idx}>
                                            <td className="kalima-truncate px-6 py-4 font-medium" title={item.user?.name || 'Unknown'}>{item.user?.name || 'Unknown'}</td>
                                            <td className="kalima-truncate px-6 py-4" title={item.user?.email}>{item.user?.email}</td>
                                            {CREATED_ROLES.map((r) => <td key={r} className="kalima-number px-4 py-4">{item.byRole?.[r] || 0}</td>)}
                                            <td className="kalima-number px-6 py-4 font-semibold text-blue-600">{item.totalAccounts || 0}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={CREATED_ROLES.length + 3} className="px-6 py-8 text-center text-muted-foreground">
                                            {t('table.noData', 'No data available')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            </section>
        </div>
    );
}
