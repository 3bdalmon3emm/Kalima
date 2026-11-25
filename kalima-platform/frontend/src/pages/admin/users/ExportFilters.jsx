import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

// The row filters of the users export: a few values to choose from per
// column (governorate, district, stage, ...). Nothing chosen means "all".

function MultiPick({ label, options, value = [], onChange }) {
    const { t } = useTranslation('userManagement');
    const [open, setOpen] = useState(false);
    const chosen = options.filter((o) => value.includes(o.value));
    const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

    return (
        <div className="space-y-1">
            <p className="text-xs font-medium">{label}</p>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="h-auto min-h-9 w-full justify-between gap-2 px-3 py-1.5 font-normal" disabled={!options.length}>
                        <span className={cn('min-w-0 flex-1 truncate text-start', !chosen.length && 'text-muted-foreground')}>
                            {chosen.length ? chosen.map((o) => o.label).join('، ') : t('export.filter.all')}
                        </span>
                        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0" align="start">
                    <Command>
                        {options.length > 6 && <CommandInput placeholder={t('export.filter.search')} />}
                        <CommandList>
                            <CommandEmpty>{t('export.filter.noMatch')}</CommandEmpty>
                            <CommandGroup>
                                {options.map((o) => (
                                    <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => toggle(o.value)}>
                                        <Check className={cn('h-4 w-4', value.includes(o.value) ? 'opacity-100' : 'opacity-0')} />
                                        {o.label}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                    {!!value.length && (
                        <div className="border-t p-1">
                            <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>
                                <X className="h-4 w-4" />{t('export.filter.clear')}
                            </Button>
                        </div>
                    )}
                </PopoverContent>
            </Popover>
        </div>
    );
}

// Governorate, then the districts of the chosen governorates (all when none).
function PlaceFilters({ lookups, value, set }) {
    const { t } = useTranslation('userManagement');
    const govs = value.government || [];
    const zones = lookups.zones.filter((z) => !govs.length || govs.includes(z.government_id));
    const pickGov = (list) => {
        const keep = (value.zone || []).filter((id) => lookups.zones.some((z) => z.id === id && (!list.length || list.includes(z.government_id))));
        set({ government: list, zone: keep });
    };
    return (
        <>
            <MultiPick label={t('export.filter.government')} options={lookups.governments.map((g) => ({ value: g.id, label: g.title }))} value={govs} onChange={pickGov} />
            <MultiPick label={t('export.filter.zone')} options={zones.map((z) => ({ value: z.id, label: z.title }))} value={value.zone} onChange={(zone) => set({ zone })} />
        </>
    );
}

export default function ExportFilters({ group, lookups, value = {}, onChange }) {
    const { t, i18n } = useTranslation('userManagement');
    const set = (patch) => onChange({ ...value, ...patch });
    const named = (x) => (i18n.language === 'ar' && x.title_ar) || x.title;

    if (group === 'all') {
        return (
            <>
                <MultiPick label={t('export.field.flag')} options={lookups.flags.map((f) => ({ value: f, label: t(`details.flags.${f}`, f) }))} value={value.flag} onChange={(flag) => set({ flag })} />
                <MultiPick label={t('export.field.gender')} options={['male', 'female'].map((g) => ({ value: g, label: t(`createDialog.${g}`) }))} value={value.gender} onChange={(gender) => set({ gender })} />
                <div className="space-y-1">
                    <p className="text-xs font-medium">{t('export.filter.signedUp')}</p>
                    <div className="flex items-center gap-2">
                        <Input type="date" className="h-9" value={value.from || ''} max={value.to || undefined} onChange={(e) => set({ from: e.target.value })} aria-label={t('export.filter.from')} />
                        <span className="text-xs text-muted-foreground">{t('export.filter.to')}</span>
                        <Input type="date" className="h-9" value={value.to || ''} min={value.from || undefined} onChange={(e) => set({ to: e.target.value })} aria-label={t('export.filter.to')} />
                    </div>
                </div>
            </>
        );
    }

    if (group === 'Student') {
        const stages = value.stage || [];
        const levels = lookups.levels.filter((l) => !stages.length || stages.includes(l.stage_id));
        const pickStage = (list) => set({
            stage: list,
            level: (value.level || []).filter((id) => lookups.levels.some((l) => l.id === id && (!list.length || list.includes(l.stage_id)))),
        });
        return (
            <>
                <MultiPick label={t('export.field.stage')} options={lookups.stages.map((s) => ({ value: s.id, label: named(s) }))} value={stages} onChange={pickStage} />
                <MultiPick label={t('export.field.level')} options={levels.map((l) => ({ value: l.id, label: named(l) }))} value={value.level} onChange={(level) => set({ level })} />
                {!!lookups.factions.length && (
                    <MultiPick label={t('export.field.faction')} options={lookups.factions.map((f) => ({ value: f, label: f }))} value={value.faction} onChange={(faction) => set({ faction })} />
                )}
                <PlaceFilters lookups={lookups} value={value} set={set} />
                <MultiPick
                    label={t('export.field.graduated')}
                    options={[{ value: 'yes', label: t('export.filter.graduatedYes') }, { value: 'no', label: t('export.filter.graduatedNo') }]}
                    value={value.graduated ? [value.graduated] : []}
                    onChange={(list) => set({ graduated: list[list.length - 1] })}
                />
            </>
        );
    }

    if (group === 'Teacher') {
        return (
            <>
                <MultiPick label={t('export.field.teaching_stages')} options={lookups.teaching_stages.map((s) => ({ value: s, label: t(`details.${s}`) }))} value={value.stage} onChange={(stage) => set({ stage })} />
                <MultiPick label={t('export.field.subject')} options={lookups.subjects.map((s) => ({ value: s.id, label: s.title }))} value={value.subject} onChange={(subject) => set({ subject })} />
                <PlaceFilters lookups={lookups} value={value} set={set} />
            </>
        );
    }

    if (group === 'Parent') return <PlaceFilters lookups={lookups} value={value} set={set} />;
    return null;
}

// How many filters are set in a group, for the badge.
export const filterCount = (value = {}) => Object.values(value).filter((v) => (Array.isArray(v) ? v.length : !!v)).length;
