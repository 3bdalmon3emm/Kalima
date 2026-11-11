import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Archive, Library, Plus, Search, Copy, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import LoadingSpinner from '@/components/ui/loading-spinner';
import SortableList from '@/components/admin/question-bank/SortableList';
import { NameDialog, showError } from '@/components/admin/question-bank/BankDialogs';
import { qbGet, qbSend } from '@/components/admin/question-bank/api';

// Finds a question by serial and opens its folder with the question shown.
export function SerialSearch() {
    const { t } = useTranslation('questionBank');
    const navigate = useNavigate();
    const [serial, setSerial] = useState('');
    const [busy, setBusy] = useState(false);
    const submit = async (e) => {
        e.preventDefault();
        if (!serial.trim()) return;
        setBusy(true);
        try {
            const found = await qbGet(`/questions/serial/${encodeURIComponent(serial.trim())}`);
            if (found.archived || found.folder.hidden) {
                toast.info(t('search.archived'));
                navigate('/admin/question-bank/archive');
            } else {
                navigate(`/admin/question-bank/folders/${found.folder.id}?q=${found.passage_id || found.question_id}&focus=${found.question_id}`);
            }
        } catch (err) {
            showError(err, t('search.notFound'));
        } finally {
            setBusy(false);
        }
    };
    return (
        <form onSubmit={submit} className="flex gap-2 w-full sm:w-auto">
            <Input
                dir="ltr"
                value={serial}
                onChange={(e) => setSerial(e.target.value.toUpperCase())}
                placeholder={t('search.placeholder')}
                className="sm:w-56 font-mono"
            />
            <Button type="submit" variant="outline" disabled={busy}>
                {busy ? <LoadingSpinner className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                <span className="sr-only sm:not-sr-only">{t('search.button')}</span>
            </Button>
        </form>
    );
}

export default function QuestionBankPage() {
    const { t } = useTranslation('questionBank');
    const navigate = useNavigate();
    const [banks, setBanks] = useState(null);
    const [creating, setCreating] = useState(false);
    const [copyingBank, setCopyingBank] = useState(null);

    const load = () => qbGet('/banks').then(setBanks).catch((err) => { setBanks([]); showError(err, t('errors.load')); });
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // A copied bank is filled in the background; refresh until it is ready.
    const anyCopying = banks?.some((b) => b.copy_status === 'copying');
    useEffect(() => {
        if (!anyCopying) return;
        const timer = setInterval(load, 3000);
        return () => clearInterval(timer);
    }, [anyCopying]); // eslint-disable-line react-hooks/exhaustive-deps

    const reorder = async (ids) => {
        setBanks((prev) => ids.map((id) => prev.find((b) => b.id === id)));
        try {
            await qbSend('post', '/banks/reorder', { ids });
        } catch (err) {
            showError(err, t('errors.save'));
            load();
        }
    };

    const archive = async (bank) => {
        if (!window.confirm(t('bank.archiveConfirm', { name: bank.name }))) return;
        try {
            await qbSend('post', `/folders/${bank.id}/archive`);
            toast.success(t('common.archived'));
            load();
        } catch (err) {
            showError(err, t('errors.save'));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold">{t('title')}</h1>
                    <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <SerialSearch />
                    <Button variant="outline" asChild>
                        <Link to="/admin/question-bank/archive"><Archive className="h-4 w-4" />{t('archive.title')}</Link>
                    </Button>
                    <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />{t('bank.new')}</Button>
                </div>
            </div>

            {banks === null ? (
                <div className="flex justify-center py-16"><LoadingSpinner /></div>
            ) : banks.length === 0 ? (
                <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
                    <Library className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    {t('bank.empty')}
                </div>
            ) : (
                <SortableList
                    items={banks}
                    onReorder={reorder}
                    className="space-y-2"
                    renderItem={(bank, handle) => (
                        <div className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:border-primary/50 transition-colors">
                            {handle}
                            <Library className="h-5 w-5 text-primary shrink-0" />
                            <Link to={`/admin/question-bank/folders/${bank.id}`} className="flex-1 min-w-0">
                                <p className="font-semibold truncate">{bank.name}</p>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                    {bank.subjects && <Badge variant="secondary">{bank.subjects.title}</Badge>}
                                    {bank.copy_status === 'copying' && <Badge className="bg-amber-100 text-amber-800">{t('bank.copying')}</Badge>}
                                    {bank.copy_status === 'failed' && <Badge variant="destructive">{t('bank.copyFailed')}</Badge>}
                                </div>
                            </Link>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setCopyingBank(bank)}>
                                        <Copy className="h-4 w-4" />{t('bank.copy')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => archive(bank)} className="text-destructive">
                                        <Archive className="h-4 w-4" />{t('common.archive')}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )}
                />
            )}

            <NameDialog
                open={creating}
                onOpenChange={setCreating}
                title={t('bank.new')}
                withSubject
                confirmLabel={t('common.create')}
                onSubmit={async ({ name, subject_id }) => {
                    const res = await qbSend('post', '/banks', { name, subject_id });
                    toast.success(t('bank.created'));
                    navigate(`/admin/question-bank/folders/${res.data.id}`);
                }}
            />
            <NameDialog
                open={!!copyingBank}
                onOpenChange={(open) => !open && setCopyingBank(null)}
                title={t('bank.copyTitle', { name: copyingBank?.name })}
                initialName={copyingBank ? t('bank.copyName', { name: copyingBank.name }) : ''}
                confirmLabel={t('bank.copy')}
                onSubmit={async ({ name }) => {
                    await qbSend('post', `/banks/${copyingBank.id}/copy`, { name });
                    toast.success(t('bank.copyStarted'));
                    load();
                }}
            />
        </div>
    );
}
