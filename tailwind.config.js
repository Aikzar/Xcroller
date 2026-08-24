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
                    danger: '#df2531',
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
