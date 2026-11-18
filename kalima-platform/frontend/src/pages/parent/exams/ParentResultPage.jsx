import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import axios from '@/api/axios';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import { formatMark } from '@/components/admin/exams/api';
import { passageNumbers } from '@/components/exams/api';
import { ReviewItem } from '@/pages/exams/ExamResultPage';

// One of a child's result papers for the parent, read only: the score and
// each question, with the right answers only once the child can see them.
export default function ParentResultPage() {
    const { childId, attemptId } = useParams();
    const { t } = useTranslation('exams');
    const [result, setResult] = useState(null);

    useEffect(() => {
        axios.get(`/exam-parent/children/${childId}/attempts/${attemptId}`)
            .then((res) => setResult(res.data.data))
            .catch((err) => showError(err, t('errors.load')));
    }, [childId, attemptId]); // eslint-disable-line react-hooks/exhaustive-deps

    const passages = useMemo(() => new Map((result?.passages || []).map((p) => [p.id, p])), [result]);
    const passageInfo = useMemo(() => {
        const byId = new Map((result?.review || []).map((r) => [r.question_id, r.question?.passage_id]));
        return passageNumbers([...byId.keys()], (qid) => byId.get(qid));
    }, [result]);

    if (!result) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
    const pending = result.status !== 'done';

    return (
        <div className="space-y-5">
            <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                <Link to={`/parent/exams?child=${childId}`} className="hover:text-foreground">{t('parent.title')}</Link>
                <ChevronLeft className="h-4 w-4" />
                <span className="text-foreground">{result.exam.name}</span>
            </nav>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4">
                <p className="flex-1 text-lg font-bold">{result.exam.name}</p>
                <Badge variant="outline">{t('result.attempt', { n: result.attempt_no })}</Badge>
                {pending
                    ? <Badge variant="outline">{t('result.waiting')}</Badge>
                    : (
                        <>
                            <Badge variant="outline">{formatMark(result.score)} / {formatMark(result.total)} ({result.percent}%)</Badge>
                            <Badge className={result.passed ? 'bg-green-600' : 'bg-destructive'}>{result.passed ? t('mine.passed') : t('mine.failed')}</Badge>
                        </>
                    )}
            </div>

            {!pending && (
                <div className="space-y-3">
                    <h2 className="text-lg font-semibold">{t('result.review')}</h2>
                    {!result.answers_shown && (
                        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{t('parent.answersHidden')}</p>
                    )}
                    {result.review.map((item, i) => {
                        const pid = item.question?.passage_id;
                        const first = pid && result.review[i - 1]?.question?.passage_id !== pid;
                        return (
                            <ReviewItem
                                key={item.question_id}
                                item={item}
                                label={String(i + 1)}
                                passage={first ? passages.get(pid) : null}
                                passageN={passageInfo.get(item.question_id)?.n}
                                shown={result.answers_shown}
                                grader
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}
