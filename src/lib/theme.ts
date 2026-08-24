export const DEFAULT_ACCENT_COLOR = '#810100';

export const ACCENT_PRESETS = [
    { name: 'Classic', color: DEFAULT_ACCENT_COLOR },
    { name: 'Coral', color: '#F94144' },
    { name: 'Ember', color: '#F3722C' },
    { name: 'Tangerine', color: '#F8961E' },
    { name: 'Apricot', color: '#F9844A' },
    { name: 'Sunflower', color: '#F9C74F' },
    { name: 'Meadow', color: '#90BE6D' },
    { name: 'Jade', color: '#43AA8B' },
    { name: 'Teal', color: '#4D908E' },
    { name: 'Slate blue', color: '#577590' },
    { name: 'Ocean', color: '#277DA1' }
] as const;

type Rgb = [number, number, number];

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const DARK_SURFACE: Rgb = [26, 26, 26];

export const normalizeAccentColor = (value: unknown): string | undefined => {
    if (typeof value !== 'string' || !HEX_COLOR_PATTERN.test(value)) return undefined;
    return value.toUpperCase();
};

const hexToRgb = (hex: string): Rgb => [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16)
];

const linearChannel = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = ([red, green, blue]: Rgb) =>
    (0.2126 * linearChannel(red)) +
    (0.7152 * linearChannel(green)) +
    (0.0722 * linearChannel(blue));

const contrastRatio = (first: Rgb, second: Rgb) => {
    const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
    const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
    return (lighter + 0.05) / (darker + 0.05);
};

const mixWithWhite = (color: Rgb, amount: number): Rgb => color.map(channel =>
    Math.round(channel + ((255 - channel) * amount))
) as Rgb;

const readableAccentText = (accent: Rgb): Rgb => {
    for (let amount = 0; amount <= 1; amount += 0.02) {
        const candidate = mixWithWhite(accent, amount);
        if (contrastRatio(candidate, DARK_SURFACE) >= 4.5) return candidate;
    }
    return [255, 255, 255];
};

export const foregroundForAccent = (color: string): '#000000' | '#FFFFFF' => {
    const accent = hexToRgb(normalizeAccentColor(color) ?? DEFAULT_ACCENT_COLOR);
    return contrastRatio(accent, [0, 0, 0]) >= contrastRatio(accent, [255, 255, 255])
        ? '#000000'
        : '#FFFFFF';
};

export const applyAccentColor = (color: string) => {
    const normalized = normalizeAccentColor(color) ?? DEFAULT_ACCENT_COLOR;
    const accent = hexToRgb(normalized);
    const accentText = readableAccentText(accent);
    const onAccent = foregroundForAccent(normalized) === '#000000'
        ? [0, 0, 0]
        : [255, 255, 255];

    const root = document.documentElement;
    root.style.setProperty('--xcroller-accent-rgb', accent.join(' '));
    root.style.setProperty('--xcroller-accent-text-rgb', accentText.join(' '));
    root.style.setProperty('--xcroller-on-accent-rgb', onAccent.join(' '));
};
