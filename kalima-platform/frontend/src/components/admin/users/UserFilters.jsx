import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import AccountLevelBadge from '@/components/admin/AccountLevelBadge';
import { ACCOUNT_LEVELS } from '@/lib/accountLevels';
import { Search, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ROLES } from '@/lib/adminConstants';

export default function UserFilters({ onFiltersChange, initialSearch = '', initialRole = '', initialFlag = '' }) {
    const { t, i18n } = useTranslation('userManagement');

    const [search, setSearch] = useState(initialSearch);
    const [role, setRole] = useState(initialRole);
    const [flag, setFlag] = useState(initialFlag);
    const debounceRef = useRef(null);

    // Debounce search input
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            onFiltersChange({ search, role, flag });
        }, 400);
        return () => clearTimeout(debounceRef.current);
    }, [search, role, flag, onFiltersChange]);

    const handleRoleChange = (value) => {
        const newRole = value === 'all' ? '' : value;
        setRole(newRole);
    };

    const handleClear = () => {
        setSearch('');
        setRole('');
        setFlag('');
    };

    const hasActiveFilters = search || role || flag;

    return (
        <div className="flex flex-col sm:flex-row gap-3" data-testid="users-page-filters">
            {/* Search */}
            <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                    className="ps-9"
                    placeholder={t('searchPlaceholder')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    data-testid="users-page-search-input"
                />
            </div>

            {/* Role filter */}
            <Select
                dir={i18n.dir()}
                value={role || 'all'}
                onValueChange={handleRoleChange}
            >
                <SelectTrigger className="w-full sm:w-[180px]" data-testid="users-page-role-filter">
                    <SelectValue placeholder={t('filters.allRoles')} />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">{t('filters.allRoles')}</SelectItem>
                    {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                            {t(`roles.${r}`, r)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Account level filter */}
            <Select dir={i18n.dir()} value={flag || 'all'} onValueChange={(v) => setFlag(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-full sm:w-[180px]" data-testid="users-page-level-filter">
                    <SelectValue placeholder={t('filters.allLevels', 'All levels')} />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">{t('filters.allLevels', 'All levels')}</SelectItem>
                    {ACCOUNT_LEVELS.map(({ value }) => (
                        <SelectItem key={value} value={value}><AccountLevelBadge level={value} /></SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Clear filters */}
            {hasActiveFilters && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClear}
                    className="gap-2 shrink-0"
                    data-testid="users-page-clear-filters"
                >
                    <X className="h-4 w-4" />
                    {t('filters.clearFilters')}
                </Button>
            )}
        </div>
    );
}
