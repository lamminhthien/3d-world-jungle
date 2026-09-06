import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const now = new Date();
const offset = -now.getTimezoneOffset() / 60;
const timezone = `UTC${offset >= 0 ? '+' : ''}${offset}`;
const buildTime = `${now.toLocaleString()} (${timezone})`;
const packageVersion = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let unit = -1;
  do { value /= 1024; unit += 1; } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
}

function offlineHtmlPlugin() {
  return {
    name: 'offline-html-and-build-info',
    closeBundle() {
      const distDir = path.resolve('dist');
      const indexPath = path.join(distDir, 'index.html');
      const html = fs.readFileSync(indexPath, 'utf8');
      const assetsDir = path.join(distDir, 'assets');
      const assetFiles = fs.readdirSync(assetsDir).map((file) => path.join(assetsDir, file));
      const initialFiles = [indexPath, ...assetFiles];
      const bundleFiles = assetFiles.filter((file) => /\.(js|css)$/i.test(file));
      const totalBytes = initialFiles.reduce((total, file) => total + fs.statSync(file).size, 0);
      const bundleBytes = bundleFiles.reduce((total, file) => total + fs.statSync(file).size, 0);
      const gzipBytes = bundleFiles.reduce((total, file) => total + zlib.gzipSync(fs.readFileSync(file)).length, 0);

      let offlineHtml = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/gi, (tag, href) => {
        const file = path.resolve(distDir, href.replace(/^\//, ''));
        return fs.existsSync(file) ? `<style>\n${fs.readFileSync(file, 'utf8')}\n</style>` : tag;
      });
      offlineHtml = offlineHtml.replace(/<script\b[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/gi, (tag, src) => {
        const file = path.resolve(distDir, src.replace(/^\//, ''));
        return fs.existsSync(file) ? `<script type="module">\n${fs.readFileSync(file, 'utf8')}\n</script>` : tag;
      });

      const info = {
        version: packageVersion,
        bundleBytes,
        bundleSize: formatBytes(bundleBytes),
        gzipBytes,
        gzipSize: formatBytes(gzipBytes),
        totalBytes,
        totalSize: formatBytes(totalBytes),
      };
      offlineHtml = offlineHtml.replace('</head>', `<script>window.__JUNGLE_BUILD_INFO__=${JSON.stringify(info)};</script>\n  </head>`);
      const offlineDir = path.join(distDir, 'offline');
      fs.mkdirSync(offlineDir, { recursive: true });
      fs.writeFileSync(path.join(offlineDir, 'index.html'), offlineHtml);
      fs.writeFileSync(path.join(distDir, 'build-info.json'), `${JSON.stringify(info, null, 2)}\n`);
      console.log(`bundle: ${info.bundleSize} raw / ${info.gzipSize} gzip`);
      console.log(`offline game: ${formatBytes(fs.statSync(path.join(offlineDir, 'index.html')).size)} standalone index.html`);
    },
  };
}

export default defineConfig({
  plugins: [offlineHtmlPlugin()],
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
});
