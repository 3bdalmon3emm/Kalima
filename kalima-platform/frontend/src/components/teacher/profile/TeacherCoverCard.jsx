import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ImagePlus, Trash2 } from 'lucide-react';
import axios from '@/api/axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import LoadingSpinner from '@/components/ui/loading-spinner';
import ExamCover from '@/components/exams/ExamCover';

// The wide photo students see at the top of this teacher's exam links.
export default function TeacherCoverCard({ profile, onChanged }) {
    const { t } = useTranslation('exams');
    const input = useRef(null);
    const [busy, setBusy] = useState(false);

    const run = async (fn, message) => {
        setBusy(true);
        try {
            await fn();
            toast.success(message);
            await onChanged();
        } catch {
            // The axios interceptor shows the error.
        } finally {
            setBusy(false);
            if (input.current) input.current.value = '';
        }
    };

    const upload = (file) => {
        if (!file) return;
        const form = new FormData();
        form.append('cover', file);
        run(() => axios.post('/profile/me/cover', form, { headers: { 'Content-Type': 'multipart/form-data' } }), t('cover.saved'));
    };

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('cover.title')}</CardTitle>
                <p className="text-xs text-muted-foreground">{t('cover.hint')}</p>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
                <ExamCover teacher={profile} className="h-32 sm:h-40 rounded-lg" />
                <div className="flex flex-wrap gap-2">
                    <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
                    <Button size="sm" onClick={() => input.current?.click()} disabled={busy}>
                        {busy ? <LoadingSpinner className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}{profile?.cover_url ? t('cover.change') : t('cover.upload')}
                    </Button>
                    {profile?.cover_url && (
                        <Button size="sm" variant="ghost" className="text-destructive" disabled={busy}
                            onClick={() => run(() => axios.delete('/profile/me/cover'), t('cover.removed'))}>
                            <Trash2 className="h-4 w-4" />{t('cover.remove')}
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
