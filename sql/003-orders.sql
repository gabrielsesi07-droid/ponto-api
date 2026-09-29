ALTER TABLE horacerta.clients ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '';
-- statement-break
ALTER TABLE horacerta.clients ADD COLUMN IF NOT EXISTS contact text NOT NULL DEFAULT '';
-- statement-break
ALTER TABLE horacerta.clients ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';
-- statement-break
CREATE TABLE IF NOT EXISTS horacerta.vehicles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plate text NOT NULL UNIQUE, model text NOT NULL,
 odometer integer NOT NULL CHECK(odometer>=0), maintenance_km integer CHECK(maintenance_km>=0),
 active boolean NOT NULL DEFAULT true, notes text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1
);
-- statement-break
CREATE TABLE IF NOT EXISTS horacerta.orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 title text NOT NULL, client_id uuid NOT NULL REFERENCES horacerta.clients(id), client_name text NOT NULL,
 address text NOT NULL, place_id text NOT NULL DEFAULT '', contact text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '',
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 members uuid[] NOT NULL CHECK(cardinality(members)>0), vehicle_id uuid REFERENCES horacerta.vehicles(id),
 equipment text NOT NULL DEFAULT '', instructions text NOT NULL DEFAULT '', priority text NOT NULL DEFAULT 'Normal',
 status text NOT NULL DEFAULT 'Agendada' CHECK(status IN ('Agendada','Em andamento','Concluída','Cancelada')),
 completion text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL REFERENCES horacerta.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
-- statement-break
CREATE INDEX IF NOT EXISTS orders_schedule ON horacerta.orders(starts_at,ends_at);
-- statement-break
CREATE INDEX IF NOT EXISTS orders_members ON horacerta.orders USING gin(members);
-- statement-break
CREATE TABLE IF NOT EXISTS horacerta.order_acknowledgements (
 order_id uuid REFERENCES horacerta.orders(id), user_id uuid REFERENCES horacerta.users(id), version integer NOT NULL,
 PRIMARY KEY(order_id,user_id)
);
-- statement-break
CREATE TABLE IF NOT EXISTS horacerta.order_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, order_id uuid NOT NULL REFERENCES horacerta.orders(id),
 actor_id uuid NOT NULL REFERENCES horacerta.users(id), action text NOT NULL, detail text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
-- statement-break
CREATE TABLE IF NOT EXISTS horacerta.order_pdfs (
 order_id uuid PRIMARY KEY REFERENCES horacerta.orders(id), name text NOT NULL, content text NOT NULL,
 size integer NOT NULL CHECK(size>0 AND size<=3145728)
);
-- statement-break
CREATE TABLE IF NOT EXISTS horacerta.vehicle_trips (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES horacerta.orders(id), vehicle_id uuid NOT NULL REFERENCES horacerta.vehicles(id),
 departure_km integer NOT NULL CHECK(departure_km>=0), return_km integer CHECK(return_km>=departure_km),
 departed_at timestamptz NOT NULL DEFAULT now(), returned_at timestamptz,
 departed_by uuid NOT NULL REFERENCES horacerta.users(id), returned_by uuid REFERENCES horacerta.users(id)
);
-- statement-break
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_one_open_trip ON horacerta.vehicle_trips(vehicle_id) WHERE return_km IS NULL;
-- statement-break
ALTER TABLE horacerta.entries ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES horacerta.orders(id);
-- statement-break
ALTER TABLE horacerta.timers ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES horacerta.orders(id);
