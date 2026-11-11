import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowRight, ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/ui/loading-spinner';
import QuestionEditor from '@/components/admin/question-bank/QuestionEditor';
import MathText from '@/components/admin/question-bank/MathText';
import { showError } from '@/components/admin/question-bank/BankDialogs';
import { emptyQuestion, fromApi, toApi, withPaste } from '@/components/admin/question-bank/questionForm';
import { getPendingPaste, parseSmartPaste } from '@/components/admin/question-bank/smartPaste';
import { qbGet, qbSend, uploadMedia } from '@/components/admin/question-bank/api';
import { QuestionFontContext, useQuestionFont } from '@/components/admin/question-bank/fonts';

const TYPES = ['mcq_single', 'mcq_multi', 'true_false', 'essay', 'matching', 'passage'];

// New question: /admin/question-bank/folders/:folderId/questions/new?type=..&passage=..
// Edit:         /admin/question-bank/questions/:questionId/edit
export default function QuestionEditorPage() {
    const { folderId: folderParam, questionId } = useParams();
    const [params] = useSearchParams();
    const { t, i18n } = useTranslation('questionBank');
    const navigate = useNavigate();
    const location = useLocation();
    const isEdit = !!questionId;
    const [folder, setFolder] = useState(null);
    const [categories, setCategories] = useState([]);
    const [passage, setPassage] = useState(null);
    const [question, setQuestion] = useState(null); // the saved one, when editing
    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);
    const passageLook = useQuestionFont(passage?.font);

    const passageId = isEdit ? question?.passage_id : Number(params.get('passage')) || null;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                let fid = Number(folderParam);
                let state;
                let saved = null;
                if (isEdit) {
                    saved = await qbGet(`/questions/${questionId}`);
                    fid = saved.folder_id;
                    state = fromApi(saved);
                } else {
                    const type = params.get('type');
                    state = emptyQuestion(TYPES.includes(type) ? type : 'mcq_single', t);
                }
                // Opened by a paste on the folder page.
                const pasted = !isEdit && location.state?.pasted ? getPendingPaste() : null;
                if (pasted?.text) state = withPaste(state, parseSmartPaste(pasted.text));
                const details = await qbGet(`/folders/${fid}`);
                const cats = await qbGet(`/banks/${details.bank_id}/categories`);
                const pid = isEdit ? saved.passage_id : Number(params.get('passage')) || null;
                const parent = pid ? await qbGet(`/questions/${pid}`) : null;
                // Children of a passage show in the passage's font.
                if (parent) state = { ...state, font: parent.font };
                if (cancelled) return;
                setQuestion(saved);
                setFolder(details);
                setCategories(cats);
                setPassage(parent);
                setForm(state);
                if (pasted?.image) {
                    uploadMedia(pasted.image, details.bank_id)
                        .then((image) => !cancelled && setForm((f) => ({ ...f, stem_image: image })))
                        .catch((err) => showError(err, t('media.uploadError')));
                }
            } catch (err) {
                showError(err, t('errors.load'));
            }
        })();
        return () => { cancelled = true; };
    }, [folderParam, questionId]); // eslint-disable-line react-hooks/exhaustive-deps

    const back = () => navigate(`/admin/question-bank/folders/${folder.id}`);

    const save = async (another = false) => {
        setSaving(true);
        try {
            const body = toApi(form, passageId);
            const res = isEdit
                ? await qbSend('put', `/questions/${questionId}`, body)
                : await qbSend('post', `/folders/${folder.id}/questions`, body);
            toast.success(t('question.saved', { serial: res.data.serial }));
            if (another) {
                setForm({ ...emptyQuestion(form.type, t), font: form.font });
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                navigate(`/admin/question-bank/folders/${folder.id}?focus=${res.data.id}`);
            }
        } catch (err) {
            const errors = err.response?.data?.errors;
            if (Array.isArray(errors) && errors.length) {
                errors.forEach((e) => showError({ response: { data: { message: typeof e === 'string' ? e : e.message } } }));
            } else {
                showError(err, t('errors.save'));
            }
        } finally {
            setSaving(false);
        }
    };

    if (!form || !folder) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;

    const Back = i18n.dir() === 'rtl' ? ArrowRight : ArrowLeft;
    const title = isEdit
        ? t(form.type === 'passage' ? 'question.editPassage' : 'question.edit')
        : t(form.type === 'passage' ? 'question.newPassage' : 'question.newOf', { type: t(`types.${form.type}`) });

    return (
        <div className="max-w-4xl mx-auto space-y-5 pb-24">
            <div className="space-y-2">
                <Button variant="ghost" size="sm" asChild>
                    <Link to={`/admin/question-bank/folders/${folder.id}`}><Back className="h-4 w-4" />{folder.breadcrumb.map((b) => b.name).join(' / ')}</Link>
                </Button>
                <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold">{title}</h1>
                    <Badge variant="secondary">{t(`types.${form.type}`)}</Badge>
                    {question && <Badge variant="outline" className="font-mono" dir="ltr">{question.serial}</Badge>}
                </div>
            </div>

            {passage && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-1">
                    <p className="text-xs font-semibold text-primary">{t('passage.inside')}</p>
                    <QuestionFontContext.Provider value={passageLook}>
                        <MathText text={passage.stem_text} className="block text-sm line-clamp-4" />
                    </QuestionFontContext.Provider>
                </div>
            )}

            <QuestionEditor value={form} onChange={setForm} bankId={folder.bank_id} categories={categories} fontLocked={!!passage} />

            <div className="fixed bottom-0 inset-x-0 z-30 border-t bg-background/95 backdrop-blur p-3">
                <div className="max-w-4xl mx-auto flex flex-wrap justify-end gap-2">
                    <Button variant="ghost" onClick={back} disabled={saving}>{t('common.cancel')}</Button>
                    {!isEdit && (
                        <Button variant="outline" onClick={() => save(true)} disabled={saving}>{t('question.saveAndAdd')}</Button>
                    )}
                    <Button onClick={() => save(false)} disabled={saving}>
                        {saving ? <LoadingSpinner className="h-4 w-4 border-primary-foreground" /> : <Save className="h-4 w-4" />}
                        {t('common.save')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
