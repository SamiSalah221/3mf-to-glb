import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves from /<repo>/; override with VITE_BASE='/' for other hosts.
const base = process.env.VITE_BASE ?? '/3mf-to-glb/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  server: {
    port: 5175,
  },
  worker: {
    format: 'es',
  },
})
