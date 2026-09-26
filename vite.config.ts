import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { localDecoders } from './scripts/decoderAssets.ts'

export default defineConfig({
  plugins: [react(), localDecoders()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/scene': process.env.INTELIDAR_API_URL ?? 'http://127.0.0.1:8000',
      '/health': process.env.INTELIDAR_API_URL ?? 'http://127.0.0.1:8000',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
