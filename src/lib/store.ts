import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { MediaItem, Folder, FilterOptions, Feed } from './types';

interface AppState {
    mediaItems: MediaItem[];
    columns: number;
    folderPaths: Folder[];
    isLoading: boolean;
    selectedMediaId: number | null;
    isAutoScrolling: boolean;
    isHoverPaused: boolean;
    hoverVolume: number;
    autoScrollSpeed: number;
    isFullscreen: boolean;
    filters: FilterOptions;
    feeds: Feed[];
    activeFeedId: number | 'home';

    hasMore: boolean;

    // Actions
    setColumns: (cols: number) => void;
    setSelectedMediaId: (id: number | null) => void;
    setHoverVolume: (volume: number) => void;
    setAutoScrollSpeed: (speed: number) => void;
    setIsFullscreen: (status: boolean) => void;
    setFilters: (filters: Partial<FilterOptions>) => void;
    setIsAutoScrolling: (status: boolean) => void;
    setIsHoverPaused: (status: boolean) => void;
    toggleAutoScroll: () => void;
    updateItemDimensions: (id: number, width: number, height: number) => void;
    loadFolders: () => Promise<void>;
    addFolder: (path: string) => Promise<void>;
    removeFolder: (path: string) => Promise<void>;
    fetchMedia: (reset?: boolean) => Promise<void>;
    toggleStar: (id: number) => void;

    // Feed Actions
    setActiveFeed: (feedId: number | 'home') => void;
    loadFeeds: () => Promise<void>;
    saveFeed: (feed: Feed) => Promise<void>;
    deleteFeed: (id: number) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
    mediaItems: [],
    columns: 5,
    folderPaths: [],
    isLoading: false,
    selectedMediaId: null,
    isAutoScrolling: false,
    isHoverPaused: false,
    hoverVolume: 0.5,
    autoScrollSpeed: 1.0,
    isFullscreen: false,
    filters: {
        media_type: 'all',
        orientation: 'all',
        sort_by: 'created_at',
        sort_order: 'desc'
    },
    feeds: [],
    activeFeedId: 'home',
    hasMore: true,

    setColumns: (cols) => set({ columns: cols }),
    setSelectedMediaId: (id) => set({ selectedMediaId: id }),
    setHoverVolume: (volume) => set({ hoverVolume: volume }),
    setAutoScrollSpeed: (speed) => set({ autoScrollSpeed: speed }),
    setIsFullscreen: (status) => set({ isFullscreen: status }),
    setFilters: async (newFilters) => {
        const currentFilters = { ...get().filters, ...newFilters };
        set({ filters: currentFilters, mediaItems: [], hasMore: true });

        const { activeFeedId, feeds, saveFeed } = get();
        if (activeFeedId !== 'home') {
            const feed = feeds.find(f => f.id === activeFeedId);
            if (feed) {
                await saveFeed({
                    ...feed,
                    filter_config: JSON.stringify(currentFilters)
                });
            }
        }

        get().fetchMedia(true);
    },
    setIsAutoScrolling: (status) => set({ isAutoScrolling: status }),
    setIsHoverPaused: (status) => set({ isHoverPaused: status }),
    toggleAutoScroll: () => set((state) => ({ isAutoScrolling: !state.isAutoScrolling })),

    updateItemDimensions: (id: number, width: number, height: number) => {
        set((state) => ({
            mediaItems: state.mediaItems.map(item =>
                item.id === id ? { ...item, width, height } : item
            )
        }));
    },

    loadFolders: async () => {
        try {
            const folders = await invoke<Folder[]>('get_folders');
            set({ folderPaths: folders });

            // Register directories in scope for asset protocol persistence
            const activePaths = folders.map(f => f.path);
            if (activePaths.length > 0) {
                await invoke('allow_directories', { paths: activePaths });
            }
        } catch (e) {
            console.error("Failed to load folders", e);
        }
    },

