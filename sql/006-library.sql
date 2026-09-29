CREATE TABLE IF NOT EXISTS horacerta.library_imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz, summary jsonb NOT NULL DEFAULT '{}'
);
-- statement-break
CREATE TABLE IF NOT EXISTS horacerta.equipment_models (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(name) BETWEEN 2 AND 160),
 family text NOT NULL DEFAULT '', source_key text UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','archived')),
 version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement-break
CREATE TABLE IF NOT EXISTS horacerta.library_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sha256 text NOT NULL UNIQUE CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 name text NOT NULL, extension text NOT NULL CHECK(extension IN ('.pdf','.docx','.xlsx','.txt','.doc')),
 size integer NOT NULL CHECK(size BETWEEN 1 AND 41943040), category text NOT NULL CHECK(category IN ('checklist','catalog','manual')),
 origins jsonb NOT NULL DEFAULT '[]', warnings jsonb NOT NULL DEFAULT '[]',
 obsolete boolean NOT NULL DEFAULT false, ready boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','archived')),
 search_text text NOT NULL DEFAULT '', section_count integer NOT NULL DEFAULT 0,
 chunk_count integer NOT NULL DEFAULT 0, import_id uuid REFERENCES horacerta.library_imports(id),
 version integer NOT NULL DEFAULT 1, reviewed_by uuid REFERENCES horacerta.users(id), reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT obsolete OR status <> 'published')
);
-- statement-break
CREATE TABLE IF NOT EXISTS horacerta.library_sections (
 document_id uuid NOT NULL REFERENCES horacerta.library_documents(id) ON DELETE CASCADE,
 position integer NOT NULL CHECK(position>=0), locator text NOT NULL, content text NOT NULL,
 PRIMARY KEY(document_id,position)
);
-- statement-break
CREATE TABLE IF NOT EXISTS horacerta.library_chunks (
 document_id uuid NOT NULL REFERENCES horacerta.library_documents(id) ON DELETE CASCADE,
 position integer NOT NULL CHECK(position>=0), data text NOT NULL CHECK(length(data)<=699052),
 PRIMARY KEY(document_id,position)
);
-- statement-break
CREATE TABLE IF NOT EXISTS horacerta.library_model_documents (
 model_id uuid NOT NULL REFERENCES horacerta.equipment_models(id) ON DELETE CASCADE,
 document_id uuid NOT NULL REFERENCES horacerta.library_documents(id) ON DELETE CASCADE,
 PRIMARY KEY(model_id,document_id)
);
-- statement-break
CREATE TABLE IF NOT EXISTS horacerta.library_reviews (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 document_id uuid REFERENCES horacerta.library_documents(id) ON DELETE CASCADE,
 model_id uuid REFERENCES horacerta.equipment_models(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES horacerta.users(id), action text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- statement-break
ALTER TABLE horacerta.orders ADD COLUMN IF NOT EXISTS model_ids uuid[] NOT NULL DEFAULT '{}';
