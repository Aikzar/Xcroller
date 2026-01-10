import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppStore } from '../lib/store';
import { MediaItem } from '../lib/types';
import { MediaTile } from './MediaTile';
import { motion, AnimatePresence } from 'framer-motion';
import { convertFileSrc } from '@tauri-apps/api/core';

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
        isLoading
    } = useAppStore();
    const [hoveredItem, setHoveredItem] = useState<MediaItem | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const [viewTop, setViewTop] = useState(0);
    const [viewBottom, setViewBottom] = useState(window.innerHeight);

    // Layout configuration
    const padding = 30; // Increased padding
    const gap = 6;     // Decreased gap
    const { hoverVolume } = useAppStore(); // Get volume
    const previewVideoRef = useRef<HTMLVideoElement>(null);

    // We need to track container width to calculate column width
    const [containerWidth, setContainerWidth] = useState(window.innerWidth - (padding * 2));

    // Sync volume for preview
    useEffect(() => {
        if (previewVideoRef.current) {
            previewVideoRef.current.volume = hoverVolume;
        }
    }, [hoverVolume, hoveredItem]);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Use contentRect for precise width excluding scrollbar
                setContainerWidth(entry.contentRect.width - (padding * 2));
            }
        });

        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, [padding]);

    const columnWidth = Math.floor((containerWidth - (gap * (columns - 1))) / columns);

    // Infinite scroll observer
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasMore && !isLoading) {
                fetchMedia();
            }
        }, { threshold: 0.1 });

        if (loadMoreRef.current) observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [hasMore, isLoading, fetchMedia]);

    // Calculate masonry positions
    const { itemPositions, totalHeight } = useMemo(() => {
        if (columns <= 0 || containerWidth <= 0) return { itemPositions: [], totalHeight: 0 };

        const columnHeights = new Array(columns).fill(padding);
        const positions: Array<{ top: number; left: number; height: number }> = [];

        mediaItems.forEach((item) => {
            const shortestColIndex = columnHeights.indexOf(Math.min(...columnHeights));

            let height = columnWidth;
            if (item.width && item.height && item.width > 0) {
                const aspectRatio = item.height / item.width;
                height = Math.round(columnWidth * aspectRatio);
            }

            positions.push({
                top: columnHeights[shortestColIndex],
                left: padding + shortestColIndex * (columnWidth + gap),
                height
            });

            columnHeights[shortestColIndex] += height + gap;
        });

        return { itemPositions: positions, totalHeight: Math.max(...columnHeights) + padding };
    }, [mediaItems, columns, columnWidth, gap, padding, containerWidth]);

    // Handle scroll for autoscroll and virtualization
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        let lastRafTime = 0;
        let rafId: number;
        // Force initial view update
        setViewBottom(container.scrollTop + container.clientHeight + 2000);

        let lastUpdateTime = 0;

        const scroll = (time: number) => {
            if (!lastRafTime) lastRafTime = time;
            const deltaTime = time - lastRafTime;
            lastRafTime = time;

            if (isAutoScrolling && !isHoverPaused) {
                // Adjust speed based on deltaTime to keep it consistent
                container.scrollTop += (autoScrollSpeed * deltaTime) / 8;
            }
            rafId = requestAnimationFrame(scroll);
        };

        const updateView = () => {
            const now = performance.now();
            // Throttle state updates to ~30fps even if scrolling faster
            if (now - lastUpdateTime > 32) {
                setViewTop(container.scrollTop);
                setViewBottom(container.scrollTop + container.clientHeight + 2000); // 2000px buffer
                lastUpdateTime = now;
            }
        };

        container.addEventListener('scroll', updateView, { passive: true });
        rafId = requestAnimationFrame(scroll);

        return () => {
            container.removeEventListener('scroll', updateView);
            cancelAnimationFrame(rafId);
        };
    }, [isAutoScrolling, isHoverPaused, autoScrollSpeed]);

    const handleHoverStart = useCallback((item: MediaItem) => {
        setHoveredItem(item);
        setIsHoverPaused(true);
    }, [setIsHoverPaused]);

    const handleHoverEnd = useCallback(() => {
        setHoveredItem(null);
        setIsHoverPaused(false);
    }, [setIsHoverPaused]);

    // Optimized visibility calculation
    const visibleIndices = useMemo(() => {
        const indices = [];
        const buffer = 1500; // Large buffer for smooth high-speed scrolling
        for (let i = 0; i < mediaItems.length; i++) {
            const pos = itemPositions[i];
            if (!pos) continue;
            if (pos.top + pos.height > viewTop - buffer && pos.top < viewBottom + buffer) {
                indices.push(i);
            }
        }
        return indices;
    }, [itemPositions, viewTop, viewBottom, mediaItems.length]);

    return (
        <div
            id="media-scroll-container"
            ref={scrollContainerRef}
            className="w-full h-full overflow-y-auto overflow-x-hidden no-scrollbar bg-xcroller-base pt-[70px]"
        >
            <div
                className="relative w-full"
                style={{ height: totalHeight }}
            >
                {visibleIndices.map((index) => {
                    const item = mediaItems[index];
                    const pos = itemPositions[index];
                    if (!item || !pos) return null;

                    const isHovered = hoveredItem?.id === item.id;

                    return (
                        <div
                            key={item.id}
                            className={`absolute ${isHovered ? 'z-50' : 'z-10'}`}
                            style={{
                                width: columnWidth,
                                height: pos.height,
                                top: pos.top,
                                left: pos.left,
                            }}
                        >
                            <MediaTile
                                item={item}
                                style={{ width: '100%', height: '100%' }}
                                onHoverStart={() => handleHoverStart(item)}
                                onHoverEnd={handleHoverEnd}
                                onClick={() => { }}
                            />
                        </div>
                    );
                })}

                {/* Infinite Scroll Trigger */}
                <div
                    ref={loadMoreRef}
                    className="absolute w-full h-40 flex items-center justify-center gap-2"
                    style={{ top: totalHeight - 100 }}
                >
                    {isLoading && (
                        <div className="flex gap-2">
                            <div className="w-3 h-3 bg-xcroller-red rounded-full animate-bounce" />
                            <div className="w-3 h-3 bg-xcroller-red rounded-full animate-bounce [animation-delay:0.2s]" />
                            <div className="w-3 h-3 bg-xcroller-red rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                    )}
                </div>
            </div>

            {/* Hover Preview Overlay */}
            <AnimatePresence>
                {hoveredItem && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center p-0 bg-black/40 backdrop-blur-sm"
                    >
                        <div className="relative flex items-center justify-center max-h-[80vh] max-w-[80vw] w-auto h-auto rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/10 bg-xcroller-surface">
                            {hoveredItem.file_type === 'video' ? (
                                <video
                                    ref={previewVideoRef}
                                    src={convertFileSrc(hoveredItem.path)}
                                    className="w-auto h-auto max-h-[80vh] max-w-full object-contain"
                                    autoPlay
                                    muted={false}
                                    loop
                                    playsInline
                                />
                            ) : (
                                <img
                                    src={convertFileSrc(hoveredItem.path)}
                                    alt={hoveredItem.path}
                                    className="w-auto h-auto max-h-[80vh] max-w-full object-contain"
                                />
                            )}

                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
                                <p className="text-white text-lg font-bold truncate">{hoveredItem.path.split(/[\\/]/).pop()}</p>
                                <div className="flex gap-3 text-sm text-white/60 mt-1">
                                    <span className="bg-white/10 px-2 py-0.5 rounded uppercase tracking-wider text-[10px] font-bold text-white/80">{hoveredItem.file_type}</span>
                                    {hoveredItem.width && <span>{hoveredItem.width}x{hoveredItem.height}</span>}
                                    {hoveredItem.duration_sec && (
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
