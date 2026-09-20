import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, FileVideo, Image, Upload, Trash2, X, Download, File, Pencil, Eye, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAdminSampleSections } from '@/hooks/admin/useAdminSampleSections';
import { cn } from '@/lib/utils';
import { getImageUrl, getApiUrl } from '@/lib/storeUtils';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// --- Helpers ---

const getAccept = (mediaType) => {
    switch (mediaType) {
        case 'video': return '.mp4,.webm,.mov,video/mp4,video/webm,video/quicktime';
        case 'image': return '.jpg,.jpeg,.png,.webp,.gif,.svg,image/*';
        case 'pdf': return '.pdf,application/pdf';
        case 'word': return '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case 'powerpoint': return '.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation';
        default: return '*/*';
    }
};

const isPreviewable = (mediaType) => mediaType === 'image' || mediaType === 'video';

const detectMediaType = (file) => {
    if (!file) return null;
    const type = file.type;
    const name = file.name.toLowerCase();
    if (type.includes('pdf')) return 'pdf';
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('video/')) return 'video';
    if (type.includes('word') || type.includes('officedocument.wordprocessingml')) return 'word';
    if (type.includes('powerpoint') || type.includes('presentationml')) return 'powerpoint';
    if (name.endsWith('.pdf')) return 'pdf';
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].some(ext => name.endsWith(ext))) return 'image';
    if (['.mp4', '.webm', '.ogg', '.mov'].some(ext => name.endsWith(ext))) return 'video';
    if (['.doc', '.docx'].some(ext => name.endsWith(ext))) return 'word';
    if (['.ppt', '.pptx'].some(ext => name.endsWith(ext))) return 'powerpoint';
    return null;
};

const MediaIcon = ({ mediaType, className }) => {
    if (mediaType === 'video') return <FileVideo className={className} />;
    if (mediaType === 'image') return <Image className={className} />;
    return <FileText className={className} />;
};

// --- Sub-components ---

