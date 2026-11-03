/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), surface: v('surface'), sunken: v('sunken'), ink: v('ink'), muted: v('muted'),
        line: v('line'), primary: v('primary'), 'primary-ink': v('primary-ink'),
        pos: v('pos'), neg: v('neg'), warn: v('warn'), info: v('info'),
        'pos-soft': v('pos-soft'), 'neg-soft': v('neg-soft'), 'warn-soft': v('warn-soft'), 'info-soft': v('info-soft'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      borderRadius: { xl: '0.875rem' },
    },
  },
  plugins: [],
};
