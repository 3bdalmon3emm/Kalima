import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, UserCog } from 'lucide-react';
import axios from '@/api/axios';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/ui/loading-spinner';

// Who entered whose account and when (Admin only).
export default function ImpersonationLogPage() {
    const { t, i18n } = useTranslation('userManagement');
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        axios.get('/admin/impersonation-logs', { params: { page, limit: 50 } })
            .then((res) => !cancelled && setData({ ...res.data.data, page }))
            .catch(() => !cancelled && setError(true));
        return () => { cancelled = true; };
    }, [page]);

    const when = (d) => (d ? new Date(d).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : null);
    const person = (u) => (
        <Link to={`/admin/users/${u.id}`} className="min-w-0 hover:underline">
            <p className="truncate font-medium">{u.name || `#${u.id}`}</p>
            {u.roles?.length > 0 && <p className="truncate text-xs text-muted-foreground">{u.roles.map((r) => t(`roles.${r}`, r)).join('، ')}</p>}
        </Link>
    );
    const Arrow = i18n.dir() === 'rtl' ? ArrowLeft : ArrowRight;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <UserCog className="h-6 w-6 text-primary" />
                <div>
                    <h1 className="text-2xl font-bold">{t('impersonationLog.title')}</h1>
                    <p className="text-sm text-muted-foreground">{t('impersonationLog.subtitle')}</p>
                </div>
            </div>

            {error ? <p className="text-destructive">{t('impersonationLog.error')}</p> : data?.page !== page ? (
                <div className="flex justify-center py-12"><LoadingSpinner /></div>
            ) : !data.logs.length ? (
                <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">{t('impersonationLog.empty')}</p>
            ) : (
                <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs text-muted-foreground">
                            <tr>
                                <th className="p-3 text-start font-medium">{t('impersonationLog.actor')}</th>
                                <th className="p-3" />
                                <th className="p-3 text-start font-medium">{t('impersonationLog.target')}</th>
                                <th className="p-3 text-start font-medium">{t('impersonationLog.started')}</th>
                                <th className="p-3 text-start font-medium">{t('impersonationLog.ended')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.logs.map((l) => (
                                <tr key={l.id} className="border-t">
                                    <td className="p-3">{person(l.actor)}</td>
                                    <td className="p-3 text-muted-foreground"><Arrow className="h-4 w-4" /></td>
                                    <td className="p-3">{person(l.target)}</td>
                                    <td className="p-3 text-xs tabular-nums">{when(l.started_at)}</td>
                                    <td className="p-3 text-xs tabular-nums">
                                        {l.ended_at ? when(l.ended_at) : <Badge variant="outline">{t('impersonationLog.noEnd')}</Badge>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {data?.pagination?.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('impersonationLog.prev')}</Button>
                    <span className="text-sm text-muted-foreground">{page} / {data.pagination.totalPages}</span>
                    <Button size="sm" variant="outline" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>{t('impersonationLog.next')}</Button>
                </div>
            )}
        </div>
    );
}
