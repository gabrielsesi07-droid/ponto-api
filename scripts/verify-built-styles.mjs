import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import postcss from 'postcss';
import ts from 'typescript';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const classNames = selector => [...selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(match => match[1]);

function within(directory, relative) {
  const file = path.resolve(directory, relative);
  const resolved = path.relative(directory, file);
  if (!resolved || resolved === '..' || resolved.startsWith('..' + path.sep) || path.isAbsolute(resolved))
    throw new Error('Referência fora do diretório de build: ' + relative);
  return file;
}

/** Follow the home route's source imports without executing application code or opening a database. */
async function authoredStyles(root) {
  const visited = new Set(), sources = new Map();
  const withinRoot = file => {
    const relative = path.relative(root, file);
    return relative && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
  };
  function resolveImport(from, specifier) {
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null;
    const base = specifier.startsWith('@/') ? path.resolve(root, specifier.slice(2)) : path.resolve(path.dirname(from), specifier);
    if (!withinRoot(base) || path.relative(root, base).startsWith('vendor' + path.sep)) return null;
    const resolved = [base, ...['.tsx', '.ts', '.mjs', '.js'].map(extension => base + extension),
      ...['index.tsx', 'index.ts', 'index.mjs', 'index.js'].map(name => path.join(base, name))]
      .find(file => /\.(?:css|tsx?|m?js)$/.test(file) && existsSync(file)) ?? null;
    if (!resolved && specifier.endsWith('.css')) throw new Error('CSS autoral importado não encontrado: ' + path.relative(root, base));
    return resolved;
  }
  async function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const source = await readFile(file, 'utf8');
    const imports = [];
    if (file.endsWith('.css')) {
      const tree = postcss.parse(source, { from: file });
      const classes = new Set();
      tree.walkRules(rule => classNames(rule.selector).forEach(name => classes.add(name)));
      sources.set(path.relative(root, file), classes);
      tree.walkAtRules('import', rule => {
        const specifier = rule.params.match(/^(?:url\(\s*)?["']([^"']+)["']/)?.[1];
        if (specifier) imports.push(specifier);
      });
    } else {
      const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      const walk = node => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
          imports.push(node.moduleSpecifier.text);
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0]))
          imports.push(node.arguments[0].text);
        ts.forEachChild(node, walk);
      };
      walk(tree);
    }
    for (const specifier of imports) {
      const resolved = resolveImport(file, specifier);
      if (resolved) await visit(resolved);
    }
  }
  for (const file of ['app/layout.tsx', 'app/page.tsx']) await visit(path.join(root, file));
  return sources;
}

async function verifyStyles({ root, html, origin, readStylesheet }) {
  const references = [...new Set([...html.matchAll(/<link\b[^>]*>/gi)].flatMap(([tag]) => {
    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    return href && rel?.toLowerCase().split(/\s+/).includes('stylesheet')
      ? [href.replaceAll('&amp;', '&')] : [];
  }))];
  if (!references.length) throw new Error('O HTML de produção não referencia nenhuma folha de estilos.');
  const actual = new Set();
  let fixedSkipLink = false;
  const sheets = await Promise.all(references.map(async reference => {
    const url = new URL(reference, origin);
    if (url.origin !== origin || url.username || url.password || !url.pathname.startsWith('/_next/static/') || !url.pathname.endsWith('.css'))
      throw new Error('Referência CSS inesperada no HTML de produção: ' + url.pathname);
    return { url, source: await readStylesheet(url) };
  }));
  for (const { url, source } of sheets) {
    const tree = postcss.parse(source, { from: url.pathname });
    tree.walkRules(rule => {
      classNames(rule.selector).forEach(name => actual.add(name));
      if (rule.selectors.some(selector => selector.trim() === '.skip-link'))
        rule.walkDecls('position', declaration => { if (declaration.value === 'fixed') fixedSkipLink = true; });
    });
  }
  const sources = await authoredStyles(root);
  if (!sources.size) throw new Error('Nenhum CSS autoral encontrado nos imports da página inicial.');
  const missing = [...sources].flatMap(([file, classes]) => [...classes].filter(name => !actual.has(name)).map(name => `${file}: .${name}`));
  if (missing.length || !fixedSkipLink) {
    const details = [!fixedSkipLink ? '.skip-link precisa manter position: fixed para não ocupar espaço no layout.' : '',
      ...missing.slice(0, 24), missing.length > 24 ? `… e mais ${missing.length - 24} classe(s).` : ''].filter(Boolean);
    throw new Error('CSS publicado pelo build está incompleto ou desatualizado. Confira o cache de transformação antes de publicar:\n' + details.join('\n'));
  }
  return { stylesheets: references.length, sources: sources.size, classes: new Set([...sources.values()].flatMap(classes => [...classes])).size };
}

