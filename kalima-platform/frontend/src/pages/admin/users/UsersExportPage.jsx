import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronLeft, Download } from 'lucide-react';
import axios from '@/api/axios';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { translateBackendMessage } from '@/lib/utils';

// Exporting users: the admin picks the account types and the columns. One
// row per user; a type's own columns (a student's grade, a teacher's
// subject, ...) are offered once that type is picked. Passwords are never
// exported.
const DEFAULT_COMMON = ['name', 'email', 'phone', 'roles'];

function CheckRow({ checked, onChange, disabled = false, children }) {
    return (
        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
            <Checkbox checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(!!v)} />
            <span className="min-w-0 flex-1">{children}</span>
        </label>
    );
}

export default function UsersExportPage() {
    const { t, i18n } = useTranslation('userManagement');
    const [opts, setOpts] = useState(null);
    const [roles, setRoles] = useState([]);
    const [fields, setFields] = useState(DEFAULT_COMMON);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        axios.get('/admin/users/export-options').then((res) => setOpts(res.data.data)).catch(() => toast.error(t('export.loadFailed')));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Ticking a type ticks its own columns; unticking it drops them.
    const toggleRole = (role, on) => {
        const own = opts.fields[role] || [];
        setRoles((list) => (on ? [...list, role] : list.filter((r) => r !== role)));
        setFields((list) => (on ? [...new Set([...list, ...own])] : list.filter((f) => !own.includes(f))));
    };
    const toggleField = (field, on) => setFields((list) => (on ? [...new Set([...list, field])] : list.filter((f) => f !== field)));

    const download = async (format) => {
        setBusy(true);
        try {
            const lang = i18n.language === 'en' ? 'en' : 'ar';
            const res = await axios.post(`/admin/users/export-custom?format=${format}&lang=${lang}`, { roles, fields }, { responseType: 'blob' });
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `users-${new Date().toISOString().slice(0, 10)}.${format}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            // The error comes back as a blob; read its message.
            let message = null;
            try { message = JSON.parse(await err.response?.data?.text?.())?.message; } catch { /* not JSON */ }
            toast.error(translateBackendMessage(message) || t('export.failed'));
        } finally {
            setBusy(false);
        }
    };

    if (!opts) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;

    const groups = ['all', ...roles.filter((r) => opts.fields[r])];
    const ready = roles.length > 0 && fields.length > 0;

    return (
        <div className="space-y-5 pb-24">
            <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                <Link to="/admin/users" className="hover:text-foreground">{t('title')}</Link>
                <ChevronLeft className="h-4 w-4" />
                <span className="text-foreground">{t('export.title')}</span>
            </nav>
            <div>
                <h1 className="text-2xl font-bold">{t('export.title')}</h1>
                <p className="text-sm text-muted-foreground">{t('export.subtitle')}</p>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
                <section className="space-y-2 rounded-xl border bg-card p-4">
                    <h2 className="font-semibold">{t('export.types')} <Badge variant="secondary">{roles.length}</Badge></h2>
                    <p className="text-xs text-muted-foreground">{t('export.typesHint')}</p>
                    {opts.roles.map((role) => (
                        <CheckRow key={role} checked={roles.includes(role)} onChange={(on) => toggleRole(role, on)}>{t(`roles.${role}`)}</CheckRow>
                    ))}
                </section>

                <section className="space-y-4 rounded-xl border bg-card p-4 lg:col-span-2">
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="font-semibold">{t('export.columns')} <Badge variant="secondary">{fields.length}</Badge></h2>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {groups.map((group) => (
                            <div key={group} className="space-y-1">
                                <p className="text-xs font-semibold text-muted-foreground">{group === 'all' ? t('export.common') : t(`roles.${group}`)}</p>
                                {opts.fields[group].map((field) => (
                                    <CheckRow key={field} checked={fields.includes(field)} onChange={(on) => toggleField(field, on)}>{t(`export.field.${field}`)}</CheckRow>
                                ))}
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{t('export.noPasswords')}</p>
                </section>
            </div>

            <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur">
                <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
                    <span className="flex-1 text-sm text-muted-foreground">{ready ? t('export.summary', { types: roles.length, columns: fields.length }) : t('export.pickType')}</span>
                    <Button variant="outline" onClick={() => download('csv')} disabled={busy || !ready}>CSV</Button>
                    <Button onClick={() => download('xlsx')} disabled={busy || !ready}>{busy ? <LoadingSpinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}Excel</Button>
                </div>
            </div>
        </div>
    );
}
