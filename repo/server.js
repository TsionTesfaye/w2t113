/**
 * Minimal static file server for the TrainingOps SPA.
 * No external dependencies — uses only Node.js built-ins.
 * Serves the project root so that public/index.html can reference ../src/ paths.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const BASE_PORT = Number(process.env.PORT) || 8080;
const MAX_PORT_RETRIES = 5;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

const requestHandler = async (req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, `http://localhost`).pathname);

    // Default route → serve public/index.html
    if (urlPath === '/' || urlPath === '') {
      urlPath = '/public/index.html';
    }

    const filePath = join(__dirname, urlPath);

    // Security: prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // Check file exists
    try {
      const fileStat = await stat(filePath);
      if (fileStat.isDirectory()) {
        // Try index.html in directory
        const indexPath = join(filePath, 'index.html');
        const content = await readFile(indexPath);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
        return;
      }
    } catch {
      // For SPA hash-based routing, serve index.html for HTML requests
      if (!extname(urlPath)) {
        const content = await readFile(join(__dirname, 'public', 'index.html'));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
        return;
      }
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const content = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Prevent browsers from serving stale JS/CSS from cache after code updates
    const headers = { 'Content-Type': contentType };
    if (ext === '.js' || ext === '.css' || ext === '.json') {
      headers['Cache-Control'] = 'no-store';
    }

    res.writeHead(200, headers);
    res.end(content);
  } catch (err) {
    console.error(`Error serving ${req.url}:`, err.message);
    res.writeHead(500);
    res.end('Internal Server Error');
  }
};

/**
 * Attempt to listen on BASE_PORT, retrying up to MAX_PORT_RETRIES on EADDRINUSE.
 * Creates a fresh server instance per attempt to avoid stale listener/callback issues.
 */
function startServer(port, attempt) {
  const server = createServer(requestHandler);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const nextPort = port + 1;
      if (attempt >= MAX_PORT_RETRIES) {
        console.error(`All ports ${BASE_PORT}–${port} are in use. Exiting.`);
        process.exit(1);
      }
      console.warn(`Port ${port} in use, trying next port ${nextPort}...`);
      startServer(nextPort, attempt + 1);
    } else {
      console.error(`Server error: ${err.message}`);
      process.exit(1);
    }
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`TrainingOps server running at http://0.0.0.0:${port}`);
    console.log(`Open http://localhost:${port} in your browser`);
  });
}

startServer(BASE_PORT, 1);
