export const DEFAULT_ACCENT_COLOR = '#810100';
export type AppearanceTheme = 'dark' | 'light';

export const DEFAULT_APPEARANCE_THEME: AppearanceTheme = 'dark';
const APPEARANCE_STORAGE_KEY = 'xcroller.appearance-theme';

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
const LIGHT_SURFACE: Rgb = [255, 250, 247];

export const normalizeAppearanceTheme = (value: unknown): AppearanceTheme | undefined =>
    value === 'dark' || value === 'light' ? value : undefined;

export const getStoredAppearanceTheme = (): AppearanceTheme => {
    if (typeof window === 'undefined') return DEFAULT_APPEARANCE_THEME;
    try {
        return normalizeAppearanceTheme(window.localStorage.getItem(APPEARANCE_STORAGE_KEY))
            ?? DEFAULT_APPEARANCE_THEME;
    } catch {
        return DEFAULT_APPEARANCE_THEME;
    }
};

export const rememberAppearanceTheme = (theme: AppearanceTheme) => {
    try {
        window.localStorage.setItem(APPEARANCE_STORAGE_KEY, theme);
    } catch {
        // SQLite preferences remain authoritative if WebView storage is unavailable.
    }
};

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

const mixColor = (color: Rgb, target: Rgb, amount: number): Rgb => color.map((channel, index) =>
    Math.round(channel + ((target[index] - channel) * amount))
) as Rgb;

const readableAccentText = (accent: Rgb, theme: AppearanceTheme): Rgb => {
    const surface = theme === 'light' ? LIGHT_SURFACE : DARK_SURFACE;
    const target: Rgb = theme === 'light' ? [0, 0, 0] : [255, 255, 255];
    for (let amount = 0; amount <= 1; amount += 0.02) {
        const candidate = mixColor(accent, target, amount);
        if (contrastRatio(candidate, surface) >= 4.5) return candidate;
    }
    return target;
};

export const foregroundForAccent = (color: string): '#000000' | '#FFFFFF' => {
    const accent = hexToRgb(normalizeAccentColor(color) ?? DEFAULT_ACCENT_COLOR);
    return contrastRatio(accent, [0, 0, 0]) >= contrastRatio(accent, [255, 255, 255])
        ? '#000000'
        : '#FFFFFF';
};

export const applyAccentColor = (color: string, theme?: AppearanceTheme) => {
    const normalized = normalizeAccentColor(color) ?? DEFAULT_ACCENT_COLOR;
    const accent = hexToRgb(normalized);
    const activeTheme = theme
        ?? normalizeAppearanceTheme(document.documentElement.dataset.theme)
        ?? DEFAULT_APPEARANCE_THEME;
    const accentText = readableAccentText(accent, activeTheme);
    const onAccent = foregroundForAccent(normalized) === '#000000'
        ? [0, 0, 0]
        : [255, 255, 255];

    const root = document.documentElement;
    root.style.setProperty('--xcroller-accent-rgb', accent.join(' '));
    root.style.setProperty('--xcroller-accent-text-rgb', accentText.join(' '));
    root.style.setProperty('--xcroller-on-accent-rgb', onAccent.join(' '));
};

export const applyAppearanceTheme = (
    theme: AppearanceTheme,
    accentColor = DEFAULT_ACCENT_COLOR
) => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    applyAccentColor(accentColor, theme);
};
