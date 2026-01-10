import { useState, useEffect } from 'react';
import { useAppStore } from '../lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus, Grid3X3, FolderPlus, Play, Pause, Settings, Volume2, Maximize, Minimize, Filter, RefreshCcw, Star, Download, Trash2 } from 'lucide-react';
import { open, message, ask } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { SettingsModal } from './SettingsModal';
import { FilterSidebar } from './FilterSidebar';

export function Toolbar() {
    const {
        columns,
        setColumns,
        addFolder,
        isAutoScrolling,
        toggleAutoScroll,
        // setIsAutoScrolling, // Unused
        isHoverPaused,
        // setIsHoverPaused, // Unused
        hoverVolume,
        setHoverVolume,
        isFullscreen,
        setIsFullscreen,
        feeds,
        activeFeedId,
        setActiveFeed,
        fetchMedia,
        loadFolders,
        exportFavorites,
        clearFavorites
    } = useAppStore();
    const [isVisible, setIsVisible] = useState(true);
    const [lastScrollY, setLastScrollY] = useState(0);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // Sync fullscreen state with window events (e.g. Esc key)
    useEffect(() => {
        const win = getCurrentWindow();
        const unlisten = win.onResized(async () => {
            const current = await win.isFullscreen();
            if (current !== isFullscreen) {
                setIsFullscreen(current);
            }
        });
        return () => {
            unlisten.then(u => u());
        };
    }, [isFullscreen, setIsFullscreen]);

    // Global Esc handler for exiting fullscreen
    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                const win = getCurrentWindow();
                const isFull = await win.isFullscreen();
                if (isFull) {
                    await win.setFullscreen(false);
                    setIsFullscreen(false);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setIsFullscreen]);

    const handleToggleFullscreen = async () => {
        const win = getCurrentWindow();
        const next = !isFullscreen;
        await win.setFullscreen(next);
        setIsFullscreen(next);
    };

    const handleAddFolder = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: "Select Core Media Folder"
            });

            if (selected && typeof selected === 'string') {
                await addFolder(selected);
            }
        } catch (err) {
            console.error("Failed to select folder", err);
        }
    };

    useEffect(() => {
        const gridElement = document.getElementById('media-scroll-container');
        if (!gridElement) return;

        const handleScroll = () => {
            const currentScrollY = gridElement.scrollTop;
            if (currentScrollY < 100 || currentScrollY < lastScrollY) {
                setIsVisible(true);
            } else {
                setIsVisible(false);
            }
            setLastScrollY(currentScrollY);
        };

        gridElement.addEventListener('scroll', handleScroll, { passive: true });
        return () => gridElement.removeEventListener('scroll', handleScroll);
    }, [lastScrollY, isAutoScrolling]);

    // Show when mouse is near top
    const handleMouseMove = (e: MouseEvent) => {
        if (e.clientY < 60) {
            setIsVisible(true);
        }
    };

    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    // Space key toggle
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' && !document.querySelector('input:focus')) {
                e.preventDefault();
                toggleAutoScroll();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggleAutoScroll]);

    const handleExportFavorites = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: "Select Export Folder"
            });

            if (selected && typeof selected === 'string') {
                const count = await exportFavorites(selected);
                await message(`Successfully exported ${count} favorites to ${selected}`, { title: 'Export Complete', kind: 'info' });
            }
        } catch (err) {
            console.error(err);
            await message('Failed to export favorites', { title: 'Error', kind: 'error' });
        }
    };

    const handleClearFavorites = async () => {
        const confirmed = await ask('Are you sure you want to clear all favorites? This cannot be undone.', {
            title: 'Clear Favorites',
            kind: 'warning'
        });

        if (confirmed) {
            await clearFavorites();
        }
    };

    return (
        <>
            <AnimatePresence>
                {(isVisible && !isAutoScrolling) && (
                    <motion.div
                        data-tauri-drag-region
                        initial={{ y: -100 }}
                        animate={{ y: 0 }}
                        exit={{ y: -100 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="fixed top-0 left-0 right-0 h-16 bg-xcroller-base/95 backdrop-blur-xl border-b border-white/5 z-[60] flex items-center px-6 justify-between shadow-2xl"
                    >
                        <div className="flex items-center gap-4">
                            <button
                                onClick={handleAddFolder}
                                className="p-2 hover:bg-white/5 rounded-full transition-all text-xcroller-text/80 hover:text-white"
                                title="Add Folder"
                            >
                                <FolderPlus size={20} />
                            </button>

                            <button
                                onClick={async () => {
                                    await loadFolders();
                                    await fetchMedia(true);
                                }}
                                className="p-2 hover:bg-white/5 rounded-full transition-all text-xcroller-text/80 hover:text-white"
                                title="Refresh Media"
                            >
                                <RefreshCcw size={20} />
                            </button>
                        </div>

                        {/* Feed Switcher */}
                        <div className="flex items-center gap-1 bg-black/20 p-1 rounded-xl border border-white/5 max-w-md overflow-x-auto no-scrollbar">
                            <button
                                onClick={() => setActiveFeed('home')}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${activeFeedId === 'home' ? 'bg-xcroller-red text-white shadow-lg' : 'text-xcroller-muted hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                HOME FEED
                            </button>
                            <button
                                onClick={() => setActiveFeed('favorites')}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1 ${activeFeedId === 'favorites' ? 'bg-xcroller-red text-white shadow-lg' : 'text-xcroller-muted hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <Star size={12} className={activeFeedId === 'favorites' ? 'fill-current' : ''} />
                                FAVORITES
                            </button>
                            {feeds.map(feed => (
                                <button
                                    key={feed.id}
                                    onClick={() => setActiveFeed(feed.id!)}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${activeFeedId === feed.id ? 'bg-xcroller-red text-white shadow-lg' : 'text-xcroller-muted hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    {feed.name}
                                </button>
                            ))}
                        </div>

                        {/* Favorites Actions */}
                        <div className="flex items-center">
                            {activeFeedId === 'favorites' && (
                                <div className="flex items-center gap-2 bg-xcroller-red/20 border border-xcroller-red/30 rounded-full px-2 py-1 mr-4">
                                    <button
                                        onClick={handleExportFavorites}
                                        className="p-1.5 hover:bg-xcroller-red hover:text-white rounded-full transition-all text-xcroller-red"
                                        title="Export Favorites"
                                    >
                                        <Download size={16} />
                                    </button>
                                    <div className="w-px h-4 bg-xcroller-red/30" />
                                    <button
                                        onClick={handleClearFavorites}
                                        className="p-1.5 hover:bg-xcroller-red hover:text-white rounded-full transition-all text-xcroller-red"
                                        title="Clear All Favorites"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-6">
                            {/* Hover Volume Control */}
                            <div className="flex items-center gap-3 bg-white/5 rounded-full px-4 py-1.5 border border-white/5 transition-colors hover:bg-white/10 group">
                                <Volume2 size={16} className="text-xcroller-muted group-hover:text-white transition-colors" />
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={hoverVolume}
                                    onChange={(e) => setHoverVolume(parseFloat(e.target.value))}
                                    className="w-24 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-xcroller-red"
                                    title="Hover Preview Volume"
                                />
                            </div>

                            {/* Grid Controls */}
                            <div className="flex items-center gap-2 bg-white/5 rounded-full px-3 py-1.5 border border-white/5">
                                <Grid3X3 size={16} className="text-xcroller-muted mr-1 pointer-events-none" />
                                <button
                                    onClick={() => setColumns(Math.max(1, columns - 1))}
                                    className="p-1 hover:text-white text-xcroller-muted transition-colors"
                                >
                                    <Minus size={14} />
                                </button>
                                <span className="text-sm font-medium w-4 text-center pointer-events-none">{columns}</span>
                                <button
                                    onClick={() => setColumns(Math.min(15, columns + 1))}
                                    className="p-1 hover:text-white text-xcroller-muted transition-colors"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>

                            <button
                                onClick={toggleAutoScroll}
                                className={`p-2.5 rounded-full transition-all shadow-lg relative ${isAutoScrolling
                                    ? (isHoverPaused ? 'bg-yellow-500 text-black scale-110' : 'bg-xcroller-red text-white scale-110')
                                    : 'bg-white/5 text-xcroller-text/80 hover:text-white hover:bg-white/10'
                                    }`}
                                title="Toggle Auto-Scroll (S / Space)"
                            >
                                {isAutoScrolling ? (
                                    isHoverPaused ? (
                                        <div className="flex items-center justify-center">
                                            <Pause size={20} />
                                            <span className="absolute -bottom-6 text-[10px] font-bold text-yellow-500 uppercase">PAUSED</span>
                                        </div>
                                    ) : (
                                        <div className="w-5 h-5 bg-white rounded-sm" />
                                    )
                                ) : (
                                    <Play size={20} className="ml-0.5" />
                                )}
                            </button>

                            <button
                                onClick={() => setIsFilterOpen(true)}
                                className={`p-2.5 rounded-full transition-all ${isFilterOpen ? 'bg-xcroller-red text-white' : 'bg-white/5 text-xcroller-text/80 hover:text-white hover:bg-white/10'}`}
                                title="Filters & Sorting"
                            >
                                <Filter size={20} />
                            </button>

                            <button
                                onClick={handleToggleFullscreen}
                                className="p-2.5 bg-white/5 rounded-full transition-all text-xcroller-text/80 hover:text-white hover:bg-white/10"
                                title="Toggle Fullscreen"
                            >
                                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                            </button>

                            <button
                                onClick={() => setIsSettingsOpen(true)}
                                className="p-2 hover:bg-white/5 rounded-full transition-colors text-xcroller-text/80 hover:text-white"
                            >
                                <Settings size={20} />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Minimal Autoscroll UI */}
            <AnimatePresence>
                {isAutoScrolling && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: -20 }}
                        className="fixed top-6 right-6 z-[70]"
                    >
                        <button
                            onClick={toggleAutoScroll}
                            className={`w-14 h-14 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.5)] flex items-center justify-center transition-transform hover:scale-105 ${isHoverPaused ? 'bg-yellow-500 text-black' : 'bg-xcroller-red text-white'
                                }`}
                        >
                            {isHoverPaused ? (
                                <Pause size={24} className="fill-current" />
                            ) : (
                                <div className="w-5 h-5 bg-current rounded-sm" />
                            )}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
            <FilterSidebar isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)} />
        </>
    );
}
