import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArchiveRestore, Folder, Library, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/ui/loading-spinner';
import MathText from '@/components/admin/question-bank/MathText';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import { qbGet, qbSend } from '@/components/admin/question-bank/api';

// Everything archived from the bank, with one-click restore.
export default function QuestionBankArchivePage() {
    const { t, i18n } = useTranslation('questionBank');
    const [data, setData] = useState(null);

    const load = () => qbGet('/archive').then(setData).catch((err) => { showError(err, t('errors.load')); setData({ folders: [], questions: [] }); });
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const restore = async (path, body) => {
        try {
            await qbSend('post', path, body);
            toast.success(t('archive.restored'));
            load();
        } catch (err) {
            showError(err, t('errors.save'));
        }
    };

    const date = (d) => new Date(d).toLocaleDateString(i18n.language);
    const where = (loc) => loc.filter(Boolean).join(' / ');

    return (
        <div className="space-y-6">
            <div>
                <nav className="text-sm text-muted-foreground mb-1">
                    <Link to="/admin/question-bank" className="hover:text-foreground">{t('title')}</Link>
                </nav>
                <h1 className="text-2xl font-bold">{t('archive.title')}</h1>
                <p className="text-sm text-muted-foreground">{t('archive.description')}</p>
            </div>

            {data === null ? (
                <div className="flex justify-center py-16"><LoadingSpinner /></div>
            ) : (
                <>
                    <section className="space-y-2">
                        <h2 className="font-semibold">{t('archive.folders')} ({data.folders.length})</h2>
                        {data.folders.length === 0 && <p className="text-sm text-muted-foreground">{t('archive.none')}</p>}
                        {data.folders.map((f) => (
                            <div key={f.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                                {f.is_bank ? <Library className="h-5 w-5 text-primary" /> : <Folder className="h-5 w-5 text-primary" />}
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{f.name}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {f.is_bank ? t('archive.bank') : where(f.location)} · {date(f.archived_at)}
                                    </p>
                                </div>
                                <Button size="sm" variant="outline" onClick={() => restore(`/folders/${f.id}/restore`)}>
                                    <ArchiveRestore className="h-4 w-4" />{t('archive.restore')}
                                </Button>
                            </div>
                        ))}
                    </section>

                    <section className="space-y-2">
                        <h2 className="font-semibold">{t('archive.questions')} ({data.questions.length})</h2>
                        {data.questions.length === 0 && <p className="text-sm text-muted-foreground">{t('archive.none')}</p>}
                        {data.questions.map((q) => (
                            <div key={q.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                                <FileQuestion className="h-5 w-5 text-primary shrink-0" />
                                <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex flex-wrap gap-1.5">
                                        <Badge variant="outline" className="font-mono" dir="ltr">{q.serial}</Badge>
                                        <Badge variant="secondary">{t(`types.${q.type}`)}</Badge>
                                        {q.reference_no && <Badge variant="secondary">{t('card.ref')}: {q.reference_no}</Badge>}
                                    </div>
                                    <MathText text={q.stem_text} className="block text-sm line-clamp-2" />
                                    <p className="text-xs text-muted-foreground truncate">{where(q.location)} · {date(q.archived_at)}</p>
                                </div>
                                <Button size="sm" variant="outline" onClick={() => restore('/questions/restore', { ids: [q.id] })}>
                                    <ArchiveRestore className="h-4 w-4" />{t('archive.restore')}
                                </Button>
                            </div>
                        ))}
                    </section>
                </>
            )}
        </div>
    );
}
