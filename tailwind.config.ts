import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        accent: '#2563eb',
        base: '#f8fafc',
        frame: '#ffffff',
        border: '#e5e7eb',
      },
    },
  },
  plugins: [],
}

export default config
