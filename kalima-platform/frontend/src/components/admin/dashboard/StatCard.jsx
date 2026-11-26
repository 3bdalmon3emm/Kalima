import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import HintLabel from '@/components/admin/HintLabel';

export default function StatCard({ icon: Icon, label, value, sub, hint, color = 'text-primary' }) {
    const { i18n } = useTranslation();

    return (
        <Card className="shadow-sm">
            <CardContent className="p-5 flex items-center gap-4">
                <div className={`p-3 rounded-xl bg-muted/60 ${color}`}>
                    <Icon className={`h-5 w-5 ${i18n.language === 'ar' ? 'scale-x-[-1]' : ''}`} />
                </div>
                <div className="min-w-0">
                    {/* Normal line height: Arabic letters get clipped at leading-none inside a truncated line. */}
                    <p className="mb-1 truncate py-0.5 text-xs leading-normal text-muted-foreground" title={!hint && typeof label === 'string' ? label : undefined}><HintLabel hint={hint}>{label}</HintLabel></p>
                    <p className="truncate text-2xl font-bold leading-normal">{value ?? '—'}</p>
                    {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
                </div>
            </CardContent>
        </Card>
    );
}
