export interface MediaItem {
    id: number;
    path: string;
    file_type: "image" | "video";
    size_bytes: number;
    created_at: number;
    width?: number;
    height?: number;
    duration_sec?: number;
    starred: boolean;
    thumbnail_path?: string;
}

export interface Folder {
    id: number;
    path: string;
    is_active: boolean;
}

export interface Feed {
    id?: number;
    name: string;
    folder_paths: string; // JSON: string[]
    filter_config: string; // JSON: FilterOptions
}

export interface FilterOptions {
    media_type?: "image" | "video" | "all";
    orientation?: "horizontal" | "vertical" | "square" | "all";
    min_width?: number;
    min_height?: number;
    min_duration?: number;
    max_duration?: number;
    min_size?: number;
    max_size?: number;
    extensions?: string[];
    folder_paths?: string[]; // Selection of folders for this feed
    sort_by?: "created_at" | "size_bytes" | "resolution" | "duration_sec" | "random";
    sort_order?: "asc" | "desc";
}
