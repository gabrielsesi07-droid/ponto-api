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

/**
 * Next's Vercel adapter emits Build Output API v3 into <distDir>/output before
 * `next build` returns. Its root static page is `.html`, mapped to `./` by an
 * override; the CLI's equivalent output lives in .vercel/output.
 * See nextjs/adapter-vercel packages/adapter/src/{index,outputs}.ts.
 */
async function publishedHome(root, dist) {
  for (const output of [path.join(dist, 'output'), path.join(root, '.vercel/output')]) {
    if (!existsSync(output)) continue;
    const configFile = path.join(output, 'config.json');
    const config = JSON.parse(await readFile(configFile, 'utf8'));
    if (config.version !== 3) throw new Error('Formato de publicação Vercel não suportado: ' + path.relative(root, configFile));
    const homes = Object.entries(config.overrides ?? {}).filter(([file, override]) =>
      /\.html$/.test(file) && override && ['/', './', '.', ''].includes(override.path) &&
      (!override.contentType || /^text\/html(?:;|$)/i.test(override.contentType)));
    if (homes.length !== 1)
      throw new Error('O output Vercel precisa identificar exatamente um HTML para a rota inicial em config.json.overrides.');
    const staticDir = path.join(output, 'static');
    return { htmlFile: within(staticDir, homes[0][0]), assetDir: staticDir, assetPrefix: '/' };
  }
  return { htmlFile: path.join(dist, 'server/app/index.html'), assetDir: dist, assetPrefix: '/_next/' };
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

/**
 * Verify the CSS actually linked by the built page. Scanning every chunk would let
 * an unreferenced fresh chunk conceal the stale linked stylesheet seen in production.
 */
export async function verifyBuiltStyles({ root = projectRoot, distDir = '.next' } = {}) {
  root = path.resolve(root);
  const dist = path.resolve(root, distDir);
  await readFile(path.join(dist, 'BUILD_ID'), 'utf8');
  const publication = await publishedHome(root, dist);
  const html = await readFile(publication.htmlFile, 'utf8');
  const references = [...new Set([...html.matchAll(/href=["']([^"']+\.css(?:\?[^"']*)?)["']/g)].map(match => match[1]))];
  if (!references.length) throw new Error('O HTML de produção não referencia nenhuma folha de estilos.');
  const actual = new Set();
  let fixedSkipLink = false;
  for (const reference of references) {
    const url = new URL(reference, 'https://build.invalid');
    if (url.origin !== 'https://build.invalid' || !url.pathname.startsWith('/_next/static/'))
      throw new Error('Referência CSS inesperada no HTML de produção: ' + reference);
    const file = within(publication.assetDir, decodeURIComponent(url.pathname.slice(publication.assetPrefix.length)));
    const tree = postcss.parse(await readFile(file, 'utf8'), { from: file });
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

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => !arg.startsWith('--dist-dir='))) throw new Error('Use somente --dist-dir=<diretório>, se necessário.');
    const result = await verifyBuiltStyles({ distDir: args[0]?.slice('--dist-dir='.length) || '.next' });
    console.log(`CSS de produção verificado: ${result.stylesheets} arquivo(s) vinculado(s), ${result.sources} fonte(s) autoral(is), ${result.classes} classes e link de salto fora do fluxo.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
