import { AlertTriangle, Ban, Crown, Eye, ShieldAlert, ShieldCheck, Zap } from 'lucide-react';

// The account levels (users.flag), best first, each with its own color, so
// the level reads at a glance in the profile, the users list and orders.
export const ACCOUNT_LEVELS = [
    { value: 'ELITE', icon: Crown, tone: 'bg-amber-100 text-amber-800 border-amber-400 dark:bg-amber-950/50 dark:text-amber-300' },
    { value: 'PRO', icon: Zap, tone: 'bg-blue-100 text-blue-800 border-blue-400 dark:bg-blue-950/50 dark:text-blue-300' },
    { value: 'NORMAL', icon: ShieldCheck, tone: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300' },
    { value: 'OBSERVER', icon: Eye, tone: 'bg-orange-100 text-orange-800 border-orange-400 dark:bg-orange-950/50 dark:text-orange-300' },
    { value: 'Warned', icon: AlertTriangle, tone: 'bg-red-100 text-red-700 border-red-400 dark:bg-red-950/50 dark:text-red-300' },
    { value: 'SUSPICIOUS', icon: ShieldAlert, tone: 'bg-red-200 text-red-900 border-red-600 dark:bg-red-900/60 dark:text-red-200' },
    { value: 'BANNED', icon: Ban, tone: 'bg-red-800 text-white border-red-900 dark:bg-red-900 dark:text-red-50' },
];

export const levelOf = (value) => ACCOUNT_LEVELS.find((l) => l.value === value) || ACCOUNT_LEVELS[2];
