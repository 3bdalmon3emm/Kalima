import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Eye, ListChecks, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import { formatMark } from '@/components/admin/exams/api';
import { passageNumbers } from '@/components/exams/api';
import { ReviewItem } from '@/pages/exams/ExamResultPage';

// The exam as a student sees it, with every right answer, model answer and
// explanation. Nothing is saved and no link is used: this is how the admin,
// staff and the teacher look at an exam.
export default function ExamPreview({ api, examId }) {
    const { t, i18n } = useTranslation('exams');
    const [data, setData] = useState(null);

    useEffect(() => {
        setData(null);
        api.get(`/exams/${examId}/preview`).then(setData).catch((err) => showError(err, t('errors.load')));
    }, [examId]); // eslint-disable-line react-hooks/exhaustive-deps

    const passages = useMemo(() => new Map((data?.passages || []).map((p) => [p.id, p])), [data]);
    const passageInfo = useMemo(() => {
        const byId = new Map((data?.review || []).map((r) => [r.question_id, r.question?.passage_id]));
        return passageNumbers([...byId.keys()], (id) => byId.get(id));
    }, [data]);

    if (!data) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
    const { exam } = data;
    let n = 0;

    return (
        <div className="mx-auto max-w-3xl space-y-5" dir={i18n.dir()}>
            <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                <Eye className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{t(exam.mode === 'random' ? 'preview.hintRandom' : 'preview.hint')}</span>
            </div>

            <div className="space-y-3 rounded-2xl border bg-card p-5">
                <h2 className="text-xl font-bold">{exam.name}</h2>
                {exam.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{exam.description}</p>}
                <div className="flex flex-wrap gap-2 text-sm">
                    <Badge variant="secondary">{t(`types.${exam.type}`)}</Badge>
                    {exam.subject && <Badge variant="outline">{exam.subject.title}</Badge>}
                    <Badge variant="outline" className="gap-1"><ListChecks className="h-3.5 w-3.5" />{t('preview.questions', { count: exam.question_count })}</Badge>
                    <Badge variant="outline" className="gap-1"><Trophy className="h-3.5 w-3.5" />{t('teacher.totalMarks', { total: formatMark(exam.total) })}</Badge>
                    <Badge variant="outline" className="gap-1"><Clock className="h-3.5 w-3.5" />{exam.duration_minutes ? t('teacher.minutes', { count: exam.duration_minutes }) : t('preview.noDuration')}</Badge>
                </div>
            </div>

            {data.review.length === 0 && <p className="rounded-lg border bg-card p-8 text-center text-muted-foreground">{t('preview.empty')}</p>}

            {data.sections.map((section) => {
                const items = data.review.filter((r) => r.section_id === section.id);
                return (
                    <div key={section.id} className="space-y-3">
                        {section.name && <h3 className="border-b pb-1 text-lg font-semibold text-primary">{section.name}</h3>}
                        {items.map((item, i) => {
                            n += 1;
                            const pid = item.question?.passage_id;
                            const first = pid && items[i - 1]?.question?.passage_id !== pid;
                            return (
                                <ReviewItem
                                    key={item.question_id}
                                    item={item}
                                    label={String(n)}
                                    passage={first ? passages.get(pid) : null}
                                    passageN={passageInfo.get(item.question_id)?.n}
                                    shown
                                    preview
                                />
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}
