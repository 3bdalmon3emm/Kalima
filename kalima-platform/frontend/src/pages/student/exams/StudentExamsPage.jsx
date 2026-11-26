import { useTranslation } from 'react-i18next';
import { ClipboardList } from 'lucide-react';
import { examGet } from '@/components/exams/api';
import ExamsOverview from '@/components/exams/ExamsOverview';

// "My exams": everything the student took, by school year, with their
// performance indicator. An attempt opens its result page.
export default function StudentExamsPage() {
    const { t } = useTranslation('exams');
    const load = (params) => examGet(`/mine?${new URLSearchParams(params)}`);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><ClipboardList className="h-8 w-8 text-primary" />{t('mine.title')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t('mine.subtitle')}</p>
            </div>
            <ExamsOverview load={load} resultHref={(r, a) => `/e/${r.link_code}/result/${a.id}`} />
        </div>
    );
}
