import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: base must match your GitHub repo name exactly, wrapped in slashes.
// If you rename the repo, update this too or the deployed site will show a blank page.
export default defineConfig({
  plugins: [react()],
  base: '/WorkChart/',
})
