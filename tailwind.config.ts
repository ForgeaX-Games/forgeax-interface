import animate from 'tailwindcss-animate'
// Relative import (not the '@forgeax/design' alias): Tailwind's config loader
// resolves modules itself and does not see Vite/tsconfig aliases.
import { createForgeaxPreset } from './packages/design/preset'
import { createEditorTailwindContent } from './tailwind-editor-content'

const integrationRoot = process.env.FORGEAX_INTEGRATION_ROOT
const editorTailwindContent = integrationRoot
  ? createEditorTailwindContent(integrationRoot)
  : []

const config = {
  // The shared design preset bridges --fx-* / --radius-* into Tailwind's
  // semantic color + radius scale and sets darkMode: ['selector', '[data-theme="dark"]'].
  presets: [createForgeaxPreset()],
  // Resolve globs from this config's package, not the consumer process cwd.
  // Studio's IDE mounts Interface source into its own Vite root; without
  // `relative`, Tailwind scans packages/ide/src and emits no Interface utilities.
  content: {
    relative: true,
    files: [
      './index.html',
      './src/**/*.{ts,tsx}',
      // Studio IDE embeds editor panels in-process; editor-ui is Tailwind-only
      // (no package CSS). Scan editor sources when FORGEAX_INTEGRATION_ROOT is set.
      ...editorTailwindContent,
    ],
  },
  // Preflight is Tailwind's CSS reset; keep it OFF so the migration is purely
  // additive and the existing hand-written CSS is never zeroed out. Re-evaluate
  // at the end of the migration (see rearch plan 03 §6 / 05 §7).
  corePlugins: { preflight: false },
  plugins: [animate],
}

export default config
