import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyBuiltStyles, verifyPublishedStyles } from '../scripts/verify-built-styles.mjs';

const currentCss = '.skip-link{position:fixed;transform:translateY(-200%)}.skip-link:focus{transform:translateY(0)}.workspace-main{display:grid}.signature-board,.signature-card{display:block}.operations-form{width:100%}';
async function writeFiles(root, files) {
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
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

test('a fresh CSS preload cannot mask the stale stylesheet actually applied by the page', async () => {
  await fixture(async root => {
    await writeFiles(root, {
      '.next/server/app/index.html': '<link rel="preload" as="style" href="/_next/static/chunks/orphan.css"/><link rel="stylesheet" href="/_next/static/chunks/current.css"/>',
      '.next/static/chunks/orphan.css': currentCss,
    });
    await assert.rejects(verifyBuiltStyles({ root }), /incompleto ou desatualizado/);
  }, '.operations-form{width:100%}');
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

function publicSite({ html = '<link rel="stylesheet" href="/_next/static/immutable/chunks/current.css?dpl=fixture&amp;x=1"/>', css = currentCss,
  htmlStatus = 200, cssStatus = 200, htmlType = 'text/html; charset=utf-8', cssType = 'text/css; charset=utf-8',
  redirected = false, responseOrigin = 'https://published.example' } = {}) {
  const calls = [];
  return { calls, fetch: async (target, options) => {
    const url = new URL(target);
    calls.push({ url, options });
    assert.equal(url.origin, 'https://published.example', 'the verifier must not request other origins');
    const isHome = url.pathname === '/';
    if (!isHome) assert.equal(url.pathname, '/_next/static/immutable/chunks/current.css');
    const status = isHome ? htmlStatus : cssStatus;
    return { ok: status >= 200 && status < 300, status, redirected, url: responseOrigin + url.pathname + url.search,
      headers: new Headers({ 'content-type': isHome ? htmlType : cssType }), text: async () => isHome ? html : css };
  } };
}

test('published verification compares every authored class against public linked CSS without native build artifacts', async () => {
  await fixture(async root => {
    await rm(path.join(root, '.next'), { recursive: true });
    const site = publicSite();
    assert.deepEqual(await verifyPublishedStyles({ root, url: 'https://published.example/?demo=1', fetch: site.fetch }),
      { stylesheets: 1, sources: 3, classes: 5 });
    assert.equal(site.calls.length, 2);
    assert.equal(site.calls[0].url.search, '?demo=1');
    assert.equal(site.calls[1].url.search, '?dpl=fixture&x=1');
    for (const { options } of site.calls) {
      assert.equal(options.credentials, 'omit');
      assert.equal(options.redirect, 'error');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.headers['cache-control'], 'no-cache');
      assert.equal(options.headers.cookie, undefined);
      assert.ok(options.signal instanceof AbortSignal);
    }
  });
});

test('stale published CSS fails despite a complete fresh native build', async () => {
  await fixture(async root => {
    const site = publicSite({ css: '.operations-form{width:100%}' });
    await assert.rejects(verifyPublishedStyles({ root, url: 'https://published.example', fetch: site.fetch }),
      /incompleto ou desatualizado[\s\S]*skip-link[\s\S]*signature-card/);
  });
});

test('published verification requires the HTTPS home without credentials or fragment before making requests', async () => {
  await fixture(async root => {
    const site = publicSite();
    for (const url of ['http://published.example', 'https://user:secret@published.example', 'https://published.example/#anchor', 'https://published.example/#',
      'https://published.example/other', 'invalid']) {
      await assert.rejects(verifyPublishedStyles({ root, url, fetch: site.fetch }), /HTTPS/);
    }
    assert.equal(site.calls.length, 0);
  });
});

test('external or credential-bearing stylesheet URLs are rejected before any CSS request', async () => {
  await fixture(async root => {
    for (const href of ['https://other.example/_next/static/current.css', 'https://user:secret@published.example/_next/static/current.css']) {
      const site = publicSite({ html: `<link rel="stylesheet" href="${href}"/>` });
      await assert.rejects(verifyPublishedStyles({ root, url: 'https://published.example', fetch: site.fetch }), /Referência CSS inesperada/);
      assert.equal(site.calls.length, 1);
    }
  });
});

test('HTTP failures, redirected responses and unexpected HTML or CSS content types fail closed', async () => {
  await fixture(async root => {
    for (const [settings, message] of [
      [{ htmlStatus: 503 }, /Falha HTTP 503/], [{ cssStatus: 404 }, /Falha HTTP 404/],
      [{ redirected: true }, /redirecionamentos/], [{ responseOrigin: 'https://other.example' }, /outra origem/],
      [{ htmlType: 'application/json' }, /Tipo de conteúdo inesperado/], [{ cssType: 'text/html' }, /Tipo de conteúdo inesperado/],
    ]) {
      const site = publicSite(settings);
      await assert.rejects(verifyPublishedStyles({ root, url: 'https://published.example', fetch: site.fetch }), message);
    }
  });
});

test('a public HTML document without linked CSS and a network error cannot pass', async () => {
  await fixture(async root => {
    const site = publicSite({ html: '<html><body>Deployment protection</body></html>' });
    await assert.rejects(verifyPublishedStyles({ root, url: 'https://published.example', fetch: site.fetch }), /nenhuma folha de estilos/);
    await assert.rejects(verifyPublishedStyles({ root, url: 'https://published.example', fetch: async () => { throw new Error('network unavailable'); } }),
      /network unavailable/);
  });
});
