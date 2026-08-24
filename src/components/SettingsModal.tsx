import { X, Trash2, Folder as FolderIcon, Plus, Layout, Check, Settings, Palette, Pipette, Moon, Sun } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Feed } from '../lib/types';
import { useShallow } from 'zustand/react/shallow';
import { ACCENT_PRESETS, foregroundForAccent } from '../lib/theme';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const parseFeedFolderPaths = (serialized: string): string[] => {
    try {
        const parsed: unknown = JSON.parse(serialized);
        return Array.isArray(parsed)
            ? parsed.filter((path): path is string => typeof path === 'string')
            : [];
    } catch {
        return [];
    }
};

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const {
        folderPaths,
        removeFolder,
        autoScrollSpeed,
        setAutoScrollSpeed,
        feeds,
        saveFeed,
        deleteFeed,
        filters,
        includeSubdirectories,
        setIncludeSubdirectories,
        accentColor,
        setAccentColor,
        appearanceTheme,
        setAppearanceTheme,
        activity
    } = useAppStore(useShallow((state) => ({
        folderPaths: state.folderPaths,
        removeFolder: state.removeFolder,
        autoScrollSpeed: state.autoScrollSpeed,
        setAutoScrollSpeed: state.setAutoScrollSpeed,
        feeds: state.feeds,
        saveFeed: state.saveFeed,
        deleteFeed: state.deleteFeed,
        filters: state.filters,
        includeSubdirectories: state.includeSubdirectories,
        setIncludeSubdirectories: state.setIncludeSubdirectories,
        accentColor: state.accentColor,
        setAccentColor: state.setAccentColor,
        appearanceTheme: state.appearanceTheme,
        setAppearanceTheme: state.setAppearanceTheme,
        activity: state.activity
    })));

    const [isCreatingFeed, setIsCreatingFeed] = useState(false);
    const [editingFeedId, setEditingFeedId] = useState<number | null>(null);
    const [newFeedName, setNewFeedName] = useState('');
    const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!isOpen) return;

        const previouslyFocused = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCloseRef.current();
                return;
            }
            if (event.key !== 'Tab' || !dialogRef.current) return;

            const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
            )).filter(element => element.offsetParent !== null);
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            window.cancelAnimationFrame(focusFrame);
            document.removeEventListener('keydown', handleKeyDown);
            previouslyFocused?.focus();
        };
    }, [isOpen]);

    const handleCreateOrUpdateFeed = async () => {
        if (!newFeedName || selectedFolders.length === 0) return;

        await saveFeed({
            id: editingFeedId || undefined,
            name: newFeedName,
            folder_paths: JSON.stringify(selectedFolders),
            filter_config: editingFeedId
                ? feeds.find(f => f.id === editingFeedId)?.filter_config || JSON.stringify(filters)
                : JSON.stringify(filters)
        });

        resetFeedForm();
    };

    const resetFeedForm = () => {
        setIsCreatingFeed(false);
        setEditingFeedId(null);
        setNewFeedName('');
        setSelectedFolders([]);
    };

    const startEditing = (feed: Feed) => {
        setEditingFeedId(feed.id!);
        setNewFeedName(feed.name);
        setSelectedFolders(parseFeedFolderPaths(feed.folder_paths));
        setIsCreatingFeed(true);
    };

    const toggleFolderSelection = (path: string) => {
        setSelectedFolders(prev =>
            prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
        );
    };

    return (
        <AnimatePresence initial={false}>
            {isOpen && (
                <div className="theme-surface-context fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="settings-title"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="relative w-full max-w-lg bg-xcroller-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5 shrink-0">
                            <h2 id="settings-title" className="text-lg font-semibold text-white">Settings</h2>
                            <button
                                ref={closeButtonRef}
                                type="button"
                                onClick={onClose}
                                aria-label="Close settings"
                                className="p-2.5 hover:bg-white/10 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                                <X size={20} className="text-white/70" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-8 overflow-y-auto custom-scrollbar flex-1">

                            {/* Feed Management Section */}
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-medium text-xcroller-muted uppercase tracking-wider">Named Side Feeds</h3>
                                    <button
                                        onClick={() => {
                                            if (isCreatingFeed) resetFeedForm();
                                            else setIsCreatingFeed(true);
                                        }}
                                        className="text-xs flex items-center gap-1.5 text-xcroller-accent-text hover:underline font-bold"
                                    >
                                        <Plus size={14} /> {isCreatingFeed ? 'DISCARD' : 'NEW FEED'}
                                    </button>
                                </div>

                                <AnimatePresence>
                                    {isCreatingFeed && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="mb-6 overflow-hidden"
                                        >
                                            <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-4">
                                                <div>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <label className="text-[10px] text-xcroller-muted uppercase block ml-1">{editingFeedId ? 'Edit Feed Name' : 'New Feed Name'}</label>
                                                        {editingFeedId && <span className="text-[10px] text-xcroller-accent-text font-bold uppercase">Editing Mode</span>}
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={newFeedName}
                                                        onChange={(e) => setNewFeedName(e.target.value)}
                                                        placeholder="e.g. My Favorites"
                                                        className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-sm outline-none focus:border-xcroller-red transition-colors"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-xcroller-muted uppercase block mb-1.5 ml-1">Included Folders</label>
                                                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                                                        {folderPaths.map(f => (
                                                            <button
                                                                key={f.id}
                                                                type="button"
                                                                onClick={() => toggleFolderSelection(f.path)}
                                                                disabled={!f.is_available}
                                                                title={f.is_available ? f.path : `${f.path} — drive unavailable`}
                                                                className={`w-full flex items-center justify-between gap-2 p-2 rounded-lg text-xs transition-colors disabled:cursor-not-allowed ${selectedFolders.includes(f.path) ? 'bg-xcroller-red/20 border border-xcroller-red/40 text-white' : 'bg-black/20 border border-white/5 text-white/60 hover:bg-black/40'
                                                                    } ${!f.is_available ? 'opacity-50' : ''
                                                                    }`}
                                                            >
                                                                <span className="truncate flex-1 text-left">{f.path}</span>
                                                                {!f.is_available && <span className="shrink-0 text-[9px] uppercase tracking-wide">Unavailable</span>}
                                                                {selectedFolders.includes(f.path) && <Check size={14} className="text-xcroller-accent-text" />}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={resetFeedForm}
                                                        className="flex-1 py-2.5 bg-white/5 text-white text-sm font-bold rounded-lg transition-colors hover:bg-white/10"
                                                    >
                                                        CANCEL
                                                    </button>
                                                    <button
                                                        onClick={handleCreateOrUpdateFeed}
                                                        disabled={!newFeedName || selectedFolders.length === 0}
                                                        className="flex-[2] py-2.5 bg-xcroller-red text-xcroller-on-accent text-sm font-bold rounded-lg shadow-lg disabled:opacity-50 disabled:grayscale transition-transform hover:scale-[1.02] active:scale-[0.96]"
                                                    >
                                                        {editingFeedId ? 'UPDATE FEED' : 'SAVE PRESET FEED'}
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <div className="space-y-2">
                                    {feeds.length === 0 ? (
                                        <div className="text-xs text-xcroller-muted italic py-4 bg-white/5 rounded-xl text-center border border-dashed border-white/10">
                                            No custom feeds yet. Create one above!
                                        </div>
                                    ) : (
                                        feeds.map((feed) => (
                                            <div key={feed.id} className="flex items-center justify-between p-3 bg-black/20 rounded-xl hover:bg-black/30 transition-colors border border-white/5 group relative">
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <Layout size={16} className="text-xcroller-accent-text" />
                                                    <div className="flex flex-col overflow-hidden text-left">
                                                        <span className="text-sm font-bold text-white uppercase tracking-tight">{feed.name}</span>
                                                        <span className="text-[10px] text-xcroller-muted truncate">
                                                            {parseFeedFolderPaths(feed.folder_paths).length} folders included
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => startEditing(feed)}
                                                        className="p-1.5 hover:bg-white/10 text-xcroller-muted hover:text-white rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Edit Feed"
                                                    >
                                                        <Settings size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => deleteFeed(feed.id!)}
                                                        className="p-1.5 hover:bg-red-500/20 text-xcroller-muted hover:text-red-400 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Delete Feed"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Folder Management Section */}
                            <div>
                                <h3 className="text-sm font-medium text-xcroller-muted uppercase tracking-wider mb-3">Managed Data Sources</h3>
                                <div className="space-y-2">
                                    {folderPaths.length === 0 ? (
                                        <div className="text-sm text-xcroller-muted italic py-2">No folders added yet.</div>
                                    ) : (
                                        folderPaths.map((folder) => (
                                            <div key={folder.id} className={`flex items-center justify-between p-3 bg-black/20 rounded-xl hover:bg-black/30 transition-colors group border ${folder.is_available ? 'border-white/5' : 'border-amber-400/20'}`}>
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <FolderIcon size={16} className={`${folder.is_available ? 'text-xcroller-muted group-hover:text-xcroller-accent-text' : 'text-amber-300/70'} transition-colors shrink-0`} />
                                                    <div className="flex min-w-0 flex-col gap-0.5">
                                                        <span className="text-sm text-white/90 truncate font-mono text-[11px]" title={folder.path}>{folder.path}</span>
                                                        {!folder.is_available && (
                                                            <span className="text-[9px] uppercase tracking-wider text-amber-300/70">
                                                                Drive unavailable — reconnect it, then refresh
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => removeFolder(folder.path)}
                                                    disabled={activity !== null}
                                                    className="p-1.5 hover:bg-red-500/20 text-xcroller-muted hover:text-red-400 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Remove Folder"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Appearance Section */}
                            <div>
                                <div className="mb-3 flex items-center gap-2">
                                    <Palette size={16} className="text-xcroller-accent-text" aria-hidden="true" />
                                    <h3 className="text-sm font-medium text-xcroller-muted uppercase tracking-wider">Appearance</h3>
                                </div>
                                <div className="space-y-4 rounded-xl border border-white/5 bg-black/20 p-4">
                                    <div>
                                        <span className="text-sm font-bold text-white/90">Color mode</span>
                                        <p className="mt-0.5 text-[10px] text-xcroller-muted">
                                            Dark is the standard appearance. Both modes keep your accent color.
                                        </p>
                                    </div>

                                    <div
                                        role="group"
                                        aria-label="Application color mode"
                                        className="grid grid-cols-2 gap-1 rounded-xl bg-black/40 p-1"
                                    >
                                        {([
                                            { id: 'dark' as const, label: 'Dark', Icon: Moon },
                                            { id: 'light' as const, label: 'Light', Icon: Sun }
                                        ]).map(({ id, label, Icon }) => {
                                            const isSelected = appearanceTheme === id;
                                            return (
                                                <button
                                                    key={id}
                                                    type="button"
                                                    aria-pressed={isSelected}
                                                    onClick={() => setAppearanceTheme(id)}
                                                    className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold transition-[background-color,color,transform] active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${isSelected
                                                        ? 'bg-xcroller-red text-xcroller-on-accent shadow-lg'
                                                        : 'text-xcroller-muted hover:bg-white/5 hover:text-white'
                                                        }`}
                                                >
                                                    <Icon size={16} strokeWidth={2} aria-hidden="true" />
                                                    {label}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="h-px bg-white/10" aria-hidden="true" />

                                    <div>
                                        <span className="text-sm font-bold text-white/90">Accent color</span>
                                        <p className="mt-0.5 text-[10px] text-xcroller-muted">
                                            Changes controls and highlights. Your choice is saved automatically.
                                        </p>
                                    </div>

                                    <div role="group" aria-label="Preset accent colors" className="grid grid-cols-6 gap-2">
                                        {ACCENT_PRESETS.map((preset) => {
                                            const isSelected = accentColor === preset.color;
                                            return (
                                                <button
                                                    key={preset.color}
                                                    type="button"
                                                    aria-label={`Use ${preset.name} accent (${preset.color})`}
                                                    aria-pressed={isSelected}
                                                    title={`${preset.name} — ${preset.color}`}
                                                    onClick={() => setAccentColor(preset.color)}
                                                    className="flex size-10 items-center justify-center rounded-lg shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)] transition-transform hover:scale-105 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                                                    style={{
                                                        backgroundColor: preset.color,
                                                        color: foregroundForAccent(preset.color)
                                                    }}
                                                >
                                                    {isSelected && <Check size={17} strokeWidth={2.5} aria-hidden="true" />}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="flex items-center justify-between gap-3 rounded-lg bg-white/5 p-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <Pipette size={16} className="shrink-0 text-xcroller-accent-text" aria-hidden="true" />
                                            <div className="min-w-0">
                                                <label htmlFor="custom-accent-color" className="block text-xs font-bold text-white/90">
                                                    Custom color
                                                </label>
                                                <span id="custom-accent-help" className="block text-[10px] text-xcroller-muted">
                                                    Opens the Windows color picker
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <output htmlFor="custom-accent-color" className="font-mono text-[10px] text-white/60">
                                                {accentColor}
                                            </output>
                                            <input
                                                id="custom-accent-color"
                                                type="color"
                                                value={accentColor}
                                                aria-describedby="custom-accent-help"
                                                onChange={(event) => setAccentColor(event.target.value)}
                                                className="h-10 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xcroller-accent-text [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Preferences Section */}
                            <div>
                                <h3 className="text-sm font-medium text-xcroller-muted uppercase tracking-wider mb-3">System Preferences</h3>
                                <div className="space-y-4">
                                    <div className="flex flex-col gap-2 p-4 bg-black/20 rounded-xl border border-white/5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-white/90 font-bold">Autoscroll Pacing</span>
                                            <span className="text-xs font-mono text-xcroller-accent-text bg-xcroller-red/10 px-2 py-0.5 rounded-full">{autoScrollSpeed.toFixed(1)}x</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.1"
                                            max="5.0"
                                            step="0.1"
                                            value={autoScrollSpeed}
                                            onChange={(e) => setAutoScrollSpeed(parseFloat(e.target.value))}
                                            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-xcroller-red"
                                        />
                                        <div className="flex justify-between text-[10px] text-xcroller-muted px-0.5 font-bold">
                                            <span>Mellow</span>
                                            <span>Intense</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2 p-4 bg-black/20 rounded-xl border border-white/5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-sm text-white/90 font-bold">Recursive Scanning</span>
                                                <span className="text-[10px] text-xcroller-muted">Include subfolders when adding a root folder</span>
                                            </div>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={includeSubdirectories}
                                                aria-label="Include subfolders when adding a folder"
                                                onClick={() => setIncludeSubdirectories(!includeSubdirectories)}
                                                className={`w-12 h-6 rounded-full transition-colors relative focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${includeSubdirectories ? 'bg-xcroller-red' : 'bg-white/10'}`}
                                            >
                                                <div className={`absolute top-1 w-4 h-4 rounded-full transition-transform ${includeSubdirectories ? 'left-7 bg-xcroller-on-accent' : 'left-1 bg-white'}`} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
