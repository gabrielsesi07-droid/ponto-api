import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import ts from 'typescript';

/** Import real handlers without loading Cloudflare, cookies, or a remote database. */
export function installLocalHandlerHooks(context) {
  const root = new URL('../../', import.meta.url);
  const serverUrl = new URL('lib/server.ts', root).href;
  globalThis.__localHandlerTest = context;
  const hooks = registerHooks({
    resolve(specifier, parent, nextResolve) {
      let candidate;
      if (specifier.startsWith('@/')) candidate = new URL(specifier.slice(2), root);
      else if (specifier.startsWith('.') && parent.parentURL?.startsWith(root.href)) candidate = new URL(specifier, parent.parentURL);
      if (candidate && existsSync(fileURLToPath(new URL(candidate.href + '.ts'))))
        return { url: candidate.href + '.ts', shortCircuit: true };
      return nextResolve(specifier, parent);
    },
    load(url, options, nextLoad) {
      if (url !== serverUrl) return nextLoad(url, options);
      const original = readFileSync(new URL(url), 'utf8');
      const source = ts.createSourceFile('server.ts', original, ts.ScriptTarget.Latest, true);
      const edits = [];
      for (const node of source.statements) {
        if (ts.isImportDeclaration(node) && node.moduleSpecifier.text !== 'zod')
          edits.push({ start: node.getFullStart(), end: node.end, replacement: '' });
        if (ts.isFunctionDeclaration(node) && node.name?.text === 'db')
          edits.push({ start: node.getFullStart(), end: node.end, replacement: '\nexport function db() { return globalThis.__localHandlerTest.sql; }' });
        if (ts.isFunctionDeclaration(node) && node.name?.text === 'member')
          edits.push({ start: node.getFullStart(), end: node.end, replacement: '\nexport async function member() { const [person] = await db()`SELECT * FROM horacerta.users WHERE id=${globalThis.__localHandlerTest.memberId}::uuid AND active=true`; if (!person) throw new ApiError(403, "Conta indisponível."); return person; }' });
      }
      let changed = original;
      for (const edit of edits.sort((a, b) => b.start - a.start)) changed = changed.slice(0, edit.start) + edit.replacement + changed.slice(edit.end);
      // payload, failure, coordinator, ApiError and schemas are the production code.
      return { format: 'module', source: stripTypeScriptTypes(changed, { mode: 'transform' }), shortCircuit: true };
    },
  });
  return () => { hooks.deregister(); delete globalThis.__localHandlerTest; };
}
