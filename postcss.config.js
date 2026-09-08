import { fileURLToPath } from 'node:url';

export default {
  plugins: {
    // Consumers such as @forgeax/ide load this PostCSS config from a different
    // Vite root. Pin Tailwind to Interface's config instead of letting it search
    // the consumer cwd, where it would find no content globs and emit no utilities.
    tailwindcss: { config: fileURLToPath(new URL('./tailwind.config.ts', import.meta.url)) },
    autoprefixer: {},
  },
};
