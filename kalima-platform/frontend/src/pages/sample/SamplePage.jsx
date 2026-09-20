import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import {
    ArrowLeft,
    Download,
    AlertCircle,
    FileText,
    Package,
    ExternalLink,
    Eye,
    Video,
    Music,
    Image as ImageIcon,
    HardDrive,
    Calendar,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import useApiMutation from '@/hooks/useApiMutation';
import { getImageUrl, getApiUrl, formatFileSize, formatPrice } from '@/lib/storeUtils';
import { getPdfViewerI18nConfig } from '@/lib/pdfViewerI18n';
import LazyPDFViewer from '@/components/pdf/LazyPDFViewer';

// ── Helpers ───────────────────────────────────────────────────────────────────
// ── Media Viewer ──────────────────────────────────────────────────────────────

// ── Media Viewer ──────────────────────────────────────────────────────────────

const PROTECTED_PDF_DISABLED_CATEGORIES = [
    'annotation',
    'redaction',
    'document-open',
    'document-print',
    'document-protect',
    'document-export',
    'document-capture',
    'fullscreen',
    'selection',
];

function MediaViewer({ sample, previewUrl, downloadUrl, viewerI18n, dir, t }) {
    const mediaType = String(sample?.media_type || '').toLowerCase();
    const isPdf = sample?.mime_type === 'application/pdf' || mediaType === 'pdf';

    if (mediaType === 'video') {
        return previewUrl ? (
            <video
                className="w-full h-full object-contain rounded-xl"
                controls
                controlsList="nodownload"
                src={previewUrl}
                data-testid="sample-page-video-player"
            >
                <track kind="captions" />
                {t('samplePage.videoNotSupported', 'Your browser does not support the video tag.')}
            </video>
        ) : (
            <MediaFallback downloadUrl={downloadUrl} t={t} />
        );
    }

    if (mediaType === 'audio') {
        return (
            <div className="flex flex-col items-center justify-center gap-8 p-8 w-full h-full">
                <div className="h-24 w-24 rounded-full bg-orange-500/10 flex items-center justify-center">
                    <Music className="h-12 w-12 text-orange-500" />
                </div>
                {previewUrl ? (
                    <audio
                        className="w-full max-w-md"
                        controls
                        controlsList="nodownload"
                        src={previewUrl}
                        data-testid="sample-page-audio-player"
                    >
                        <track kind="captions" />
                    </audio>
                ) : (
                    <MediaFallback downloadUrl={downloadUrl} t={t} />
                )}
            </div>
        );
    }

    if (mediaType === 'image') {
        return previewUrl ? (
            <img
                src={previewUrl}
                alt={sample?.original_name || 'Sample'}
                className="w-full h-full object-contain rounded-xl"
                data-testid="sample-page-image-viewer"
            />
        ) : (
            <MediaFallback downloadUrl={downloadUrl} t={t} />
        );
    }

    // Document — PDF viewer or word download prompt
    if ((isPdf || mediaType === 'pdf') && previewUrl) {
        return (
            <LazyPDFViewer
                config={{
                    src: previewUrl,
                    theme: { preference: 'system' },
                    i18n: viewerI18n,
                    dir,
                    disabledCategories: PROTECTED_PDF_DISABLED_CATEGORIES,
                }}
                style={{ width: '100%', height: '100%' }}
            />
        );
    }

    // Word / unknown document
    return (
        <div className="flex flex-col items-center justify-center gap-4 text-muted-foreground p-8 w-full h-full">
            <FileText className="h-20 w-20 opacity-40" />
            <p className="text-sm text-center px-4 max-w-xs">{t('samplePage.previewUnavailable', 'Preview is not available for this file type.')}</p>
            {downloadUrl && (
                <Button variant="outline" asChild>
                    <a href={downloadUrl} download>
                        <Download className="me-2 h-4 w-4" />
                        {t('samplePage.downloadFile', 'Download File')}
                    </a>
                </Button>
            )}
        </div>
    );
}

function resolveSampleMediaUrls(sample) {
    const mediaType = String(sample?.media_type || '').toLowerCase();
    const apiUrl = getApiUrl();
    const sectionId = sample?.section_id;

    // Prefer API-served endpoints (proper Content-Type headers, bypasses nginx static cache)
    // Falls back to raw static URLs if section_id is unavailable
    const highQualityUrl = sectionId && sample?.high_quality_url
        ? `${apiUrl}/sample-sections/${sectionId}/samples/${sample.id}/preview`
        : (sample?.high_quality_url ? getImageUrl(sample.high_quality_url) : '');
    const lowQualityUrl = sectionId && sample?.low_quality_url
        ? `${apiUrl}/sample-sections/${sectionId}/samples/${sample.id}/download`
        : (sample?.low_quality_url ? getImageUrl(sample.low_quality_url) : '');

    const previewUrl = highQualityUrl || (['image', 'video', 'audio'].includes(mediaType) ? lowQualityUrl : '');

    return { mediaType, highQualityUrl, lowQualityUrl, previewUrl };
}


function MediaFallback({ downloadUrl, t }) {
    return (
        <div className="flex flex-col items-center justify-center gap-4 text-muted-foreground w-full h-full">
            <AlertCircle className="h-12 w-12 opacity-40" />
            <p className="text-sm">{t('samplePage.previewUnavailable', 'Preview unavailable.')}</p>
            {downloadUrl && (
                <Button variant="outline" asChild>
                    <a href={downloadUrl} download>
                        <Download className="me-2 h-4 w-4" />
                        {t('samplePage.downloadFile', 'Download File')}
                    </a>
                </Button>
            )}
        </div>
    );
}

// ── Detail Row ────────────────────────────────────────────────────────────────

function DetailRow({ label, value, children }) {
    return (
        <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
            <span className="text-sm text-muted-foreground">{label}</span>
            {children ?? <span className="text-sm font-medium text-end ms-4">{value}</span>}
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

/**
 * SamplePage — full sample details page.
 * Route: /samples/:id  (public)
 *
 * Handles media types: Document (PDF/Word), Video, Audio, Image
 * Uses sample-sections endpoints for preview/download.
 */
export default function SamplePage() {
    const { t, i18n } = useTranslation(['market', 'PDFViewer']);
    const location = useLocation();
    const cameFromAdmin = Boolean(location.state?.cameFromAdmin);
    const { id } = useParams();
    const { mutate: fetchApi, loading } = useApiMutation();
    const [sample, setSample] = useState(location.state?.sample || null);
    const [error, setError] = useState(false);

    const viewerI18n = useMemo(() => getPdfViewerI18nConfig(i18n.language), [i18n.language]);
    const isRtl = i18n.dir() === 'rtl';

    const mediaTypeMeta = useMemo(() => ({
        document: {
            icon: FileText,
            colorClass: 'text-blue-500',
            bgClass: 'bg-blue-500/10',
            label: t('samples.mediaTypes.pdf', 'Document'),
        },
        pdf: {
            icon: FileText,
            colorClass: 'text-blue-500',
            bgClass: 'bg-blue-500/10',
            label: t('samples.mediaTypes.pdf', 'PDF'),
        },
        word: {
            icon: FileText,
            colorClass: 'text-blue-500',
            bgClass: 'bg-blue-500/10',
            label: t('samples.mediaTypes.word', 'Word'),
        },
        powerpoint: {
            icon: FileText,
            colorClass: 'text-red-500',
            bgClass: 'bg-red-500/10',
            label: t('samples.mediaTypes.powerpoint', 'PowerPoint'),
        },
        video: {
            icon: Video,
            colorClass: 'text-purple-500',
            bgClass: 'bg-purple-500/10',
            label: t('samples.mediaTypes.video', 'Video'),
        },
        audio: {
            icon: Music,
            colorClass: 'text-orange-500',
            bgClass: 'bg-orange-500/10',
            label: t('samples.mediaTypes.audio', 'Audio'),
        },
        image: {
            icon: ImageIcon,
            colorClass: 'text-green-500',
            bgClass: 'bg-green-500/10',
            label: t('samples.mediaTypes.image', 'Image'),
        },
    }), [t]);

    const getMediaMeta = (type) => mediaTypeMeta[type?.toLowerCase()] || mediaTypeMeta.pdf;

    const preventProtectedPdfShortcuts = (event) => {
        const key = event.key?.toLowerCase();
        if ((event.ctrlKey || event.metaKey) && ['o', 'p', 's'].includes(key)) {
            event.preventDefault();
            event.stopPropagation();
        }
    };

    useEffect(() => {
        window.scrollTo(0, 0);
        if (!id) return;

        // If we already have the sample from location state, skip fetch
        if (sample) return;

        fetchApi({ endpoint: `/samples/${id}`, method: 'get' })
            .then(res => {
                if (res?.success) setSample(res.data);
                else setError(true);
            })
            .catch(() => setError(true));
    }, [id, fetchApi, sample]);

    const sampleMediaType = String(sample?.media_type || '').toLowerCase();
    const sampleIsProtectedPdf = sampleMediaType === 'pdf' || sample?.mime_type === 'application/pdf';

    useEffect(() => {
        if (!sampleIsProtectedPdf) return undefined;

        const handleKeyDown = (event) => {
            const key = event.key?.toLowerCase();
            if ((event.ctrlKey || event.metaKey) && ['o', 'p', 's'].includes(key)) {
                event.preventDefault();
                event.stopPropagation();
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [sampleIsProtectedPdf]);

    // ── Loading ───────────────────────────────────────────────────────────────
    if (loading && !sample) {
        return (
            <div className="min-h-screen" data-testid="sample-page-loading">
                <div className="container mx-auto px-4 md:px-8 py-8">
                    <Skeleton className="h-5 w-64 mb-8" />
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                        <div className="lg:col-span-7">
                            <Skeleton className="w-full aspect-4/3 rounded-2xl" />
                        </div>
                        <div className="lg:col-span-5 space-y-4">
                            <Skeleton className="h-8 w-3/4" />
                            <Skeleton className="h-5 w-1/3" />
                            <Skeleton className="h-32 w-full rounded-xl" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── Error ─────────────────────────────────────────────────────────────────
    if (error || (!loading && !sample)) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-center px-4" data-testid="sample-page-error">
                <AlertCircle className="h-12 w-12 text-destructive" />
                <p className="text-lg font-semibold">{t('samplePage.notFound', 'Sample not found')}</p>
                <Button variant="ghost" asChild>
                    <Link to="/market">
                        <ArrowLeft className="me-2 h-4 w-4" />
                        {t('samplePage.backToMarket', 'Back to Market')}
                    </Link>
                </Button>
            </div>
        );
    }

    // ── Derived values ────────────────────────────────────────────────────────
    const {
        mediaType,
        highQualityUrl,
        lowQualityUrl: downloadUrl,
        previewUrl,
    } = resolveSampleMediaUrls(sample);
    const meta = getMediaMeta(mediaType);
    const MetaIcon = meta.icon;
    const product = sample?.products;
    const isProtectedPdf = sampleIsProtectedPdf;

    const hasHighQuality = Boolean(sample?.high_quality_url || highQualityUrl);
    const hasLowQuality = Boolean(sample?.low_quality_url || downloadUrl);

    const formattedDate = sample?.created_at
        ? new Date(sample.created_at).toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' })
        : null;

    const backLink = cameFromAdmin
        ? '/admin/samples'
        : product?.id
            ? `/product/${product.id}`
            : '/samples';

    return (
        <div
            className="min-h-screen"
            data-testid="sample-details-page"
            onKeyDownCapture={isProtectedPdf ? preventProtectedPdfShortcuts : undefined}
            onContextMenu={isProtectedPdf ? (event) => event.preventDefault() : undefined}
            onDragStart={isProtectedPdf ? (event) => event.preventDefault() : undefined}
        >
            <div className="container mx-auto px-4 md:px-8 py-8">

                {/* Breadcrumbs */}
                <Breadcrumb className="mb-8">
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink asChild>
                                <Link to="/">{t('breadcrumbs.home', 'Home')}</Link>
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbLink asChild>
                                <Link to="/samples">{t('breadcrumbs.samples', 'Samples')}</Link>
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        {product && (
                            <>
                                <BreadcrumbSeparator />
                                <BreadcrumbItem>
                                    <BreadcrumbLink asChild>
                                        <Link to={`/product/${product.id}`} dir="auto" className="max-w-[160px] truncate">
                                            {product.title}
                                        </Link>
                                    </BreadcrumbLink>
                                </BreadcrumbItem>
                            </>
                        )}
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbPage className="max-w-[200px] truncate" dir="auto">
                                {sample?.title || sample?.original_name || `${t('samples.count', 'Sample')} #${sample?.id}`}
                            </BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>

                {/* Main Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">

                    {/* ── Left Column: Media Viewer ──────────────────────────── */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="lg:col-span-7"
                    >
                        <div className="space-y-4">
                            {/* Viewer Box */}
                            <div
                                className="relative w-full aspect-4/3 rounded-2xl overflow-hidden bg-muted border flex items-center justify-center"
                                data-testid="sample-page-viewer-box"
                            >
                                <MediaViewer
                                    sample={sample}
                                    previewUrl={previewUrl}
                                    downloadUrl={downloadUrl}
                                    viewerI18n={viewerI18n}
                                    dir={i18n.dir()}
                                    t={t}
                                />
                            </div>

                        </div>
                    </motion.div>

                    {/* ── Right Column: Details Panel ───────────────────────── */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="lg:col-span-5"
                    >
                        <div className="lg:sticky lg:top-24 flex flex-col gap-6">

                            {/* Header */}
                            <div className="space-y-3">
                                {/* Media type badge */}
                                <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${meta.bgClass} ${meta.colorClass}`}>
                                    <MetaIcon className="h-4 w-4" />
                                    {meta.label}
                                </div>

                                <h1 dir="auto" className="text-2xl font-bold leading-tight" data-testid="sample-page-title">
                                    {sample?.title || sample?.original_name || `${t('samples.count', 'Sample')} #${sample?.id}`}
                                </h1>

                                {/* Quality badges
                                <div className="flex flex-wrap gap-2">
                                    {hasHighQuality && (
                                        <Badge variant="secondary" className="gap-1 text-xs" data-testid="sample-page-hq-badge">
                                            <Eye className="h-3 w-3" />
                                            {t('samples.hq', 'High Quality')}
                                            {sample?.high_quality_size > 0 && ` · ${formatFileSize(sample.high_quality_size)}`}
                                        </Badge>
                                    )}
                                    {hasLowQuality && (
                                        <Badge variant="outline" className="gap-1 text-xs" data-testid="sample-page-lq-badge">
                                            <Download className="h-3 w-3" />
                                            {t('samples.lq', 'Low Quality')}
                                            {sample?.low_quality_size > 0 && ` · ${formatFileSize(sample.low_quality_size)}`}
                                        </Badge>
                                    )}
                                </div> */}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-col gap-3" data-testid="sample-page-action-buttons">
                                {hasHighQuality && !isProtectedPdf && ['image'].includes(mediaType?.toLowerCase()) && (
                                    <Button variant="default" className="w-full gap-2" asChild data-testid="sample-page-full-preview-button">
                                        <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                                            <Eye className="h-4 w-4" />
                                            {t('samplePage.fullPreview', 'Full Preview')}
                                            <ExternalLink className="h-4 w-4" />
                                        </a>
                                    </Button>
                                )}

                                {hasLowQuality && (
                                    <Button variant="outline" className="w-full gap-2" asChild data-testid="sample-page-download-lq-button">
                                        <a href={downloadUrl} target="_blank" rel="noopener noreferrer" download>
                                            <Download className="h-4 w-4" />
                                            {t('samplePage.download', 'Download')}
                                            {sample?.low_quality_size > 0 && (
                                                <span className="text-xs text-muted-foreground">
                                                    ({formatFileSize(sample.low_quality_size)})
                                                </span>
                                            )}
                                        </a>
                                    </Button>
                                )}
                            </div>

                            {/* Sample Details */}
                            <div className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-md p-6 space-y-2 shadow-xs" data-testid="sample-page-details-card">
                                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                                        <FileText className="h-4 w-4" />
                                    </div>
                                    {t('samplePage.sampleInfo', 'Sample Information')}
                                </h2>

                                <DetailRow label={t('samplePage.fileType', 'File Type')}>
                                    <Badge variant="secondary" className="bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary">
                                        {sample?.mime_type || t(`samples.mediaTypes.${mediaType}`, mediaType)}
                                    </Badge>
                                </DetailRow>

                                {sample?.high_quality_size > 0 && (
                                    <DetailRow
                                        label={t('samples.hq', 'High Quality')}
                                        value={formatFileSize(sample.high_quality_size)}
                                    />
                                )}

                                {sample?.low_quality_size > 0 && (
                                    <DetailRow
                                        label={t('samples.lq', 'Low Quality')}
                                        value={formatFileSize(sample.low_quality_size)}
                                    />
                                )}

                                {/* {formattedDate && (
                                    <DetailRow label={t('samplePage.uploadDate', 'Uploaded')}>
                                        <span className="flex items-center gap-1.5 text-sm font-medium">
                                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                            {formattedDate}
                                        </span>
                                    </DetailRow>
                                )} */}
                            </div>

                            {/* Product Info */}
                            {product && (
                                <div className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-md p-6 space-y-2 shadow-xs" data-testid="sample-page-product-card">
                                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                                            <Package className="h-4 w-4" />
                                        </div>
                                        {t('samplePage.productInfo', 'Product Information')}
                                    </h2>

                                    {/* Thumbnail */}
                                    {product.thumbnail_image?.url && (
                                        <div className="mb-4 rounded-lg overflow-hidden bg-muted aspect-video">
                                            <img
                                                src={getImageUrl(product.thumbnail_image.url)}
                                                alt={product.title}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    )}

                                    <DetailRow label={t('samplePage.productName', 'Name')}>
                                        <span dir="auto" className={`text-sm font-medium truncate ${isRtl ? 'mr-2' : 'ml-2'} max-w-[55%]`}>
                                            {product.title}
                                        </span>
                                    </DetailRow>

                                    <DetailRow label={t('samplePage.productType', 'Type')}>
                                        <Badge variant="secondary">{product.type}</Badge>
                                    </DetailRow>

                                    <DetailRow label={t('samplePage.price', 'Price')}>
                                        <div className="flex items-center gap-2">
                                            {product.price_after_discount && product.price_after_discount !== product.price ? (
                                                <>
                                                    <span className="text-sm font-semibold text-primary">
                                                        {formatPrice(product.price_after_discount)} {t('info.currency', 'EGP')}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground line-through">
                                                        {formatPrice(product.price)} {t('info.currency', 'EGP')}
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="text-sm font-semibold">
                                                    {formatPrice(product.price)} {t('info.currency', 'EGP')}
                                                </span>
                                            )}
                                        </div>
                                    </DetailRow>

                                    {product.serial && (
                                        <DetailRow label={t('samplePage.serial', 'Serial')} value={product.serial} />
                                    )}

                                    <div className="pt-6">
                                        <Button
                                            variant="default"
                                            className="w-full rounded-xl shadow-lg shadow-primary/20"
                                            asChild
                                            data-testid="sample-page-view-product-button"
                                        >
                                            <Link to={`/product/${product.id}`}>
                                                {t('samplePage.viewProduct', 'View Product')}
                                            </Link>
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
