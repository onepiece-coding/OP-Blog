import fs from 'fs';
import path from 'path';

/**
 * Returns a small PNG buffer taken from tests/fixtures/<name>.
 * Use when you want a real file on disk (easier to swap/inspect).
 */
export function loadTestImage(name = 'tiny.png') {
  const p = path.resolve(__dirname, '..', 'fixtures', name);
  return fs.readFileSync(p);
}

/**
 * Returns a tiny 1x1 PNG buffer (base64 embedded). Fast & no FS.
 */
export function createPngBuffer() {
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAn0B9c8k2L0AAAAASUVORK5CYII=';
  return Buffer.from(pngBase64, 'base64');
}