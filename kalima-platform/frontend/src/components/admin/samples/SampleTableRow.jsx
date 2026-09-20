import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Image, Video, Presentation, FilePieChart, ExternalLink, Download, Edit, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import RemoteFileSize from './RemoteFileSize';
import { getImageUrl, getApiUrl } from '@/lib/storeUtils';

const getIconForType = (mediaType) => {
    const mt = mediaType?.toLowerCase();
    if (mt === 'video') return <Video className="h-5 w-5 text-blue-500" />;
    if (mt === 'image') return <Image className="h-5 w-5 text-green-500" />;
    if (mt === 'pdf') return <FileText className="h-5 w-5 text-red-500" />;
    if (mt === 'word') return <FileText className="h-5 w-5 text-blue-600" />;
    if (mt === 'powerpoint') return <Presentation className="h-5 w-5 text-orange-500" />;
    return <FileText className="h-5 w-5 text-primary" />;
};

export default function SampleTableRow({ sample, sectionId, onEdit, onDelete, loading }) {
    const { t } = useTranslation('admin');
    const apiUrl = getApiUrl();
    const effectiveSectionId = sample.section_id ?? sectionId;
    const downloadUrl = effectiveSectionId
        ? `${apiUrl}/sample-sections/${effectiveSectionId}/samples/${sample.id}/download`
        : null;
    const thumbnailUrl = getImageUrl(sample.thumbnail_url);

    return (
        <tr>
            <td className="ps-4 py-3">
                <div className="flex items-center gap-3">
                    {thumbnailUrl ? (
                        <img
                            src={thumbnailUrl}
                            alt=""
                            className="h-12 w-16 rounded-md object-cover bg-muted border border-border"
                            data-testid={`admin-sample-thumb-${sample.id}`}
                        />
                    ) : (
                        getIconForType(sample.media_type)
                    )}
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <span className="font-medium" title={sample.title || undefined}>{sample.title || `${t('samples.count', 'Sample')} #${sample.id}`}</span>
                            {sample.is_archived && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4" title={t('samples.is_archived_hint')}>
                                    {t('samples.archived', 'Archived')}
                                </Badge>
                            )}
                        </div>
                        <div className="text-xs text-muted-foreground flex gap-2">
                            {sample.high_quality_url && (
                                <span>
                                    {t('samples.hq')}: <RemoteFileSize url={sample.high_quality_url} fallbackSize={sample.high_quality_size} />
                                </span>
                            )}
                            {sample.low_quality_url && (
                                <span>
                                    {t('samples.lq')}: <RemoteFileSize url={sample.low_quality_url} fallbackSize={sample.low_quality_size} />
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </td>
            <td className="kalima-number py-3">
                {sample.product_id ? (
                    <Link to={`/admin/products/${sample.product_id}`} className="text-primary hover:underline">
                        {t('samples.table.product', 'Product')} #{sample.product_id}
                    </Link>
                ) : (
                    <span className="text-muted-foreground italic text-xs">
                        {t('samples.noAssociatedProduct', 'No Link')}
                    </span>
                )}
            </td>
            <td className="py-3 hidden sm:table-cell">
                <Badge variant="outline">
                    {t(`samples.mediaTypes.${sample.media_type}`, sample.media_type)}
                </Badge>
            </td>
            <td className="kalima-actions pe-4 py-3">
                <div className="flex items-center justify-end gap-2">
                    {/* View sample details page */}
                    <Button
                        variant="ghost"
                        size="icon"
                        asChild
                        title={t('samples.view')}
                        data-testid={`admin-sample-view-${sample.id}`}
                    >
                        <Link
                            to={`/samples/${sample.id}`}
                            state={{ cameFromAdmin: true, sample }}
                        >
                            <Eye className="h-4 w-4" />
                        </Link>
                    </Button>

                    {/* Full-screen preview */}
                    {sample.high_quality_url && (
                        <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            title={t('samples.openPreview')}
                            data-testid={`admin-sample-preview-${sample.id}`}
                        >
                        <Link
                            to={`/samples/${sample.id}/preview?${new URLSearchParams({
                                section_id: effectiveSectionId || '',
                                media_type: sample.media_type,
                                mime_type: sample.mime_type || '',
                                original_name: sample.original_name || '',
                                high_quality_url: sample.high_quality_url || '',
                                low_quality_url: sample.low_quality_url || '',
                                created_at: sample.created_at || '',
                                product_id: sample.product_id || '',
                                product_title: sample.products?.title || '',
                                title: sample.title || ''
                            }).toString()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                                <ExternalLink className="h-4 w-4" />
                            </Link>
                        </Button>
                    )}

                    {/* Download LQ */}
                    {sample.low_quality_url && downloadUrl && (
                        <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            title={t('samples.download')}
                            data-testid={`admin-sample-download-${sample.id}`}
                        >
                            <a href={downloadUrl} download>
                                <Download className="h-4 w-4" />
                            </a>
                        </Button>
                    )}

                    {/* Edit sample */}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(sample)}
                        title={t('common.edit', 'Edit Sample')}
                        data-testid={`admin-sample-edit-${sample.id}`}
                    >
                        <Edit className="h-4 w-4" />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(sample.id)}
                        className="text-destructive hover:bg-destructive/10"
                        title={t('common.delete', 'Remove Sample')}
                        disabled={loading}
                        data-testid={`admin-sample-delete-${sample.id}`}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </td>
        </tr>
    );
}