const SampleUploadForm = ({
    sample,
    sections,
    onCancel,
    onSubmit,
    uploading,
    uploadProgress,
    initialSectionId,
    initialMediaType,
    initialThumbnailName,
    initialHqName,
    initialLqName,
    initialTitle
}) => {
    const { t, i18n } = useTranslation('admin');

    const [title, setTitle] = useState(initialTitle || '');
    const [sectionId, setSectionId] = useState(initialSectionId || '');
    const [mediaType, setMediaType] = useState(initialMediaType || 'pdf');
    const [thumbnailFileName, setThumbnailFileName] = useState(initialThumbnailName || '');
    const [hqFileName, setHqFileName] = useState(initialHqName || '');
    const [lqFileName, setLqFileName] = useState(initialLqName || '');
    const [validationError, setValidationError] = useState('');

    const thumbnailFileRef = useRef(null);
    const hqFileRef = useRef(null);
    const lqFileRef = useRef(null);

    const getTypes = (newHq = null, newLq = null) => {
        const hqFile = newHq || hqFileRef.current?.files?.[0];
        const lqFile = newLq || lqFileRef.current?.files?.[0];
        const thumbnailFile = thumbnailFileRef.current?.files?.[0];
        const hqType = hqFile ? detectMediaType(hqFile) : (sample ? sample.media_type : null);
        const lqType = lqFile ? detectMediaType(lqFile) : (sample ? sample.media_type : null);
        return { hqFile, lqFile, thumbnailFile, hqType, lqType };
    };

    const validateFiles = (newHq = null, newLq = null, overrideTitle = null) => {
        const { hqFile, lqFile, hqType, lqType } = getTypes(newHq, newLq);
        const thumbnailFile = thumbnailFileRef.current?.files?.[0];
        const hqExists = hqFile || (sample && sample.high_quality_url);
        const lqExists = lqFile || (sample && sample.low_quality_url);
        const thumbnailExists = thumbnailFile || (sample && sample.thumbnail_url);

        const currentTitle = overrideTitle !== null ? overrideTitle : title;
        if (!currentTitle.trim()) return t('samples.errors.titleRequired');
        if (!sectionId) return t('samples.errors.noSection');
        if (!thumbnailExists) return t('samples.errors.noThumbnail', 'Thumbnail image is required.');
        if (!hqExists) return t('samples.errors.noHqFile');

        if (hqExists && hqFile && !hqType) return t('samples.errors.unsupportedType');
        if (lqExists && lqFile && !lqType) return t('samples.errors.unsupportedType');
        if (hqExists && lqExists && hqType && lqType && hqType !== lqType) {
            return t('samples.errors.mismatchedTypes');
        }
        return '';
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        const error = validateFiles();
        if (error) {
            setValidationError(error);
            return;
        }
        const { hqFile, lqFile, thumbnailFile, hqType, lqType } = getTypes();
        const finalMediaType = hqType || lqType || mediaType;

        onSubmit({ sectionId, mediaType: finalMediaType, title, hqFile, lqFile, thumbnailFile });
    };

    return (
        <form onSubmit={handleFormSubmit} className="space-y-4 max-w-full border border-border rounded-xl p-4">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">
                    {sample ? t('samples.editTitle', 'Edit Sample') : t('samples.addTitle', 'Add Sample')}
                </h3>
                {sample && onCancel && (
                    <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>

            <div className="space-y-2">
                <Label htmlFor="sample-title">{t('samples.titleLabel', 'Sample Title')} *</Label>
                <Input
                    id="sample-title"
                    placeholder={t('samples.titlePlaceholder')}
                    value={title}
                    onChange={(e) => {
                        setTitle(e.target.value);
                        if (validationError) setValidationError(validateFiles(null, null, e.target.value));
                    }}
                    disabled={uploading}
                />
            </div>

            <div className="space-y-2">
                <Label>{t('samples.sectionLabel', 'Sample Section')} *</Label>
                <Select dir={i18n.dir()} value={sectionId} onValueChange={(val) => {
                    setSectionId(val);
                    if (validationError) setValidationError(validateFiles());
                }}>
                    <SelectTrigger>
                        <SelectValue placeholder={t('samples.selectSection', 'Select a section...')} />
                    </SelectTrigger>
                    <SelectContent>
                        {sections.map(sec => (
                            <SelectItem key={sec.id} value={String(sec.id)}>{sec.title}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-4">
                {(mediaType === 'pdf' || mediaType === 'word' || mediaType === 'powerpoint') && (
                    <p className="text-xs text-muted-foreground p-2 bg-muted/50 rounded-lg">
                        {t('samples.docFormats', 'Accepted: PDF, Word (.doc/.docx), PowerPoint (.ppt/.pptx) — download only')}
                    </p>
                )}
            </div>

            <div className="space-y-2">
                <Label>{t('samples.thumbnailFileLabel', 'Thumbnail Image')} *</Label>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => thumbnailFileRef.current?.click()}
                    disabled={uploading}
                    className="w-full justify-start font-normal text-muted-foreground h-10 px-3"
                >
                    <Upload className="h-4 w-4 me-2 shrink-0" />
                    <span className="truncate">
                        {thumbnailFileName || (sample?.thumbnail_url ? t('samples.currentThumbnail', 'Current thumbnail') : t('common.chooseFile'))}
                    </span>
                </Button>
                <input
                    type="file"
                    ref={thumbnailFileRef}
                    className="hidden"
                    accept=".jpg,.jpeg,.png,.webp,.gif,.svg,.avif,image/*"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            setThumbnailFileName(file.name);
                            setValidationError(validateFiles());
                        } else {
                            setThumbnailFileName('');
                            setValidationError(validateFiles());
                        }
                    }}
                />
                <p className="text-[10px] text-muted-foreground">{t('samples.thumbnailNote', 'Shown on the samples page cards.')}</p>
            </div>

            <div className="space-y-2">
                <Label>{t('samples.hqFileLabel', 'High Quality File')} *</Label>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => hqFileRef.current?.click()}
                    disabled={uploading}
                    className="w-full justify-start font-normal text-muted-foreground h-10 px-3"
                >
                    <Upload className="h-4 w-4 me-2 shrink-0" />
                    <span className="truncate">{hqFileName || t('common.chooseFile')}</span>
                </Button>
                <input
                    type="file"
                    ref={hqFileRef}
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            setHqFileName(file.name);
                            // Auto-populate title from filename if currently empty
                            let updatedTitle = title;
                            if (!title.trim()) {
                                const nameWithoutExt = file.name.split('.').slice(0, -1).join('.');
                                updatedTitle = nameWithoutExt || file.name;
                                setTitle(updatedTitle);
                            }
                            setValidationError(validateFiles(file, null, updatedTitle));
                            const detected = detectMediaType(file);
                            if (detected) setMediaType(detected);
                        } else {
                            setHqFileName('');
                            setValidationError(validateFiles(null, null));
                        }
                    }}
                />
            </div>

            <div className="space-y-2">
                <Label>{t('samples.lqFileLabel', 'Low Quality File')}</Label>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => lqFileRef.current?.click()}
                    disabled={uploading}
                    className="w-full justify-start font-normal text-muted-foreground h-10 px-3"
                >
                    <Upload className="h-4 w-4 me-2 shrink-0" />
                    <span className="truncate">{lqFileName || t('common.chooseFile')}</span>
                </Button>
                <input
                    type="file"
                    ref={lqFileRef}
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            setLqFileName(file.name);
                            // Auto-populate title from filename if currently empty
                            let updatedTitle = title;
                            if (!title.trim()) {
                                const nameWithoutExt = file.name.split('.').slice(0, -1).join('.');
                                updatedTitle = nameWithoutExt || file.name;
                                setTitle(updatedTitle);
                            }
                            setValidationError(validateFiles(null, file, updatedTitle));
                            const detected = detectMediaType(file);
                            if (detected) setMediaType(detected);
                            // Only override if HQ isn't selected or if HQ matches
                            if (detected && !hqFileRef.current?.files?.[0]) {
                                setMediaType(detected);
                            }
                        } else {
                            setLqFileName('');
                            setValidationError(validateFiles(null, null));
                        }
                    }}
                />
            </div>

            <div className="flex items-center gap-2 pt-2">
                <span className="text-xs font-medium text-muted-foreground">{t('samples.detectedType', 'Detected Media Type')}:</span>
                <Badge variant="secondary" className="px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider">
                    {mediaType ? t(`samples.mediaTypes.${mediaType}`, mediaType) : t('common.na')}
                </Badge>
            </div>

            {validationError && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-2 rounded-lg flex items-center animate-in fade-in slide-in-from-top-1">
                    <AlertCircle className="h-4 w-4 me-2 shrink-0" />
                    {validationError}
                </div>
            )}

            {uploading && uploadProgress > 0 && (
                <div className="space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                        <span>{uploadProgress < 100 ? t('common.uploading') : t('common.processing')}</span>
                        <span>{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} />
                </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
                {uploading && (
                    <Button type="button" variant="outline" onClick={onCancel}>
                        <X className="me-2 h-4 w-4" /> {t('common.cancel')}
                    </Button>
                )}
                <Button type="submit" disabled={uploading || !!validationError}>
                    <Upload className="me-2 h-4 w-4" />
                    {uploading ? t('samples.uploading') : (sample ? t('common.update') : t('samples.upload'))}
                </Button>
            </div>
        </form>
    );
};

