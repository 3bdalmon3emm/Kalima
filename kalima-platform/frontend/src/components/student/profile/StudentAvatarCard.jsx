import { levelTitle } from "@/lib/levelUtils";
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Loader2, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { getImageUrl } from '@/lib/storeUtils';

export default function StudentAvatarCard({ profile, uploadAvatar, fetchProfile }) {
    const { t } = useTranslation('student');
    const avatarInputRef = useRef(null);
    const [avatarUploading, setAvatarUploading] = useState(false);

    const handleAvatarChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setAvatarUploading(true);
        try {
            await uploadAvatar(file, () => { });
            await fetchProfile();
        } finally {
            setAvatarUploading(false);
        }
    };

    const student = profile?.students;

    return (
        <Card className="relative overflow-hidden border-primary/10 shadow-sm">
            <div className="pointer-events-none absolute inset-y-0 end-0 w-1/2 bg-linear-to-l from-primary/10 via-primary/5 to-transparent" />
            <CardContent className="relative p-4 sm:p-5">
                <div className="flex items-center gap-4">
                    <div className="relative shrink-0 rounded-2xl bg-primary/10 p-1.5 ring-1 ring-primary/15">
                        <Avatar className="h-16 w-16 border-2 border-background shadow-sm sm:h-[4.5rem] sm:w-[4.5rem]">
                            <AvatarImage src={getImageUrl(profile?.profile_pic_url)} alt={profile?.name} className="object-cover" />
                            <AvatarFallback className="bg-background text-primary text-xl font-bold uppercase">
                                {profile?.name?.trim().charAt(0) || 'S'}
                            </AvatarFallback>
                        </Avatar>
                        <button
                            onClick={() => avatarInputRef.current?.click()}
                            disabled={avatarUploading}
                            className="absolute -bottom-1 -end-1 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow border-2 border-background hover:bg-primary/90 transition-colors"
                            data-testid="student-upload-avatar-button"
                        >
                            {avatarUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                        </button>
                        <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleAvatarChange}
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 className="min-w-0 text-lg font-semibold leading-tight tracking-tight sm:text-xl">{profile?.name}</h2>
                        <p className="mt-1 max-w-full break-words text-sm leading-snug text-muted-foreground sm:truncate">{profile?.email}</p>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            {student?.levels?.title && (
                                <Badge variant="secondary">{levelTitle(student.levels)}</Badge>
                            )}
                            {student?.graduated && (
                                <Badge>{t('promotion.graduate')}</Badge>
                            )}

                            {/* Student ID with tooltip */}
                            {profile?.id && (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div
                                                className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 border border-border rounded-md px-2 py-0.5 cursor-help select-all"
                                                data-testid="student-profile-id-badge"
                                            >
                                                <span className="font-mono font-semibold">ID: {profile.id}</span>
                                                <Info className="h-3 w-3 shrink-0" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="max-w-[220px] text-center">
                                            {t('profile.idTooltip', 'Share this ID with your parent so they can link your account in the Parent Portal.')}
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
