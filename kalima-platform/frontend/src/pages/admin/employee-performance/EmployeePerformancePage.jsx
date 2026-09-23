import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Activity, CheckCircle, Users, BarChart3, Filter, Calendar as CalendarIcon, X, ChevronLeft, ChevronRight, ShoppingBag
} from 'lucide-react';
import { format } from 'date-fns';
import { useEmployeePerformance } from '@/hooks/admin/useEmployeePerformance';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/loading-spinner';
import SectionTitle from '@/components/admin/dashboard/SectionTitle';

export default function EmployeePerformancePage() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation('admin');
    const {
        loading,
        confirmerStats,
        confirmedCount,
        createdAccounts,
        fetchConfirmerStats,
        fetchConfirmedCount,
        fetchCreatedAccounts
    } = useEmployeePerformance();

    const [date, setDate] = useState(null);
    const [activeYear, setActiveYear] = useState(new Date().getFullYear());
    const [isOpen, setIsOpen] = useState(false);

    const getMonthName = (monthIndex, type = 'long') => {
        try {
            return new Intl.DateTimeFormat(i18n.language, { month: type }).format(new Date(2025, monthIndex, 1));
        } catch (e) {
            return format(new Date(2025, monthIndex, 1), type === 'long' ? "MMMM" : "MMM");
        }
    };

    const months = Array.from({ length: 12 }, (_, i) => ({
        name: getMonthName(i, 'long'),
        short: getMonthName(i, 'short'),
        index: i
    }));

    useEffect(() => {
        if (date) {
            setActiveYear(date.getFullYear());
        }
    }, [date]);


    useEffect(() => {
        fetchConfirmerStats();
        fetchCreatedAccounts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (date) {
            const m = date.getMonth() + 1;
            const y = date.getFullYear();
            fetchConfirmedCount(m, y);
        } else {
            fetchConfirmedCount();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date]);

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

            {/* Confirmer Stats (Who handled how many) */}
            <section data-testid="ep-confirmer-stats-section">
                <SectionTitle icon={CheckCircle}>{t('dashboard.confirmerStats', 'Confirmer Statistics')}</SectionTitle>
                <Card className="shadow-sm">
                    <CardContent className="p-0 overflow-x-auto">
                        <table className="kalima-data-table text-start">
                            <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                                <tr>
                                    <th className="px-6 py-3 font-medium text-start">{t('table.adminName', 'Admin Name')}</th>
                                    <th className="px-6 py-3 font-medium text-start">{t('table.email', 'Email')}</th>
                                    <th className="kalima-number px-6 py-3 font-medium">{t('table.totalHandled', 'Total Handled')}</th>
                                    <th className="kalima-number px-6 py-3 font-medium">{t('table.confirmed', 'Confirmed')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {confirmerStats && confirmerStats.length > 0 ? (
                                    confirmerStats.map((item, idx) => (
                                        <tr key={item.user?.id || idx}>
                                            <td className="kalima-truncate px-6 py-4 font-medium" title={item.user?.name || 'Unknown'}>{item.user?.name || 'Unknown'}</td>
                                            <td className="kalima-truncate px-6 py-4" title={item.user?.email}>{item.user?.email}</td>
                                            <td className="kalima-number px-6 py-4">{item.totalHandled || 0}</td>
                                            <td className="kalima-number px-6 py-4 text-emerald-600">{item.byStatus?.confirmed || 0}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-8 text-center text-muted-foreground">
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
                    {/* Month/Year Filters */}
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-muted-foreground" />
                        <Popover open={isOpen} onOpenChange={setIsOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    size="sm"
                                    className={cn(
                                        "w-[240px] justify-start text-left font-normal",
                                        !date && "text-muted-foreground"
                                    )}
                                    data-testid="month-year-picker-trigger"
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {date ? `${getMonthName(date.getMonth(), 'long')} ${date.getFullYear()}` : <span>{t('dashboard.pickMonth', 'Pick a month')}</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-3" align="end">
                                <div className="flex items-center justify-between mb-4 px-1">
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveYear(activeYear - 1);
                                        }}
                                        aria-label={t('dashboard.prevYear', 'Previous year')}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <div className="font-semibold text-sm select-none tabular-nums">
                                        {activeYear}
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveYear(activeYear + 1);
                                        }}
                                        aria-label={t('dashboard.nextYear', 'Next year')}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {months.map((m) => {
                                        const isSelected = date && date.getMonth() === m.index && date.getFullYear() === activeYear;
                                        return (
                                            <Button
                                                key={m.index}
                                                variant={isSelected ? "default" : "ghost"}
                                                className="h-9 text-xs font-medium"
                                                onClick={() => {
                                                    setDate(new Date(activeYear, m.index, 1));
                                                    setIsOpen(false);
                                                }}
                                            >
                                                {m.short}
                                            </Button>
                                        );
                                    })}
                                </div>
                            </PopoverContent>
                        </Popover>
                        {date && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDate(null)}
                                className="h-8 px-2 lg:px-3"
                                data-testid="clear-date-filter"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
                {loading && !confirmedCount && <LoadingSpinner className="h-6 w-6 text-primary mb-4" />}
                <Card className="shadow-sm">
                    <CardContent className="p-0 overflow-x-auto">
                        <table className="kalima-data-table text-start">
                            <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                                <tr>
                                    <th className="kalima-number px-6 py-3 font-medium">{t('table.id', 'ID')}</th>
                                    <th className="px-6 py-3 font-medium text-start">{t('table.name', 'Name')}</th>
                                    <th className="px-6 py-3 font-medium text-start">{t('table.email', 'Email')}</th>
                                    <th className="px-6 py-3 font-medium text-start">{t('table.phone', 'Phone')}</th>
                                    <th className="px-6 py-3 font-medium text-start">{t('table.role', 'Role')}</th>
                                    <th className="kalima-number px-6 py-3 font-medium">{t('table.confirmedCount', 'Store Sales')}</th>
                                    <th className="kalima-number px-6 py-3 font-medium">{t('table.productsSold', 'Products Sold')}</th>
                                    <th className="kalima-number px-6 py-3 font-medium">{t('table.eBookletsDelivered', 'E-Booklets Delivered')}</th>
                                    <th className="px-6 py-3 font-medium text-center">{t('table.actions', 'Actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {confirmedCount && confirmedCount.length > 0 ? (
                                    confirmedCount.map((item, idx) => {
                                        return (
                                            <tr key={idx}>
                                                <td className="kalima-number px-6 py-4">{item.id}</td>
                                                <td className="kalima-truncate px-6 py-4 font-medium" title={item.name || 'Unknown'}>{item.name || 'Unknown'}</td>
                                                <td className="kalima-truncate px-6 py-4" title={item.email}>{item.email}</td>
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
                                                            const query = date ? `?month=${date.getMonth() + 1}&year=${date.getFullYear()}` : '';
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
                                        <td colSpan="9" className="px-6 py-8 text-center text-muted-foreground">
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
                                    <th className="px-6 py-3 font-medium text-start">{t('table.adminName', 'Admin Name')}</th>
                                    <th className="px-6 py-3 font-medium text-start">{t('table.email', 'Email')}</th>
                                    <th className="kalima-number px-6 py-3 font-medium">{t('table.createdAccounts', 'Accounts Created')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {createdAccounts && createdAccounts.length > 0 ? (
                                    createdAccounts.map((item, idx) => (
                                        <tr key={item.user?.id || idx}>
                                            <td className="kalima-truncate px-6 py-4 font-medium" title={item.user?.name || 'Unknown'}>{item.user?.name || 'Unknown'}</td>
                                            <td className="kalima-truncate px-6 py-4" title={item.user?.email}>{item.user?.email}</td>
                                            <td className="kalima-number px-6 py-4 text-blue-600">{item.totalAccounts || 0}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="3" className="px-6 py-8 text-center text-muted-foreground">
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
