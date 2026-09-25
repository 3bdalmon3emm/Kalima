import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowLeft,
    ArrowRight,
    ShoppingBag,
    Package,
    BookOpen,
    TrendingUp,
    ClipboardCheck,
    Calendar as CalendarIcon,
    Filter,
    X,
    Search,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    User,
    Mail,
    Phone,
    Layers
} from 'lucide-react';
import { format } from 'date-fns';
import { useEmployeePerformance } from '@/hooks/admin/useEmployeePerformance';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatCurrency, getImageUrl } from '@/lib/storeUtils';
import LoadingSpinner from '@/components/ui/loading-spinner';

export default function EmployeePerformanceDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { t, i18n } = useTranslation('admin');

    const initialMonth = searchParams.get('month') ? parseInt(searchParams.get('month'), 10) : null;
    const initialYear = searchParams.get('year') ? parseInt(searchParams.get('year'), 10) : (initialMonth ? new Date().getFullYear() : null);

    const [date, setDate] = useState(() => {
        if (initialMonth && initialYear) {
            return new Date(initialYear, initialMonth - 1, 1);
        }
        return null;
    });

    const [activeYear, setActiveYear] = useState(() => initialYear || new Date().getFullYear());
    const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
    const [selectedType, setSelectedType] = useState('all'); // 'all' | 'normal' | 'ebooklet'
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    const {
        loading,
        employeeSalesDetails,
        fetchEmployeeProducts
    } = useEmployeePerformance();

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
            setSearchParams({
                month: String(date.getMonth() + 1),
                year: String(date.getFullYear())
            });
        } else {
            setSearchParams({});
        }
    }, [date, setSearchParams]);

    const loadData = () => {
        if (!id) return;
        const params = {
            page: currentPage,
            limit: 100, // Fetch up to 100 items for rich client-side search & filtering
        };
        if (date) {
            params.month = date.getMonth() + 1;
            params.year = date.getFullYear();
        }
        fetchEmployeeProducts(id, params);
    };

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, date]);

    const employee = employeeSalesDetails?.employee;
    const summary = employeeSalesDetails?.summary || {
        totalOrders: 0,
        totalProductsSold: 0,
        totalRevenue: 0,
        normalProductsCount: 0,
        ebookletsCount: 0
    };

    const rawItems = employeeSalesDetails?.items || [];

    // Client-side filtering by type and search query
    const filteredItems = useMemo(() => {
        let result = rawItems;
        if (selectedType !== 'all') {
            result = result.filter(item => item.itemType === selectedType);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            result = result.filter(item =>
                (item.product?.title && item.product.title.toLowerCase().includes(q)) ||
                (item.product?.serial && item.product.serial.toLowerCase().includes(q)) ||
                (item.purchaseSerial && item.purchaseSerial.toLowerCase().includes(q)) ||
                (item.customer?.name && item.customer.name.toLowerCase().includes(q)) ||
                (item.customer?.phone && item.customer.phone.includes(q))
            );
        }
        return result;
    }, [rawItems, selectedType, searchQuery]);

    const totalPages = Math.ceil(filteredItems.length / itemsPerPage) || 1;
    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredItems.slice(start, start + itemsPerPage);
    }, [filteredItems, currentPage, itemsPerPage]);

    const handleClearDate = () => {
        setDate(null);
        setCurrentPage(1);
    };

    const isRtl = i18n.dir() === 'rtl';
    const BackIcon = isRtl ? ArrowRight : ArrowLeft;

    return (
        <div className="space-y-8" data-testid="employee-performance-detail-page">
            {/* Header & Back Navigation */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 px-0 text-muted-foreground hover:text-foreground"
                        onClick={() => navigate('/admin/employee-performance')}
                    >
                        <BackIcon className="h-4 w-4" />
                        <span>{t('employeePerformanceDetails.back', 'Back to Employee Performance')}</span>
                    </Button>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <User className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-bold tracking-tight">
                                    {employee?.name || t('employeePerformanceDetails.title', 'Employee Sales')}
                                </h1>
                                {employee?.role && (
                                    <Badge variant="secondary" className="font-normal text-xs">
                                        {t(`roles.${employee.role}`, employee.role)}
                                    </Badge>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-1">
                                {employee?.email && (
                                    <span className="flex items-center gap-1">
                                        <Mail className="h-3.5 w-3.5" />
                                        {employee.email}
                                    </span>
                                )}
                                {employee?.phone && (
                                    <span className="flex items-center gap-1">
                                        <Phone className="h-3.5 w-3.5" />
                                        {employee.phone}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Date Filter */}
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Popover open={isMonthPickerOpen} onOpenChange={setIsMonthPickerOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className={cn(
                                    "w-[220px] justify-start text-start font-normal",
                                    !date && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {date ? `${getMonthName(date.getMonth(), 'long')} ${date.getFullYear()}` : <span>{t('employeePerformanceDetails.allTime', 'All Time')}</span>}
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
                                                setIsMonthPickerOpen(false);
                                                setCurrentPage(1);
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
                            onClick={handleClearDate}
                            className="h-8 px-2"
                            title={t('common.cancel', 'Clear')}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* KPI Metric Summary Cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                <Card className="shadow-xs">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between space-y-0 pb-2">
                            <span className="text-xs font-medium text-muted-foreground">
                                {t('employeePerformanceDetails.totalOrdersConfirmed', 'Confirmed Orders')}
                            </span>
                            <ClipboardCheck className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div className="text-2xl font-bold tracking-tight text-emerald-600 tabular-nums">
                            {summary.totalOrders}
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-xs">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between space-y-0 pb-2">
                            <span className="text-xs font-medium text-muted-foreground">
                                {t('employeePerformanceDetails.totalProductsSold', 'Total Units Sold')}
                            </span>
                            <ShoppingBag className="h-4 w-4 text-primary" />
                        </div>
                        <div className="text-2xl font-bold tracking-tight text-primary tabular-nums">
                            {summary.totalProductsSold}
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-xs">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between space-y-0 pb-2">
                            <span className="text-xs font-medium text-muted-foreground">
                                {t('employeePerformanceDetails.normalProducts', 'Normal Products')}
                            </span>
                            <Package className="h-4 w-4 text-sky-600" />
                        </div>
                        <div className="text-2xl font-bold tracking-tight text-sky-600 tabular-nums">
                            {summary.normalProductsCount}
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-xs">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between space-y-0 pb-2">
                            <span className="text-xs font-medium text-muted-foreground">
                                {t('employeePerformanceDetails.ebooklets', 'E-Booklets')}
                            </span>
                            <BookOpen className="h-4 w-4 text-purple-600" />
                        </div>
                        <div className="text-2xl font-bold tracking-tight text-purple-600 tabular-nums">
                            {summary.ebookletsCount}
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-xs col-span-2 lg:col-span-1">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between space-y-0 pb-2">
                            <span className="text-xs font-medium text-muted-foreground">
                                {t('employeePerformanceDetails.totalRevenue', 'Total Revenue')}
                            </span>
                            <TrendingUp className="h-4 w-4 text-amber-600" />
                        </div>
                        <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                            {formatCurrency(summary.totalRevenue)}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter Tabs & Search Bar */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-1.5 rounded-lg bg-muted p-1">
                    <button
                        type="button"
                        onClick={() => { setSelectedType('all'); setCurrentPage(1); }}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                            selectedType === 'all'
                                ? "bg-background text-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Layers className="h-3.5 w-3.5" />
                        <span>{t('employeePerformanceDetails.allTypes', 'All')}</span>
                        <span className="rounded-full bg-muted-foreground/15 px-1.5 py-0.2 text-[10px] tabular-nums">
                            {summary.totalProductsSold || 0}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => { setSelectedType('normal'); setCurrentPage(1); }}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                            selectedType === 'normal'
                                ? "bg-background text-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Package className="h-3.5 w-3.5" />
                        <span>{t('employeePerformanceDetails.normalProducts', 'Normal Products')}</span>
                        <span className="rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-400 px-1.5 py-0.2 text-[10px] tabular-nums">
                            {summary.normalProductsCount || 0}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => { setSelectedType('ebooklet'); setCurrentPage(1); }}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                            selectedType === 'ebooklet'
                                ? "bg-background text-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <BookOpen className="h-3.5 w-3.5" />
                        <span>{t('employeePerformanceDetails.ebooklets', 'E-Booklets')}</span>
                        <span className="rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-400 px-1.5 py-0.2 text-[10px] tabular-nums">
                            {summary.ebookletsCount || 0}
                        </span>
                    </button>
                </div>

                <div className="relative w-full sm:w-72">
                    <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground rtl:left-3 rtl:right-auto" />
                    <Input
                        type="text"
                        placeholder={t('employeePerformanceDetails.searchPlaceholder', 'Search products, orders, customers...')}
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1);
                        }}
                        className="h-9 px-9 text-xs"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute left-3 top-2.5 text-muted-foreground hover:text-foreground rtl:left-auto rtl:right-3"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Products Sold Table */}
            <Card className="shadow-xs overflow-hidden">
                <CardContent className="p-0 overflow-x-auto">
                    {loading && paginatedItems.length === 0 ? (
                        <div className="flex h-48 items-center justify-center">
                            <LoadingSpinner className="h-8 w-8 text-primary" />
                        </div>
                    ) : (
                        <table className="kalima-data-table text-start">
                            <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                                <tr>
                                    <th className="px-6 py-3 font-medium text-start">
                                        {t('employeePerformanceDetails.product', 'Product')}
                                    </th>
                                    <th className="px-6 py-3 font-medium text-start">
                                        {t('employeePerformanceDetails.type', 'Type')}
                                    </th>
                                    <th className="px-6 py-3 font-medium text-start">
                                        {t('employeePerformanceDetails.orderCode', 'Order Code')}
                                    </th>
                                    <th className="px-6 py-3 font-medium text-start">
                                        {t('employeePerformanceDetails.customer', 'Customer')}
                                    </th>
                                    <th className="kalima-number px-6 py-3 font-medium">
                                        {t('employeePerformanceDetails.qty', 'Qty')}
                                    </th>
                                    <th className="kalima-number px-6 py-3 font-medium">
                                        {t('employeePerformanceDetails.unitPrice', 'Unit Price')}
                                    </th>
                                    <th className="kalima-number px-6 py-3 font-medium">
                                        {t('employeePerformanceDetails.finalPrice', 'Total')}
                                    </th>
                                    <th className="px-6 py-3 font-medium text-start">
                                        {t('employeePerformanceDetails.confirmedAt', 'Confirmed At')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {paginatedItems.length > 0 ? (
                                    paginatedItems.map((item) => {
                                        const isEBooklet = item.itemType === 'ebooklet';
                                        return (
                                            <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                                                {/* Product Info */}
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        {item.product?.thumbnailUrl ? (
                                                            <img
                                                                src={getImageUrl(item.product.thumbnailUrl)}
                                                                alt={item.product?.title || ''}
                                                                className="h-10 w-10 rounded-md object-cover border"
                                                            />
                                                        ) : (
                                                            <div className={cn(
                                                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border",
                                                                isEBooklet ? "bg-purple-50 text-purple-600 dark:bg-purple-950/40" : "bg-sky-50 text-sky-600 dark:bg-sky-950/40"
                                                            )}>
                                                                {isEBooklet ? <BookOpen className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                                                            </div>
                                                        )}
                                                        <div className="min-w-0 max-w-xs">
                                                            <p className="font-medium text-sm truncate" title={item.product?.title}>
                                                                {item.product?.title || 'Unknown'}
                                                            </p>
                                                            {item.product?.serial && (
                                                                <span className="text-[11px] text-muted-foreground font-mono">
                                                                    #{item.product.serial}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Type Badge */}
                                                <td className="px-6 py-4">
                                                    {isEBooklet ? (
                                                        <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800 text-[11px] font-medium">
                                                            <BookOpen className="mr-1 h-3 w-3" />
                                                            {t('employeePerformanceDetails.ebookletBadge', 'E-Booklet')}
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800 text-[11px] font-medium">
                                                            <Package className="mr-1 h-3 w-3" />
                                                            {t('employeePerformanceDetails.normalProductBadge', 'Normal Product')}
                                                        </Badge>
                                                    )}
                                                </td>

                                                {/* Order Link */}
                                                <td className="px-6 py-4">
                                                    <Link
                                                        to={isEBooklet ? `/admin/e-booklets/orders/${item.purchaseId}` : `/admin/orders/${item.purchaseId}`}
                                                        className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                                                    >
                                                        <span>{item.purchaseSerial || `#${item.purchaseId}`}</span>
                                                        <ExternalLink className="h-3 w-3" />
                                                    </Link>
                                                </td>

                                                {/* Customer */}
                                                <td className="px-6 py-4">
                                                    <div className="text-xs">
                                                        <p className="font-medium text-foreground">
                                                            {item.customer?.name || '—'}
                                                        </p>
                                                        {item.customer?.phone && (
                                                            <p className="text-muted-foreground font-mono">
                                                                {item.customer.phone}
                                                            </p>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Quantity */}
                                                <td className="kalima-number px-6 py-4 font-semibold">
                                                    {item.quantity}
                                                </td>

                                                {/* Unit Price */}
                                                <td className="kalima-number px-6 py-4 text-xs text-muted-foreground tabular-nums">
                                                    {formatCurrency(item.unitPrice)}
                                                </td>

                                                {/* Final Price */}
                                                <td className="kalima-number px-6 py-4 font-bold text-foreground tabular-nums">
                                                    {formatCurrency(item.finalPrice)}
                                                </td>

                                                {/* Confirmation Date */}
                                                <td className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap">
                                                    {item.confirmedAt ? (
                                                        format(new Date(item.confirmedAt), 'yyyy/MM/dd - hh:mm a')
                                                    ) : (
                                                        '—'
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan="8" className="px-6 py-12 text-center text-muted-foreground">
                                            <ShoppingBag className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                                            <p className="font-medium">
                                                {t('employeePerformanceDetails.noSalesFound', 'No sold products found matching the criteria')}
                                            </p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </CardContent>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-2 text-xs text-muted-foreground">
                    <div>
                        {filteredItems.length} {t('employeePerformanceDetails.totalProductsSold', 'items')}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage <= 1}
                            className="h-8 text-xs"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="tabular-nums">
                            {currentPage} / {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage >= totalPages}
                            className="h-8 text-xs"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
