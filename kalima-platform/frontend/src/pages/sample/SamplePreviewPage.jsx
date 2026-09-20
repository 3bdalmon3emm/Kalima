import { useEffect, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, AlertCircle, FileText, Music } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { getPdfViewerI18nConfig } from '@/lib/pdfViewerI18n';
import { getImageUrl, getApiUrl } from '@/lib/storeUtils';
import LazyPDFViewer from '@/components/pdf/LazyPDFViewer';

const PROTECTED_PDF_DISABLED_CATEGORIES = [
    'annotation',
    'redaction',
    'document-open',
    'document-print',
    'document-protect',
    'document-export',
    'document-capture',
    'selection',
];

/**
 * SamplePreviewPage — full-screen media viewer for a single sample.
 * Route: /samples/:id/preview  (public)
 *
 * Uses route params + search params for zero-fetch initialization.
 */
export default function SamplePreviewPage() {
    const { t, i18n } = useTranslation(['market', 'PDFViewer']);
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const viewerI18n = useMemo(() => getPdfViewerI18nConfig(i18n.language), [i18n.language]);

    // Construct sample object from URL params
    const sample = useMemo(() => {
        if (!id) return null;

        const mediaType = searchParams.get('media_type');

        // Basic fields
        const s = {
            id,
            section_id: searchParams.get('section_id'),
            media_type: mediaType,
            mime_type: searchParams.get('mime_type'),
            original_name: searchParams.get('original_name'),
            high_quality_url: searchParams.get('high_quality_url'),
            low_quality_url: searchParams.get('low_quality_url'),
            created_at: searchParams.get('created_at'),
            product_id: searchParams.get('product_id'),
            title: searchParams.get('title'),
            // Nested products (simplified for URL)
            products: searchParams.get('product_title') ? {
                id: searchParams.get('product_id'),
                title: searchParams.get('product_title')
            } : null
        };

        // Validate minimum required for a preview to function
        if (!s.section_id || !s.media_type) return null;
        return s;
    }, [id, searchParams]);

    const mediaType = String(sample?.media_type || '').toLowerCase();
    const apiUrl = getApiUrl();
    const sectionId = sample?.section_id;

    // Prefer API-served endpoints (proper Content-Type headers, bypasses nginx static cache)
    const highQualityUrl = sectionId && sample?.high_quality_url
        ? `${apiUrl}/sample-sections/${sectionId}/samples/${sample.id}/preview`
        : (getImageUrl(sample?.high_quality_url) || '');
    const downloadUrl = sectionId && sample?.low_quality_url
        ? `${apiUrl}/sample-sections/${sectionId}/samples/${sample.id}/download`
        : (getImageUrl(sample?.low_quality_url) || '');
    const previewUrl = highQualityUrl || (['image', 'video', 'audio'].includes(mediaType) ? downloadUrl : '');
    const isPdf = mediaType === 'pdf' || sample?.mime_type === 'application/pdf';

    const preventProtectedPdfShortcuts = (event) => {
        const key = event.key?.toLowerCase();
        if ((event.ctrlKey || event.metaKey) && ['o', 'p', 's'].includes(key)) {
            event.preventDefault();
            event.stopPropagation();
        }
    };

    useEffect(() => {
        if (!isPdf) return undefined;
        window.addEventListener('keydown', preventProtectedPdfShortcuts, true);
        return () => window.removeEventListener('keydown', preventProtectedPdfShortcuts, true);
    }, [isPdf]);

    if (!sample) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-center px-4" data-testid="sample-preview-error">
                <AlertCircle className="h-12 w-12 text-destructive" />
                <p className="text-lg font-semibold">{t('samplePage.notFound', 'Sample not found')}</p>
                <Button variant="ghost" asChild>
                    <Link to={`/samples/${id}`}>
                        <ArrowLeft className="me-2 h-4 w-4" />
                        {t('samplePage.backToSample', 'Back to Sample')}
                    </Link>
                </Button>
            </div>
        );
    }

    return (
        <div
            className="flex flex-col h-screen"
            data-testid="sample-preview-page"
            onKeyDownCapture={isPdf ? preventProtectedPdfShortcuts : undefined}
            onContextMenu={isPdf ? (event) => event.preventDefault() : undefined}
            onDragStart={isPdf ? (event) => event.preventDefault() : undefined}
        >

            {/* Slim top bar */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-background/80 backdrop-blur shrink-0">
                <Button variant="ghost" size="sm" asChild data-testid="sample-preview-back-button">
                    <Link to={`/samples/${id}`}>
                        <ArrowLeft className="h-4 w-4 me-1" />
                        {t('samplePage.backToSample', 'Sample Details')}
                    </Link>
                </Button>
                <span dir="auto" className="text-sm font-medium truncate text-muted-foreground flex-1">
                    {sample?.title || sample?.original_name}
                </span>
                {downloadUrl && !isPdf && (
                    <Button variant="outline" size="sm" asChild data-testid="sample-preview-download-button">
                        <a href={downloadUrl} download>
                            <Download className="h-4 w-4 me-1" />
                            {t('samplePage.download', 'Download')}
                        </a>
                    </Button>
                )}
            </div>

            {/* Full-screen viewer */}
            <div className="flex-1 overflow-hidden flex items-center justify-center bg-muted/20" data-testid="sample-preview-viewer">

                {/* Video */}
                {mediaType === 'video' && previewUrl && (
                    <video
                        className="max-h-full max-w-full"
                        controls
                        src={previewUrl}
                        data-testid="sample-preview-video-player"
                    >
                        <track kind="captions" />
                    </video>
                )}

                {/* Image */}
                {mediaType === 'image' && previewUrl && (
                    <img
                        src={previewUrl}
                        alt={sample?.original_name || 'Sample'}
                        className="max-h-full max-w-full object-contain"
                        data-testid="sample-preview-image"
                    />
                )}

                {/* PDF Document */}
                {isPdf && previewUrl && (
                    <div className="w-full h-full max-w-6xl mx-auto">
                        <LazyPDFViewer
                            config={{
                                src: previewUrl,
                                theme: { preference: 'system' },
                                i18n: viewerI18n,
                                dir: i18n.dir(),
                                disabledCategories: PROTECTED_PDF_DISABLED_CATEGORIES,
                            }}
                            style={{ width: '100%', height: '100%' }}
                        />
                    </div>
                )}

                {/* Word / PowerPoint / Unknown — download fallback */}
                {((mediaType === 'word' || mediaType === 'powerpoint') ||
                    (!isPdf && mediaType !== 'video' && mediaType !== 'image' && !previewUrl)) && (
                        <div className="flex flex-col items-center justify-center gap-4 text-muted-foreground p-8">
                            <FileText className="h-20 w-20 opacity-30" />
                            <p className="text-sm text-center">{t('samplePage.previewUnavailable', 'Preview not available.')}</p>
                            {downloadUrl && (
                                <Button asChild data-testid="sample-preview-download-fallback-button">
                                    <a href={downloadUrl} download>
                                        <Download className="me-2 h-4 w-4" />
                                        {t('samplePage.downloadFile', 'Download File')}
                                    </a>
                                </Button>
                            )}
                        </div>
                    )}
            </div>
        </div>
    );
}
