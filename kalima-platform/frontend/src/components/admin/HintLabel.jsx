import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// A column title or card label that explains itself: hovering (or tapping)
// shows what the number means. The dotted underline says there is more.
export default function HintLabel({ children, hint, className = '' }) {
    if (!hint) return children;
    return (
        <TooltipProvider delayDuration={150}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span tabIndex={0} className={`cursor-help underline decoration-dotted decoration-muted-foreground/60 underline-offset-4 outline-none ${className}`}>
                        {children}
                    </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs whitespace-normal text-start text-xs leading-relaxed normal-case">{hint}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
