import fs from 'node:fs';
import path from 'node:path';

/**
 * vite-plugins/fileLogPlugin.js
 *
 * WHY THIS EXISTS: a browser cannot write to disk, so the frontend had no
 * equivalent of the backend's src/logs/*.log -- when something went wrong
 * during live-market testing the evidence lived in a console nobody had open,
 * and vanished on refresh.
 *
 * Vite's dev and preview servers are Node processes on the user's own machine,
 * and Node CAN write files. So the browser posts one line per event to a
 * hidden endpoint here, and this plugin does two things with it:
 *
 *   1. prints it in the VS Code terminal, live
 *   2. appends it to src/logs/frontend-info.log (and frontend-error.log)
 *
 * Mounted on BOTH servers: `npm run dev` and `npm run serve` (the live testing
 * instance on port 4173 is `vite preview`, so dev-only would have missed the
 * exact case this was built for).
 *
 * Anyone reaching the app through the ngrok tunnel goes through this same
 * process, so a tester's errors land in the same file -- which is why every
 * line carries the short browser id the client generates.
 *
 * NO PAYLOADS. The client sends URL, status, duration and error text only;
 * this end writes whatever arrives verbatim and adds nothing.
 */

const ENDPOINT = '/__log';

/** 2026-10-15 09:16:04,231 -- the backend's format, so both logs read alike. */
const stamp = (d = new Date()) => {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
    + `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())},${p(d.getMilliseconds(), 3)}`;
};

/* Terminal colour, matching the level. Plain text still goes to the files. */
const PAINT = {
  ERROR: (s) => `\x1b[31m${s}\x1b[0m`,
  WARN: (s) => `\x1b[33m${s}\x1b[0m`,
  INFO: (s) => `\x1b[36m${s}\x1b[0m`,
};

export default function fileLogPlugin({
  dir = 'src/logs',
  /** Lines above this length are cut -- a runaway message cannot fill the disk. */
  maxLineLength = 2000,
  /** Printed in the terminal as well as written to file. */
  echo = true,
} = {}) {
  let logDir = null;

  const ensureDir = (root) => {
    if (logDir) return logDir;
    logDir = path.resolve(root, dir);
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch {
      logDir = null;                         // read-only disk: terminal only
    }
    return logDir;
  };

  const append = (file, line) => {
    if (!logDir) return;
    try {
      fs.appendFileSync(path.join(logDir, file), `${line}\n`, 'utf8');
    } catch {
      /* A failed write must never take the dev server down. */
    }
  };

  /**
   * One event -> one line.
   *
   * Everything is coerced and clamped here rather than trusted: the body
   * arrives over HTTP and, through the tunnel, can come from a browser that is
   * not the developer's own.
   */
  const write = (entry) => {
    const level = ['ERROR', 'WARN', 'INFO'].includes(entry?.level) ? entry.level : 'INFO';
    const who = String(entry?.client || '----').replace(/[^\w-]/g, '').slice(0, 8) || '----';
    const text = String(entry?.message ?? '')
      .replace(/[\r\n]+/g, ' ')              // one event stays one line
      .slice(0, maxLineLength);

    const line = `${stamp()} | ${level.padEnd(5)} | ${who} | ${text}`;

    // Errors go to BOTH files: frontend-error.log is the short list to scan
    // first, frontend-info.log stays the complete timeline in order.
    append('frontend-info.log', line);
    if (level === 'ERROR') append('frontend-error.log', line);

    if (echo) {
      const paint = PAINT[level] || ((s) => s);
      console.log(paint(line));
    }
  };

  const middleware = (root) => (req, res, next) => {
    if (req.url?.split('?')[0] !== ENDPOINT || req.method !== 'POST') return next();

    ensureDir(root);

    let body = '';
    let tooBig = false;
    req.on('data', (chunk) => {
      body += chunk;
      // 256 KB ceiling. A batch is a handful of short lines; anything this
      // large is a bug or abuse, and buffering it unbounded would be the
      // actual vulnerability.
      if (body.length > 262_144) { tooBig = true; req.destroy(); }
    });

    req.on('end', () => {
      if (tooBig) return;
      try {
        const parsed = JSON.parse(body);
        const entries = Array.isArray(parsed) ? parsed : [parsed];
        entries.slice(0, 200).forEach(write);
      } catch {
        /* Malformed body: ignore it rather than crash the server. */
      }
      res.statusCode = 204;
      res.end();
    });

    // A client that disconnects mid-send leaves no response to write.
    req.on('error', () => { /* nothing to do */ });
    return undefined;
  };

  return {
    name: 'frontend-file-log',
    // Dev server (npm run dev).
    configureServer(server) {
      server.middlewares.use(middleware(server.config.root));
    },
    // Preview server (npm run serve -- the live testing instance on 4173).
    configurePreviewServer(server) {
      server.middlewares.use(middleware(server.config.root));
    },
  };
}
