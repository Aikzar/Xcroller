import { useState, useEffect } from 'react';
import { useAppStore } from '../lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus, Grid3X3, FolderPlus, Play, Pause, Settings, Volume2, Maximize, Minimize, Filter, RefreshCcw, Download, Trash2 } from 'lucide-react';
import { open, message, ask } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { SettingsModal } from './SettingsModal';
import { FilterSidebar } from './FilterSidebar';
import { FeedSwitcher } from './FeedSwitcher';
import { useShallow } from 'zustand/react/shallow';

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
        preferencesLoaded,
        activity,
        refreshLibrary,
        exportFavorites,
        clearFavorites
    } = useAppStore(useShallow((state) => ({
        columns: state.columns,
        setColumns: state.setColumns,
        addFolder: state.addFolder,
        isAutoScrolling: state.isAutoScrolling,
        toggleAutoScroll: state.toggleAutoScroll,
        isHoverPaused: state.isHoverPaused,
        hoverVolume: state.hoverVolume,
        setHoverVolume: state.setHoverVolume,
        isFullscreen: state.isFullscreen,
        setIsFullscreen: state.setIsFullscreen,
        feeds: state.feeds,
        activeFeedId: state.activeFeedId,
        setActiveFeed: state.setActiveFeed,
        preferencesLoaded: state.preferencesLoaded,
        activity: state.activity,
        refreshLibrary: state.refreshLibrary,
        exportFavorites: state.exportFavorites,
        clearFavorites: state.clearFavorites
    })));
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
        const revealZone = window.innerWidth <= 1180 ? 120 : 60;
        if (e.clientY < revealZone) {
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
            <AnimatePresence initial={false}>
                {(isVisible && !isAutoScrolling) && (
                    <motion.div
                        data-tauri-drag-region
                        initial={{ y: '-100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '-100%' }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="xcroller-toolbar theme-surface-context fixed top-0 left-0 right-0 bg-xcroller-base/95 backdrop-blur-xl border-b border-white/5 z-[60] shadow-2xl"
                    >
                        <div className="xcroller-toolbar__leading flex items-center gap-4">
                            <button
                                onClick={handleAddFolder}
                                disabled={activity !== null}
                                aria-label="Add folder"
                                className="p-2 hover:bg-white/5 rounded-full transition-colors text-xcroller-text/80 hover:text-white disabled:cursor-wait disabled:opacity-40"
                                title="Add Folder"
                            >
                                <FolderPlus size={20} />
                            </button>

                            <button
                                onClick={() => void refreshLibrary()}
                                disabled={activity !== null}
                                aria-label="Refresh media"
                                aria-busy={activity?.message.includes('Refreshing') || activity?.message.includes('latest media')}
                                className="p-2 hover:bg-white/5 rounded-full transition-colors text-xcroller-text/80 hover:text-white disabled:cursor-wait disabled:opacity-40"
                                title="Refresh Media"
                            >
                                <RefreshCcw
                                    size={20}
                                    className={activity?.message.includes('Refreshing') || activity?.message.includes('latest media') ? 'motion-safe:animate-spin' : ''}
                                />
                            </button>
                        </div>

                        <FeedSwitcher
                            feeds={feeds}
                            activeFeedId={activeFeedId}
                            setActiveFeed={setActiveFeed}
                            className="xcroller-toolbar__feeds w-full max-w-3xl justify-self-center"
                        />

                        <div className="xcroller-toolbar__actions flex min-w-0 items-center gap-6">
                            {/* Favorites Actions */}
                            {activeFeedId === 'favorites' && (
                                <div className="xcroller-toolbar__favorite-actions flex items-center gap-2 bg-xcroller-red/20 border border-xcroller-red/30 rounded-full px-2 py-1">
                                    <button
                                        onClick={handleExportFavorites}
                                        aria-label="Export favorites"
                                        className="p-1.5 hover:bg-xcroller-red hover:text-xcroller-on-accent rounded-full transition-colors text-xcroller-accent-text"
                                        title="Export Favorites"
                                    >
                                        <Download size={16} />
                                    </button>
                                    <div className="w-px h-4 bg-xcroller-red/30" />
                                    <button
                                        onClick={handleClearFavorites}
                                        aria-label="Clear all favorites"
                                        className="p-1.5 hover:bg-xcroller-red hover:text-xcroller-on-accent rounded-full transition-colors text-xcroller-accent-text"
                                        title="Clear All Favorites"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            )}

                            {/* Hover Volume Control */}
                            <div className="xcroller-toolbar__volume flex items-center gap-3 bg-white/5 rounded-full px-4 py-1.5 border border-white/5 transition-colors hover:bg-white/10 group">
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
                            <div className="xcroller-toolbar__grid flex items-center gap-2 bg-white/5 rounded-full px-3 py-1.5 border border-white/5">
                                <Grid3X3 size={16} className="text-xcroller-muted mr-1 pointer-events-none" />
                                <button
                                    onClick={() => setColumns(Math.max(1, columns - 1))}
                                    aria-label="Decrease columns"
                                    className="p-1 hover:text-white text-xcroller-muted transition-colors"
                                >
                                    <Minus size={14} />
                                </button>
                                <span className="text-sm font-medium w-4 text-center pointer-events-none">{columns}</span>
                                <button
                                    onClick={() => setColumns(Math.min(15, columns + 1))}
                                    aria-label="Increase columns"
                                    className="p-1 hover:text-white text-xcroller-muted transition-colors"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>

                            <button
                                onClick={toggleAutoScroll}
                                aria-label={isAutoScrolling ? 'Stop automatic scrolling' : 'Start automatic scrolling'}
                                className={`p-2.5 rounded-full transition-[background-color,color,transform] shadow-lg relative ${isAutoScrolling
                                    ? (isHoverPaused ? 'bg-yellow-500 text-black scale-110' : 'bg-xcroller-red text-xcroller-on-accent scale-110')
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
                                aria-label="Open filters and sorting"
                                className={`p-2.5 rounded-full transition-colors ${isFilterOpen ? 'bg-xcroller-red text-xcroller-on-accent' : 'bg-white/5 text-xcroller-text/80 hover:text-white hover:bg-white/10'}`}
                                title="Filters & Sorting"
                            >
                                <Filter size={20} />
                            </button>

                            <button
                                onClick={handleToggleFullscreen}
                                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                                data-toolbar-fullscreen
                                className="p-2.5 bg-white/5 rounded-full transition-colors text-xcroller-text/80 hover:text-white hover:bg-white/10"
                                title="Toggle Fullscreen"
                            >
                                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                            </button>

                            <button
                                onClick={() => setIsSettingsOpen(true)}
                                disabled={!preferencesLoaded}
                                aria-label="Open settings"
                                className="p-2 hover:bg-white/5 rounded-full transition-colors text-xcroller-text/80 hover:text-white disabled:cursor-wait disabled:opacity-40"
                            >
                                <Settings size={20} />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Minimal Autoscroll UI */}
            <AnimatePresence initial={false}>
                {isAutoScrolling && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: -20 }}
                        className="fixed top-6 right-6 z-[70]"
                    >
                        <button
                            onClick={toggleAutoScroll}
                            className={`w-14 h-14 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.5)] flex items-center justify-center transition-transform hover:scale-105 ${isHoverPaused ? 'bg-yellow-500 text-black' : 'bg-xcroller-red text-xcroller-on-accent'
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
