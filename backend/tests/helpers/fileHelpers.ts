import fs from 'fs';
import path from 'path';

export function loadTestImage(name = 'tiny.png') {
  const p = path.resolve(__dirname, '..', 'fixtures', name);
  return fs.readFileSync(p);
}

export function createPngBuffer() {
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAn0B9c8k2L0AAAAASUVORK5CYII=';
  return Buffer.from(pngBase64, 'base64');
}