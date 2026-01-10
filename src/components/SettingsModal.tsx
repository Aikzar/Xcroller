import { X, Trash2, Folder as FolderIcon, Plus, Layout, Check, Settings } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Feed } from '../lib/types';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const {
        folderPaths,
        removeFolder,
        autoScrollSpeed,
        setAutoScrollSpeed,
        feeds,
        saveFeed,
        deleteFeed,
        filters
    } = useAppStore();

    const [isCreatingFeed, setIsCreatingFeed] = useState(false);
    const [editingFeedId, setEditingFeedId] = useState<number | null>(null);
    const [newFeedName, setNewFeedName] = useState('');
    const [selectedFolders, setSelectedFolders] = useState<string[]>([]);

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
        setSelectedFolders(JSON.parse(feed.folder_paths));
        setIsCreatingFeed(true);
    };

    const toggleFolderSelection = (path: string) => {
        setSelectedFolders(prev =>
            prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
        );
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div
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
                            <h2 className="text-lg font-semibold text-white">Settings</h2>
                            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
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
                                        className="text-xs flex items-center gap-1.5 text-xcroller-red hover:underline font-bold"
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
                                                        {editingFeedId && <span className="text-[10px] text-xcroller-red font-bold uppercase">Editing Mode</span>}
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
                                                                onClick={() => toggleFolderSelection(f.path)}
                                                                className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition-colors ${selectedFolders.includes(f.path) ? 'bg-xcroller-red/20 border border-xcroller-red/40 text-white' : 'bg-black/20 border border-white/5 text-white/60 hover:bg-black/40'
                                                                    }`}
                                                            >
                                                                <span className="truncate flex-1 text-left">{f.path}</span>
                                                                {selectedFolders.includes(f.path) && <Check size={14} className="text-xcroller-red" />}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={resetFeedForm}
                                                        className="flex-1 py-2.5 bg-white/5 text-white text-sm font-bold rounded-lg transition-all hover:bg-white/10"
                                                    >
                                                        CANCEL
                                                    </button>
                                                    <button
                                                        onClick={handleCreateOrUpdateFeed}
                                                        disabled={!newFeedName || selectedFolders.length === 0}
                                                        className="flex-[2] py-2.5 bg-xcroller-red text-white text-sm font-bold rounded-lg shadow-lg disabled:opacity-50 disabled:grayscale transition-all hover:scale-[1.02] active:scale-[0.98]"
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
                                            <div key={feed.id} className="flex items-center justify-between p-3 bg-black/20 rounded-xl hover:bg-black/30 transition-all border border-white/5 group relative">
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <Layout size={16} className="text-xcroller-red" />
                                                    <div className="flex flex-col overflow-hidden text-left">
                                                        <span className="text-sm font-bold text-white uppercase tracking-tight">{feed.name}</span>
                                                        <span className="text-[10px] text-xcroller-muted truncate">
                                                            {JSON.parse(feed.folder_paths).length} folders included
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
                                            <div key={folder.id} className="flex items-center justify-between p-3 bg-black/20 rounded-xl hover:bg-black/30 transition-colors group border border-white/5">
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <FolderIcon size={16} className="text-xcroller-muted group-hover:text-xcroller-red transition-colors shrink-0" />
                                                    <span className="text-sm text-white/90 truncate font-mono text-[11px]" title={folder.path}>{folder.path}</span>
                                                </div>
                                                <button
                                                    onClick={() => removeFolder(folder.path)}
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

                            {/* Preferences Section */}
                            <div>
                                <h3 className="text-sm font-medium text-xcroller-muted uppercase tracking-wider mb-3">System Preferences</h3>
                                <div className="space-y-4">
                                    <div className="flex flex-col gap-2 p-4 bg-black/20 rounded-xl border border-white/5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-white/90 font-bold">Autoscroll Pacing</span>
                                            <span className="text-xs font-mono text-xcroller-red bg-xcroller-red/10 px-2 py-0.5 rounded-full">{autoScrollSpeed.toFixed(1)}x</span>
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
                                                onClick={() => useAppStore.getState().setIncludeSubdirectories(!useAppStore.getState().includeSubdirectories)}
                                                className={`w-12 h-6 rounded-full transition-colors relative ${useAppStore.getState().includeSubdirectories ? 'bg-xcroller-red' : 'bg-white/10'}`}
                                            >
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${useAppStore.getState().includeSubdirectories ? 'left-7' : 'left-1'}`} />
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
