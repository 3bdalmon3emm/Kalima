import { useTranslation } from 'react-i18next';
import { levelOf } from '@/lib/accountLevels';

// An account level as a colored badge; `size="lg"` for the profile header.
export default function AccountLevelBadge({ level, size = 'sm', className = '', children }) {
    const { t } = useTranslation('userManagement');
    const l = levelOf(level || 'NORMAL');
    const Icon = l.icon;
    const sizes = size === 'lg' ? 'gap-2 px-3 py-1.5 text-sm' : 'gap-1 px-2 py-0.5 text-[11px]';
    return (
        <span className={`inline-flex items-center whitespace-nowrap rounded-full border font-bold ${sizes} ${l.tone} ${className}`}>
            <Icon className={size === 'lg' ? 'h-4 w-4 no-flip' : 'h-3 w-3 no-flip'} />
            {t(`details.flags.${l.value}`, l.value)}
            {children}
        </span>
    );
}
