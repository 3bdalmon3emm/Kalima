import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Music, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { translateBackendMessage } from '@/lib/utils';
import { mediaUrl, uploadMedia } from './api';

// Uploads one image or audio file to the bank and keeps { id, url }.
export default function MediaField({ kind = 'image', bankId, value, onChange, compact = false }) {
    const { t } = useTranslation('questionBank');
    const inputRef = useRef(null);
    const [uploading, setUploading] = useState(false);

    const upload = async (file) => {
        if (!file) return;
        setUploading(true);
        try {
            onChange(await uploadMedia(file, bankId));
        } catch (err) {
            toast.error(translateBackendMessage(err.response?.data?.message) || t('media.uploadError'));
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const Icon = kind === 'image' ? ImagePlus : Music;
    const label = kind === 'image' ? t('media.addImage') : t('media.addAudio');

    return (
        <div className="space-y-2">
            {value ? (
                <div className="relative inline-block max-w-full">
                    {kind === 'image' ? (
                        <img
                            src={mediaUrl(value.url)}
                            alt=""
                            className={compact ? 'max-h-24 rounded border' : 'max-h-56 rounded border'}
                        />
                    ) : (
                        <audio src={mediaUrl(value.url)} controls className="max-w-full" />
                    )}
                    <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        className="absolute -top-2 -end-2 h-6 w-6 rounded-full"
                        onClick={() => onChange(null)}
                        title={t('media.remove')}
                    >
                        <X className="h-3 w-3" />
                    </Button>
                </div>
            ) : (
                <Button
                    type="button"
                    variant="outline"
                    size={compact ? 'sm' : 'default'}
                    disabled={uploading}
                    onClick={() => inputRef.current?.click()}
                >
                    {uploading ? <LoadingSpinner className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    {!compact && label}
                </Button>
            )}
            <input
                ref={inputRef}
                type="file"
                accept={kind === 'image' ? 'image/*' : 'audio/*'}
                className="hidden"
                onChange={(e) => upload(e.target.files?.[0])}
            />
        </div>
    );
}
