import { AnimatePresence, motion } from 'framer-motion';
import { LoaderCircle } from 'lucide-react';
import { useAppStore } from '../lib/store';

export function ActivityIndicator() {
    const activity = useAppStore(state => state.activity);

    return (
        <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="pointer-events-none fixed left-1/2 top-20 z-[90] min-h-10 -translate-x-1/2"
        >
            <AnimatePresence initial={false}>
                {activity && (
                    <motion.div
                        key={activity.id}
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
                        className="theme-surface-context flex items-center gap-2.5 rounded-full bg-xcroller-surface/95 px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_35px_rgba(0,0,0,0.45)] outline outline-1 outline-white/10 backdrop-blur-xl"
                    >
                        <LoaderCircle
                            size={16}
                            strokeWidth={2}
                            aria-hidden="true"
                            className="shrink-0 text-xcroller-accent-text motion-safe:animate-spin"
                        />
                        <span className="max-w-[min(70vw,32rem)] truncate">{activity.message}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
