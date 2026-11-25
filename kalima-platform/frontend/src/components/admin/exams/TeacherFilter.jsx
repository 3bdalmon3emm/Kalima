import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { teacherMatches } from './FolderTeachersPanel';

// Picks one teacher (or all) by typing a name, email or phone, for lists
// that can hold many teachers. value is 'all' or the teacher's id as text.
export default function TeacherFilter({ teachers, value, onChange, className = 'w-60' }) {
    const { t } = useTranslation('exams');
    const [open, setOpen] = useState(false);
    const [term, setTerm] = useState('');
    const picked = teachers.find((u) => String(u.id) === value);
    const shown = teachers.filter((u) => teacherMatches(u, term));
    const choose = (next) => { onChange(next); setOpen(false); setTerm(''); };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={open} className={`justify-between font-normal ${className}`}>
                    <span className="truncate">{picked ? picked.name : t('results.allTeachers')}</span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
                {/* Our own matching (name, email, phone), so cmdk's filter is off. */}
                <Command shouldFilter={false}>
                    <CommandInput value={term} onValueChange={setTerm} placeholder={t('teachers.searchTeachers')} />
                    <CommandList>
                        <CommandEmpty>{t('search.none')}</CommandEmpty>
                        {!term.trim() && (
                            <CommandItem value="all" onSelect={() => choose('all')}>
                                <Check className={`h-4 w-4 ${value === 'all' ? 'opacity-100' : 'opacity-0'}`} />{t('results.allTeachers')}
                            </CommandItem>
                        )}
                        {shown.map((u) => (
                            <CommandItem key={u.id} value={String(u.id)} onSelect={() => choose(String(u.id))}>
                                <Check className={`h-4 w-4 ${value === String(u.id) ? 'opacity-100' : 'opacity-0'}`} />
                                <span className="min-w-0">
                                    <span className="block truncate">{u.name}</span>
                                    {(u.phone || u.email) && <span className="block truncate text-xs text-muted-foreground" dir="ltr">{u.phone || u.email}</span>}
                                </span>
                            </CommandItem>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
