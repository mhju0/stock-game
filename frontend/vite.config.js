import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (command === 'build' && !env.VITE_API_URL?.trim()) {
    throw new Error('VITE_API_URL is required to build. For local verification use ./scripts/verify.sh.')
  }
  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      include: ['src/**/*.{test,spec}.{js,jsx}'],
    },
  }
})
