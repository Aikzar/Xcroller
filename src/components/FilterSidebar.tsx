import { useAppStore } from '../lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Filter, SortAsc, SortDesc, Image as ImageIcon, Video, Layers, Calendar, HardDrive, Ruler, Clock, FileText } from 'lucide-react';
import { FilterOptions } from '../lib/types';

interface FilterSidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export function FilterSidebar({ isOpen, onClose }: FilterSidebarProps) {
    const { filters, setFilters } = useAppStore();

    const updateFilter = (newFilters: Partial<FilterOptions>) => {
        setFilters(newFilters);
    };

    return (
        <AnimatePresence>
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
                        className="fixed top-0 right-0 h-full w-80 bg-xcroller-base border-l border-white/5 z-[80] shadow-2xl flex flex-col"
                    >
                        <div className="p-6 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Filter size={20} className="text-xcroller-red" />
                                <h2 className="text-lg font-bold">Filters & Sort</h2>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                                <X size={20} />
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
                                            className={`flex items-center justify-between p-3 rounded-lg transition-all border ${filters.sort_by === option.id
                                                ? 'bg-xcroller-red border-xcroller-red text-white'
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
                                        className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg border ${filters.sort_order === 'asc' ? 'bg-xcroller-red border-xcroller-red' : 'bg-white/5 border-white/5'
                                            }`}
                                    >
                                        <SortAsc size={16} /> <span className="text-xs">Ascending</span>
                                    </button>
                                    <button
                                        onClick={() => updateFilter({ sort_order: 'desc' })}
                                        className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg border ${filters.sort_order === 'desc' ? 'bg-xcroller-red border-xcroller-red' : 'bg-white/5 border-white/5'
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
                                            className={`flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-lg transition-all ${filters.media_type === type.id ? 'bg-xcroller-red text-white shadow-lg' : 'text-white/50 hover:text-white'
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
                                            className={`px-3 py-2 rounded-lg text-xs border transition-all ${filters.orientation === o.id ? 'bg-xcroller-red border-xcroller-red text-white' : 'bg-white/5 border-white/5 hover:bg-white/10 text-white/60'
                                                }`}
                                        >
                                            {o.label}
                                        </button>
                                    ))}
                                </div>
                            </section>

                            {/* Duration Constraints (Videos) */}
                            {filters.media_type !== 'image' && (
                                <section className="space-y-4">
                                    <h3 className="text-xs font-semibold text-xcroller-muted uppercase tracking-wider flex items-center gap-2">
                                        <Clock size={14} /> Duration (Seconds)
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-xcroller-muted ml-1">Min</label>
                                            <input
                                                type="number"
                                                placeholder="0s"
                                                value={filters.min_duration || ''}
                                                onChange={(e) => updateFilter({ min_duration: e.target.value ? parseFloat(e.target.value) : undefined })}
                                                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:border-xcroller-red outline-none"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-xcroller-muted ml-1">Max</label>
                                            <input
                                                type="number"
                                                placeholder="Inf"
                                                value={filters.max_duration || ''}
                                                onChange={(e) => updateFilter({ max_duration: e.target.value ? parseFloat(e.target.value) : undefined })}
                                                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm focus:border-xcroller-red outline-none"
                                            />
                                        </div>
                                    </div>
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
                                className="w-full py-4 text-xs font-bold text-xcroller-muted hover:text-xcroller-red transition-colors border-t border-white/5"
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
