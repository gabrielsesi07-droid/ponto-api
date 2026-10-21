import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyBuiltStyles } from '../scripts/verify-built-styles.mjs';

const currentCss = '.skip-link{position:fixed;transform:translateY(-200%)}.skip-link:focus{transform:translateY(0)}.workspace-main{display:grid}.signature-board,.signature-card{display:block}.operations-form{width:100%}';
async function writeFiles(root, files) {
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

async function adapterOutput(root, { directory = '.next/output', home = '.html', css = currentCss } = {}) {
  await writeFiles(root, {
    [`${directory}/config.json`]: JSON.stringify({ version: 3, overrides: { [home]: { path: './', contentType: 'text/html; charset=utf-8' } } }),
    [`${directory}/static/${home}`]: '<link rel="stylesheet" href="/_next/static/immutable/chunks/published.css?dpl=fixture"/>',
    [`${directory}/static/_next/static/immutable/chunks/published.css`]: css,
  });
}

async function fixture(run, linkedCss = currentCss) {
  const root = await mkdtemp(path.join(tmpdir(), 'horacerta-css-'));
  const files = {
    'app/layout.tsx': 'import "./globals.css"; export default function Layout() {}',
    'app/page.tsx': 'import { Workspace } from "@/components/workspace";',
    'app/globals.css': '.skip-link { position: fixed; transform: translateY(-200%); } .skip-link:focus { transform: translateY(0); } .workspace-main { display: grid; }',
    'app/operations.css': '.operations-form { width: 100%; }',
    'components/workspace.tsx': 'import "./signature.css"; import "@/app/operations.css";',
    'components/signature.css': '.signature-board { display: block; } .signature-card { display: block; }',
    '.next/BUILD_ID': 'fixture-build',
    '.next/server/app/index.html': '<link rel="stylesheet" href="/_next/static/chunks/current.css"/>',
    '.next/static/chunks/current.css': linkedCss,
  };
  try {
    await writeFiles(root, files);
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('build verification follows real CSS links and source imports across minified merged rules', async () => {
  await fixture(async root => {
    assert.deepEqual(await verifyBuiltStyles({ root }), { stylesheets: 1, sources: 3, classes: 5 });
  });
});

test('stale linked CSS fails even when a fresh orphaned chunk exists', async () => {
  await fixture(async root => {
    await writeFile(path.join(root, '.next/static/chunks/orphan.css'), currentCss);
    await assert.rejects(verifyBuiltStyles({ root }), /incompleto ou desatualizado[\s\S]*skip-link[\s\S]*signature-card/);
  }, '.operations-form{width:100%}');
});

test('a skip-link class without fixed positioning cannot pass the layout regression guard', async () => {
  await fixture(async root => {
    await assert.rejects(verifyBuiltStyles({ root }), /skip-link precisa manter position: fixed/);
  }, currentCss.replace('position:fixed', 'position:static'));
});

test('missing linked stylesheet and absent completed build fail closed', async () => {
  await fixture(async root => {
    await rm(path.join(root, '.next/static/chunks/current.css'));
    await assert.rejects(verifyBuiltStyles({ root }), { code: 'ENOENT' });
    await rm(path.join(root, '.next/BUILD_ID'));
    await assert.rejects(verifyBuiltStyles({ root }), { code: 'ENOENT' });
  });
});

test('an unresolved authored CSS import cannot be silently excluded from verification', async () => {
  await fixture(async root => {
    await rm(path.join(root, 'components/signature.css'));
    await assert.rejects(verifyBuiltStyles({ root }), /CSS autoral importado não encontrado/);
  });
});

test('the Next Vercel adapter root override verifies published assets after native HTML was removed', async () => {
  await fixture(async root => {
    // Exact adapter output: join("./", "/.html") => ".html", root override path => "./".
    await adapterOutput(root);
    await rm(path.join(root, '.next/server/app/index.html'));
    await rm(path.join(root, '.next/static'), { recursive: true });
    assert.deepEqual(await verifyBuiltStyles({ root }), { stylesheets: 1, sources: 3, classes: 5 });
  });
});

test('Build Output API v3 also supports the CLI publication directory with an explicit root override', async () => {
  await fixture(async root => {
    await adapterOutput(root, { directory: '.vercel/output', home: 'index.html' });
    await rm(path.join(root, '.next/server/app/index.html'));
    assert.deepEqual(await verifyBuiltStyles({ root }), { stylesheets: 1, sources: 3, classes: 5 });
  });
});

test('stale published styles cannot be masked by fresh native HTML, native CSS or orphan output chunks', async () => {
  await fixture(async root => {
    await adapterOutput(root, { css: '.operations-form{width:100%}' });
    await writeFiles(root, { '.next/output/static/_next/static/immutable/chunks/orphan.css': currentCss });
    await assert.rejects(verifyBuiltStyles({ root }), /incompleto ou desatualizado[\s\S]*signature-card/);
  });
});

test('a missing published stylesheet fails instead of falling back to native Next assets', async () => {
  await fixture(async root => {
    await adapterOutput(root);
    await rm(path.join(root, '.next/output/static/_next/static/immutable/chunks/published.css'));
    await assert.rejects(verifyBuiltStyles({ root }), { code: 'ENOENT' });
  });
});

test('incomplete output and unidentifiable, ambiguous or escaping root overrides fail closed', async () => {
  await fixture(async root => {
    const output = '.next/output';
    await mkdir(path.join(root, output), { recursive: true });
    await assert.rejects(verifyBuiltStyles({ root }), { code: 'ENOENT' });
    for (const overrides of [
      { 'other.html': { path: '/other' } },
      { '.html': { path: './' }, 'other.html': { path: '/' } },
    ]) {
      await writeFiles(root, { [`${output}/config.json`]: JSON.stringify({ version: 3, overrides }) });
      await assert.rejects(verifyBuiltStyles({ root }), /exatamente um HTML para a rota inicial/);
    }
    await writeFiles(root, { [`${output}/config.json`]: JSON.stringify({ version: 3, overrides: { '../outside.html': { path: '/' } } }) });
    await assert.rejects(verifyBuiltStyles({ root }), /fora do diretório de build/);
    await writeFiles(root, { [`${output}/config.json`]: JSON.stringify({ version: 4, overrides: { '.html': { path: '/' } } }) });
    await assert.rejects(verifyBuiltStyles({ root }), /Formato de publicação Vercel não suportado/);
  });
});
