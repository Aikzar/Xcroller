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
                    red: '#810100', // Deep red
                    accent: '#df2531', // Bright red
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
