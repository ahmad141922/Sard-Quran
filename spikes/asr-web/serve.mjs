// A static server for the spike page.
//
//   node serve.mjs [port]      then open http://localhost:8096/
//
// It sends COOP/COEP so the page is cross-origin isolated: without that,
// SharedArrayBuffer is off and onnxruntime-web runs on one thread. Production
// would need the same two headers in sard/deploy/_headers.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.argv[2] ?? 8096);

const routes = [
  ['/ort/', join(here, 'node_modules/onnxruntime-web/dist/')],
  ['/tokens.txt', join(here, '../../sard/public/asr/tokens.txt')],
  ['/', here],
];

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.wav': 'audio/wav',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const [prefix, dir] = routes.find(([p]) => path === p || (p.endsWith('/') && path.startsWith(p)));
  let file = prefix.endsWith('/') ? normalize(join(dir, path.slice(prefix.length))) : dir;
  if (prefix.endsWith('/') && !file.startsWith(normalize(dir))) {
    res.writeHead(403).end();
    return;
  }
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
    const { size } = statSync(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      'Content-Length': size,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cache-Control': 'no-store',
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`http://localhost:${port}/`));
