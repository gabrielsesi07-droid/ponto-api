// Run locally on a trusted computer. Originals/manifest/model suggestions are private inputs,
// never embedded in the app bundle or Git. Re-running is resumable and content-addressed.
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
const folder = resolve(process.argv[2] || 'work/library');
const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
const suggestions = JSON.parse(await readFile(join(folder, 'models.json'), 'utf8'));
const sql = neon(process.env.DATABASE_URL);
const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const [run] = await sql`INSERT INTO horacerta.library_imports DEFAULT VALUES RETURNING id`;
let uploaded = 0, reused = 0;
try {
  for (const item of manifest.documents) {
    const data = await readFile(join(folder, 'originals', item.hash + item.extension));
    if (createHash('sha256').update(data).digest('hex') !== item.hash || data.length !== item.size)
      throw new Error('Original não confere com manifesto. Interrompendo importação.');
    const count = Math.ceil(data.length / 524288);
    const [doc] = await sql`INSERT INTO horacerta.library_documents(sha256,name,extension,size,category,origins,warnings,obsolete,status,search_text,section_count,chunk_count,import_id)
      VALUES(${item.hash},${item.name},${item.extension},${item.size},${item.category},${JSON.stringify(item.origins)}::jsonb,${JSON.stringify(item.warnings)}::jsonb,${item.obsolete},${item.obsolete ? 'archived' : 'pending'},${normalize(item.name + '\n' + item.sections.map(s => s.text).join('\n'))},${item.sections.length},${count},${run.id})
      ON CONFLICT(sha256) DO UPDATE SET
        origins=excluded.origins, obsolete=excluded.obsolete,
        status=CASE WHEN excluded.obsolete THEN 'archived' ELSE horacerta.library_documents.status END,
        version=horacerta.library_documents.version+CASE WHEN horacerta.library_documents.obsolete IS DISTINCT FROM excluded.obsolete THEN 1 ELSE 0 END,
        import_id=excluded.import_id
      RETURNING id,ready`;
    if (doc.ready) { reused++; continue; }
    for (let start = 0; start < count; start += 4) {
      await sql.transaction(Array.from({ length: Math.min(4, count - start) }, (_, offset) => {
        const i = start + offset;
        return sql`INSERT INTO horacerta.library_chunks(document_id,position,data) VALUES(${doc.id},${i},${data.subarray(i * 524288, (i + 1) * 524288).toString('base64')}) ON CONFLICT(document_id,position) DO UPDATE SET data=excluded.data`;
      }));
    }
    for (let start = 0; start < item.sections.length; start += 80) {
      const records = item.sections.slice(start, start + 80).map((s, i) => ({ position: start + i, locator: s.locator, content: s.text }));
      await sql`INSERT INTO horacerta.library_sections(document_id,position,locator,content)
        SELECT ${doc.id}::uuid,r.position,r.locator,r.content FROM jsonb_to_recordset(${JSON.stringify(records)}::jsonb) AS r(position int,locator text,content text)
        ON CONFLICT(document_id,position) DO UPDATE SET locator=excluded.locator,content=excluded.content`;
    }
    await sql`UPDATE horacerta.library_documents SET ready=true WHERE id=${doc.id}::uuid
      AND (SELECT count(*) FROM horacerta.library_chunks WHERE document_id=${doc.id}::uuid)=${count}
      AND (SELECT count(*) FROM horacerta.library_sections WHERE document_id=${doc.id}::uuid)=${item.sections.length}`;
    uploaded++;
    if (uploaded % 20 === 0) console.log(`Documentos enviados: ${uploaded}`);
  }
  let models = 0;
  for (const suggestion of suggestions) {
    const pattern = new RegExp(suggestion.pattern, 'i');
    const matches = manifest.documents.filter(d => !d.obsolete && pattern.test(d.name));
    if (!matches.length) continue;
    const [model] = await sql`INSERT INTO horacerta.equipment_models(name,family,source_key)
      VALUES(${suggestion.name},${suggestion.family},${suggestion.key}) ON CONFLICT(source_key) DO UPDATE SET source_key=excluded.source_key RETURNING id,status`;
    // Never overwrite a coordinator's reviewed associations on later imports.
    await sql`INSERT INTO horacerta.library_model_documents(model_id,document_id)
      SELECT ${model.id}::uuid,id FROM horacerta.library_documents WHERE sha256=ANY(${matches.map(d => d.hash)}::text[]) AND reviewed_at IS NULL
      ON CONFLICT DO NOTHING`;
    models++;
  }
  const summary = { documents: manifest.documents.length, models, uploaded, reused,
    duplicate_copies: manifest.documents.reduce((sum, d) => sum + d.origins.length - 1, 0),
    obsolete: manifest.documents.filter(d => d.obsolete).length, no_text: manifest.documents.filter(d => !d.sections.length).length,
    skipped: manifest.skipped.length, source_errors: manifest.errors.length,
    original_bytes: manifest.documents.reduce((sum, d) => sum + d.size, 0),
    sources_scanned_at: manifest.created_at };
  await sql`UPDATE horacerta.library_imports SET finished_at=now(),summary=${JSON.stringify(summary)}::jsonb WHERE id=${run.id}::uuid`;
  console.log(JSON.stringify(summary));
} catch (error) {
  await sql`UPDATE horacerta.library_imports SET summary=${JSON.stringify({ uploaded, reused, failed: true })}::jsonb WHERE id=${run.id}::uuid`;
  // Do not print DB connection strings or document contents in CI/terminal logs.
  console.error('Importação interrompida; pode ser retomada. Tipo:', error.constructor.name, 'código:', error.code || 'local');
  process.exitCode = 1;
}