/** Verify only CSS linked by the native build, never unrelated orphaned chunks. */
export async function verifyBuiltStyles({ root = projectRoot, distDir = '.next' } = {}) {
  root = path.resolve(root);
  const dist = path.resolve(root, distDir);
  await readFile(path.join(dist, 'BUILD_ID'), 'utf8');
  const html = await readFile(path.join(dist, 'server/app/index.html'), 'utf8');
  return verifyStyles({ root, html, origin: 'https://build.invalid',
    readStylesheet: url => readFile(within(dist, decodeURIComponent(url.pathname.slice('/_next/'.length))), 'utf8') });
}

/** Verify the public home and its same-origin styles without cookies or platform internals. */
export async function verifyPublishedStyles({ root = projectRoot, url, fetch: fetcher = globalThis.fetch } = {}) {
  let home;
  try { home = new URL(url); } catch { throw new Error('Informe a URL HTTPS da página inicial para verificar o CSS publicado.'); }
  if (home.protocol !== 'https:' || home.username || home.password || home.href.includes('#') || home.pathname !== '/')
    throw new Error('A verificação publicada exige HTTPS na página inicial, sem credenciais ou fragmento.');
  async function fetchText(target, contentType, maxBytes) {
    const response = await fetcher(target.href, { cache: 'no-store', credentials: 'omit', redirect: 'error',
      headers: { accept: contentType, 'cache-control': 'no-cache', pragma: 'no-cache' }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Falha HTTP ${response.status} ao verificar ${target.origin}${target.pathname}.`);
    if (response.redirected || !response.url || new URL(response.url).origin !== home.origin)
      throw new Error('A verificação publicada não aceita redirecionamentos ou respostas de outra origem.');
    if (!new RegExp('^' + contentType + '(?:\\s*;|$)', 'i').test(response.headers.get('content-type') ?? ''))
      throw new Error('Tipo de conteúdo inesperado ao verificar ' + target.pathname + '.');
    const source = await response.text();
    if (Buffer.byteLength(source) > maxBytes) throw new Error('Resposta acima do limite ao verificar ' + target.pathname + '.');
    return source;
  }
  const html = await fetchText(home, 'text/html', 2 * 1024 * 1024);
  return verifyStyles({ root: path.resolve(root), html, origin: home.origin,
    readStylesheet: target => fetchText(target, 'text/css', 8 * 1024 * 1024) });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || args.some(arg => !arg.startsWith('--dist-dir=') && !arg.startsWith('--url=')))
      throw new Error('Use --dist-dir=<diretório> ou --url=https://<domínio>, sem combinar opções.');
    const result = args[0]?.startsWith('--url=')
      ? await verifyPublishedStyles({ url: args[0].slice('--url='.length) })
      : await verifyBuiltStyles({ distDir: args[0]?.slice('--dist-dir='.length) || '.next' });
    console.log(`CSS de produção verificado: ${result.stylesheets} arquivo(s) vinculado(s), ${result.sources} fonte(s) autoral(is), ${result.classes} classes e link de salto fora do fluxo.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
