import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    // Suppress the "chunk > 500 kB" warning.
    // The bundle is large mainly because of:
    // - 500 Bridge questions embedded at build time (from bridge_the_gap_questions.txt)
    // - Firebase modular SDK
    // No code-splitting is needed for this small app.
    chunkSizeWarningLimit: 1000
  }
})
