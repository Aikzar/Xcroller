/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                xcroller: {
                    base: '#0f0f0f', // Near black
                    surface: '#1a1a1a', // Dark gray
                    red: 'rgb(var(--xcroller-accent-rgb) / <alpha-value>)',
                    accent: 'rgb(var(--xcroller-accent-rgb) / <alpha-value>)',
                    'accent-text': 'rgb(var(--xcroller-accent-text-rgb) / <alpha-value>)',
                    'on-accent': 'rgb(var(--xcroller-on-accent-rgb) / <alpha-value>)',
                    danger: '#df2531',
                    text: '#f0f0f0', // Off-white
                    muted: '#888888', // Gray text
                }
            },
            borderRadius: {
                'xl': '12px',
                '2xl': '16px',
            }
        },
    },
    plugins: [],
}
