import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(resolve(root, 'public/assets'), { recursive: true });
await copyFile(resolve(root, 'index.html'), resolve(root, 'public/index.html'));
console.log('build: index.html -> public/index.html');
