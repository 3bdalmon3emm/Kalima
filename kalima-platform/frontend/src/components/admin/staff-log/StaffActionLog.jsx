import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';
import axios from '@/api/axios';
import AccountLevelBadge from '@/components/admin/AccountLevelBadge';

// Who did what and why on an account or an order, for staff: level changes,
// returns, removed items, deletes, cancelled e-booklet orders. Pass a new
// refreshKey after an action to reload it.
export default function StaffActionLog({ entityType, entityId, refreshKey, title, emptyText, hideWhenEmpty = false }) {
    const { t, i18n } = useTranslation('staffLog');
    const [rows, setRows] = useState(null);

    useEffect(() => {
        if (!entityId) return;
        let cancelled = false;
        axios.get('/admin/staff-actions', { params: { entity_type: entityType, entity_id: entityId } })
            .then((res) => !cancelled && setRows(res.data.data || []))
            .catch(() => !cancelled && setRows([]));
        return () => { cancelled = true; };
    }, [entityType, entityId, refreshKey]);

    if (!rows || (hideWhenEmpty && !rows.length)) return null;
    const when = (d) => new Date(d).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

    return (
        <section className="space-y-3 rounded-lg border bg-card p-4" data-testid={`staff-log-${entityType}`}>
            <h3 className="flex items-center gap-2 font-semibold"><History className="h-4 w-4 text-primary" />{title || t('title')}</h3>
            {!rows.length ? <p className="text-sm text-muted-foreground">{emptyText || t('empty')}</p> : (
                <ol className="space-y-3">
                    {rows.map((r) => (
                        <li key={r.id} className="rounded-md border-s-2 border-primary/60 bg-muted/30 p-3 text-sm">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="font-semibold">{t(`action.${r.action}`, r.action)}</span>
                                {r.action === 'flag' && r.meta && (
                                    <span className="inline-flex items-center gap-1">
                                        <AccountLevelBadge level={r.meta.from} /><span className="inline-block text-muted-foreground rtl:rotate-180">→</span><AccountLevelBadge level={r.meta.to} />
                                    </span>
                                )}
                                {r.action === 'item_delete' && r.meta?.title && (
                                    <span className="text-muted-foreground">{r.meta.title}{r.meta.quantity > 1 ? ` × ${r.meta.quantity}` : ''}</span>
                                )}
                            </div>
                            {r.reason && <p className="mt-1.5 whitespace-pre-wrap">{r.reason}</p>}
                            <p className="mt-1.5 text-xs text-muted-foreground">
                                {t('by', { name: r.actor?.name || t('unknown') })}
                                {r.as_user && <> · {t('asUser', { name: r.as_user.name || `#${r.as_user.id}` })}</>}
                                {' · '}{when(r.created_at)}
                            </p>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
