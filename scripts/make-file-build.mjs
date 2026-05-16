import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const stripJs = args.includes('--strip-js');
const [outDirArg] = args.filter((arg) => !arg.startsWith('--'));
const outDir = path.resolve(outDirArg ?? 'doc_build');
const fixes = [];
const stats = {
  removedScripts: 0,
  htmlUrls: 0,
  htmlScripts: 0,
  cssUrls: 0,
  jsRuntime: 0,
  jsRoutes: 0,
  jsSearch: 0,
  jsonRoutes: 0,
  searchIndexScripts: 0,
};
let searchIndexScriptFiles = [];

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

function fileHtmlRoute(routePath) {
  if (routePath === '/') {
    return '/index.html';
  }

  if (/\.[^/]+$/.test(routePath)) {
    return routePath;
  }

  return `${routePath}.html`;
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

function isSearchIndexJson(file) {
  return path.basename(file).startsWith('search_index') && file.endsWith('.json');
}

function searchIndexScriptFile(jsonFile) {
  return jsonFile.replace(/\.json$/, '.js');
}

function insertSearchIndexScripts(source, file) {
  if (!searchIndexScriptFiles.length) {
    return source;
  }

  source = source.replace(/\n?<script\b[^>]*\bsrc="[^"]*search_index[^"]*\.js"[^>]*><\/script>/g, '');

  const scriptTags = searchIndexScriptFiles.map((scriptFile) => {
    return `<script src="${relativeUrl(file, scriptFile)}"></script>`;
  }).join('\n');

  if (source.includes(scriptTags)) {
    return source;
  }

  const next = source.replace(/(<script\b(?=[^>]*\bsrc=)[^>]*><\/script>)/, `${scriptTags}\n$1`);
  if (next !== source) {
    recordFix(file, '[insert search index scripts]', scriptTags, 'htmlScripts');
  }

  return next;
}

async function rewriteHtml(file) {
  let source = await readFile(file, 'utf8');

  if (stripJs) {
    // Keep the server-rendered HTML readable from file:// by avoiding SPA hydration.
    source = source.replace(/\n?<script\b(?=[^>]*\bsrc=)[^>]*><\/script>/g, (match) => {
      recordFix(file, match, '[removed]', 'removedScripts');
      return '';
    });
  }

  source = source.replace(/\b(href|src)="(\/(?!\/)[^"]*)"/g, (_match, attr, rootUrl) => {
    const { targetFile, suffix } = resolveRootUrl(rootUrl);
    const next = `${attr}="${relativeUrl(file, targetFile)}${suffix}"`;
    recordFix(file, `${attr}="${rootUrl}"`, next, 'htmlUrls');
    return next;
  });

  source = insertSearchIndexScripts(source, file);

  await writeFile(file, source);
}

async function rewriteJs(file) {
  let source = await readFile(file, 'utf8');
  const fileRootHref = '(()=>{const script=document.currentScript&&document.currentScript.src;return new URL(script?"../../":"./",script||location.href).href})()';
  const fileRootPathname = '(()=>{const script=document.currentScript&&document.currentScript.src;return new URL(script?"../../":"./",script||location.href).pathname})()';

  source = source.replace(/\b([A-Za-z_$][\w$]*)\.p="\/"/g, (match, runtime) => {
    const next = `${runtime}.p=location.protocol==="file:"?${fileRootHref}:"/"`;
    recordFix(file, match, next, 'jsRuntime');
    return next;
  });

  source = source.replace(/\bbase:"\/"/g, (match) => {
    const next = `base:location.protocol==="file:"?${fileRootPathname}:"/"`;
    recordFix(file, match, next, 'jsRuntime');
    return next;
  });

  source = source.replace(/\blogoHref:""/g, (match) => {
    const next = 'logoHref:location.protocol==="file:"?"/index.html":""';
    recordFix(file, match, next, 'jsRuntime');
    return next;
  });

  if (!source.includes('__RSPRESS_SEARCH_INDEX__')) {
    source = source.replace(/\blet ([A-Za-z_$][\w$]*)=await fetch\(([^)]+)\);if\(\1\.ok\)return \1\.json\(\);l\(\1\)/g, (match, response, url) => {
      const next = `if(location.protocol==="file:"){let ${response}=globalThis.__RSPRESS_SEARCH_INDEX__&&globalThis.__RSPRESS_SEARCH_INDEX__[${url}.split("/").pop()];if(${response})return ${response}}${match}`;
      recordFix(file, match, next, 'jsSearch');
      return next;
    });
  }

  source = source.replace(/\b(path|routePath|link):"(\/[^"#?]*)"/g, (match, prop, routePath) => {
    const nextRoutePath = fileHtmlRoute(routePath);
    if (nextRoutePath === routePath) {
      return match;
    }

    const next = `${prop}:"${nextRoutePath}"`;
    recordFix(file, match, next, 'jsRoutes');
    return next;
  });

  await writeFile(file, source);
}

function rewriteJsonRoutes(value, file) {
  if (Array.isArray(value)) {
    for (const item of value) {
      rewriteJsonRoutes(item, file);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  if (typeof value.routePath === 'string') {
    const nextRoutePath = fileHtmlRoute(value.routePath);
    if (nextRoutePath !== value.routePath) {
      recordFix(file, `"routePath":"${value.routePath}"`, `"routePath":"${nextRoutePath}"`, 'jsonRoutes');
      value.routePath = nextRoutePath;
    }
  }

  for (const item of Object.values(value)) {
    rewriteJsonRoutes(item, file);
  }
}

async function rewriteJson(file) {
  const source = await readFile(file, 'utf8');
  const data = JSON.parse(source);

  rewriteJsonRoutes(data, file);

  await writeFile(file, JSON.stringify(data));
}

async function writeSearchIndexScript(file) {
  const source = await readFile(file, 'utf8');
  const scriptFile = searchIndexScriptFile(file);
  const script = `globalThis.__RSPRESS_SEARCH_INDEX__=Object.assign(globalThis.__RSPRESS_SEARCH_INDEX__||{},${JSON.stringify({ [path.basename(file)]: JSON.parse(source) })});\n`;

  await writeFile(scriptFile, script);
  recordFix(scriptFile, '[create search index script]', path.basename(scriptFile), 'searchIndexScripts');

  return scriptFile;
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
const searchIndexFiles = files.filter(isSearchIndexJson);

await Promise.all(searchIndexFiles.map(rewriteJson));
searchIndexScriptFiles = await Promise.all(searchIndexFiles.map(writeSearchIndexScript));
await Promise.all(files.filter((file) => file.endsWith('.html')).map(rewriteHtml));
await Promise.all(files.filter((file) => file.endsWith('.js')).map(rewriteJs));
await Promise.all(files.filter((file) => file.endsWith('.css')).map(rewriteCss));

if (verbose) {
  for (const fix of fixes.sort()) {
    console.log(fix);
  }
}

const total = stats.removedScripts + stats.htmlUrls + stats.htmlScripts + stats.cssUrls + stats.jsRuntime + stats.jsRoutes + stats.jsSearch + stats.jsonRoutes + stats.searchIndexScripts;
console.log(
  `${total} fixes: ${stats.removedScripts} removed scripts, ${stats.htmlUrls} HTML URLs, ${stats.htmlScripts} HTML scripts, ${stats.cssUrls} CSS URLs, ${stats.jsRuntime} JS runtime, ${stats.jsRoutes} JS routes, ${stats.jsSearch} JS search, ${stats.jsonRoutes} JSON routes, ${stats.searchIndexScripts} search index scripts`,
);
