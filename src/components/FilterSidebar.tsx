import { useAppStore } from '../lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Filter, SortAsc, SortDesc, Image as ImageIcon, Video, Layers, Calendar, HardDrive, Ruler, Clock, FileText } from 'lucide-react';
import { FilterOptions } from '../lib/types';
import { useShallow } from 'zustand/react/shallow';

const durationPresets = [
    { label: '5–20 sec', min: 5, max: 20 },
    { label: '30–45 sec', min: 30, max: 45 },
    { label: '45–90 sec', min: 45, max: 90 },
];

interface FilterSidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export function FilterSidebar({ isOpen, onClose }: FilterSidebarProps) {
    const { filters, setFilters } = useAppStore(useShallow((state) => ({
        filters: state.filters,
        setFilters: state.setFilters
    })));

    const durationRangeInvalid = filters.min_duration != null &&
        filters.max_duration != null &&
        filters.min_duration > filters.max_duration;

    const updateFilter = (newFilters: Partial<FilterOptions>) => {
        setFilters(newFilters);
    };

    return (
        <AnimatePresence initial={false}>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70]"
                    />

                    {/* Sidebar */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="theme-surface-context fixed top-0 right-0 h-full w-80 bg-xcroller-base border-l border-white/5 z-[80] shadow-2xl flex flex-col"
                    >
                        <div className="p-6 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Filter size={20} className="text-xcroller-accent-text" />
                                <h2 className="text-lg font-bold">Filters & Sort</h2>
                            </div>
                            <button
                                type="button"
                                aria-label="Close filters"
                                onClick={onClose}
                                className="p-2 hover:bg-white/5 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                                <X size={20} aria-hidden="true" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {/* Sort Section */}
                            <section className="space-y-4">
                                <h3 className="text-xs font-semibold text-xcroller-muted uppercase tracking-wider flex items-center gap-2">
                                    <Clock size={14} /> Sort Ordering
                                </h3>
                                <div className="grid grid-cols-1 gap-2">
                                    {[
                                        { id: 'created_at', label: 'Date Added', icon: Calendar },
                                        { id: 'filename', label: 'Filename', icon: FileText },
                                        { id: 'size_bytes', label: 'File Size', icon: HardDrive },
                                        { id: 'resolution', label: 'Resolution', icon: Ruler },
                                        { id: 'duration_sec', label: 'Duration', icon: Clock },
                                        { id: 'random', label: 'Random Shuffle', icon: Layers },
                                    ].map((option) => (
                                        <button
                                            key={option.id}
                                            onClick={() => updateFilter({ sort_by: option.id as any })}
                                            className={`flex items-center justify-between p-3 rounded-lg transition-colors border ${filters.sort_by === option.id
                                                ? 'bg-xcroller-red border-xcroller-red text-xcroller-on-accent'
                                                : 'bg-white/5 border-white/5 hover:bg-white/10 text-white/70'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <option.icon size={16} />
                                                <span className="text-sm">{option.label}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => updateFilter({ sort_order: 'asc' })}
                                        className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg border ${filters.sort_order === 'asc' ? 'bg-xcroller-red border-xcroller-red text-xcroller-on-accent' : 'bg-white/5 border-white/5'
                                            }`}
                                    >
                                        <SortAsc size={16} /> <span className="text-xs">Ascending</span>
                                    </button>
                                    <button
                                        onClick={() => updateFilter({ sort_order: 'desc' })}
                                        className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg border ${filters.sort_order === 'desc' ? 'bg-xcroller-red border-xcroller-red text-xcroller-on-accent' : 'bg-white/5 border-white/5'
                                            }`}
                                    >
                                        <SortDesc size={16} /> <span className="text-xs">Descending</span>
                                    </button>
                                </div>
                            </section>

                            {/* Media Type Section */}
                            <section className="space-y-4">
                                <h3 className="text-xs font-semibold text-xcroller-muted uppercase tracking-wider flex items-center gap-2">
                                    <Layers size={14} /> Media Type
                                </h3>
                                <div className="flex bg-black/40 p-1 rounded-xl">
                                    {[
                                        { id: 'all', label: 'All', icon: Layers },
                                        { id: 'image', label: 'Images', icon: ImageIcon },
                                        { id: 'video', label: 'Videos', icon: Video },
                                    ].map((type) => (
                                        <button
                                            key={type.id}
                                            onClick={() => updateFilter({ media_type: type.id as any })}
                                            className={`flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-lg transition-colors ${filters.media_type === type.id ? 'bg-xcroller-red text-xcroller-on-accent shadow-lg' : 'text-white/50 hover:text-white'
                                                }`}
                                        >
                                            <type.icon size={16} />
                                            <span className="text-[10px] uppercase font-bold tracking-tight">{type.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </section>

                            {/* Orientation Section */}
                            <section className="space-y-4">
                                <h3 className="text-xs font-semibold text-xcroller-muted uppercase tracking-wider flex items-center gap-2">
                                    <Ruler size={14} /> Orientation
                                </h3>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { id: 'all', label: 'Any' },
                                        { id: 'horizontal', label: 'Horizontal' },
                                        { id: 'vertical', label: 'Vertical' },
                                        { id: 'square', label: 'Square' },
                                    ].map((o) => (
                                        <button
                                            key={o.id}
                                            onClick={() => updateFilter({ orientation: o.id as any })}
                                            className={`px-3 py-2 rounded-lg text-xs border transition-colors ${filters.orientation === o.id ? 'bg-xcroller-red border-xcroller-red text-xcroller-on-accent' : 'bg-white/5 border-white/5 hover:bg-white/10 text-white/60'
                                                }`}
                                        >
                                            {o.label}
                                        </button>
                                    ))}
                                </div>
                            </section>

                            {/* Duration range (videos) */}
                            {filters.media_type !== 'image' && (
                                <section className="space-y-4">
                                    <h3 className="text-xs font-semibold text-xcroller-muted uppercase tracking-wider flex items-center gap-2">
                                        <Clock size={14} /> Video duration
                                    </h3>

                                    <div className="grid grid-cols-2 gap-2">
                                        {durationPresets.map((preset) => {
                                            const isSelected = filters.min_duration === preset.min &&
                                                filters.max_duration === preset.max;
                                            return (
                                                <button
                                                    key={preset.label}
                                                    type="button"
                                                    aria-pressed={isSelected}
                                                    onClick={() => updateFilter({
                                                        media_type: 'video',
                                                        min_duration: preset.min,
                                                        max_duration: preset.max
                                                    })}
                                                    className={`px-3 py-2 rounded-lg text-xs border transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${isSelected
                                                        ? 'bg-xcroller-red border-xcroller-red text-xcroller-on-accent'
                                                        : 'bg-white/5 border-white/5 hover:bg-white/10 text-white/70'
                                                        }`}
                                                >
                                                    {preset.label}
                                                </button>
                                            );
                                        })}
                                        <button
                                            type="button"
                                            aria-pressed={filters.min_duration == null && filters.max_duration == null}
                                            onClick={() => updateFilter({
                                                min_duration: undefined,
                                                max_duration: undefined
                                            })}
                                            className={`px-3 py-2 rounded-lg text-xs border transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${filters.min_duration == null && filters.max_duration == null
                                                ? 'bg-xcroller-red border-xcroller-red text-xcroller-on-accent'
                                                : 'bg-white/5 border-white/5 hover:bg-white/10 text-white/70'
                                                }`}
                                        >
                                            Any duration
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label htmlFor="min-video-duration" className="text-[10px] text-xcroller-muted ml-1">
                                                Minimum seconds
                                            </label>
                                            <input
                                                id="min-video-duration"
                                                name="min-video-duration"
                                                type="number"
                                                min="0"
                                                step="1"
                                                inputMode="numeric"
                                                placeholder="5"
                                                value={filters.min_duration ?? ''}
                                                aria-invalid={durationRangeInvalid}
                                                aria-describedby={durationRangeInvalid ? 'duration-range-error' : undefined}
                                                onChange={(event) => updateFilter({
                                                    media_type: 'video',
                                                    min_duration: event.target.value
                                                        ? Math.max(0, Number(event.target.value))
                                                        : undefined
                                                })}
                                                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus-visible:border-xcroller-red focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label htmlFor="max-video-duration" className="text-[10px] text-xcroller-muted ml-1">
                                                Maximum seconds
                                            </label>
                                            <input
                                                id="max-video-duration"
                                                name="max-video-duration"
                                                type="number"
                                                min="0"
                                                step="1"
                                                inputMode="numeric"
                                                placeholder="20"
                                                value={filters.max_duration ?? ''}
                                                aria-invalid={durationRangeInvalid}
                                                aria-describedby={durationRangeInvalid ? 'duration-range-error' : undefined}
                                                onChange={(event) => updateFilter({
                                                    media_type: 'video',
                                                    max_duration: event.target.value
                                                        ? Math.max(0, Number(event.target.value))
                                                        : undefined
                                                })}
                                                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus-visible:border-xcroller-red focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                                            />
                                        </div>
                                    </div>

                                    <p
                                        id="duration-range-error"
                                        className={`text-xs text-xcroller-danger ${durationRangeInvalid ? 'block' : 'sr-only'}`}
                                        aria-live="polite"
                                    >
                                        {durationRangeInvalid
                                            ? 'Set the maximum duration to at least the minimum.'
                                            : ''}
                                    </p>
                                </section>
                            )}

                            {/* Reset Button */}
                            <button
                                onClick={() => setFilters({
                                    media_type: 'all',
                                    orientation: 'all',
                                    sort_by: 'created_at',
                                    sort_order: 'desc',
                                    min_duration: undefined,
                                    max_duration: undefined,
                                    min_width: undefined,
                                    min_height: undefined,
                                    min_size: undefined,
                                    max_size: undefined,
                                })}
                                className="w-full py-4 text-xs font-bold text-xcroller-muted hover:text-xcroller-accent-text transition-colors border-t border-white/5"
                            >
                                RESET ALL FILTERS
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
