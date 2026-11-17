import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Link2, Search, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import { TeacherAvatar } from '@/components/admin/exams/FolderTeachersPanel';
import { exGet, exSend } from '@/components/admin/exams/api';

// The teachers an assistant works for: the assistant sees those teachers'
// exams, students and results as they do.
export default function AssistantTeachersCard({ assistantId }) {
    const { t } = useTranslation('exams');
    const [linked, setLinked] = useState([]);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);

    const load = () => exGet(`/assistants/${assistantId}/teachers`).then(setLinked).catch(() => {});
    useEffect(() => { load(); }, [assistantId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!query.trim()) { setResults([]); return undefined; }
        const timer = setTimeout(() => exGet('/teachers/search', { q: query }).then(setResults).catch(() => {}), 300);
        return () => clearTimeout(timer);
    }, [query]);

    const act = async (fn, message) => {
        try {
            await fn();
            toast.success(message);
            setQuery('');
            load();
        } catch (err) {
            showError(err, t('errors.save'));
        }
    };

    return (
        <Card className="shadow-sm">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-5 w-5 text-primary" />{t('assistant.title')}</CardTitle>
                <p className="text-xs text-muted-foreground">{t('assistant.hint')}</p>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
                {linked.length === 0 && <p className="text-sm text-muted-foreground">{t('assistant.none')}</p>}
                {linked.map((u) => (
                    <div key={u.id} className="flex items-center gap-3">
                        <TeacherAvatar teacher={u} className="h-8 w-8" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{u.name}</span>
                        <Button variant="ghost" size="icon" title={t('assistant.unlink')}
                            onClick={() => act(() => exSend('delete', `/assistants/${assistantId}/teachers/${u.id}`), t('assistant.unlinked'))}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                    </div>
                ))}
                <div className="relative">
                    <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="ps-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('assistant.search')} />
                </div>
                {results.filter((u) => !linked.some((l) => l.id === u.id)).map((u) => (
                    <button key={u.id} type="button" className="flex w-full items-center gap-3 rounded-md p-2 text-start hover:bg-muted"
                        onClick={() => act(() => exSend('post', `/assistants/${assistantId}/teachers`, { teacher_id: u.id }), t('assistant.linked'))}>
                        <TeacherAvatar teacher={u} className="h-8 w-8" />
                        <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
                        <span className="text-xs text-primary">{t('assistant.link')}</span>
                    </button>
                ))}
            </CardContent>
        </Card>
    );
}
