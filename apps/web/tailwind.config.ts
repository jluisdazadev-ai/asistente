import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        whatsapp: {
          light: '#25D366',
          DEFAULT: '#128C7E',
          dark: '#075E54',
          chat: '#ECE5DD',
          teal: '#128C7E',
          bubbleOut: '#DCF8C6',
          bubbleIn: '#FFFFFF',
        },
      },
    },
  },
  plugins: [],
};

export default config;
