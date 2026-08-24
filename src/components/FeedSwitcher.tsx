import { useCallback, useEffect, useRef, useState, type WheelEvent } from 'react';
import { ChevronLeft, ChevronRight, House, Star } from 'lucide-react';
import type { Feed } from '../lib/types';

type ActiveFeedId = number | 'home' | 'favorites';

interface FeedSwitcherProps {
    feeds: Feed[];
    activeFeedId: ActiveFeedId;
    setActiveFeed: (feedId: ActiveFeedId) => void;
    className?: string;
}

const tabClass = (isActive: boolean) =>
    `flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${isActive
        ? 'bg-xcroller-red text-xcroller-on-accent shadow-lg'
        : 'text-xcroller-muted hover:bg-white/5 hover:text-white'
    }`;

export function FeedSwitcher({ feeds, activeFeedId, setActiveFeed, className = '' }: FeedSwitcherProps) {
    const scrollerRef = useRef<HTMLDivElement>(null);
    const [scrollState, setScrollState] = useState({ hasOverflow: false, canScrollBack: false, canScrollForward: false });

    const updateScrollState = useCallback(() => {
        const scroller = scrollerRef.current;
        if (!scroller) return;
        const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
        setScrollState({
            hasOverflow: maxScrollLeft > 2,
            canScrollBack: scroller.scrollLeft > 2,
            canScrollForward: scroller.scrollLeft < maxScrollLeft - 2
        });
    }, []);

    useEffect(() => {
        const scroller = scrollerRef.current;
        if (!scroller) return;
        const observer = new ResizeObserver(updateScrollState);
        observer.observe(scroller);
        for (const child of Array.from(scroller.children)) observer.observe(child);
        updateScrollState();
        return () => observer.disconnect();
    }, [feeds, updateScrollState]);

    useEffect(() => {
        if (typeof activeFeedId !== 'number') return;
        const scroller = scrollerRef.current;
        const activeButton = scroller?.querySelector<HTMLElement>(`[data-feed-id="${activeFeedId}"]`);
        activeButton?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        const updateTimer = window.setTimeout(updateScrollState, 250);
        return () => window.clearTimeout(updateTimer);
    }, [activeFeedId, updateScrollState]);

    const scrollCustomViews = (direction: -1 | 1) => {
        const scroller = scrollerRef.current;
        if (!scroller) return;
        scroller.scrollBy({ left: direction * Math.max(120, scroller.clientWidth * 0.72), behavior: 'smooth' });
    };

    const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
        const scroller = scrollerRef.current;
        if (!scroller || !scrollState.hasOverflow || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        event.preventDefault();
        scroller.scrollLeft += event.deltaY;
    };

    return (
        <nav
            aria-label="Media views"
            className={`flex min-w-0 items-center gap-1 rounded-xl border border-white/5 bg-black/20 p-1 ${className}`}
        >
            <button
                type="button"
                aria-label="Home feed"
                aria-current={activeFeedId === 'home' ? 'page' : undefined}
                onClick={() => setActiveFeed('home')}
                className={tabClass(activeFeedId === 'home')}
            >
                <House size={13} strokeWidth={2} aria-hidden="true" />
                <span className="feed-switcher__label">Home feed</span>
            </button>

            <button
                type="button"
                aria-label="Favorites"
                aria-current={activeFeedId === 'favorites' ? 'page' : undefined}
                onClick={() => setActiveFeed('favorites')}
                className={tabClass(activeFeedId === 'favorites')}
            >
                <Star size={13} strokeWidth={2} aria-hidden="true" className={activeFeedId === 'favorites' ? 'fill-current' : ''} />
                <span className="feed-switcher__label">Favorites</span>
            </button>

            {feeds.length > 0 && (
                <>
                    <div className="mx-0.5 h-5 w-px shrink-0 bg-white/10" aria-hidden="true" />
                    {scrollState.hasOverflow && (
                        <button
                            type="button"
                            aria-label="Scroll custom views backward"
                            disabled={!scrollState.canScrollBack}
                            onClick={() => scrollCustomViews(-1)}
                            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-xcroller-muted transition-colors hover:bg-white/5 hover:text-white disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                            <ChevronLeft size={16} aria-hidden="true" />
                        </button>
                    )}

                    <div className="relative min-w-0 flex-1">
                        <div
                            ref={scrollerRef}
                            onScroll={updateScrollState}
                            onWheel={handleWheel}
                            className="flex min-w-0 items-center gap-1 overflow-x-auto overscroll-x-contain scroll-smooth no-scrollbar"
                        >
                            {feeds.map((feed) => (
                                <button
                                    key={feed.id}
                                    type="button"
                                    data-feed-id={feed.id}
                                    aria-current={activeFeedId === feed.id ? 'page' : undefined}
                                    title={feed.name}
                                    onClick={() => setActiveFeed(feed.id!)}
                                    className={`${tabClass(activeFeedId === feed.id)} max-w-40`}
                                >
                                    <span className="truncate">{feed.name}</span>
                                </button>
                            ))}
                        </div>
                        {scrollState.canScrollBack && <div className="pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-xcroller-base to-transparent" />}
                        {scrollState.canScrollForward && <div className="pointer-events-none absolute inset-y-0 right-0 w-5 bg-gradient-to-l from-xcroller-base to-transparent" />}
                    </div>

                    {scrollState.hasOverflow && (
                        <button
                            type="button"
                            aria-label="Scroll custom views forward"
                            disabled={!scrollState.canScrollForward}
                            onClick={() => scrollCustomViews(1)}
                            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-xcroller-muted transition-colors hover:bg-white/5 hover:text-white disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                            <ChevronRight size={16} aria-hidden="true" />
                        </button>
                    )}
                </>
            )}
        </nav>
    );
}