    addFolder: async (path) => {
        set({ isLoading: true });
        try {
            // 1. Scan (this adds to DB and returns count)
            await invoke('scan_folder', { path });
            // 2. Reload folders
            await get().loadFolders();
            // 3. Reload media (resetting list)
            await get().fetchMedia(true);
        } catch (e) {
            console.error("Failed to add folder", e);
        } finally {
            set({ isLoading: false });
        }
    },

    removeFolder: async (path) => {
        try {
            await invoke('remove_folder', { path });
            await get().loadFolders();
            await get().fetchMedia(true);
        } catch (e) {
            console.error("Failed to remove folder", e);
        }
    },

    fetchMedia: async (reset = false) => {
        if (get().isLoading && !reset) return;
        if (!get().hasMore && !reset) return;

        set({ isLoading: true });
        const limit = 50; // Smaller chunks for better performance
        const offset = reset ? 0 : get().mediaItems.length;
        const { activeFeedId, feeds, folderPaths, filters } = get();
        let queryFilters = { ...filters };

        // If we have an active feed, merge its folder set
        if (activeFeedId !== 'home') {
            const feed = feeds.find(f => f.id === activeFeedId);
            if (feed) {
                const feedFolders = JSON.parse(feed.folder_paths);
                queryFilters.folder_paths = feedFolders;
            }
        } else {
            // Home feed: union of all active folders
            queryFilters.folder_paths = folderPaths.filter(f => f.is_active).map(f => f.path);
        }

        try {
            const newItems = await invoke<MediaItem[]>('get_media', { limit, offset, filters: queryFilters });
            set((state) => ({
                mediaItems: reset ? newItems : [...state.mediaItems, ...newItems],
                hasMore: newItems.length === limit,
                isLoading: false
            }));

            if (reset && newItems.length === 0 && queryFilters.folder_paths && queryFilters.folder_paths.length > 0) {
                // Retry once if empty on start
                setTimeout(() => {
                    const currentItems = get().mediaItems;
                    if (currentItems.length === 0) {
                        get().fetchMedia(true);
                    }
                }, 2000);
            }
        } catch (e) {
            console.error("Failed to fetch media", e);
            set({ isLoading: false });
        }
    },

    toggleStar: async (id) => {
        // Optimistic update
        set((state) => ({
            mediaItems: state.mediaItems.map(item =>
                item.id === id ? { ...item, starred: !item.starred } : item
            )
        }));
        try {
            await invoke('toggle_star', { id });
        } catch (e) {
            console.error("Failed to toggle star", e);
        }
    },

    setActiveFeed: (feedId) => {
        const { feeds } = get();
        if (feedId === 'home') {
            set({
                activeFeedId: feedId,
                mediaItems: [],
                filters: {
                    media_type: 'all',
                    orientation: 'all',
                    sort_by: 'created_at',
                    sort_order: 'desc'
                }
            });
        } else {
            const feed = feeds.find(f => f.id === feedId);
            if (feed) {
                const feedFilters = JSON.parse(feed.filter_config);
                set({
                    activeFeedId: feedId,
                    mediaItems: [],
                    filters: feedFilters
                });
            }
        }
        get().fetchMedia(true);
    },

    loadFeeds: async () => {
        try {
            const feeds = await invoke<Feed[]>('get_feeds');
            set({ feeds });
        } catch (e) {
            console.error("Failed to load feeds", e);
        }
    },

    saveFeed: async (feed) => {
        try {
            await invoke('save_feed', { feed });
            await get().loadFeeds();
        } catch (e) {
            console.error("Failed to save feed", e);
        }
    },

    deleteFeed: async (id) => {
        try {
            await invoke('delete_feed', { id });
            if (get().activeFeedId === id) {
                set({ activeFeedId: 'home' });
            }
            await get().loadFeeds();
            get().fetchMedia(true);
        } catch (e) {
            console.error("Failed to delete feed", e);
        }
    }
}));