const SamplePreviewDisplay = ({ sample, product, previewUrl, downloadUrl, onEdit, onDelete }) => {
    const { t } = useTranslation('admin');
    const mt = sample.media_type;
    const thumbnailUrl = getImageUrl(sample.thumbnail_url);

    return (
        <div className="border border-border rounded-xl overflow-hidden">
            {thumbnailUrl && (
                <div className="w-full max-h-64 overflow-hidden bg-muted flex items-center justify-center">
                    <img src={thumbnailUrl} alt={sample.title || t('samples.previewAlt')} className="max-h-64 object-cover w-full" />
                </div>
            )}
            {!thumbnailUrl && mt === 'image' && sample.high_quality_url && (
                <div className="w-full max-h-64 overflow-hidden bg-muted flex items-center justify-center">
                    <img src={previewUrl} alt={t('samples.previewAlt')} className="max-h-64 object-contain w-full" />
                </div>
            )}
            {!thumbnailUrl && mt === 'video' && sample.high_quality_url && (
                <div className="w-full bg-black">
                    <video src={previewUrl} controls className="w-full max-h-64" />
                </div>
            )}

            <div className="flex items-center justify-between p-4 flex-wrap gap-4">
                <div className="flex flex-col space-y-1">
                    <div className="flex items-center gap-2">
                        <MediaIcon mediaType={mt} className="h-5 w-5 text-primary" />
                        <span className="font-medium text-foreground">
                            {sample.title || t('samples.productSampleName', { title: product.title })}
                        </span>
                        <Badge variant="outline">{t(`samples.mediaTypes.${mt}`)}</Badge>
                    </div>
                    {sample.section && (
                        <p className="text-sm text-muted-foreground">
                            {t('samples.inSection')}: {sample.section?.title}
                        </p>
                    )}
                    {(mt === 'pdf' || mt === 'word' || mt === 'powerpoint') && (
                        <p className="text-xs text-muted-foreground">{t('samples.docDownloadOnly')}</p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {!isPreviewable(mt) && sample.high_quality_url && (
                        <Button variant="outline" size="sm" asChild>
                            <a href={previewUrl} target="_blank" rel="noreferrer">
                                <Eye className="me-2 h-4 w-4" /> {t('samples.open')}
                            </a>
                        </Button>
                    )}
                    {sample.low_quality_url && (
                        <Button variant="outline" size="sm" asChild>
                            <a href={downloadUrl} download>
                                <Download className="me-2 h-4 w-4" /> {t('samples.download')}
                            </a>
                        </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={onEdit}>
                        <Pencil className="me-2 h-4 w-4" /> {t('samples.change')}
                    </Button>
                    <Button variant="outline" size="icon" onClick={onDelete} className="text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
};

// --- Main Component ---

export default function SampleManager({ product, loading, onUpdateSample, onRemoveSample, onRefresh }) {
    const { t } = useTranslation('admin');
    const { sections, fetchSections, createSample, updateSample, deleteSample } = useAdminSampleSections();

    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [currentEditSample, setCurrentEditSample] = useState(null);
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [sampleToDelete, setSampleToDelete] = useState(null);

    const abortControllerRef = useRef(null);

    const samples = Array.isArray(product?.samples) ? product.samples : (product?.sample ? [product?.sample] : []);
    const apiUrl = getApiUrl();

    useEffect(() => {
        fetchSections();
    }, [fetchSections]);

    const handleCancelUpload = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setUploading(false);
        setUploadProgress(0);
    };

    const handleUploadSubmit = async ({ sectionId, mediaType, title, hqFile, lqFile, thumbnailFile }) => {
        const formData = new FormData();
        formData.append('product_id', product.id);
        formData.append('sample_section_id', sectionId);
        formData.append('media_type', mediaType);
        if (title) formData.append('title', title);
        
        if (thumbnailFile) formData.append('thumbnail', thumbnailFile);
        if (hqFile) formData.append('high_quality', hqFile);
        if (lqFile) formData.append('low_quality', lqFile);

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        setUploading(true);
        setUploadProgress(0);

        try {
            let res;
            const onProgress = (progressEvent) => {
                if (progressEvent.total) {
                    setUploadProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
                }
            };
            
            if (currentEditSample) {
                // UPDATE existing sample
                res = await updateSample(
                    currentEditSample.section_id || sectionId, 
                    currentEditSample.id, 
                    formData, 
                    onProgress, 
                    abortController.signal
                );
            } else {
                // CREATE new sample
                res = await createSample(
                    sectionId, 
                    formData, 
                    onProgress, 
                    abortController.signal
                );
            }

            if (res?.success) {
                setCurrentEditSample(null);
                setIsAddingNew(false);
                if (onRefresh) onRefresh();
            }
        } catch (error) {
            if (error?.name !== 'AbortError') {
                toast.error(t('samples.errors.uploadFailed'));
            }
        } finally {
            setUploading(false);
            setUploadProgress(0);
            abortControllerRef.current = null;
        }
    };

    const handleRemove = async () => {
        if (!sampleToDelete) return;
        try {
            const res = await deleteSample(sampleToDelete.section_id, sampleToDelete.id);
            if (res?.success && onRefresh) onRefresh();
        } catch (error) {
            toast.error(t('samples.errors.deleteFailed'));
        } finally {
            setSampleToDelete(null);
        }
    };

    return (
        <div className="space-y-6">
            {samples.length > 0 ? (
                <div className="space-y-4">
                    {samples.map((s, idx) => {
                        const previewUrl = `${apiUrl}/sample-sections/${s.section_id}/samples/${s.id}/preview`;
                        const downloadUrl = `${apiUrl}/sample-sections/${s.section_id}/samples/${s.id}/download`;
                        const isBeingEdited = currentEditSample?.id === s.id;
                        return (
                            <div key={s.id || idx} className={cn(
                                "transition-all duration-300",
                                isBeingEdited ? "ring-2 ring-primary ring-offset-2 opacity-50 scale-[0.98]" : ""
                            )}>
                                <SamplePreviewDisplay
                                    sample={s}
                                    product={product}
                                    previewUrl={previewUrl}
                                    downloadUrl={downloadUrl}
                                    onEdit={() => {
                                        setIsAddingNew(false);
                                        setCurrentEditSample(s);
                                    }}
                                    onDelete={() => setSampleToDelete(s)}
                                />
                            </div>
                        );
                    })}
                </div>
            ) : !isAddingNew && (
                <div className="p-8 border border-dashed rounded-xl flex flex-col items-center justify-center text-center space-y-3 bg-muted/30">
                    <div className="p-3 bg-muted rounded-full">
                        <Upload className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                        <p className="font-medium">{t('samples.noSamples', 'No samples found')}</p>
                        <p className="text-sm text-muted-foreground">{t('samples.addFirstHint', 'Add a sample to provide product previews.')}</p>
                    </div>
                    <Button onClick={() => setIsAddingNew(true)}>
                        <Upload className="me-2 h-4 w-4" /> {t('samples.addTitle', 'Add Sample')}
                    </Button>
                </div>
            )}

            {(isAddingNew || currentEditSample) && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <SampleUploadForm
                        key={currentEditSample?.id || 'new'}
                        sample={currentEditSample}
                        sections={sections}
                        uploading={uploading}
                        uploadProgress={uploadProgress}
                        onCancel={() => {
                            if (uploading) {
                                handleCancelUpload();
                            } else {
                                setCurrentEditSample(null);
                                setIsAddingNew(false);
                            }
                        }}
                        onSubmit={handleUploadSubmit}
                        initialSectionId={currentEditSample?.section_id ? String(currentEditSample.section_id) : ''}
                        initialMediaType={currentEditSample?.media_type || 'pdf'}
                        initialThumbnailName=""
                        initialHqName={currentEditSample?.original_name || ''}
                        initialLqName={currentEditSample?.original_name || ''}
                        initialTitle={currentEditSample?.title || ''}
                    />
                </div>
            )}

            {samples.length > 0 && !isAddingNew && !currentEditSample && (
                <Button variant="outline" className="w-full border-dashed" onClick={() => setIsAddingNew(true)}>
                    <Upload className="me-2 h-4 w-4" /> {t('samples.addAnother', 'Add Another Sample')}
                </Button>
            )}

            <AlertDialog open={!!sampleToDelete} onOpenChange={(open) => !open && setSampleToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('samples.deleteConfirm', 'Are you sure you want to delete this sample?')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('samples.deleteDescription', 'This action cannot be undone. This sample file will be permanently removed from the product.')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            {t('common.delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
