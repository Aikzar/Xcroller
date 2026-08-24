import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../lib/store';
import { MediaItem } from '../lib/types';
import { MediaTile } from './MediaTile';

const GRID_PADDING = 30;
const GRID_GAP = 6;
const RENDER_OVERSCAN = 400;
const VIDEO_PLAY_OVERSCAN = 100;
const MAX_ACTIVE_VIDEO_COLUMNS = 8;
const HOVER_PREVIEW_DELAY_MS = 35;
const SCROLL_IDLE_DELAY_MS = 120;

export const MediaGrid = () => {
    const {
        mediaItems,
        columns,
        isAutoScrolling,
        isHoverPaused,
        setIsHoverPaused,
        autoScrollSpeed,
        fetchMedia,
        hasMore,
        isLoading,
        hoverVolume,
        selectedMediaId
    } = useAppStore(useShallow((state) => ({
        mediaItems: state.mediaItems,
        columns: state.columns,
        isAutoScrolling: state.isAutoScrolling,
        isHoverPaused: state.isHoverPaused,
        setIsHoverPaused: state.setIsHoverPaused,
        autoScrollSpeed: state.autoScrollSpeed,
        fetchMedia: state.fetchMedia,
        hasMore: state.hasMore,
        isLoading: state.isLoading,
        hoverVolume: state.hoverVolume,
        selectedMediaId: state.selectedMediaId
    })));

    const [hoveredItem, setHoveredItem] = useState<MediaItem | null>(null);
    const [isScrolling, setIsScrolling] = useState(false);
    const [viewport, setViewport] = useState({ top: 0, bottom: window.innerHeight });
    const [containerWidth, setContainerWidth] = useState(
        Math.max(1, window.innerWidth - (GRID_PADDING * 2))
    );
    const [toolbarOffset, setToolbarOffset] = useState(() => {
        const value = Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--xcroller-toolbar-offset')
        );
        return Number.isFinite(value) ? value : 70;
    });
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const previewVideoRef = useRef<HTMLVideoElement>(null);
    const hoverTimerRef = useRef<number | undefined>(undefined);
    const scrollIdleTimerRef = useRef<number | undefined>(undefined);
    const isScrollingRef = useRef(false);

    useEffect(() => {
        if (previewVideoRef.current) {
            previewVideoRef.current.volume = hoverVolume;
        }
    }, [hoverVolume, hoveredItem]);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const resizeObserver = new ResizeObserver(([entry]) => {
            if (!entry) return;
            setContainerWidth(Math.max(1, entry.contentRect.width - (GRID_PADDING * 2)));
            const nextToolbarOffset = Number.parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue('--xcroller-toolbar-offset')
            );
            if (Number.isFinite(nextToolbarOffset)) setToolbarOffset(nextToolbarOffset);
            setViewport({
                top: container.scrollTop,
                bottom: container.scrollTop + container.clientHeight
            });
        });

        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, []);

    const columnWidth = Math.max(
        1,
        Math.floor((containerWidth - (GRID_GAP * (columns - 1))) / columns)
    );

    useEffect(() => {
        const root = scrollContainerRef.current;
        const target = loadMoreRef.current;
        if (!root || !target) return;

        const observer = new IntersectionObserver(([entry]) => {
            if (entry?.isIntersecting && hasMore && !isLoading) {
                void fetchMedia();
            }
        }, {
            root,
            rootMargin: '1200px 0px',
            threshold: 0
        });

        observer.observe(target);
        return () => observer.disconnect();
    }, [hasMore, isLoading, fetchMedia]);

    const { itemPositions, totalHeight } = useMemo(() => {
        if (columns <= 0 || containerWidth <= 0) {
            return { itemPositions: [], totalHeight: 0 };
        }

        const columnHeights = new Array(columns).fill(GRID_PADDING);
        const positions: Array<{
            top: number;
            left: number;
            height: number;
            bottom: number;
            maxBottom: number;
        }> = [];
        let maxBottom = 0;

        mediaItems.forEach((item) => {
            const shortestColumn = columnHeights.indexOf(Math.min(...columnHeights));
            let height = columnWidth;

            if (item.width && item.height && item.width > 0) {
                height = Math.round(columnWidth * (item.height / item.width));
            }

            const top = columnHeights[shortestColumn];
            const bottom = top + height;
            maxBottom = Math.max(maxBottom, bottom);
            positions.push({
                top,
                left: GRID_PADDING + shortestColumn * (columnWidth + GRID_GAP),
                height,
                bottom,
                maxBottom
            });
            columnHeights[shortestColumn] += height + GRID_GAP;
        });

        return {
            itemPositions: positions,
            totalHeight: Math.max(GRID_PADDING, ...columnHeights) + GRID_PADDING
        };
    }, [mediaItems, columns, columnWidth, containerWidth]);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        let viewportFrame: number | undefined;
        const updateViewport = () => {
            if (!isScrollingRef.current) {
                isScrollingRef.current = true;
                setIsScrolling(true);
            }
            if (scrollIdleTimerRef.current !== undefined) {
                window.clearTimeout(scrollIdleTimerRef.current);
            }
            scrollIdleTimerRef.current = window.setTimeout(() => {
                isScrollingRef.current = false;
                setIsScrolling(false);
            }, SCROLL_IDLE_DELAY_MS);

            if (viewportFrame !== undefined) return;
            viewportFrame = requestAnimationFrame(() => {
                viewportFrame = undefined;
                setViewport({
                    top: container.scrollTop,
                    bottom: container.scrollTop + container.clientHeight
                });
            });
        };

        updateViewport();
        container.addEventListener('scroll', updateViewport, { passive: true });
        return () => {
            container.removeEventListener('scroll', updateViewport);
            if (viewportFrame !== undefined) cancelAnimationFrame(viewportFrame);
            if (scrollIdleTimerRef.current !== undefined) {
                window.clearTimeout(scrollIdleTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container || !isAutoScrolling) return;

        let lastFrameTime = 0;
        let frameId = 0;
        let scrollAccumulator = container.scrollTop;

        const scroll = (time: number) => {
            if (!lastFrameTime) lastFrameTime = time;
            const deltaTime = Math.min(time - lastFrameTime, 50);
            lastFrameTime = time;

            if (!isHoverPaused) {
                if (Math.abs(container.scrollTop - scrollAccumulator) > 5) {
                    scrollAccumulator = container.scrollTop;
                }
                scrollAccumulator += (autoScrollSpeed * deltaTime) / 8;
                container.scrollTop = scrollAccumulator;
            } else {
                scrollAccumulator = container.scrollTop;
            }

            frameId = requestAnimationFrame(scroll);
        };

        frameId = requestAnimationFrame(scroll);
        return () => cancelAnimationFrame(frameId);
    }, [isAutoScrolling, isHoverPaused, autoScrollSpeed]);

    useEffect(() => () => {
        if (hoverTimerRef.current !== undefined) {
            window.clearTimeout(hoverTimerRef.current);
        }
        if (scrollIdleTimerRef.current !== undefined) {
            window.clearTimeout(scrollIdleTimerRef.current);
        }
    }, []);

    const handleHoverStart = useCallback((item: MediaItem) => {
        setIsHoverPaused(true);
        if (hoverTimerRef.current !== undefined) {
            window.clearTimeout(hoverTimerRef.current);
        }
        hoverTimerRef.current = window.setTimeout(() => {
            setHoveredItem(item);
        }, HOVER_PREVIEW_DELAY_MS);
    }, [setIsHoverPaused]);

    const handleHoverEnd = useCallback(() => {
        if (hoverTimerRef.current !== undefined) {
            window.clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = undefined;
        }
        setHoveredItem(null);
        setIsHoverPaused(false);
    }, [setIsHoverPaused]);

    const contentViewportTop = Math.max(0, viewport.top - toolbarOffset);
    const contentViewportBottom = Math.max(0, viewport.bottom - toolbarOffset);

    const visibleIndices = useMemo(() => {
        const lowerBound = contentViewportTop - RENDER_OVERSCAN;
        const upperBound = contentViewportBottom + RENDER_OVERSCAN;
        const indices: number[] = [];

        // Positions are created in non-decreasing top order. Use the running
        // maximum bottom edge to find the first potentially visible tile in
        // O(log n), then inspect only the small window around the viewport.
        let low = 0;
        let high = itemPositions.length;
        while (low < high) {
            const middle = Math.floor((low + high) / 2);
            if (itemPositions[middle].maxBottom > lowerBound) {
                high = middle;
            } else {
                low = middle + 1;
            }
        }

        for (let index = low; index < itemPositions.length; index += 1) {
            const position = itemPositions[index];
            if (position.top >= upperBound) break;
            if (
                position.bottom > lowerBound &&
                position.top < upperBound
            ) {
                indices.push(index);
            }
        }
        return indices;
    }, [itemPositions, contentViewportTop, contentViewportBottom]);

    const activeVideoIds = useMemo(() => {
        if (selectedMediaId !== null) return new Set<number>();

        const viewportCenter = (contentViewportTop + contentViewportBottom) / 2;
        const candidates = visibleIndices
            .filter((index) => {
                const item = mediaItems[index];
                const position = itemPositions[index];
                return item?.file_type === 'video' &&
                    item.id !== hoveredItem?.id &&
                    position.top + position.height > contentViewportTop - VIDEO_PLAY_OVERSCAN &&
                    position.top < contentViewportBottom + VIDEO_PLAY_OVERSCAN;
            })
            .map((index) => ({
                id: mediaItems[index].id,
                column: Math.max(0, Math.round(
                    (itemPositions[index].left - GRID_PADDING) / (columnWidth + GRID_GAP)
                )),
                distance: Math.abs(
                    itemPositions[index].top + (itemPositions[index].height / 2) - viewportCenter
                )
            }))
            .sort((a, b) => a.distance - b.distance);

        // Keep the video nearest the center playing in each column. This gives
        // every column motion during manual and automatic scrolling, while
        // bounding decoder pressure on very dense grids.
        const closestByColumn = new Map<number, number>();
        for (const candidate of candidates) {
            if (closestByColumn.has(candidate.column)) continue;
            closestByColumn.set(candidate.column, candidate.id);
            if (closestByColumn.size >= MAX_ACTIVE_VIDEO_COLUMNS) break;
        }

        return new Set(closestByColumn.values());
    }, [
        visibleIndices,
        mediaItems,
        itemPositions,
        hoveredItem?.id,
        contentViewportTop,
        contentViewportBottom,
        columnWidth,
        columns,
        selectedMediaId,
    ]);

    return (
        <div
            id="media-scroll-container"
            ref={scrollContainerRef}
            className="xcroller-media-grid w-full h-full overflow-y-auto overflow-x-hidden no-scrollbar bg-xcroller-base"
        >
            <div className="relative w-full" style={{ height: totalHeight }}>
                {visibleIndices.map((index) => {
                    const item = mediaItems[index];
                    const position = itemPositions[index];
                    if (!item || !position) return null;

                    const isHovered = hoveredItem?.id === item.id;
                    return (
                        <div
                            key={item.id}
                            className={`absolute ${isHovered ? 'z-50' : 'z-10'}`}
                            style={{
                                width: columnWidth,
                                height: position.height,
                                top: position.top,
                                left: position.left,
                                contain: 'strict'
                            }}
                        >
                            <MediaTile
                                item={item}
                                shouldPlayVideo={activeVideoIds.has(item.id)}
                                shouldLoadThumbnail={!isScrolling}
                                onHoverStart={handleHoverStart}
                                onHoverEnd={handleHoverEnd}
                            />
                        </div>
                    );
                })}

                <div
                    ref={loadMoreRef}
                    className="absolute w-full h-40 flex items-center justify-center gap-2"
                    style={{ top: Math.max(0, totalHeight - 100) }}
                >
                    {isLoading && (
                        <div className="flex gap-2" role="status" aria-label="Loading more media">
                            <div className="w-3 h-3 bg-xcroller-red rounded-full motion-safe:animate-bounce" />
                            <div className="w-3 h-3 bg-xcroller-red rounded-full motion-safe:animate-bounce [animation-delay:0.2s]" />
                            <div className="w-3 h-3 bg-xcroller-red rounded-full motion-safe:animate-bounce [animation-delay:0.4s]" />
                        </div>
                    )}
                </div>
            </div>

            <AnimatePresence initial={false}>
                {hoveredItem && (
                    <motion.div
                        key={hoveredItem.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.06 }}
                        className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center bg-black/60"
                    >
                        <div className="relative flex items-center justify-center max-h-[80vh] max-w-[80vw] rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] outline outline-1 outline-white/10 bg-[#0b0b0c]">
                            {hoveredItem.file_type === 'video' ? (
                                <video
                                    ref={previewVideoRef}
                                    src={convertFileSrc(hoveredItem.path)}
                                    className="w-auto h-auto max-h-[80vh] max-w-full object-contain"
                                    autoPlay
                                    preload="auto"
                                    muted={false}
                                    loop
                                    playsInline
                                    disablePictureInPicture
                                />
                            ) : (
                                <img
                                    src={convertFileSrc(hoveredItem.path)}
                                    alt={hoveredItem.path.split(/[\\/]/).pop() ?? 'Media preview'}
                                    className="w-auto h-auto max-h-[80vh] max-w-full object-contain"
                                />
                            )}

                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
                                <p className="text-white text-lg font-bold truncate">
                                    {hoveredItem.path.split(/[\\/]/).pop()}
                                </p>
                                <div className="flex gap-3 text-sm text-white/60 mt-1">
                                    <span className="bg-white/10 px-2 py-0.5 rounded uppercase tracking-wider text-[10px] font-bold text-white/80">
                                        {hoveredItem.file_type}
                                    </span>
                                    {hoveredItem.width && <span>{hoveredItem.width}x{hoveredItem.height}</span>}
                                    {hoveredItem.duration_sec != null && (
                                        <span>{Math.round(hoveredItem.duration_sec)}s</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
