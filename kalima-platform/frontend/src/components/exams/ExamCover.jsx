import { useTranslation } from 'react-i18next';
import { UserRound } from 'lucide-react';

// The top of an exam link: the teacher's cover photo (a plain gradient when
// there is none), their photo and name. The admin test link has no teacher.
export default function ExamCover({ teacher, className = 'h-40 sm:h-56 sm:rounded-b-2xl' }) {
    const { t } = useTranslation('exams');
    return (
        <div className="relative mb-12">
            {teacher?.cover_url
                ? <img src={teacher.cover_url} alt="" className={`w-full object-cover ${className}`} />
                : <div className={`bg-gradient-to-l from-primary/80 via-primary/60 to-primary/30 ${className}`} />}
            <div className="absolute -bottom-12 start-6 flex items-end gap-4">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-muted shadow">
                    {teacher?.profile_pic_url
                        ? <img src={teacher.profile_pic_url} alt="" className="h-full w-full object-cover" />
                        : <UserRound className="h-12 w-12 text-muted-foreground" />}
                </div>
                <p className="mb-2 rounded bg-background/70 px-2 text-lg font-semibold backdrop-blur-sm">{teacher?.name || t('start.testLink')}</p>
            </div>
        </div>
    );
}
