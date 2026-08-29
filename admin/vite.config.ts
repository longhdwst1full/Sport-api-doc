import react from '@vitejs/plugin-react-swc';
import { fileURLToPath, URL } from 'node:url';

function vendorChunk(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  if (id.includes('ckeditor5')) return 'vendor-editor';
  if (id.includes('@ant-design/icons')) return 'vendor-icons';
  if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) {
    return 'vendor-charts';
  }
  if (
    id.includes('/react/') ||
    id.includes('/react-dom/') ||
    id.includes('react-router') ||
    id.includes('/scheduler/')
  ) {
    return 'vendor-react';
  }
  if (
    id.includes('@reduxjs') ||
    id.includes('react-redux') ||
    id.includes('redux-saga') ||
    id.includes('@tanstack')
  ) {
    return 'vendor-state';
  }
  if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('/yup/')) {
    return 'vendor-forms';
  }
  if (id.includes('/axios/')) return 'vendor-http';
  return undefined;
}

export default {
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5173 },
  build: {
    rollupOptions: { output: { manualChunks: vendorChunk } },
  },
};
