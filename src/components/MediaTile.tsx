import React, { useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { Clock3, Play, Star } from 'lucide-react';
import { MediaItem } from '../lib/types';
import { cn } from '../lib/utils';
import { useAppStore } from '../lib/store';
import {
    cacheVideoFrame,
    discardVideoThumbnail,
    getCachedVideoThumbnail,
    requestVideoThumbnail
} from '../lib/videoThumbnails';

interface MediaTileProps {
    item: MediaItem;
    shouldPlayVideo: boolean;
    shouldLoadThumbnail: boolean;
    onHoverStart?: (item: MediaItem) => void;
    onHoverEnd?: () => void;
}

const formatDuration = (duration: number) => {
    const totalSeconds = Math.max(0, Math.round(duration));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const MediaTile = React.memo(({
    item,
    shouldPlayVideo,
    shouldLoadThumbnail,
    onHoverStart,
    onHoverEnd
}: MediaTileProps) => {
    const toggleStar = useAppStore((state) => state.toggleStar);
    const updateItemMetadata = useAppStore((state) => state.updateItemMetadata);
    const [isHovered, setIsHovered] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(
        () => getCachedVideoThumbnail(item.path) ?? null
    );
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
    const retryTimerRef = useRef<number | undefined>(undefined);
    const videoRef = useRef<HTMLVideoElement>(null);

    const placeholderColor = useMemo(() => {
        const hash = item.path.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const colors = [
            'bg-red-900/20', 'bg-blue-900/20', 'bg-green-900/20',
            'bg-yellow-900/20', 'bg-purple-900/20', 'bg-pink-900/20',
            'bg-emerald-900/20', 'bg-indigo-900/20', 'bg-orange-900/20'
        ];
        return colors[hash % colors.length];
    }, [item.path]);

    const assetUrl = useMemo(() => {
        const baseUrl = convertFileSrc(item.path);
        return retryCount > 0 ? `${baseUrl}?r=${retryCount}` : baseUrl;
    }, [item.path, retryCount]);

    useEffect(() => {
        if (!thumbnailBlob) {
            setThumbnailUrl(null);
            return;
        }

        const objectUrl = URL.createObjectURL(thumbnailBlob);
        setThumbnailUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [thumbnailBlob]);

    useEffect(() => {
        if (item.file_type !== 'video') return;

        const cached = getCachedVideoThumbnail(item.path);
        if (cached) {
            setThumbnailBlob(cached);
            return;
        }
        if (!shouldLoadThumbnail || shouldPlayVideo) return;

        const controller = new AbortController();
        void requestVideoThumbnail(item.path, assetUrl, controller.signal)
            .then(setThumbnailBlob)
            .catch((error: unknown) => {
                if (!(error instanceof DOMException && error.name === 'AbortError')) {
                    // The clock placeholder remains available if a codec cannot be captured.
                }
            });
        return () => controller.abort();
    }, [assetUrl, item.file_type, item.path, shouldLoadThumbnail, shouldPlayVideo]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || item.file_type !== 'video') return;

        if (shouldPlayVideo) {
            void video.play().catch(() => {
                // Autoplay can be declined briefly while a source is changing.
            });
        } else {
            video.pause();
            setIsLoaded(false);
            video.removeAttribute('src');
            video.load();
        }
    }, [item.file_type, shouldPlayVideo, assetUrl]);

    useEffect(() => () => {
        if (retryTimerRef.current !== undefined) {
            window.clearTimeout(retryTimerRef.current);
        }
        const video = videoRef.current;
        if (video) {
            video.pause();
            video.removeAttribute('src');
            video.load();
        }
    }, []);

    const handleLoadError = () => {
        if (retryCount < 2) {
            retryTimerRef.current = window.setTimeout(
                () => setRetryCount((count) => count + 1),
                800 * (retryCount + 1)
            );
        } else {
            setLoadError(true);
        }
    };

    const handleVideoMetadata = (video: HTMLVideoElement) => {
        const width = video.videoWidth || item.width;
        const height = video.videoHeight || item.height;
        const duration = Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : item.duration_sec;

        const hasNewDimensions = Boolean(width && height && (!item.width || !item.height));
        const hasNewDuration = duration != null && item.duration_sec == null;
        if (!hasNewDimensions && !hasNewDuration) return;

        const metadata = { width, height, duration_sec: duration };
        updateItemMetadata(item.id, metadata);
        void invoke('update_media_metadata', {
            id: item.id,
            width,
            height,
            durationSec: duration
        }).catch(() => {
            // The in-memory metadata still improves the current session.
        });
    };

    const isWaitingForMedia = !loadError && !isLoaded && (
        item.file_type === 'image' || shouldPlayVideo
    );

    return (
        <div
            className="absolute inset-0 p-2 transition-transform duration-150 ease-out hover:scale-[1.02]"
        >
            <div
                className={cn(
                    'w-full h-full relative group rounded-xl overflow-hidden bg-xcroller-surface origin-center outline outline-1 outline-white/10 transition-[box-shadow,outline-color] duration-150',
                    isHovered
                        ? 'z-50 outline-2 outline-xcroller-red shadow-2xl'
                        : 'z-0 shadow-lg',
                    placeholderColor
                )}
                onMouseEnter={() => {
                    setIsHovered(true);
                    onHoverStart?.(item);
                }}
                onMouseLeave={() => {
                    setIsHovered(false);
                    onHoverEnd?.();
                }}
                onClick={() => {
                    const { setSelectedMediaId, setIsAutoScrolling } = useAppStore.getState();
                    setSelectedMediaId(item.id);
                    setIsAutoScrolling(false);
                }}
            >
                {isWaitingForMedia && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full border-2 border-white/5 border-t-xcroller-red/40 motion-safe:animate-spin" />
                    </div>
                )}

                {loadError && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center text-[10px] font-bold uppercase text-xcroller-muted/70">
                        Preview unavailable
                    </div>
                )}

                {!loadError && item.file_type === 'video' && (
                    <>
                        {thumbnailUrl && (
                            <img
                                src={thumbnailUrl}
                                alt=""
                                aria-hidden="true"
                                className="absolute inset-0 z-0 block w-full h-full object-cover"
                                decoding="async"
                                onError={() => {
                                    discardVideoThumbnail(item.path, thumbnailBlob);
                                    setThumbnailBlob(null);
                                }}
                            />
                        )}
                        <video
                            ref={videoRef}
                            src={shouldPlayVideo ? assetUrl : undefined}
                            crossOrigin="anonymous"
                            className={cn(
                                'block w-full h-full object-cover relative z-10 transition-opacity duration-200',
                                isLoaded ? 'opacity-100' : 'opacity-0'
                            )}
                            autoPlay={shouldPlayVideo}
                            muted
                            loop
                            playsInline
                            preload={shouldPlayVideo ? 'auto' : 'none'}
                            disablePictureInPicture
                            onLoadedData={(event) => {
                                setIsLoaded(true);
                                void cacheVideoFrame(item.path, event.currentTarget)
                                    .then(setThumbnailBlob)
                                    .catch(() => {
                                        // Playback can continue if this codec cannot be captured.
                                    });
                            }}
                            onLoadedMetadata={(event) => handleVideoMetadata(event.currentTarget)}
                            onError={handleLoadError}
                        />
                    </>
                )}

                {!loadError && item.file_type === 'image' && (
                    <img
                        src={assetUrl}
                        alt={item.path.split(/[\\/]/).pop() ?? 'Media item'}
                        className={cn(
                            'block w-full h-full object-cover relative z-10 transition-opacity duration-200',
                            isLoaded ? 'opacity-100' : 'opacity-0'
                        )}
                        loading="lazy"
                        decoding="async"
                        onLoad={(event) => {
                            setIsLoaded(true);
                            const image = event.currentTarget;
                            if (!item.width || !item.height) {
                                updateItemMetadata(item.id, {
                                    width: image.naturalWidth,
                                    height: image.naturalHeight
                                });
                                void invoke('update_media_dimensions', {
                                    id: item.id,
                                    width: image.naturalWidth,
                                    height: image.naturalHeight
                                }).catch(() => {
                                    // The current layout already has the dimensions.
                                });
                            }
                        }}
                        onError={handleLoadError}
                    />
                )}

                <div className="absolute inset-0 z-20 pointer-events-none bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150" />

                {item.file_type === 'video' && (
                    <div className="absolute z-30 top-2 right-2 flex items-center gap-1.5 bg-black/60 px-2 py-1 rounded-full">
                        <Play size={11} className="fill-white text-white" />
                        {item.duration_sec != null && (
                            <span className="text-[10px] font-semibold tabular-nums text-white">
                                {formatDuration(item.duration_sec)}
                            </span>
                        )}
                    </div>
                )}

                {item.file_type === 'video' && !thumbnailUrl && !isLoaded && !shouldPlayVideo && !loadError && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center text-white/35">
                        <Clock3 size={24} />
                    </div>
                )}

                <button
                    type="button"
                    aria-label={item.starred ? 'Remove from favorites' : 'Add to favorites'}
                    onClick={(event) => {
                        event.stopPropagation();
                        toggleStar(item.id);
                    }}
                    className={cn(
                        'absolute z-30 bottom-2 right-2 p-2 rounded-full transition-[background-color,color,opacity,transform] duration-150 active:scale-[0.96]',
                        item.starred
                            ? 'bg-xcroller-accent text-xcroller-on-accent opacity-100'
                            : 'bg-black/40 text-white/70 hover:bg-xcroller-accent hover:text-xcroller-on-accent opacity-0 group-hover:opacity-100'
                    )}
                >
                    <Star size={16} className={cn(item.starred && 'fill-current')} />
                </button>

                <div className="absolute z-30 bottom-2 left-3 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
                    <p className="text-xs font-medium text-white drop-shadow-md truncate max-w-[150px]">
                        {item.path.split(/[\\/]/).pop()}
                    </p>
                </div>
            </div>
        </div>
    );
});

MediaTile.displayName = 'MediaTile';
