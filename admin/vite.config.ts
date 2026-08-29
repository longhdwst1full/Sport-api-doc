import react from '@vitejs/plugin-react-swc';
import { fileURLToPath, URL } from 'node:url';

export default {
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5173 },
};
