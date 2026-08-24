import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { MediaItem, Folder, FilterOptions, Feed } from './types';
import { applyAccentColor, DEFAULT_ACCENT_COLOR, normalizeAccentColor } from './theme';

interface ActivityStatus {
    id: number;
    message: string;
    startedAt: number;
}

interface AppState {
    mediaItems: MediaItem[];
    columns: number;
    folderPaths: Folder[];
    isLoading: boolean;
    activity: ActivityStatus | null;
    selectedMediaId: number | null;
    isAutoScrolling: boolean;
    isHoverPaused: boolean;
    hoverVolume: number;
    autoScrollSpeed: number;
    includeSubdirectories: boolean;
    accentColor: string;
    isFullscreen: boolean;
    filters: FilterOptions;
    feeds: Feed[];
    activeFeedId: number | 'home' | 'favorites';
    preferencesLoaded: boolean;

    hasMore: boolean;

    // Actions
    setColumns: (cols: number) => void;
    setSelectedMediaId: (id: number | null) => void;
    setHoverVolume: (volume: number) => void;
    setAutoScrollSpeed: (speed: number) => void;
    setIncludeSubdirectories: (include: boolean) => void;
    setAccentColor: (color: string) => void;
    setIsFullscreen: (status: boolean) => void;
    setFilters: (filters: Partial<FilterOptions>) => void;
    setIsAutoScrolling: (status: boolean) => void;
    setIsHoverPaused: (status: boolean) => void;
    toggleAutoScroll: () => void;
    updateItemDimensions: (id: number, width: number, height: number) => void;
    updateItemMetadata: (id: number, metadata: Partial<Pick<MediaItem, 'width' | 'height' | 'duration_sec'>>) => void;
    loadFolders: () => Promise<void>;
    loadPreferences: () => Promise<void>;
    addFolder: (path: string, recursive?: boolean) => Promise<void>;
    removeFolder: (path: string) => Promise<void>;
    fetchMedia: (reset?: boolean) => Promise<void>;
    refreshLibrary: () => Promise<void>;
    toggleStar: (id: number) => void;
    beginActivity: (message: string) => number;
    updateActivity: (id: number, message: string) => void;
    finishActivity: (id: number, minimumVisibleMs?: number) => Promise<void>;

    // Feed Actions
    setActiveFeed: (feedId: number | 'home' | 'favorites') => void;
    loadFeeds: () => Promise<void>;
    saveFeed: (feed: Feed) => Promise<void>;
    deleteFeed: (id: number) => Promise<void>;
    exportFavorites: (targetPath: string) => Promise<number>;
    clearFavorites: () => Promise<void>;
}

let filterFetchTimer: ReturnType<typeof setTimeout> | undefined;
let preferencesSaveTimer: ReturnType<typeof setTimeout> | undefined;
let mediaRequestVersion = 0;
let lastSavedPreferences: string | undefined;
let activitySequence = 0;

const DEFAULT_FILTERS: FilterOptions = {
    media_type: 'all',
    orientation: 'all',
    sort_by: 'created_at',
    sort_order: 'desc'
};

const clamp = (value: number, minimum: number, maximum: number) =>
    Math.min(maximum, Math.max(minimum, value));

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeFilters = (value: unknown): FilterOptions => {
    if (!isRecord(value)) return { ...DEFAULT_FILTERS };

    const mediaTypes = ['image', 'video', 'all'];
    const orientations = ['horizontal', 'vertical', 'square', 'all'];
    const sortFields = ['created_at', 'size_bytes', 'resolution', 'duration_sec', 'filename', 'random'];
    const numberOrUndefined = (candidate: unknown) =>
        typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined;

    return {
        media_type: mediaTypes.includes(String(value.media_type))
            ? value.media_type as FilterOptions['media_type']
            : DEFAULT_FILTERS.media_type,
        orientation: orientations.includes(String(value.orientation))
            ? value.orientation as FilterOptions['orientation']
            : DEFAULT_FILTERS.orientation,
        min_width: numberOrUndefined(value.min_width),
        min_height: numberOrUndefined(value.min_height),
        min_duration: numberOrUndefined(value.min_duration),
        max_duration: numberOrUndefined(value.max_duration),
        min_size: numberOrUndefined(value.min_size),
        max_size: numberOrUndefined(value.max_size),
        extensions: Array.isArray(value.extensions)
            ? value.extensions.filter((extension): extension is string => typeof extension === 'string')
            : undefined,
        sort_by: sortFields.includes(String(value.sort_by))
            ? value.sort_by as FilterOptions['sort_by']
            : DEFAULT_FILTERS.sort_by,
        sort_order: value.sort_order === 'asc' || value.sort_order === 'desc'
            ? value.sort_order
            : DEFAULT_FILTERS.sort_order
    };
};

