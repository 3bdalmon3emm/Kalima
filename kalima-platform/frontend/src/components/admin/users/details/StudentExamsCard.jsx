import { useTranslation } from 'react-i18next';
import { ClipboardList } from 'lucide-react';
import ExamsOverview from '@/components/exams/ExamsOverview';
import { exGet } from '@/components/admin/exams/api';

// A student's exams for staff, as the student sees them: the year at a
// glance, the performance indicator per subject, and every exam with all of
// its attempts (not just the first or last), a page at a time. An attempt
// opens the grader's review.
export default function StudentExamsCard({ studentId }) {
    const { t } = useTranslation('exams');
    return (
        <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm" data-testid="student-exams">
            <div>
                <h2 className="flex items-center gap-2 text-lg font-bold"><ClipboardList className="h-5 w-5 text-primary" />{t('studentCard.title')}</h2>
                <p className="text-xs text-muted-foreground">{t('studentCard.hint')}</p>
            </div>
            <ExamsOverview
                key={studentId}
                load={(params) => exGet(`/students/${studentId}/exams`, params)}
                resultHref={(row, attempt) => `/admin/exams/attempts/${attempt.id}`}
            />
        </section>
    );
}
