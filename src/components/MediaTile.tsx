import React, { useState, useMemo } from 'react';
import { MediaItem } from '../lib/types';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';
import { Star, Play } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { convertFileSrc } from '@tauri-apps/api/core';

interface MediaTileProps {
    item: MediaItem;
    style: React.CSSProperties;
    onHoverStart?: () => void;
    onHoverEnd?: () => void;
    onClick?: () => void;
}

export const MediaTile = React.memo(({ item, style, onHoverStart, onHoverEnd, onClick }: MediaTileProps) => {
    const { toggleStar } = useAppStore();
    const [isHovered, setIsHovered] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [retryCount, setRetryCount] = useState(0);

    // Deterministic background for that Pinterest "placeholder" look
    const placeholderColor = useMemo(() => {
        const hash = item.path.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const colors = [
            'bg-red-900/20', 'bg-blue-900/20', 'bg-green-900/20',
            'bg-yellow-900/20', 'bg-purple-900/20', 'bg-pink-900/20',
            'bg-emerald-900/20', 'bg-indigo-900/20', 'bg-orange-900/20'
        ];
        return colors[hash % colors.length];
    }, [item.path]);

    // Use Tauri's optimized asset protocol for direct file streaming
    const assetUrl = useMemo(() => {
        // Append a small key to force re-evaluation on retry
        const baseUrl = convertFileSrc(item.path);
        return retryCount > 0 ? `${baseUrl}?r=${retryCount}` : baseUrl;
    }, [item.path, retryCount]);

    const handleLoadError = () => {
        console.error(`[MediaTile] Failed to load: ${item.path} (URL: ${assetUrl})`);
        if (retryCount < 3) {
            setTimeout(() => setRetryCount(prev => prev + 1), 1000 * (retryCount + 1));
        } else {
            setLoadError(true);
        }
    };

    const handleMouseEnter = () => {
        setIsHovered(true);
        onHoverStart?.();
    };

    const handleMouseLeave = () => {
        setIsHovered(false);
        onHoverEnd?.();
    };

    return (
        <motion.div
            style={style}
            className="absolute top-0 left-0 p-2"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
        >
            <div
                className={cn(
                    "w-full h-full relative group rounded-xl overflow-hidden bg-xcroller-surface transition-all duration-500 origin-center border border-white/5",
                    isHovered ? "z-50 ring-2 ring-xcroller-red shadow-2xl" : "z-0 shadow-lg",
                    placeholderColor
                )}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onClick={() => {
                    const { setSelectedMediaId, setIsAutoScrolling } = useAppStore.getState();
                    if (item.id !== undefined && item.id !== null) {
                        setSelectedMediaId(item.id);
                    }
                    setIsAutoScrolling(false); // STOP permanently on click
                    onClick?.();
                }}
            >
                {/* Skeleton / Placeholder / Error */}
                {!isLoaded && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center">
                        {loadError ? (
                            <div className="text-xcroller-muted flex flex-col items-center gap-1">
                                <span className="text-[10px] font-bold uppercase opacity-50">Error Loading</span>
                            </div>
                        ) : (
                            <div className="animate-pulse w-8 h-8 rounded-full border-2 border-white/5 border-t-xcroller-red/40 animate-spin" />
                        )}
                    </div>
                )}

                {assetUrl && !loadError ? (
                    item.file_type === 'video' ? (
                        <video
                            src={assetUrl}
                            className={cn("w-full h-full object-cover relative z-10 transition-opacity duration-500", isLoaded ? "opacity-100" : "opacity-0")}
                            autoPlay
                            muted
                            loop
                            playsInline
                            preload="metadata"
                            onLoadedData={() => setIsLoaded(true)}
                            onError={handleLoadError}
                            onLoadedMetadata={async (e) => {
                                const video = e.currentTarget;
                                if (!item.width || !item.height) {
                                    try {
                                        const { updateItemDimensions } = useAppStore.getState();
                                        if (item.width !== video.videoWidth || item.height !== video.videoHeight) {
                                            updateItemDimensions(item.id!, video.videoWidth, video.videoHeight);
                                            const { invoke } = await import('@tauri-apps/api/core');
                                            invoke('update_media_dimensions', {
                                                id: item.id,
                                                width: video.videoWidth,
                                                height: video.videoHeight
                                            }).catch(() => { });
                                        }
                                    } catch (err) { }
                                }
                            }}
                        />
                    ) : (
                        <img
                            src={assetUrl}
                            alt={item.path}
                            className={cn("w-full h-full object-cover relative z-10 transition-opacity duration-500", isLoaded ? "opacity-100" : "opacity-0")}
                            loading="lazy"
                            onLoad={(e) => {
                                setIsLoaded(true);
                                const img = e.currentTarget;
                                if (!item.width || !item.height) {
                                    const { updateItemDimensions } = useAppStore.getState();
                                    if (item.width !== img.naturalWidth || item.height !== img.naturalHeight) {
                                        updateItemDimensions(item.id!, img.naturalWidth, img.naturalHeight);
                                        import('@tauri-apps/api/core').then(m => {
                                            m.invoke('update_media_dimensions', {
                                                id: item.id,
                                                width: img.naturalWidth,
                                                height: img.naturalHeight
                                            }).catch(() => { });
                                        });
                                    }
                                }
                            }}
                            onError={handleLoadError}
                        />
                    )
                ) : (
                    <div className="w-full h-full flex items-center justify-center relative z-10 bg-xcroller-surface">
                        {loadError && <div className="text-[10px] text-xcroller-muted uppercase font-bold">Access Denied</div>}
                    </div>
                )}

                {/* Overlay Gradients */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                {/* Video Indicator */}
                {item.file_type === 'video' && (
                    <div className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full backdrop-blur-sm">
                        <Play size={12} className="fill-white text-white" />
                    </div>
                )}

                {/* Actions (Star) */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleStar(item.id);
                    }}
                    className={cn(
                        "absolute bottom-2 right-2 p-2 rounded-full transition-all duration-200",
                        item.starred
                            ? "bg-xcroller-accent text-white opacity-100"
                            : "bg-black/40 text-white/70 hover:bg-xcroller-accent hover:text-white opacity-0 group-hover:opacity-100"
                    )}
                >
                    <Star size={16} className={cn(item.starred && "fill-current")} />
                </button>

                {/* Info */}
                <div className="absolute bottom-2 left-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                    <p className="text-xs font-medium text-white shadow-black drop-shadow-md truncate max-w-[150px]">
                        {item.path.split(/[\\/]/).pop()}
                    </p>
                </div>
            </div>
        </motion.div >
    );
});
