#!/usr/bin/env node
// Frame-by-frame renderer. Serves the engine and one project over loopback, drives the player page in
// headless Chromium (window.__seek(t)), and encodes the frames with ffmpeg. Deterministic: the same
// project gives the same frames on every machine.
//
//   node render.cjs <project> [--format 9x16|16x9|1x1] [--style <pack>] [--scale 1] [--fps 30]
//                   [--from s] [--to s] [--workers n] [--out file.mp4] [--audio file] [--crf 16]
//                   [--still t1,t2,...] [--sheet n] [--svg t] [--png] [--gpu] [--keep-frames]
//   node render.cjs <project> --serve            (open the printed URL to preview and scrub)
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ENGINE = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

function fail(msg) {
  console.error('render: ' + msg);
  process.exit(1);
}

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (!s.startsWith('--')) { a._.push(s); continue; }
    const k = s.slice(2);
    const flag = ['png', 'gpu', 'keep-frames', 'serve'].includes(k);
    a[k] = flag ? true : argv[++i];
    if (!flag && a[k] === undefined) fail(`--${k} needs a value`);
  }
  return a;
}

function loadPlaywright() {
  for (const name of ['playwright', path.join(ENGINE, 'node_modules', 'playwright')]) {
    try { return require(name); } catch { /* try the next place */ }
  }
  fail('Playwright is not installed. Run "npm i playwright && npx playwright install chromium" in the engine folder.');
}

function serve(projectDir) {
  const roots = { engine: ENGINE, project: projectDir };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const m = /^\/(engine|project)\/(.*)$/.exec(url);
    const file = m ? path.resolve(roots[m[1]], m[2]) : null;
    // Only files inside the two roots are served.
    if (!file || !(file + path.sep).startsWith(roots[m[1]] + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function openPage(pw, url, size, scale, gpu) {
  const args = gpu ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const browser = await pw.chromium.launch({ args, executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: scale });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
  const err = await page.evaluate(() => window.__error || null);
  if (err || errors.length) { await browser.close(); fail('the scene failed to load:\n' + (err || errors.join('\n'))); }
  return { browser, page };
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.error) fail('ffmpeg is not installed or not on PATH.');
  if (r.status !== 0) fail('ffmpeg stopped with an error (see above).');
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a._[0]) fail('usage: node render.cjs <project folder> [options]  (see the top of this file)');
  const projectDir = path.resolve(a._[0]);
  const projectFile = path.join(projectDir, 'project.json');
  if (!fs.existsSync(projectFile)) fail(`no project.json in ${projectDir}`);
  const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
  const format = a.format || project.format || '9x16';
  const style = a.style || project.style || 'midnight-lab';
  const SIZES = { '9x16': { w: 1080, h: 1920 }, '16x9': { w: 1920, h: 1080 }, '1x1': { w: 1080, h: 1080 } };
  const size = SIZES[format] || fail(`unknown format "${format}"`);
  if (!fs.existsSync(path.join(ENGINE, 'styles', style + '.json'))) fail(`no style pack "${style}" in engine/styles`);
  const fps = Number(a.fps || project.fps || 30);
  const scale = Number(a.scale || 1);
  const outDir = path.join(projectDir, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const tag = `${project.id || path.basename(projectDir)}_${format}_${style}`;

  const server = await serve(projectDir);
  const base = `http://127.0.0.1:${server.address().port}/engine/runtime/player.html?format=${format}&style=${style}`;
  if (a.serve) { console.log('preview: ' + base + '&play=1\n(Ctrl+C to stop)'); return; }
  const pw = loadPlaywright();

  try {
    if (a.still || a.sheet || a.svg) {
      const sheet = a.sheet ? Number(a.sheet) : 0;
      const { browser, page } = await openPage(pw, base, size, sheet ? Math.min(scale, 0.3) : scale, a.gpu);
      const duration = await page.evaluate(() => window.__duration);
      if (a.svg) {
        await page.evaluate((t) => window.__seek(t), Number(a.svg));
        const file = path.join(outDir, `${tag}_${a.svg}s.svg`);
        fs.writeFileSync(file, await page.evaluate(() => window.__svg()));
        console.log(file);
      }
      const times = a.still ? a.still.split(',').map(Number) : sheet ? Array.from({ length: sheet }, (_, i) => (duration * (i + 0.5)) / sheet) : [];
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-'));
      for (let i = 0; i < times.length; i++) {
        await page.evaluate((t) => window.__seek(t), times[i]);
        const file = sheet ? path.join(tmp, `s_${String(i).padStart(3, '0')}.jpg`) : path.join(outDir, `${tag}_${times[i]}s.png`);
        await page.screenshot({ path: file, type: sheet ? 'jpeg' : 'png', ...(sheet ? { quality: 88 } : {}) });
        if (!sheet) console.log(file);
      }
      await browser.close();
      if (sheet) {
        const cols = format === '16x9' ? 4 : 6;
        const file = path.join(outDir, `${tag}_sheet.jpg`);
        ffmpeg(['-i', path.join(tmp, 's_%03d.jpg'), '-vf', `tile=${cols}x${Math.ceil(sheet / cols)}`, '-frames:v', '1', '-q:v', '3', file]);
        fs.rmSync(tmp, { recursive: true, force: true });
        console.log(file);
      }
      return;
    }

    // Full render: split the frame range between workers, each with its own browser.
    const probe = await openPage(pw, base, size, scale, a.gpu);
    const duration = await probe.page.evaluate(() => window.__duration);
    await probe.browser.close();
    const first = Math.round(Number(a.from || 0) * fps);
    const last = Math.round(Math.min(Number(a.to || duration), duration) * fps);
    const total = last - first;
    if (total <= 0) fail('nothing to render: check --from/--to against the duration');
    const workers = Math.max(1, Math.min(Number(a.workers || Math.min(4, os.cpus().length)), total));
    const ext = a.png ? 'png' : 'jpg';
    const frames = path.join(outDir, `.frames_${tag}`);
    fs.rmSync(frames, { recursive: true, force: true });
    fs.mkdirSync(frames, { recursive: true });
    let done = 0;
    const started = Date.now();
    await Promise.all(Array.from({ length: workers }, async (_, w) => {
      const { browser, page } = await openPage(pw, base, size, scale, a.gpu);
      // Interleaved frames (w, w+workers, ...) keep every worker equally busy on heavy and light parts.
      for (let i = w; i < total; i += workers) {
        await page.evaluate((t) => window.__seek(t), (first + i) / fps);
        await page.screenshot({ path: path.join(frames, `f_${String(i).padStart(6, '0')}.${ext}`), type: a.png ? 'png' : 'jpeg', ...(a.png ? {} : { quality: 93 }) });
        if (++done % 30 === 0 || done === total) process.stdout.write(`\r  ${done}/${total} frames  ${(done / ((Date.now() - started) / 1000)).toFixed(1)} fps   `);
      }
      await browser.close();
    }));
    process.stdout.write('\n');
    const out = path.resolve(a.out || path.join(outDir, `${tag}.mp4`));
    const audio = a.audio || (project.audio && project.audio.file ? path.join(projectDir, project.audio.file) : null);
    ffmpeg(['-framerate', String(fps), '-i', path.join(frames, `f_%06d.${ext}`),
      ...(audio ? ['-i', audio, '-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', String(a.crf || 16), '-preset', 'medium', '-movflags', '+faststart', out]);
    if (!a['keep-frames']) fs.rmSync(frames, { recursive: true, force: true });
    console.log(out);
  } finally {
    server.close();
  }
}

main().catch((e) => fail(e && e.stack ? e.stack : String(e)));
