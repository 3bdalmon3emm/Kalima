import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardList, UserRound } from 'lucide-react';
import axios from '@/api/axios';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import ExamsOverview from '@/components/exams/ExamsOverview';

const get = async (path) => (await axios.get(`/exam-parent${path}`)).data.data;

// A parent's view of their children's exams: pick a child, then the same
// "my exams" page the child has. ?child= keeps the choice in the address.
export default function ParentExamsPage() {
    const { t } = useTranslation('exams');
    const [params, setParams] = useSearchParams();
    const [children, setChildren] = useState(null);
    const [year, setYear] = useState(null);
    const [data, setData] = useState(null);

    useEffect(() => { get('/children').then(setChildren).catch((err) => { setChildren([]); showError(err, t('errors.load')); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const childId = useMemo(() => {
        if (!children?.length) return null;
        const wanted = Number(params.get('child'));
        return children.some((c) => c.id === wanted) ? wanted : children[0].id;
    }, [children, params]);

    useEffect(() => {
        if (!childId) return;
        setData(null);
        get(`/children/${childId}/exams${year === null ? '' : `?year=${year}`}`).then(setData).catch((err) => showError(err, t('errors.load')));
    }, [childId, year]); // eslint-disable-line react-hooks/exhaustive-deps

    const pick = (id) => { setYear(null); setParams({ child: String(id) }); };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><ClipboardList className="h-8 w-8 text-primary" />{t('parent.title')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t('parent.subtitle')}</p>
            </div>

            {children === null && <div className="flex justify-center py-16"><LoadingSpinner /></div>}

            {children?.length === 0 && (
                <div className="rounded-lg border bg-card p-8 text-center">
                    <p className="font-semibold">{t('parent.noChildren')}</p>
                    <Button asChild variant="outline" className="mt-4"><Link to="/parent/profile">{t('parent.linkChild')}</Link></Button>
                </div>
            )}

            {children?.length > 0 && (
                <>
                    <div className="flex flex-wrap gap-2">
                        {children.map((c) => (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => pick(c.id)}
                                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${c.id === childId ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}
                            >
                                <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-muted">
                                    {c.profile_pic_url ? <img src={c.profile_pic_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-4 w-4 text-muted-foreground" />}
                                </span>
                                <span className="font-medium">{c.name}</span>
                                {c.serial && <span className="text-xs opacity-80" dir="ltr">#{c.serial}</span>}
                            </button>
                        ))}
                    </div>
                    {data
                        ? <ExamsOverview data={data} onYear={setYear} resultHref={(r, a) => `/parent/exams/${childId}/result/${a.id}`} />
                        : <div className="flex justify-center py-16"><LoadingSpinner /></div>}
                </>
            )}
        </div>
    );
}
