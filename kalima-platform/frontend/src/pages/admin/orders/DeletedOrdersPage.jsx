import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Trash2 } from 'lucide-react';
import axios from '@/api/axios';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { formatCurrency } from '@/lib/storeUtils';

// Deleted orders for the Admin: who deleted each one, when and why. A deleted
// order is kept for the record but counts nowhere.
export default function DeletedOrdersPage() {
    const { t, i18n } = useTranslation('admin');
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 400);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        let cancelled = false;
        axios.get('/purchases/deleted', { params: { page, limit: 20, ...(query && { search: query }) } })
            .then((res) => !cancelled && setData({ rows: res.data.data, pagination: res.data.pagination, key: `${query}:${page}` }))
            .catch(() => !cancelled && setError(true));
        return () => { cancelled = true; };
    }, [query, page]);

    const when = (d) => (d ? new Date(d).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
    const status = (s) => t(`orders.status${s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()}`, { defaultValue: s });

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Trash2 className="h-7 w-7 text-destructive" />
                    <div>
                        <h1 className="text-2xl font-bold">{t('orders.deleted.title', 'Deleted orders')}</h1>
                        <p className="text-sm text-muted-foreground">{t('orders.deleted.subtitle', 'Kept for the record; they count nowhere. Admin only.')}</p>
                    </div>
                </div>
                <Button variant="outline" asChild><Link to="/admin/orders">{t('orders.deleted.back', 'Back to orders')}</Link></Button>
            </div>

            <div className="relative max-w-md">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="ps-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('orders.deleted.search', 'Search by order number, customer or reason')} />
            </div>

            {error ? <p className="text-destructive">{t('orders.deleted.error', 'Could not load deleted orders')}</p>
                : data?.key !== `${query}:${page}` ? <div className="flex justify-center py-12"><LoadingSpinner /></div>
                    : !data.rows.length ? <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">{t('orders.deleted.empty', 'No deleted orders.')}</p>
                        : (
                            <div className="overflow-x-auto rounded-lg border">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                                        <tr>
                                            <th className="p-3 text-start font-medium">{t('orders.deleted.order', 'Order')}</th>
                                            <th className="p-3 text-start font-medium">{t('orders.deleted.customer', 'Customer')}</th>
                                            <th className="p-3 text-start font-medium">{t('orders.deleted.total', 'Total')}</th>
                                            <th className="p-3 text-start font-medium">{t('orders.deleted.statusAtDelete', 'Status')}</th>
                                            <th className="p-3 text-start font-medium">{t('orders.deleted.by', 'Deleted by')}</th>
                                            <th className="p-3 text-start font-medium">{t('orders.deleted.at', 'Deleted at')}</th>
                                            <th className="p-3 text-start font-medium">{t('orders.deleted.reason', 'Reason')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.rows.map((o) => (
                                            <tr key={o.id} className="border-t align-top">
                                                <td className="p-3 font-mono text-xs" dir="ltr">{o.purchase_serial || `#${o.id}`}</td>
                                                <td className="p-3">
                                                    {o.users ? <Link to={`/admin/users/${o.users.id}`} className="hover:underline">{o.users.name}</Link> : '—'}
                                                    {o.users?.phone && <p className="text-xs text-muted-foreground" dir="ltr">{o.users.phone}</p>}
                                                </td>
                                                <td className="p-3 tabular-nums">{formatCurrency(Number(o.total) || 0, t)}</td>
                                                <td className="p-3"><Badge variant="outline">{status(o.status)}</Badge></td>
                                                <td className="p-3">{o.deleted_by_user?.name || <span className="text-muted-foreground">{t('orders.deleted.unknown', 'Not recorded')}</span>}</td>
                                                <td className="p-3 text-xs tabular-nums">{when(o.deleted_at)}</td>
                                                <td className="p-3 max-w-xs whitespace-pre-wrap">{o.delete_reason || <span className="text-muted-foreground">{t('orders.deleted.unknown', 'Not recorded')}</span>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

            {data?.pagination?.pages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('orders.deleted.prev', 'Previous')}</Button>
                    <span className="text-sm text-muted-foreground">{page} / {data.pagination.pages}</span>
                    <Button size="sm" variant="outline" disabled={page >= data.pagination.pages} onClick={() => setPage((p) => p + 1)}>{t('orders.deleted.next', 'Next')}</Button>
                </div>
            )}
        </div>
    );
}
