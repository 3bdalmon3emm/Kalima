import React, { useEffect, useCallback, useState } from 'react';
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { FileText, Download, Eye, Box, Folder, Video, FileAudio, Image as ImageIcon } from "lucide-react";
import HeroSection from "@/components/MarketPage/HeroSection";
import useApiMutation from "@/hooks/useApiMutation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFileSize, getImageUrl, getApiUrl } from "@/lib/storeUtils";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import DownloadWithProgress from '@/components/ui/DownloadWithProgress';

export default function SamplesDirectoryPage() {
    const { t, i18n } = useTranslation("market");
    const { mutate, loading } = useApiMutation();

    const [sections, setSections] = useState([]);
    const [fetched, setFetched] = useState(false);

    const isRtl = i18n.dir() === 'rtl';

    const fetchSampleSections = useCallback(async () => {
        setFetched(false);
        try {
            // Depending on backend, /sample-sections might return fully populated nested samples
            const res = await mutate({ endpoint: '/sample-sections', method: 'get' }, false);
            if (res && res.success) {
                // If the sections response doesn't embed samples, we could fetch them here, 
                // but the prompt implies listing sections with nested samples, assuming API provides it.
                // Assuming `res.data` is an array of section objects, and each has `samples` array.
                // Alternatively, we fetch each section if `samples` doesn't exist, but typically active sections carry it.

                // For safety, let's just use what's returned.
                setSections(res.data?.filter(s => s.active) ?? []);
            }
        } catch (error) {
            console.error("Failed to fetch sample sections", error);
        } finally {
            setFetched(true);
        }
    }, [mutate]);

    useEffect(() => {
        window.scrollTo(0, 0);
        fetchSampleSections();
    }, [fetchSampleSections]);

    const getIconForType = (mediaType) => {
        const mt = mediaType?.toLowerCase();
        if (mt === 'video') return <Video className="h-6 w-6 text-blue-500" />;
        if (mt === 'audio') return <FileAudio className="h-6 w-6 text-orange-500" />;
        if (mt === 'image') return <ImageIcon className="h-6 w-6 text-green-500" />;
        return <FileText className="h-6 w-6 text-primary" />;
    };

    return (
        <>
            <HeroSection
                onSearch={() => { }}
                title={t("samples.heroTitle", "Explore Free Samples")}
                subtitle={t("samples.heroSubtitle", "Download or preview high quality resources.")}
                hideSearch={true}
            />

            <div className="container py-12">
                <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold tracking-tight">
                            {t("samples.availableSamples", "Available Samples")}
                        </h2>
                    </div>

                    {loading && !fetched ? (
                        <div className="space-y-4">
                            {[...Array(3)].map((_, i) => (
                                <Skeleton key={i} className="h-16 w-full rounded-xl" />
                            ))}
                        </div>
                    ) : sections.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-4 py-24 text-muted-foreground bg-muted/30 rounded-2xl border border-dashed border-border">
                            <Folder className="h-16 w-16 opacity-30" />
                            <p className="text-lg font-medium">{t("samples.noSamples", "No samples found")}</p>
                        </div>
                    ) : (
                        <Accordion type="multiple" defaultValue={sections.map(s => String(s.id))} className="space-y-4">
                            {sections.map(section => (
                                <AccordionItem key={section.id} value={String(section.id)} className=" border border-border rounded-xl px-5 text-card-foreground">
                                    <AccordionTrigger className="hover:no-underline py-4">
                                        <div className="flex items-center gap-4 text-start">
                                            {section.thumbnail_url ? (
                                                <img src={section.thumbnail_url} alt="" className="w-10 h-10 rounded-md object-cover" />
                                            ) : (
                                                <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                                    <Folder className="h-5 w-5" />
                                                </div>
                                            )}
                                            <div>
                                                <h3 className="font-semibold text-lg" dir="auto">{section.title}</h3>
                                                {section.description && <p className="text-sm font-normal text-muted-foreground mt-0.5" dir="auto">{section.description}</p>}
                                            </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pt-2 pb-5 border-t border-border/50">
                                        {(() => {
                                            const filteredSamples = section.samples?.filter((s) => !s.is_archived) || [];
                                            if (filteredSamples.length === 0) {
                                                return <p className="text-muted-foreground py-4 text-center">{t('samples.noNestedSamples')}</p>;
                                            }
                                            return (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
                                                    {filteredSamples.map((sample) => {
                                                        const mt = sample.media_type?.toLowerCase();
                                                        const apiUrl = getApiUrl();
                                                        const sectionId = sample.section_id || section.id;
                                                        // Use API-served endpoints for proper Content-Type headers
                                                        const downloadUrl = sectionId && sample.low_quality_url
                                                            ? `${apiUrl}/sample-sections/${sectionId}/samples/${sample.id}/download`
                                                            : '';
                                                        const previewThumbnailUrl = sectionId && sample.high_quality_url
                                                            ? `${apiUrl}/sample-sections/${sectionId}/samples/${sample.id}/preview`
                                                            : '';
                                                        const uploadedThumbnailUrl = getImageUrl(sample.thumbnail_url);
                                                        const thumbnailUrl = uploadedThumbnailUrl || previewThumbnailUrl;
                                                        const hasMediaPreview = !uploadedThumbnailUrl && sample.high_quality_url && (mt === 'image' || mt === 'video');
                                                        const hasThumbnail = Boolean(uploadedThumbnailUrl || hasMediaPreview);

                                                        return (
                                                            <div
                                                                key={sample.id}
                                                                className="group flex flex-col rounded-xl border border-border shadow-sm transition-all hover:shadow-md hover:border-primary/50 bg-background overflow-hidden"
                                                            >
                                                                {/* Thumbnail / Media preview */}
                                                                {hasThumbnail ? (
                                                                    <div className="w-full aspect-video overflow-hidden bg-muted relative">
                                                                        {hasMediaPreview && mt === 'video' ? (
                                                                            <video
                                                                                src={thumbnailUrl}
                                                                                className="w-full h-full object-cover"
                                                                                muted
                                                                                preload="metadata"
                                                                                data-testid={`samples-directory-thumb-${sample.id}`}
                                                                            />
                                                                        ) : (
                                                                            <img
                                                                                src={thumbnailUrl}
                                                                                alt={sample.title || ''}
                                                                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                                                data-testid={`samples-directory-thumb-${sample.id}`}
                                                                            />
                                                                        )}
                                                                        <div className="absolute top-2 start-2">
                                                                            <span className="font-medium bg-black/60 text-white px-2 py-0.5 rounded-md text-xs backdrop-blur-sm">
                                                                                {t(`samples.mediaTypes.${sample.media_type}`, sample.media_type)}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="w-full aspect-video bg-muted flex items-center justify-center">
                                                                        {getIconForType(sample.media_type)}
                                                                    </div>
                                                                )}

                                                                {/* Card body */}
                                                                <div className="p-5 flex flex-col flex-1 gap-4">
                                                                    <div className="flex items-center gap-3">
                                                                        {!hasThumbnail && getIconForType(sample.media_type)}
                                                                        <h3 dir="auto" className="font-semibold text-lg line-clamp-2 leading-tight">
                                                                            {sample.title || `${t('samples.count')} #${sample.id}`}
                                                                        </h3>
                                                                    </div>

                                                                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                                                        {!hasThumbnail && (
                                                                            <span className="font-medium bg-muted px-2 py-0.5 rounded-md text-xs">
                                                                                {t(`samples.mediaTypes.${sample.media_type}`, sample.media_type)}
                                                                            </span>
                                                                        )}
                                                                        {sample.high_quality_size > 0 && <span>{t('samples.hq')}: {formatFileSize(sample.high_quality_size)}</span>}
                                                                        {sample.low_quality_size > 0 && <span>{t('samples.lq')}: {formatFileSize(sample.low_quality_size)}</span>}
                                                                    </div>

                                                                    {sample.product_id && (
                                                                        <div className="flex items-start gap-2 border-t border-border pt-3 line-clamp-2">
                                                                            <Box className="h-4 w-4 shrink-0 text-muted-foreground relative top-0.5" />
                                                                            <Link
                                                                                to={`/product/${sample.product_id}`}
                                                                                dir="auto"
                                                                                className="text-sm text-muted-foreground hover:text-primary transition-colors hover:underline text-start"
                                                                            >
                                                                                {t('samplePage.viewProduct')}: #{sample.product_id}
                                                                            </Link>
                                                                        </div>
                                                                    )}

                                                                    <div className="flex items-center gap-2 mt-auto pt-4 border-t border-border">
                                                                        <Button
                                                                            variant="default"
                                                                            className="flex-1"
                                                                            asChild
                                                                            data-testid={`samples-directory-view-${sample.id}`}
                                                                        >
                                                                            <Link to={`/samples/${sample.id}`} state={{ sample }}>
                                                                                <Eye className={`${isRtl ? 'ms-2' : 'me-2'} h-4 w-4`} />
                                                                                {t("samples.view")}
                                                                            </Link>
                                                                        </Button>

                                                                        {sample.low_quality_url && (
                                                                            <Button
                                                                                variant="outline"
                                                                                className="flex-1"
                                                                                asChild
                                                                                data-testid={`samples-directory-download-${sample.id}`}
                                                                            >
                                                                                <a href={downloadUrl} download>
                                                                                    <Download className={`${isRtl ? 'ms-2' : 'me-2'} h-4 w-4`} />
                                                                                    {t("samples.download")}
                                                                                </a>
                                                                            </Button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })()}
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    )}
                </div>
            </div>
        </>
    );
}
