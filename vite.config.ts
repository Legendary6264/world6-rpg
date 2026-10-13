import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { productBrand } from './src/productBrand.ts'
import { readSitePresentation, siteHeadTags } from './src/sitePresentation.ts'

export default defineConfig(({ mode }) => {
  const presentation = readSitePresentation(loadEnv(mode, process.cwd(), 'VITE_'))
  return {
    base: './',
    server: { proxy: { '/api': 'http://127.0.0.1:3001', '/socket.io': { target: 'http://127.0.0.1:3001', ws: true } } },
    build: { chunkSizeWarningLimit: 650 },
    plugins: [react(), {
      name: 'grani-bytiya-presentation',
      transformIndexHtml: html => ({
        html: html.replace(/<title>[^<]*<\/title>/, '<title>' + productBrand.title + '</title>'),
        tags: siteHeadTags(presentation.siteUrl),
      }),
    }],
  }
})