const parseFolderPaths = (serialized: string): string[] => {
    try {
        const parsed: unknown = JSON.parse(serialized);
        return Array.isArray(parsed)
            ? parsed.filter((path): path is string => typeof path === 'string')
            : [];
    } catch {
        return [];
    }
};

const serializePreferences = (state: AppState) => JSON.stringify({
    version: 2,
    columns: state.columns,
    hoverVolume: state.hoverVolume,
    autoScrollSpeed: state.autoScrollSpeed,
    includeSubdirectories: state.includeSubdirectories,
    accentColor: state.accentColor,
    activeFeedId: state.activeFeedId,
    filters: state.filters
});

const schedulePreferencesSave = (get: () => AppState) => {
    if (!get().preferencesLoaded) return;
    if (preferencesSaveTimer !== undefined) clearTimeout(preferencesSaveTimer);

    preferencesSaveTimer = setTimeout(async () => {
        preferencesSaveTimer = undefined;
        const preferences = serializePreferences(get());
        if (preferences === lastSavedPreferences) return;

        try {
            await invoke('save_app_preferences', { preferences });
            lastSavedPreferences = preferences;
        } catch (error) {
            console.error('Failed to save preferences', error);
        }
    }, 300);
};

const cancelScheduledFilterFetch = () => {
    if (filterFetchTimer !== undefined) {
        clearTimeout(filterFetchTimer);
        filterFetchTimer = undefined;
    }
};

