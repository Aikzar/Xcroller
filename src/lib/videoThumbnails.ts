const MAX_THUMBNAIL_DIMENSION = 480;
const MAX_CACHED_THUMBNAILS = 250;
const MAX_CONCURRENT_EXTRACTIONS = 2;

const thumbnailCache = new Map<string, Blob>();

type ThumbnailJob = {
    signal: AbortSignal;
    work: () => Promise<Blob>;
    resolve: (blob: Blob) => void;
    reject: (error: unknown) => void;
};

const extractionQueue: ThumbnailJob[] = [];
let activeExtractions = 0;

const abortError = () => new DOMException('Thumbnail extraction was cancelled.', 'AbortError');

const rememberThumbnail = (path: string, blob: Blob) => {
    thumbnailCache.delete(path);
    thumbnailCache.set(path, blob);

    while (thumbnailCache.size > MAX_CACHED_THUMBNAILS) {
        const oldestPath = thumbnailCache.keys().next().value;
        if (oldestPath === undefined) break;
        thumbnailCache.delete(oldestPath);
    }

    return blob;
};

export const getCachedVideoThumbnail = (path: string) => {
    const thumbnail = thumbnailCache.get(path);
    if (thumbnail) {
        // Refresh the entry so frequently revisited media remains in the LRU cache.
        thumbnailCache.delete(path);
        thumbnailCache.set(path, thumbnail);
    }
    return thumbnail;
};

export const discardVideoThumbnail = (path: string, thumbnail?: Blob | null) => {
    if (!thumbnail || thumbnailCache.get(path) === thumbnail) {
        thumbnailCache.delete(path);
    }
};

const thumbnailFromFrame = (video: HTMLVideoElement) => {
    if (!video.videoWidth || !video.videoHeight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return Promise.reject(new Error('The video does not have a frame ready.'));
    }

    const scale = Math.min(
        1,
        MAX_THUMBNAIL_DIMENSION / video.videoWidth,
        MAX_THUMBNAIL_DIMENSION / video.videoHeight
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return Promise.reject(new Error('Canvas rendering is unavailable.'));

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (blob) => blob ? resolve(blob) : reject(new Error('Could not encode the video thumbnail.')),
            'image/jpeg',
            0.8
        );
    });
};

export const cacheVideoFrame = async (path: string, video: HTMLVideoElement) => {
    const cached = getCachedVideoThumbnail(path);
    if (cached) return cached;
    const thumbnail = await thumbnailFromFrame(video);
    return rememberThumbnail(path, thumbnail);
};

const extractVideoThumbnail = (assetUrl: string, signal: AbortSignal) => new Promise<Blob>((resolve, reject) => {
    const video = document.createElement('video');
    let settled = false;
    let captureStarted = false;
    let seekRequested = false;

    const cleanup = () => {
        window.clearTimeout(timeoutId);
        signal.removeEventListener('abort', handleAbort);
        video.removeEventListener('error', handleError);
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('loadeddata', handleLoadedData);
        video.removeEventListener('seeked', handleSeeked);
        video.pause();
        video.removeAttribute('src');
        video.load();
    };

    const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
    };

    const capture = () => {
        if (settled || captureStarted || signal.aborted) return;
        captureStarted = true;
        void thumbnailFromFrame(video).then((blob) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(blob);
        }).catch(fail);
    };

    function handleAbort() {
        fail(abortError());
    }

    function handleError() {
        fail(new Error('Could not load the video while creating its thumbnail.'));
    }

    function handleLoadedMetadata() {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const seekTime = Math.min(0.15, duration / 10);
        if (seekTime > 0.01) {
            seekRequested = true;
            video.currentTime = seekTime;
        } else if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            capture();
        }
    }

    function handleLoadedData() {
        if (!seekRequested) capture();
    }

    function handleSeeked() {
        capture();
    }

    const timeoutId = window.setTimeout(
        () => fail(new Error('Timed out while creating the video thumbnail.')),
        15_000
    );

    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.addEventListener('error', handleError);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('seeked', handleSeeked);
    signal.addEventListener('abort', handleAbort, { once: true });

    if (signal.aborted) {
        handleAbort();
        return;
    }

    video.src = assetUrl;
    video.load();
});

const pumpExtractionQueue = () => {
    while (activeExtractions < MAX_CONCURRENT_EXTRACTIONS && extractionQueue.length > 0) {
        const job = extractionQueue.shift();
        if (!job) return;
        if (job.signal.aborted) {
            job.reject(abortError());
            continue;
        }

        activeExtractions += 1;
        void job.work()
            .then(job.resolve, job.reject)
            .finally(() => {
                activeExtractions -= 1;
                pumpExtractionQueue();
            });
    }
};

const queueThumbnailExtraction = (work: () => Promise<Blob>, signal: AbortSignal) => (
    new Promise<Blob>((resolve, reject) => {
        extractionQueue.push({ signal, work, resolve, reject });
        pumpExtractionQueue();
    })
);

export const requestVideoThumbnail = async (
    path: string,
    assetUrl: string,
    signal: AbortSignal
) => {
    const cached = getCachedVideoThumbnail(path);
    if (cached) return cached;

    const thumbnail = await queueThumbnailExtraction(
        () => extractVideoThumbnail(assetUrl, signal),
        signal
    );
    if (signal.aborted) throw abortError();
    return rememberThumbnail(path, thumbnail);
};
