import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import axios from '@/api/axios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import LoadingSpinner from '@/components/ui/loading-spinner';
import StageLevelSelect from '@/components/StageLevelSelect';
import { levelTitle } from '@/lib/levelUtils';
import { translateBackendMessage } from '@/lib/utils';

// Shown once after the yearly promotion to students who signed up in June:
// the level they picked may already have been the new one, so they confirm
// it or pick the right one. Closing it without confirming shows it again.
export default function PromotionNoticeDialog() {
    const { t, i18n } = useTranslation('student');
    const [student, setStudent] = useState(null);
    const [levels, setLevels] = useState([]);
    const [levelId, setLevelId] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        axios.get('/profile/me')
            .then(async (res) => {
                const current = (res.data?.data || res.data)?.students;
                if (!current?.promotion_notice || cancelled) return;
                const levelsRes = await axios.get('/levels');
                if (cancelled) return;
                setLevels(levelsRes.data?.data || []);
                setLevelId(current.level_id ? String(current.level_id) : '');
                setStudent(current);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const confirm = async () => {
        setSaving(true);
        const changed = levelId && Number(levelId) !== student.level_id;
        try {
            await axios.post('/profile/me/promotion-notice', changed ? { level_id: Number(levelId) } : {});
            toast.success(t('promotion.saved'));
            setStudent(null);
            // Pages already open still show the old level.
            if (changed) window.location.reload();
        } catch (err) {
            toast.error(translateBackendMessage(err.response?.data?.message) || t('promotion.saveError'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={student !== null} onOpenChange={(open) => !open && setStudent(null)}>
            <DialogContent dir={i18n.dir()}>
                <DialogHeader>
                    <DialogTitle>{t('promotion.title')}</DialogTitle>
                    <DialogDescription>
                        {t('promotion.body', { level: levelTitle(student?.levels, i18n.language) })}
                    </DialogDescription>
                </DialogHeader>
                <StageLevelSelect
                    levels={levels}
                    value={levelId}
                    onChange={setLevelId}
                    stageLabel={t('promotion.stage')}
                    stagePlaceholder={t('promotion.selectStage')}
                    levelLabel={t('promotion.level')}
                    levelPlaceholder={t('promotion.selectLevel')}
                />
                <p className="text-xs text-muted-foreground">{t('promotion.once')}</p>
                <DialogFooter>
                    <Button onClick={confirm} disabled={!levelId || saving}>
                        {saving && <LoadingSpinner className="h-4 w-4 border-primary-foreground" />}
                        {t('promotion.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