export const useAppStore = create<AppState>((set, get) => ({
    mediaItems: [],
    columns: 5,
    folderPaths: [],
    isLoading: false,
    activity: null,
    selectedMediaId: null,
    isAutoScrolling: false,
    isHoverPaused: false,
    hoverVolume: 0.5,
    autoScrollSpeed: 1.0,
    includeSubdirectories: true,
    accentColor: DEFAULT_ACCENT_COLOR,
    isFullscreen: false,
    filters: { ...DEFAULT_FILTERS },
    feeds: [],
    activeFeedId: 'home',
    preferencesLoaded: false,
    hasMore: true,

    setColumns: (cols) => {
        set({ columns: Math.round(clamp(cols, 1, 15)) });
        schedulePreferencesSave(get);
    },
    setSelectedMediaId: (id) => set({ selectedMediaId: id }),
    setHoverVolume: (volume) => {
        set({ hoverVolume: clamp(volume, 0, 1) });
        schedulePreferencesSave(get);
    },
    setAutoScrollSpeed: (speed) => {
        set({ autoScrollSpeed: clamp(speed, 0.1, 5) });
        schedulePreferencesSave(get);
    },
    setIncludeSubdirectories: (include) => {
        set({ includeSubdirectories: include });
        schedulePreferencesSave(get);
    },
    setAccentColor: (color) => {
        const normalized = normalizeAccentColor(color);
        if (!normalized) return;
        applyAccentColor(normalized);
        set({ accentColor: normalized });
        schedulePreferencesSave(get);
    },
    setIsFullscreen: (status) => set({ isFullscreen: status }),
    beginActivity: (message) => {
        const id = ++activitySequence;
        set({ activity: { id, message, startedAt: Date.now() } });
        return id;
    },
    updateActivity: (id, message) => set((state) => state.activity?.id === id
        ? { activity: { ...state.activity, message } }
        : {}),
    finishActivity: async (id, minimumVisibleMs = 400) => {
        const activity = get().activity;
        if (activity?.id !== id) return;

        const remaining = minimumVisibleMs - (Date.now() - activity.startedAt);
        if (remaining > 0) {
            await new Promise(resolve => window.setTimeout(resolve, remaining));
        }
        set((state) => state.activity?.id === id ? { activity: null } : {});
    },
    setFilters: (newFilters) => {
        const currentFilters = { ...get().filters, ...newFilters };
        const hasInvalidDurationRange = currentFilters.min_duration != null &&
            currentFilters.max_duration != null &&
            currentFilters.min_duration > currentFilters.max_duration;

        set(hasInvalidDurationRange
            ? { filters: currentFilters, isLoading: false }
            : { filters: currentFilters, mediaItems: [], hasMore: true });

        // Invalidate any response for the previous filter set immediately. The
        // replacement request is debounced so typing a number does not rescan
        // the database on every keystroke.
        mediaRequestVersion += 1;
        cancelScheduledFilterFetch();

        // Keep the last valid results visible while the range is incomplete.
        if (hasInvalidDurationRange) return;

        schedulePreferencesSave(get);

        filterFetchTimer = setTimeout(async () => {
            filterFetchTimer = undefined;
            const { activeFeedId, feeds, saveFeed } = get();
            if (activeFeedId !== 'home' && activeFeedId !== 'favorites') {
                const feed = feeds.find(f => f.id === activeFeedId);
                if (feed) {
                    await saveFeed({
                        ...feed,
                        filter_config: JSON.stringify(get().filters)
                    });
                }
            }

            await get().fetchMedia(true);
        }, 250);
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

    updateItemMetadata: (id, metadata) => {
        set((state) => ({
            mediaItems: state.mediaItems.map(item =>
                item.id === id ? { ...item, ...metadata } : item
            )
        }));
    },

    loadFolders: async () => {
        try {
            const folders = await invoke<Folder[]>('get_folders');
            set({ folderPaths: folders });

            // Register directories in scope for asset protocol persistence
            const activePaths = folders.filter(f => f.is_available).map(f => f.path);
            if (activePaths.length > 0) {
                await invoke('allow_directories', { paths: activePaths });
            }
        } catch (e) {
            console.error("Failed to load folders", e);
        }
    },

    loadPreferences: async () => {
        try {
            const rawPreferences = await invoke<string | null>('get_app_preferences');
            if (!rawPreferences) {
                applyAccentColor(DEFAULT_ACCENT_COLOR);
                set({ preferencesLoaded: true });
                return;
            }

            const parsed: unknown = JSON.parse(rawPreferences);
            if (!isRecord(parsed)) throw new Error('Stored preferences are not an object');

            const { feeds } = get();
            const storedFeedId = parsed.activeFeedId;
            const activeFeedId: AppState['activeFeedId'] = storedFeedId === 'favorites'
                ? 'favorites'
                : typeof storedFeedId === 'number' && feeds.some((feed) => feed.id === storedFeedId)
                    ? storedFeedId
                    : 'home';

            let filters = normalizeFilters(parsed.filters);
            const accentColor = normalizeAccentColor(parsed.accentColor) ?? DEFAULT_ACCENT_COLOR;
            applyAccentColor(accentColor);
            if (typeof activeFeedId === 'number') {
                const feed = feeds.find((candidate) => candidate.id === activeFeedId);
                if (feed) {
                    try {
                        filters = normalizeFilters(JSON.parse(feed.filter_config));
                    } catch {
                        filters = { ...DEFAULT_FILTERS };
                    }
                }
            }

            set({
                columns: typeof parsed.columns === 'number'
                    ? Math.round(clamp(parsed.columns, 1, 15))
                    : get().columns,
                hoverVolume: typeof parsed.hoverVolume === 'number'
                    ? clamp(parsed.hoverVolume, 0, 1)
                    : get().hoverVolume,
                autoScrollSpeed: typeof parsed.autoScrollSpeed === 'number'
                    ? clamp(parsed.autoScrollSpeed, 0.1, 5)
                    : get().autoScrollSpeed,
                includeSubdirectories: typeof parsed.includeSubdirectories === 'boolean'
                    ? parsed.includeSubdirectories
                    : get().includeSubdirectories,
                accentColor,
                activeFeedId,
                filters,
                preferencesLoaded: true
            });
            lastSavedPreferences = serializePreferences(get());
        } catch (error) {
            console.error('Failed to load preferences', error);
            applyAccentColor(DEFAULT_ACCENT_COLOR);
            set({ preferencesLoaded: true });
        }
    },

    addFolder: async (path, recursive) => {
        const activityId = get().beginActivity(`Scanning ${path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? 'folder'}…`);
        set({ isLoading: true });
        try {
            const isRecursive = recursive ?? get().includeSubdirectories;
            // 1. Scan
            const itemCount = await invoke<number>('scan_folder', { path, recursive: isRecursive });
            get().updateActivity(activityId, `Loading ${itemCount.toLocaleString()} media ${itemCount === 1 ? 'item' : 'items'}…`);
            // 2. Reload folders
            await get().loadFolders();
            // 3. Reload media
            await get().fetchMedia(true);
        } catch (e) {
            console.error("Failed to add folder", e);
        } finally {
            set({ isLoading: false });
            await get().finishActivity(activityId);
        }
    },

    removeFolder: async (path) => {
        const activityId = get().beginActivity('Removing folder from the library…');
        try {
            await invoke('remove_folder', { path });
            await get().loadFolders();
            await get().fetchMedia(true);
        } catch (e) {
            console.error("Failed to remove folder", e);
        } finally {
            await get().finishActivity(activityId);
        }
    },

    refreshLibrary: async () => {
        if (get().activity) return;
        const activityId = get().beginActivity('Refreshing library…');
        try {
            await get().loadFolders();
            get().updateActivity(activityId, 'Loading the latest media…');
            await get().fetchMedia(true);
        } catch (error) {
            console.error('Failed to refresh library', error);
        } finally {
            await get().finishActivity(activityId);
        }
    },

    fetchMedia: async (reset = false) => {
        if (get().isLoading && !reset) return;
        if (!get().hasMore && !reset) return;

        const requestVersion = reset ? ++mediaRequestVersion : mediaRequestVersion;
        set({ isLoading: true });
        const limit = 50;
        const offset = reset ? 0 : get().mediaItems.length;
        const { activeFeedId, feeds, folderPaths, filters } = get();
        let queryFilters = { ...filters };
        const availableFolders = folderPaths.filter(folder => folder.is_available);
        const availablePathKeys = new Set(
            availableFolders.map(folder => folder.path.replace(/\\/g, '/').toLocaleLowerCase())
        );

        if (activeFeedId === 'favorites') {
            queryFilters.favorites_only = true;
            queryFilters.folder_paths = availableFolders.map(folder => folder.path);
        } else if (activeFeedId !== 'home') {
            const feed = feeds.find(f => f.id === activeFeedId);
            if (feed) {
                const feedFolders = parseFolderPaths(feed.folder_paths);
                queryFilters.folder_paths = feedFolders.filter(path =>
                    availablePathKeys.has(path.replace(/\\/g, '/').toLocaleLowerCase())
                );
            } else {
                queryFilters.folder_paths = [];
            }
        } else {
            // Home feed
            queryFilters.folder_paths = availableFolders.filter(f => f.is_active).map(f => f.path);
        }

        try {
            const newItems = await invoke<MediaItem[]>('get_media', { limit, offset, filters: queryFilters });
            if (requestVersion !== mediaRequestVersion) return;

            set((state) => ({
                mediaItems: reset ? newItems : [...state.mediaItems, ...newItems],
                hasMore: newItems.length === limit,
                isLoading: false
            }));

            if (reset && newItems.length === 0 && queryFilters.folder_paths && queryFilters.folder_paths.length > 0 && activeFeedId !== 'favorites') {
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
            if (requestVersion === mediaRequestVersion) {
                set({ isLoading: false });
            }
        }
    },

    toggleStar: async (id) => {
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
        cancelScheduledFilterFetch();
        mediaRequestVersion += 1;
        const { feeds } = get();
        if (feedId === 'home') {
            set({
                activeFeedId: feedId,
                mediaItems: [],
                filters: { ...DEFAULT_FILTERS }
            });
        } else if (feedId === 'favorites') {
            set({
                activeFeedId: feedId,
                mediaItems: [],
                filters: { ...DEFAULT_FILTERS }
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
        schedulePreferencesSave(get);
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
                set({ activeFeedId: 'home', filters: { ...DEFAULT_FILTERS } });
                schedulePreferencesSave(get);
            }
            await get().loadFeeds();
            get().fetchMedia(true);
        } catch (e) {
            console.error("Failed to delete feed", e);
        }
    },

    exportFavorites: async (targetPath) => {
        try {
            const count = await invoke<number>('export_starred', { targetPath });
            return count;
        } catch (e) {
            console.error("Failed to export favorites", e);
            throw e;
        }
    },

    clearFavorites: async () => {
        try {
            await invoke('clear_favorites');
            if (get().activeFeedId === 'favorites') {
                await get().fetchMedia(true);
            }
        } catch (e) {
            console.error("Failed to clear favorites", e);
        }
    }
}));
