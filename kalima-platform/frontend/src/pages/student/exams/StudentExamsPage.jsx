import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList } from 'lucide-react';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import { examGet } from '@/components/exams/api';
import ExamsOverview from '@/components/exams/ExamsOverview';

// "My exams": everything the student took, by school year, with their
// performance indicator. An attempt opens its result page.
export default function StudentExamsPage() {
    const { t } = useTranslation('exams');
    const [year, setYear] = useState(null);
    const [data, setData] = useState(null);

    useEffect(() => {
        examGet(`/mine${year === null ? '' : `?year=${year}`}`).then(setData).catch((err) => showError(err, t('errors.load')));
    }, [year]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="space-y-6">
            <div>
                <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><ClipboardList className="h-8 w-8 text-primary" />{t('mine.title')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t('mine.subtitle')}</p>
            </div>
            {data
                ? <ExamsOverview data={data} onYear={setYear} resultHref={(r, a) => `/e/${r.link_code}/result/${a.id}`} />
                : <div className="flex justify-center py-16"><LoadingSpinner /></div>}
        </div>
    );
}
