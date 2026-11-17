import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeCanvas } from 'qrcode.react';
import { toast } from 'sonner';
import { Copy, Download } from 'lucide-react';
import axios from '@/api/axios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { examLink } from '@/components/admin/exams/api';

// One exam link: the QR on screen, copy the link, download the QR as a PNG
// (made by the server from the public address, the same image every time).
export default function LinkQrDialog({ open, onOpenChange, code, pngPath, fileName = 'qr' }) {
    const { t } = useTranslation('exams');
    const [downloading, setDownloading] = useState(false);
    const url = code ? examLink(code) : '';

    const download = async () => {
        setDownloading(true);
        try {
            const res = await axios.get(pngPath, { responseType: 'blob' });
            const href = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = href;
            a.download = `${fileName.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'qr'}.png`;
            a.click();
            URL.revokeObjectURL(href);
        } catch {
            toast.error(t('errors.load'));
        } finally {
            setDownloading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader><DialogTitle className="truncate">{fileName}</DialogTitle></DialogHeader>
                {code && (
                    <div className="flex flex-col items-center gap-4">
                        <div className="rounded-xl border bg-white p-3"><QRCodeCanvas value={url} size={220} /></div>
                        <code className="w-full truncate rounded-md bg-muted px-3 py-2 text-center text-sm" dir="ltr">{url}</code>
                        <div className="flex w-full gap-2">
                            <Button variant="outline" className="flex-1" onClick={() => { navigator.clipboard.writeText(url); toast.success(t('testLink.copied')); }}>
                                <Copy className="h-4 w-4" />{t('testLink.copy')}
                            </Button>
                            <Button className="flex-1" onClick={download} disabled={downloading}>
                                {downloading ? <LoadingSpinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}{t('teachers.downloadQr')}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
