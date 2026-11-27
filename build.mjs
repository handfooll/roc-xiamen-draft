// Usage: node build.mjs            -> dist/ preview (form does not send)
//        API=/api/lead node build.mjs -> dist/ for the server
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync, cpSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { page } from './src/page.mjs';

const out = 'dist';
const api = process.env.API || '';
const lang = process.env.LANG_MAIN || 'ru';
rmSync(out, { recursive: true, force: true });
mkdirSync(out);

const hashed = (file, ext) => {
  const body = readFileSync(`src/${file}`);
  const name = `${file.split('.')[0]}.${createHash('sha256').update(body).digest('hex').slice(0, 10)}.${ext}`;
  writeFileSync(`${out}/${name}`, body);
  return name;
};
const css = hashed('style.css', 'css');
const js = hashed('app.js', 'js');
const t = JSON.parse(readFileSync(`content/${lang}.json`, 'utf8'));
const unis = JSON.parse(readFileSync('content/universities.json', 'utf8'));

const site = process.env.SITE_URL || ''; // e.g. https://example.com/ so chat apps can load og.png
writeFileSync(`${out}/index.html`, page(t, unis, { css, js, api, site }));
writeFileSync(`${out}/404.html`, readFileSync('src/404.html', 'utf8').replace('__CSS__', css));
cpSync('src/img', `${out}/img`, { recursive: true });
for (const f of ['favicon.png', 'apple-touch-icon.png', 'og.png', 'robots.txt']) if (existsSync(`src/${f}`)) copyFileSync(`src/${f}`, `${out}/${f}`);
console.log(`built ${out}/ (${lang}, api=${api || 'preview'})`);
