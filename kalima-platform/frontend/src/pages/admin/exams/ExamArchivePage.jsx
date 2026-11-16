import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronLeft, FileText, FolderOpen, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import { exGet, exSend } from '@/components/admin/exams/api';

// Archived exam folders and exams, each restorable with one click.
export default function ExamArchivePage() {
    const { t } = useTranslation('exams');
    const [data, setData] = useState(null);
    const load = () => exGet('/archive').then(setData).catch((err) => { setData({ folders: [], exams: [] }); showError(err, t('errors.load')); });
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const restore = async (kind, id) => {
        try {
            await exSend('post', `/${kind}/${id}/restore`);
            toast.success(t('archive.restored'));
            load();
        } catch (err) {
            showError(err, t('errors.save'));
        }
    };

    const row = (icon, item, kind) => (
        <div key={`${kind}-${item.id}`} className="flex items-center gap-3 rounded-lg border bg-card p-3">
            {icon}
            <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.name}</p>
                {item.path.length > 0 && <p className="text-xs text-muted-foreground truncate">{item.path.join(' / ')}</p>}
            </div>
            <Button size="sm" variant="outline" onClick={() => restore(kind, item.id)}><RotateCcw className="h-4 w-4" />{t('archive.restore')}</Button>
        </div>
    );

    return (
        <div className="space-y-6">
            <nav className="flex items-center gap-1 text-sm text-muted-foreground">
                <Link to="/admin/exams" className="hover:text-foreground">{t('title')}</Link>
                <ChevronLeft className="h-4 w-4" /><span>{t('archive.title')}</span>
            </nav>
            <h1 className="text-2xl font-bold">{t('archive.title')}</h1>
            {!data ? <div className="flex justify-center py-16"><LoadingSpinner /></div> : (
                <>
                    <section className="space-y-2">
                        <h2 className="font-semibold">{t('archive.folders')}</h2>
                        {data.folders.length === 0 && <p className="text-sm text-muted-foreground">{t('archive.empty')}</p>}
                        {data.folders.map((f) => row(<FolderOpen className="h-5 w-5 text-primary" />, f, 'folders'))}
                    </section>
                    <section className="space-y-2">
                        <h2 className="font-semibold">{t('archive.exams')}</h2>
                        {data.exams.length === 0 && <p className="text-sm text-muted-foreground">{t('archive.empty')}</p>}
                        {data.exams.map((e) => row(<FileText className="h-5 w-5 text-primary" />, e, 'exams'))}
                    </section>
                </>
            )}
        </div>
    );
}
