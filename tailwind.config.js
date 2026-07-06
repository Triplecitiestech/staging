/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/constants/**/*.{js,ts,jsx,tsx,mdx}',
    // Sales calculator (internal tool) — its lib/config files can carry class names
    './src/lib/sales-calculator/**/*.{js,ts,jsx,tsx}',
    './src/config/sales-calculator/**/*.json',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        secondary: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
        // --- Sales calculator design tokens (internal tool) ---
        // All values resolve from --tct-* CSS variables that are ONLY defined
        // on the .tct-calc-root wrapper (src/app/admin/sales-calculator/), so
        // these utilities are inert everywhere else on the site. Ported
        // unchanged from the standalone calculator's tailwind.config.ts.
        bg: 'var(--tct-bg)',
        bgdeep: 'var(--tct-bg-deep)',
        surface: 'var(--tct-surface)',
        surface2: 'var(--tct-surface-2)',
        surfaceAlt: 'var(--tct-bg-deep)',
        line: 'var(--tct-border)',
        lineStrong: 'var(--tct-border-strong)',
        ink: 'var(--tct-text)',
        body2: 'var(--tct-text-body)',
        muted: 'var(--tct-text-muted)',
        faint: 'var(--tct-text-faint)',
        brand: {
          DEFAULT: 'rgb(var(--tct-accent) / <alpha-value>)',
          dark: 'rgb(var(--tct-accent-hover) / <alpha-value>)',
          light: 'rgb(var(--tct-accent-deep) / <alpha-value>)',
          accent: 'rgb(var(--tct-accent) / <alpha-value>)',
          accentDark: 'rgb(var(--tct-accent-hover) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--tct-accent) / <alpha-value>)',
          hover: 'rgb(var(--tct-accent-hover) / <alpha-value>)',
          deep: 'rgb(var(--tct-accent-deep) / <alpha-value>)',
        },
        emerald2: 'rgb(var(--tct-emerald) / <alpha-value>)',
        teal2: 'rgb(var(--tct-teal) / <alpha-value>)',
        ok: 'rgb(var(--tct-success) / <alpha-value>)',
        warn: 'rgb(var(--tct-warning) / <alpha-value>)',
        danger: 'rgb(var(--tct-danger) / <alpha-value>)',
      },
      borderRadius: { card: '16px', btn: '12px', sm2: '8px' },
      boxShadow: {
        soft: '0 1px 3px rgba(2,6,23,.4), 0 10px 30px rgba(2,6,23,.35)',
        glow: '0 8px 28px rgba(6,182,212,.35)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'tilt': 'tilt 10s infinite linear',
      },
      keyframes: {
        tilt: {
          '0%, 50%, 100%': {
            transform: 'rotate(0deg)',
          },
          '25%': {
            transform: 'rotate(0.5deg)',
          },
          '75%': {
            transform: 'rotate(-0.5deg)',
          },
        },
      },
    },
  },
  plugins: [],
}
