import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const workerTemplate = fileURLToPath(new URL('./pwa-worker.js', import.meta.url));

function publicFiles(directory: string, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = prefix + entry.name;
    if (entry.isDirectory()) return publicFiles(join(directory, entry.name), name + '/');
    return entry.isFile() ? [name] : [];
  });
}

export function pwaBuild(): Plugin {
  let publicDir: string;
  return {
    name: 'kabemjunto-pwa',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const template = readFileSync(workerTemplate, 'utf8');
        const version = createHash('sha256').update(template);
        const urls: string[] = [];

        for (const [name, file] of Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b))) {
          if (name.endsWith('.map')) continue;
          urls.push('./' + name);
          version.update(name).update(file.type === 'asset' ? file.source : file.code);
        }
        for (const name of publicFiles(publicDir).sort()) {
          urls.push('./' + name);
          version.update(name).update(readFileSync(join(publicDir, name)));
        }
        if (!urls.includes('./index.html')) this.error('PWA: index.html ausente no build.');

        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source:
            `const CACHE_NAME = ${JSON.stringify('kabemjunto-pwa-' + version.digest('hex'))};\n` +
            `const PRECACHE = ${JSON.stringify(urls)};\n` +
            template,
        });
      },
    },
  };
}
