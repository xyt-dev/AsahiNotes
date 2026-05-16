import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const [outDirArg] = args.filter((arg) => arg !== '--verbose');
const outDir = path.resolve(outDirArg ?? 'doc_build');
const fixes = [];
const stats = {
  removedScripts: 0,
  htmlUrls: 0,
  cssUrls: 0,
};

async function walk(dir) {
  const entries = await readdir(dir);
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const info = await stat(fullPath);
    if (info.isDirectory()) {
      files.push(...await walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function toUrlPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function displayPath(filePath) {
  return toUrlPath(path.relative(process.cwd(), filePath));
}

function singleLine(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function recordFix(file, before, after, type) {
  stats[type] += 1;

  if (verbose) {
    fixes.push(`${displayPath(file)}: ${singleLine(before)} -> ${singleLine(after)}`);
  }
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function relativeUrl(fromFile, targetFile) {
  const relativePath = path.relative(path.dirname(fromFile), targetFile);
  return toUrlPath(relativePath || path.basename(targetFile));
}

function resolveRootUrl(rootUrl) {
  const [pathnameWithMaybeQuery, hash = ''] = rootUrl.split('#');
  const [pathname, query = ''] = pathnameWithMaybeQuery.split('?');
  const normalizedPathname = pathname.replace(/^\/+\.?\//, '/');
  const targetPath = normalizedPathname === '/'
    ? 'index.html'
    : safeDecode(normalizedPathname.replace(/^\/+/, ''));

  return {
    targetFile: path.join(outDir, targetPath),
    suffix: `${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`,
  };
}

async function rewriteHtml(file) {
  let source = await readFile(file, 'utf8');

  // Keep the server-rendered HTML readable from file:// by avoiding SPA hydration.
  source = source.replace(/\n?<script\b(?=[^>]*\bsrc=)[^>]*><\/script>/g, (match) => {
    recordFix(file, match, '[removed]', 'removedScripts');
    return '';
  });

  source = source.replace(/\b(href|src)="(\/(?!\/)[^"]*)"/g, (_match, attr, rootUrl) => {
    const { targetFile, suffix } = resolveRootUrl(rootUrl);
    const next = `${attr}="${relativeUrl(file, targetFile)}${suffix}"`;
    recordFix(file, `${attr}="${rootUrl}"`, next, 'htmlUrls');
    return next;
  });

  await writeFile(file, source);
}

async function rewriteCss(file) {
  let source = await readFile(file, 'utf8');

  source = source.replace(/url\((['"]?)\/static\/([^)'"]+)\1\)/g, (_match, quote, assetPath) => {
    const targetFile = path.join(outDir, 'static', safeDecode(assetPath));
    const next = `url(${quote}${relativeUrl(file, targetFile)}${quote})`;
    recordFix(file, _match, next, 'cssUrls');
    return next;
  });

  await writeFile(file, source);
}

const files = await walk(outDir);

await Promise.all(files.filter((file) => file.endsWith('.html')).map(rewriteHtml));
await Promise.all(files.filter((file) => file.endsWith('.css')).map(rewriteCss));

if (verbose) {
  for (const fix of fixes.sort()) {
    console.log(fix);
  }
}

const total = stats.removedScripts + stats.htmlUrls + stats.cssUrls;
console.log(
  `Made ${path.relative(process.cwd(), outDir)} openable via file:// (${total} fixes: ${stats.removedScripts} scripts, ${stats.htmlUrls} HTML URLs, ${stats.cssUrls} CSS URLs)`,
);
