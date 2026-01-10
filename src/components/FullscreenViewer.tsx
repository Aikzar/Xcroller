import { useEffect, useState, useRef, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../lib/store';
import { convertFileSrc } from '@tauri-apps/api/core';

export function FullscreenViewer() {
    const { mediaItems, selectedMediaId, setSelectedMediaId } = useAppStore();
    const [isPlaying, setIsPlaying] = useState(true);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [showControls, setShowControls] = useState(true);
    const videoRef = useRef<HTMLVideoElement>(null);
    const controlsTimeoutRef = useRef<number | undefined>(undefined);

    const selectedIndex = mediaItems.findIndex(i => i.id === selectedMediaId);
    const item = mediaItems[selectedIndex];

    const handleClose = () => setSelectedMediaId(null);

    const handleNext = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (selectedIndex < mediaItems.length - 1) {
            setSelectedMediaId(mediaItems[selectedIndex + 1].id!);
        }
    };

    const handlePrev = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (selectedIndex > 0) {
            setSelectedMediaId(mediaItems[selectedIndex - 1].id!);
        }
    };

    const togglePlayPause = () => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTime = parseFloat(e.target.value);
        setCurrentTime(newTime);
        if (videoRef.current) {
            videoRef.current.currentTime = newTime;
        }
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = parseFloat(e.target.value);
        setVolume(newVolume);
        setIsMuted(newVolume === 0);
        if (videoRef.current) {
            videoRef.current.volume = newVolume;
        }
    };

    const toggleMute = () => {
        if (videoRef.current) {
            const newMuted = !isMuted;
            setIsMuted(newMuted);
            videoRef.current.muted = newMuted;
        }
    };

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose();
            if (e.key === 'ArrowRight') handleNext();
            if (e.key === 'ArrowLeft') handlePrev();
            if (e.key === ' ') {
                e.preventDefault();
                togglePlayPause();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIndex, item, isPlaying]);

    // Video event listeners
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleTimeUpdate = () => setCurrentTime(video.currentTime);
        const handleLoadedMetadata = () => {
            setDuration(video.duration);
            video.volume = volume;
            video.muted = isMuted;
        };
        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);

        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);

        return () => {
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
        };
    }, [item, volume, isMuted]);

    // Auto-hide controls
    const resetControlsTimeout = () => {
        setShowControls(true);
        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
        }
        controlsTimeoutRef.current = window.setTimeout(() => {
            if (isPlaying) setShowControls(false);
        }, 3000);
    };

    useEffect(() => {
        resetControlsTimeout();
        return () => {
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
            }
        };
    }, [isPlaying]);

    // Use Tauri's optimized asset protocol for direct file streaming
    const assetUrl = useMemo(() => item ? convertFileSrc(item.path) : null, [item?.path]);

    const [isZoomed, setIsZoomed] = useState(false);
    const [pan, setPan] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e: React.MouseEvent) => {
        resetControlsTimeout();
        if (isZoomed) {
            const { clientX, clientY } = e;
            const width = window.innerWidth;
            const height = window.innerHeight;
            // Scale 2.5
            const scale = 2.5;

            // Calculate pan to follow mouse relative to center
            // (0.5 - pct) * dimension * (scale - 1)
            const x = (0.5 - (clientX / width)) * width * (scale - 1);
            const y = (0.5 - (clientY / height)) * height * (scale - 1);

            setPan({ x, y });
        }
    };

    const toggleZoom = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isZoomed) {
            setIsZoomed(false);
            setPan({ x: 0, y: 0 });
        } else {
            setIsZoomed(true);
            // Set initial pan based on click position? Or center? Start with click position logic reuse
            const { clientX, clientY } = e;
            const width = window.innerWidth;
            const height = window.innerHeight;
            const scale = 2.5;
            const x = (0.5 - (clientX / width)) * width * (scale - 1);
            const y = (0.5 - (clientY / height)) * height * (scale - 1);
            setPan({ x, y });
        }
    };

    // Reset zoom on slide change
    useEffect(() => {
        setIsZoomed(false);
        setPan({ x: 0, y: 0 });
    }, [selectedIndex]);

    if (selectedIndex === -1 || !item || !assetUrl) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-0 backdrop-blur-xl overflow-hidden"
                onClick={handleClose}
                onMouseMove={handleMouseMove}
            >
                {/* Content Container */}
                <div
                    className="relative max-w-full max-h-full w-full h-full flex items-center justify-center transition-transform duration-75 ease-out"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        transform: isZoomed ? `translate(${pan.x}px, ${pan.y}px) scale(2.5)` : 'scale(1)',
                        cursor: isZoomed ? 'zoom-out' : item.file_type === 'image' ? 'zoom-in' : 'default'
                    }}
                >
                    {item.file_type === 'video' ? (
                        <>
                            <video
                                ref={videoRef}
                                src={assetUrl}
                                className="max-w-full max-h-full w-auto h-auto rounded-lg shadow-2xl"
                                autoPlay
                                loop
                                onClick={togglePlayPause}
                            />

                            {/* Video Controls - Hide when zoomed (video doesn't zoom though) */}
                            <AnimatePresence>
                                {showControls && !isZoomed && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 20 }}
                                        className="absolute bottom-4 left-4 right-4 bg-black/70 backdrop-blur-md rounded-lg p-4 flex flex-col gap-2 max-w-3xl mx-auto"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {/* Seek Bar */}
                                        <input
                                            type="range"
                                            min="0"
                                            max={duration || 0}
                                            value={currentTime}
                                            onChange={handleSeek}
                                            className="w-full h-1 bg-white/30 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-xcroller-red"
                                        />

                                        {/* Controls Row */}
                                        <div className="flex items-center gap-4">
                                            <button
                                                onClick={togglePlayPause}
                                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                                            >
                                                {isPlaying ? <Pause size={20} className="text-white" /> : <Play size={20} className="text-white" />}
                                            </button>

                                            <span className="text-white text-sm">
                                                {formatTime(currentTime)} / {formatTime(duration)}
                                            </span>

                                            <div className="flex items-center gap-2 ml-auto">
                                                <button
                                                    onClick={toggleMute}
                                                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                                                >
                                                    {isMuted ? <VolumeX size={20} className="text-white" /> : <Volume2 size={20} className="text-white" />}
                                                </button>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="1"
                                                    step="0.01"
                                                    value={isMuted ? 0 : volume}
                                                    onChange={handleVolumeChange}
                                                    className="w-24 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                                                />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </>
                    ) : (
                        <img
                            src={assetUrl}
                            alt={item.path}
                            className="max-w-full max-h-full w-auto h-auto shadow-2xl object-contain"
                            onClick={toggleZoom}
                        />
                    )}
                </div>

                {/* Top Bar (Overlay) */}
                <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
                    <div className="pointer-events-auto">
                        <p className="text-white font-medium drop-shadow-md truncate max-w-xl">{item.path}</p>
                        <div className="flex gap-2 text-xs text-white/70 mt-1">
                            <span>{item.file_type.toUpperCase()}</span>
                            <span>•</span>
                            <span>{item.width && item.height ? `${item.width}x${item.height}` : 'Unknown Size'}</span>
                        </div>
                    </div>
                </div>

                {/* Close Button */}
                <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-50 pointer-events-auto"
                >
                    <X size={24} />
                </button>

                {/* Navigation Arrows */}
                <div className="absolute inset-y-0 left-0 flex items-center px-4 pointer-events-none">
                    {selectedIndex > 0 && (
                        <button
                            onClick={handlePrev}
                            className="pointer-events-auto p-3 rounded-full bg-black/20 hover:bg-black/50 text-white/50 hover:text-white transition-all backdrop-blur-sm"
                        >
                            <ChevronLeft size={32} />
                        </button>
                    )}
                </div>
                <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                    {selectedIndex < mediaItems.length - 1 && (
                        <button
                            onClick={handleNext}
                            className="pointer-events-auto p-3 rounded-full bg-black/20 hover:bg-black/50 text-white/50 hover:text-white transition-all backdrop-blur-sm"
                        >
                            <ChevronRight size={32} />
                        </button>
                    )}
                </div>

            </motion.div>
        </AnimatePresence>
    );
}
