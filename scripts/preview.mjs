import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addOfflinePreview } from './preview-offline.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = resolve(root, 'artifacts/yat-biha');
const build = process.argv.includes('--build');
const pages = process.argv.includes('--pages');
const repositoryName = (process.env.GITHUB_REPOSITORY || 'ginshsingh-crypto/Yat-Baha-Catalog').split('/')[1];
const basePath = pages ? `/${repositoryName}` : '';
const expoCli = resolve(app, 'node_modules/expo/bin/cli');
const args = build
  ? ['export', '--platform', 'web', '--output-dir', 'dist', '--max-workers', '2']
  : ['start', '--go', '--lan'];

const result = spawnSync(process.execPath, [expoCli, ...args], {
  cwd: app,
  stdio: 'inherit',
  env: {
    ...process.env,
    EXPO_PUBLIC_PREVIEW_MODE: 'true',
    EXPO_WEB_BASE_PATH: basePath,
    EXPO_PUBLIC_DOMAIN: '',
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: '',
    EXPO_PUBLIC_CLERK_PROXY_URL: '',
    EXPO_NO_DOTENV: '1',
  },
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

if (build) {
  const output = resolve(app, 'dist');
  const hiddenAssets = resolve(output, 'assets/__node_modules/.pnpm');
  const assetPaths = new Map();
  if (existsSync(hiddenAssets)) {
    const vendor = resolve(output, 'assets/vendor');
    mkdirSync(vendor, { recursive: true });
    for (const relativePath of readdirSync(hiddenAssets, { recursive: true })) {
      const source = resolve(hiddenAssets, relativePath);
      if (!statSync(source).isFile()) continue;
      const destination = resolve(vendor, basename(relativePath));
      if (existsSync(destination) && !readFileSync(source).equals(readFileSync(destination))) {
        throw new Error(`Export asset filename collision: ${relativePath}`);
      }
      copyFileSync(source, destination);
      assetPaths.set(
        `assets/__node_modules/.pnpm/${relativePath.replaceAll('\\', '/')}`,
        `assets/vendor/${basename(relativePath)}`,
      );
    }
    // Keep asset bytes and hashed filenames while making their URLs static-host friendly.
    for (const relativePath of readdirSync(output, { recursive: true })) {
      const file = resolve(output, relativePath);
      if (!['.js', '.css', '.json', '.html', '.map'].includes(extname(file))) continue;
      if (!statSync(file).isFile()) continue;
      let content = readFileSync(file, 'utf8');
      for (const [oldPath, newPath] of assetPaths) content = content.replaceAll(oldPath, newPath);
      writeFileSync(file, content);
    }
    rmSync(hiddenAssets, { recursive: true });
    const nodeModulesAssets = resolve(output, 'assets/__node_modules');
    if (readdirSync(nodeModulesAssets).length === 0) rmSync(nodeModulesAssets, { recursive: true });
  }
  const indexPath = resolve(output, 'index.html');
  const html = readFileSync(indexPath, 'utf8')
    .replace(/<html[^>]*>/, '<html lang="ar">')
    .replace(/<title>.*?<\/title>/, '<title>يأت بها — معاينة التطبيق</title>');
  writeFileSync(indexPath, html);
  // GitHub Pages serves this document for dynamic report URLs and page refreshes.
  copyFileSync(indexPath, resolve(output, '404.html'));
  writeFileSync(resolve(output, '.nojekyll'), '');
  const offline = addOfflinePreview(output, basePath, resolve(app, 'assets/images/icon.png'));
  console.log(`Offline preview ${offline.version}: ${offline.assets.length} verified static resources`);
  console.log(`Preview exported to ${output}`);
}
