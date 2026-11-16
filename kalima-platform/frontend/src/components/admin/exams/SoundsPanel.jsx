import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Music, Play, Plus, Trash2, Sparkles } from 'lucide-react';
import axios from '@/api/axios';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import { mediaUrl } from '@/components/admin/question-bank/api';
import Celebration, { CelebrationBadge } from '@/components/exams/Celebration';
import { ex, exGet, exSend } from './api';

const BANDS = ['pass', 'good', 'great', 'perfect'];

// Celebration sounds per score band. The bands and their animations are
// fixed; the admin adds any number of sounds to each band, and a student
// hears one of them at random.
export default function SoundsPanel() {
    const { t } = useTranslation('exams');
    const [sounds, setSounds] = useState(null);
    const [uploading, setUploading] = useState(null);
    const [preview, setPreview] = useState(null);
    const input = useRef(null);
    const target = useRef(null);
    const player = useRef(null);

    const load = () => exGet('/sounds').then(setSounds).catch((err) => { setSounds({}); showError(err, t('errors.load')); });
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const play = (url) => {
        player.current?.pause();
        player.current = new Audio(mediaUrl(url));
        player.current.play().catch(() => {});
    };

    const upload = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setUploading(target.current);
        try {
            const form = new FormData();
            form.append('band', target.current);
            form.append('file', file);
            await axios.post(ex('/sounds'), form);
            toast.success(t('sounds.added'));
            load();
        } catch (err) {
            showError(err, t('errors.save'));
        } finally {
            setUploading(null);
        }
    };

    const remove = async (sound) => {
        if (!window.confirm(t('sounds.removeConfirm'))) return;
        try {
            await exSend('delete', `/sounds/${sound.id}`);
            load();
        } catch (err) {
            showError(err, t('errors.save'));
        }
    };

    const showPreview = (band) => {
        const list = sounds?.[band] || [];
        const pick = list.length ? mediaUrl(list[Math.floor(Math.random() * list.length)].url) : null;
        setPreview({ band, sound: pick, key: Date.now() });
    };

    if (!sounds) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('sounds.intro')}</p>
            <input ref={input} type="file" accept="audio/*" className="hidden" onChange={upload} />
            <div className="grid gap-4 md:grid-cols-2">
                {BANDS.map((band) => (
                    <div key={band} className="rounded-lg border bg-card p-4 space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="shrink-0 scale-50 -m-5"><CelebrationBadge band={band} /></div>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold">{t(`bands.${band}`)}</p>
                                <p className="text-xs text-muted-foreground">{t(`bands.${band}Range`)}</p>
                                <p className="text-xs text-muted-foreground mt-1">{t(`bands.${band}Animation`)}</p>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => showPreview(band)}>
                                <Sparkles className="h-4 w-4" />{t('sounds.preview')}
                            </Button>
                        </div>
                        <ul className="space-y-1.5">
                            {(sounds[band] || []).map((s) => (
                                <li key={s.id} className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm">
                                    <Music className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <span className="flex-1 truncate" dir="auto">{s.original_filename || t('sounds.untitled')}</span>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => play(s.url)} title={t('sounds.play')}>
                                        <Play className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(s)} title={t('common.delete')}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </li>
                            ))}
                            {!(sounds[band] || []).length && <li className="text-xs text-muted-foreground">{t('sounds.none')}</li>}
                        </ul>
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={uploading === band}
                            onClick={() => { target.current = band; input.current?.click(); }}
                        >
                            {uploading === band ? <LoadingSpinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                            {t('sounds.add')}
                        </Button>
                    </div>
                ))}
            </div>
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">{t('bands.fail')}</p>
                {t('bands.failNote')}
            </div>
            {preview && <Celebration band={preview.band} sound={preview.sound} playKey={preview.key} />}
        </div>
    );
}
