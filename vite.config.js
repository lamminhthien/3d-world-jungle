import { defineConfig } from 'vite';

const now = new Date();
const offset = -now.getTimezoneOffset() / 60;
const timezone = `UTC${offset >= 0 ? '+' : ''}${offset}`;
const buildTime = `${now.toLocaleString()} (${timezone})`;

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
});
