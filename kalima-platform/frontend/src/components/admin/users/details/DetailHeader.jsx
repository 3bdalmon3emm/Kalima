import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Edit3, Save, X, Trash2, CheckCircle2, XCircle, Mail, Phone, Crown, Zap, ShieldCheck, Eye, AlertTriangle, ChevronDown, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { useTranslation } from 'react-i18next';
import { extractImageColors } from '@/lib/imageColors';
import SendNotificationModal from '@/components/admin/notifications/SendNotificationModal';
import { Bell } from 'lucide-react';


export default function DetailHeader({
    user,
    isEditing,
    onEdit,
    onCancel,
    onSave,
    onApprove,
    onReject,
    onDelete,
    onUpdateFlag,
    onResetPassword,
    actionLoading,
    canResetPassword,
    canManage = true,
    canEdit = true,
    isRtl,
    t
}) {
    const { i18n } = useTranslation();
    const [bannerColors, setBannerColors] = useState(null);
    const [isNotifModalOpen, setIsNotifModalOpen] = useState(false);
    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
    const [password, setPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');
    const [passwordError, setPasswordError] = useState('');


    useEffect(() => {
        if (user?.profile_pic_url) {
            extractImageColors(user.profile_pic_url).then(colors => {
                if (colors) setBannerColors(colors);
            });
        }
    }, [user?.profile_pic_url]);

    const getFlagConfig = (flag) => {
        const f = flag || 'NORMAL';
        if (f === 'ELITE') return { icon: Crown, color: 'bg-amber-500/10 text-amber-600 border-amber-500/20 shadow-amber-500/5' };
        if (f === 'PRO') return { icon: Zap, color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20 shadow-indigo-500/5' };
        if (f === 'OBSERVER') return { icon: Eye, color: 'bg-slate-500/10 text-slate-600 border-slate-500/20' };
        if (f === 'Warned') return { icon: AlertTriangle, color: 'bg-red-500/10 text-red-600 border-red-500/20 animate-pulse' };
        return { icon: ShieldCheck, color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' };
    };

    const flagConfig = getFlagConfig(user.flag);
    const FlagIcon = flagConfig.icon;

    const handlePasswordSubmit = async (event) => {
        event.preventDefault();
        if (password.length < 8) {
            setPasswordError(t('details.passwordMinLength'));
            return;
        }
        if (password !== passwordConfirmation) {
            setPasswordError(t('createDialog.passwordMismatch'));
            return;
        }

        const result = await onResetPassword(password);
        if (result?.success) {
            setPassword('');
            setPasswordConfirmation('');
            setPasswordError('');
            setIsPasswordDialogOpen(false);
        }
    };

    return (
        <div className="sticky top-0 z-20 -mx-4 md:-mx-8 border-b bg-background/80 backdrop-blur-xl overflow-hidden transition-all duration-300">
            {/* Elegant Cover Photo Banner */}
            <div className={`h-32 md:h-40 w-full relative overflow-hidden transition-all duration-1000 ${!bannerColors ? 'bg-linear-to-br from-primary/20 via-primary/5 to-background' : 'bg-background/50'}`}>

                {/* Dynamic YouTube-like Ambient Glow */}
                {bannerColors && (
                    <>
                        <div
                            className="absolute inset-0 opacity-80 mix-blend-screen dark:mix-blend-lighten"
                            style={{
                                backgroundImage: `radial-gradient(circle at 20% -20%, rgba(${bannerColors.vibrantRGB}, 0.85) 0%, rgba(${bannerColors.dominantRGB}, 0) 75%)`
                            }}
                        />
                        <div
                            className="absolute inset-0 opacity-60 mix-blend-multiply dark:mix-blend-screen"
                            style={{
                                backgroundImage: `radial-gradient(circle at 85% 120%, rgba(${bannerColors.dominantRGB}, 0.6) 0%, rgba(${bannerColors.vibrantRGB}, 0) 70%)`
                            }}
                        />
                        <div className="absolute inset-0 bg-background/20 backdrop-blur-[60px]" />
                        <div className="absolute inset-0 bg-linear-to-b from-transparent via-background/10 to-background" />
                    </>
                )}

                {/* Decorative Elements Fallback */}
                {!bannerColors && (
                    <>
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -mr-20 -mt-20 animate-pulse" />
                        <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/5 rounded-full blur-2xl -ml-10 -mb-10" />
                    </>
                )}

                {/* Back Button Over Banner */}
                <div className="absolute top-4 start-4 z-10">
                    <Button variant="secondary" size="icon" asChild className="h-9 w-9 rounded-full bg-background/50 backdrop-blur-md border-none shadow-sm hover:bg-background/80 transition-all">
                        <Link to="/admin/users">
                            <ChevronLeft className="h-5 w-5" />
                        </Link>
                    </Button>
                </div>
            </div>

            <div className="px-4 md:px-8 pb-4 pt-0">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 -mt-10 md:-mt-12 relative z-10">
                    <div className="flex flex-col md:flex-row md:items-end gap-4 min-w-0">
                        <div className="relative shrink-0">
                            <Avatar className="h-24 w-24 md:h-32 md:w-32 border-4 border-background ring-1 ring-primary/10 shadow-xl transition-transform hover:scale-105 duration-300">
                                <AvatarImage src={user.profile_pic_url} alt={user.name} className="object-cover" />
                                <AvatarFallback className="bg-primary/10 text-primary font-bold text-3xl">
                                    {user.name?.charAt(0) || 'U'}
                                </AvatarFallback>
                            </Avatar>
                            {!user.is_deleted && user.confirmed && (
                                <div className="absolute bottom-2 right-2 bg-success text-white rounded-full p-1 border-2 border-background shadow-lg">
                                    <CheckCircle2 className={`h-4 w-4 ${i18n.language === 'ar' ? 'scale-x-[-1]' : ''}`} />
                                </div>
                            )}
                        </div>

                        <div className="min-w-0 md:pb-2">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                <h1 className="text-3xl font-extrabold tracking-tight truncate max-w-[200px] md:max-w-md lg:max-w-lg">
                                    {user.name}
                                </h1>
                                {user.is_deleted ? (
                                    <Badge variant="destructive" className="uppercase text-[10px] tracking-widest font-black h-5">
                                        {t('status.deleted')}
                                    </Badge>
                                ) : user.confirmed ? (
                                    <Badge className="bg-success/20 text-success border-success/30 uppercase text-[10px] tracking-widest font-black h-5">
                                        {t('status.verified')}
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="uppercase text-[10px] tracking-widest font-black h-5">
                                        {t('status.pending')}
                                    </Badge>
                                )}

                                <DropdownMenu dir={i18n.dir()}>
                                    <DropdownMenuTrigger className="focus:outline-none">
                                        <Badge variant="outline" className={`h-5 gap-1 px-2 border-dashed uppercase text-[10px] tracking-widest font-black cursor-pointer hover:opacity-80 transition-opacity ${flagConfig.color}`}>
                                            <FlagIcon className={`${i18n.language === 'ar' ? 'scale-x-[-1]' : ''} h-3 w-3`} />
                                            {t(`details.flags.${user.flag || 'NORMAL'}`, user.flag || 'NORMAL')}
                                            <ChevronDown className="h-3 w-3 opacity-50 ms-0.5" />
                                        </Badge>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align={i18n.dir() === 'rtl' ? 'end' : 'start'}>
                                        {['ELITE', 'PRO', 'NORMAL', 'OBSERVER', 'Warned'].map(flagOption => (
                                            <DropdownMenuItem
                                                key={flagOption}
                                                onClick={() => onUpdateFlag && onUpdateFlag(flagOption)}
                                                className={`cursor-pointer ${user.flag === flagOption ? 'bg-primary/10 font-bold' : ''}`}
                                            >
                                                {t(`details.flags.${flagOption}`, flagOption)}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground font-medium">
                                <div className="flex items-center gap-1.5">
                                    <Mail className="h-4 w-4 text-primary/60" />
                                    <span className="truncate">{user.email}</span>
                                </div>
                                {user.phone && (
                                    <div className="hidden sm:flex items-center gap-1.5 border-s ps-3 border-border/50">
                                        <Phone className="h-4 w-4 text-primary/60" />
                                        <span dir="ltr">{user.phone}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {isEditing ? (
                            <>
                                <Button variant="outline" size="sm" onClick={onCancel} disabled={actionLoading}>
                                    <X className="h-4 w-4 me-2" />
                                    {t('actions.cancel')}
                                </Button>
                                <Button size="sm" onClick={onSave} disabled={actionLoading}>
                                    {actionLoading ? <LoadingSpinner className="h-4 w-4 me-2" /> : <Save className="h-4 w-4 me-2" />}
                                    {t('actions.save')}
                                </Button>
                            </>
                        ) : (
                            <>
                                {!user.is_deleted && !user.confirmed && canManage && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-success hover:text-success hover:bg-success/10 border-success/30"
                                        onClick={onApprove}
                                        disabled={actionLoading}
                                    >
                                        <CheckCircle2 className={`h-4 w-4 me-2 ${i18n.dir() === 'rtl' ? 'scale-x-[-1]' : ''}`} />
                                        {t('actions.approve')}
                                    </Button>
                                )}
                                {!user.is_deleted && user.confirmed && canManage && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-warning hover:text-warning hover:bg-warning/10 border-warning/30"
                                        onClick={onReject}
                                        disabled={actionLoading}
                                    >
                                        <XCircle className="h-4 w-4 me-2" />
                                        {t('actions.reject')}
                                    </Button>
                                )}
                                {canEdit && (
                                    <Button size="sm" onClick={onEdit}>
                                        <Edit3 className="h-4 w-4 me-2" />
                                        {t('actions.edit')}
                                    </Button>
                                )}
                                {canResetPassword && !user.is_deleted && (
                                    <Button variant="outline" size="sm" onClick={() => setIsPasswordDialogOpen(true)}>
                                        <KeyRound className="h-4 w-4 me-2" />
                                        {t('actions.changePassword')}
                                    </Button>
                                )}
                                {!user.is_deleted && canManage && (
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 border-destructive/30">
                                                <Trash2 className="h-4 w-4 me-2" />
                                                {t('actions.delete')}
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>{t('details.confirmDeleteTitle')}</AlertDialogTitle>
                                                <AlertDialogDescription>{t('details.confirmDeleteDesc')}</AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
                                                <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                    {t('actions.delete')}
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                )}
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="bg-primary/5 text-primary border-primary/20 hover:bg-primary/10"
                                    onClick={() => setIsNotifModalOpen(true)}
                                >
                                    <Bell className="h-4 w-4 me-2" />
                                    {t('notifications:admin.send_notification', 'Send Notification')}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <SendNotificationModal 
                open={isNotifModalOpen} 
                onOpenChange={setIsNotifModalOpen}
                userId={user.id}
            />
            <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
                <DialogContent>
                    <form onSubmit={handlePasswordSubmit} className="space-y-4">
                        <DialogHeader>
                            <DialogTitle>{t('details.changePasswordTitle')}</DialogTitle>
                            <DialogDescription>{t('details.changePasswordDescription', { name: user.name })}</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2">
                            <label htmlFor="admin-password" className="text-sm font-medium">{t('details.newPassword')}</label>
                            <input
                                id="admin-password"
                                type="password"
                                autoComplete="new-password"
                                value={password}
                                onChange={(event) => { setPassword(event.target.value); setPasswordError(''); }}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="admin-password-confirmation" className="text-sm font-medium">{t('details.confirmNewPassword')}</label>
                            <input
                                id="admin-password-confirmation"
                                type="password"
                                autoComplete="new-password"
                                value={passwordConfirmation}
                                onChange={(event) => { setPasswordConfirmation(event.target.value); setPasswordError(''); }}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                required
                            />
                        </div>
                        {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsPasswordDialogOpen(false)} disabled={actionLoading}>
                                {t('actions.cancel')}
                            </Button>
                            <Button type="submit" disabled={actionLoading}>
                                {actionLoading && <LoadingSpinner className="h-4 w-4 me-2" />}
                                {t('actions.changePassword')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>

    );
}
