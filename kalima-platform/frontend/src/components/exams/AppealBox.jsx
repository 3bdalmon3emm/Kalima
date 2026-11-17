import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ImagePlus, MessageSquareWarning, Send, X } from 'lucide-react';
import axios from '@/api/axios';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { shrinkImage } from '@/lib/imageFile';
import { translateBackendMessage } from '@/lib/utils';
import AppealCard from '@/components/exams/AppealCard';

const MAX_PHOTOS = 3;

// Under a question on the student's result: their appeals on it, and the
// "appeal" button when they lost marks and nothing is waiting already.
export default function AppealBox({ attemptId, item, allowed, onSent }) {
    const { t } = useTranslation('exams');
    const input = useRef(null);
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [photos, setPhotos] = useState([]);
    const [busy, setBusy] = useState(false);

    const appeals = item.appeals || [];
    const waiting = appeals.some((a) => a.status === 'pending');
    const lost = item.earned !== null && item.earned < item.mark;
    const canAppeal = allowed && lost && !waiting;
    if (!appeals.length && !canAppeal) return null;

    const addPhotos = (files) => {
        const list = [...files].filter((f) => f.type.startsWith('image/'));
        setPhotos((p) => [...p, ...list.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX_PHOTOS));
        if (input.current) input.current.value = '';
    };

    const send = async () => {
        if (!text.trim() && !photos.length) { toast.error(t('appeals.empty')); return; }
        setBusy(true);
        try {
            const form = new FormData();
            form.append('question_id', String(item.question_id));
            form.append('text', text.trim());
            for (const p of photos) form.append('files', await shrinkImage(p.file));
            await axios.post(`/exams/attempts/${attemptId}/appeals`, form);
            toast.success(t('appeals.sent'));
            setOpen(false);
            setText('');
            setPhotos([]);
            onSent?.();
        } catch (err) {
            toast.error(translateBackendMessage(err.response?.data?.message) || t('errors.save'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-2">
            {appeals.map((a) => <AppealCard key={a.id} appeal={a} max={item.mark} />)}
            {canAppeal && !open && (
                <Button variant="outline" size="sm" className="border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-300" onClick={() => setOpen(true)}>
                    <MessageSquareWarning className="h-4 w-4" />{appeals.length ? t('appeals.again') : t('appeals.button')}
                </Button>
            )}
            {open && (
                <div className="space-y-2 rounded-lg border-2 border-amber-300 p-3">
                    <p className="text-sm font-semibold">{t('appeals.formTitle')}</p>
                    <p className="text-xs text-muted-foreground">{t('appeals.formHint')}</p>
                    <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('appeals.placeholder')} maxLength={5000} />
                    <div className="flex flex-wrap items-center gap-2">
                        {photos.map((p, i) => (
                            <div key={p.url} className="relative">
                                <img src={p.url} alt="" className="h-16 w-16 rounded-md border object-cover" />
                                <button type="button" className="absolute -end-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-white" onClick={() => setPhotos((all) => all.filter((_, j) => j !== i))}>
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        ))}
                        {photos.length < MAX_PHOTOS && (
                            <>
                                <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPhotos(e.target.files || [])} />
                                <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()}><ImagePlus className="h-4 w-4" />{t('appeals.addPhoto')}</Button>
                            </>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button size="sm" onClick={send} disabled={busy}>{busy ? <LoadingSpinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}{t('appeals.send')}</Button>
                        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>{t('appeals.cancel')}</Button>
                    </div>
                </div>
            )}
        </div>
    );
}
