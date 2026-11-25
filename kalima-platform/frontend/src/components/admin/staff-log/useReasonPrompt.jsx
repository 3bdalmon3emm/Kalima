import { useCallback, useRef, useState } from 'react';
import ReasonDialog from './ReasonDialog';

// Asks for a reason from inside an async handler:
//   const [askReason, reasonDialog] = useReasonPrompt();
//   const reason = await askReason({ title }); if (reason === null) return;
// Render reasonDialog once in the component.
export default function useReasonPrompt() {
    const [options, setOptions] = useState(null);
    const resolver = useRef(null);

    const ask = useCallback((opts = {}) => new Promise((resolve) => {
        resolver.current = resolve;
        setOptions(opts);
    }), []);

    const finish = (value) => {
        resolver.current?.(value);
        resolver.current = null;
        setOptions(null);
    };

    const element = (
        <ReasonDialog
            open={!!options}
            onOpenChange={(o) => !o && finish(null)}
            title={options?.title}
            description={options?.description}
            destructive={options?.destructive}
            onConfirm={(reason) => { finish(reason); return true; }}
        />
    );
    return [ask, element];
}

// Cancelling or rejecting an e-booklet order stands for deleting it and needs
// a reason. Returns undefined when no reason is needed, null when cancelled.
export const CLOSING_STATUSES = ['cancelled', 'rejected'];
export function askClosingReason(ask, tLog, currentStatus, nextStatus) {
    if (!CLOSING_STATUSES.includes(nextStatus) || currentStatus === nextStatus) return Promise.resolve(undefined);
    return ask({ title: tLog('ebookletDialog.title', { status: tLog(`action.${nextStatus}`) }), destructive: true });
}
