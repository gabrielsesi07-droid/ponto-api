import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyBuiltStyles } from '../scripts/verify-built-styles.mjs';

const currentCss = '.skip-link{position:fixed;transform:translateY(-200%)}.skip-link:focus{transform:translateY(0)}.workspace-main{display:grid}.signature-board,.signature-card{display:block}.operations-form{width:100%}';
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
    for (const [file, content] of Object.entries(files)) {
      const target = path.join(root, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
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
