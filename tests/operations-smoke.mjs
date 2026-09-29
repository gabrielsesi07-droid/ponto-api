import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

// Uses disposable fixtures only. Never changes an existing person's PIN or records.
// Needs a local server connected to the same migrated database and an existing coordinator.
const base = process.env.TEST_BASE_URL || "http://localhost:5174";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Use a local test server.");
const sql = neon(process.env.DATABASE_URL);
const [admin] =
  await sql`SELECT id FROM horacerta.users WHERE role='coordinator' AND active LIMIT 1`;
assert.ok(admin, "Existing coordinator required");
const worker = randomUUID(),
  other = randomUUID(),
  fixture = randomUUID();
const hashes = [],
  cookies = new Map(),
  orders = [],
  resources = { client: null, vehicle: null };
let checks = 0;
function check(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  checks++;
  console.log("OK " + label);
}
async function call(path, body, who = admin.id) {
  const res = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(who ? { cookie: cookies.get(who) } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}
const action = (action, data, who) =>
  call("/api/operations", { action, data }, who);
const payload = () => ({
  title: "QA OS " + fixture,
  client_id: resources.client,
  address: "Rua de teste, 100, São Paulo - SP",
  place_id: "",
  contact: "QA",
  phone: "",
  starts_at: new Date(Date.now() - 3600000).toISOString(),
  ends_at: new Date(Date.now() + 3600000).toISOString(),
  members: [worker],
  vehicle_id: resources.vehicle,
  equipment: "Multímetro",
  instructions: "Fixture temporária",
  priority: "Normal",
});
try {
  await sql`INSERT INTO horacerta.users(id,name,email,role,hourly_rate,pin_change_required,pin_change_prompted) VALUES(${worker},'QA OS colaborador',${worker + "@example.invalid"},'employee',30,false,true),(${other},'QA OS outro',${other + "@example.invalid"},'employee',30,false,true)`;
  for (const id of [admin.id, worker, other]) {
    const token = randomBytes(32).toString("hex"),
      hash = createHash("sha256").update(token).digest("hex");
    hashes.push(hash);
    cookies.set(id, "hc_session=" + token);
    await sql`INSERT INTO horacerta.sessions(token_hash,user_id,expires_at) VALUES(${hash},${id},now()+interval '30 minutes')`;
  }
  check(
    (await call("/api/operations", null, null)).status,
    401,
    "Unauthenticated access blocked",
  );
  const client = await action("save_client", {
    name: "QA cliente " + fixture,
    address: "Rua de teste 100",
    contact: "QA",
    phone: "",
    notes: "",
    active: true,
  });
  check(client.status, 200, "Coordinator creates client");
  resources.client = client.data.id;
  const vehicle = await action("save_vehicle", {
    plate: "QAT" + String(Math.floor(Math.random() * 10000)).padStart(4, "0"),
    model: "QA " + fixture,
    odometer: 1000,
    maintenance_km: 1050,
    notes: "",
    active: true,
  });
  check(vehicle.status, 200, "Coordinator creates vehicle");
  resources.vehicle = vehicle.data.id;
  check(
    (await action("save_order", payload(), worker)).status,
    403,
    "Employee cannot create OS",
  );
  const saved = await action("save_order", payload());
  check(saved.status, 200, "Coordinator creates OS");
  orders.push(saved.data.id);
  const id = saved.data.id;
  check(
    (await action("save_order", payload())).status,
    409,
    "Team/vehicle schedule overlap blocked",
  );
  const invalid = payload();
  invalid.members = [randomUUID()];
  invalid.vehicle_id = null;
  check(
    (await action("save_order", invalid)).status,
    409,
    "Unknown team member blocked",
  );
  const mine = await call("/api/operations", null, worker);
  check(
    mine.data.orders.some((o) => o.id === id),
    true,
    "Assigned employee sees OS",
  );
  check(mine.data.people.length, 0, "Employee cannot list unassigned users");
  check(
    (await call("/api/operations", null, other)).data.orders.some(
      (o) => o.id === id,
    ),
    false,
    "Other employee cannot see OS",
  );
  check(
    (await action("ack", { id }, other)).status,
    409,
    "Unassigned action blocked",
  );
  check(
    (await action("ack", { id }, worker)).status,
    200,
    "Assigned employee acknowledges",
  );
  const edited = await action("save_order", {
    ...payload(),
    id,
    version: 1,
    title: "QA revised " + fixture,
  });
  check(edited.status, 200, "Coordinator edits scheduled OS");
  check(
    (await action("save_order", { ...payload(), id, version: 1 })).status,
    409,
    "Stale OS edit blocked",
  );
  const pdfPath = `/api/operations/${id}/pdf`;
  const upload = (who, content) =>
    fetch(base + pdfPath, {
      method: "POST",
      headers: {
        cookie: cookies.get(who),
        "Content-Type": "application/pdf",
        "X-File-Name": "qa.pdf",
      },
      body: content,
    });
  const pdf = "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF";
  check((await upload(worker, pdf)).status, 403, "Employee cannot replace PDF");
  check((await upload(admin.id, "not-pdf")).status, 400, "Non-PDF rejected");
  check((await upload(admin.id, pdf)).status, 200, "Coordinator attaches PDF");
  check(
    (await fetch(base + pdfPath, { headers: { cookie: cookies.get(other) } }))
      .status,
    404,
    "Other employee cannot download PDF",
  );
  const downloaded = await fetch(base + pdfPath, {
    headers: { cookie: cookies.get(worker) },
  });
  check(downloaded.status, 200, "Assigned employee downloads PDF");
  check(await downloaded.text(), pdf, "PDF contents preserved");
  check(
    (await action("depart", { id, km: 999 }, worker)).status,
    409,
    "Odometer cannot move backwards",
  );
  const races = await Promise.all([
    action("depart", { id, km: 1000 }, worker),
    action("depart", { id, km: 1000 }, worker),
  ]);
  check(
    races.map((r) => r.status).sort(),
    [200, 409],
    "Concurrent departure recorded once",
  );
  check(
    (await action("finish", { id, notes: "Concluído" }, worker)).status,
    409,
    "Open trip blocks completion",
  );
  check(
    (await action("return", { id, km: 999 }, worker)).status,
    409,
    "Invalid return blocked",
  );
  check(
    (await action("return", { id, km: 1060 }, worker)).status,
    200,
    "Return updates odometer",
  );
  const fleet = (await call("/api/operations")).data.vehicles.find(
    (v) => v.id === resources.vehicle,
  );
  check(fleet.odometer, 1060, "Fleet reflects latest km");
  check(
    (await action("return", { id, km: 1060 }, worker)).status,
    409,
    "Duplicate return blocked",
  );
  check(
    (await action("save_vehicle", { ...fleet, odometer: 2000 })).status,
    409,
    "Direct odometer overwrite blocked",
  );
  const started_at = new Date(Date.now() - 120000)
    .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
    .slice(0, 16)
    .replace(" ", "T");
  const clock = {
    action: "start",
    started_at,
    order_id: id,
    company: "Spoofed",
    service: "Spoofed",
    notes: "",
  };
  check(
    (await call("/api/clock", clock, other)).status,
    409,
    "Unassigned OS clock blocked",
  );
  check(
    (await call("/api/clock", clock, worker)).status,
    200,
    "Assigned employee starts linked point",
  );
  check(
    (await action("finish", { id, notes: "Concluído" }, worker)).status,
    409,
    "Active point blocks completion",
  );
  check(
    (await call("/api/clock", { action: "stop" }, worker)).status,
    200,
    "Employee ends point",
  );
  const entries =
    await sql`SELECT order_id,company FROM horacerta.entries WHERE user_id=${worker}`;
  check(entries.length > 0, true, "Time entries persisted");
  check(
    entries.every(
      (e) => e.order_id === id && e.company === "QA cliente " + fixture,
    ),
    true,
    "Entries retain OS and trusted company",
  );
  check(
    (await action("finish", { id, notes: "Manutenção concluída" }, worker))
      .status,
    200,
    "Service completion recorded",
  );
  check(
    (await action("depart", { id, km: 1060 }, worker)).status,
    409,
    "Closed OS cannot restart",
  );
  check(
    (await upload(admin.id, pdf)).status,
    409,
    "Closed OS attachment protected",
  );
  check(
    (await call("/api/places?q=Avenida", null, worker)).status,
    403,
    "Google lookup is coordinator-only",
  );
  check(
    (await call("/api/places?q=Avenida")).status,
    200,
    "Address lookup has graceful fallback",
  );
  const beforeClients =
    await sql`SELECT count(*)::int n FROM horacerta.clients`;
  const freeData = {
    ...payload(),
    client_id: null,
    client_name: "QA avulso " + fixture,
    address: "",
    vehicle_id: null,
  };
  check(
    (await action("save_order", { ...freeData, client_name: "  " })).status,
    400,
    "Blank client name rejected without registration",
  );
  const free = await action("save_order", freeData);
  check(
    free.status,
    200,
    "OS created with just client name, without client registration or address",
  );
  orders.push(free.data.id);
  const [freeRow] =
    await sql`SELECT client_id,client_name,address FROM horacerta.orders WHERE id=${free.data.id}`;
  check(
    freeRow,
    { client_id: null, client_name: freeData.client_name, address: "" },
    "Unregistered client snapshot preserved",
  );
  const afterClients = await sql`SELECT count(*)::int n FROM horacerta.clients`;
  check(
    afterClients[0].n,
    beforeClients[0].n,
    "No client record silently created",
  );
  const renamed = freeData.client_name + " alterado";
  check(
    (
      await action("save_order", {
        ...freeData,
        id: free.data.id,
        version: 1,
        client_name: renamed,
      })
    ).status,
    200,
    "Unregistered client name can be edited",
  );
  const currentStart = new Date()
    .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
    .slice(0, 16)
    .replace(" ", "T");
  check(
    (
      await call(
        "/api/clock",
        { ...clock, order_id: free.data.id, started_at: currentStart },
        worker,
      )
    ).status,
    200,
    "Point starts for OS without registered client",
  );
  check(
    (await call("/api/clock", { action: "stop" }, worker)).status,
    200,
    "Point ends for OS without registered client",
  );
  const [freeEntry] =
    await sql`SELECT company FROM horacerta.entries WHERE order_id=${free.data.id} LIMIT 1`;
  check(
    freeEntry.company,
    renamed,
    "Typed client name reaches point/report data",
  );
  check(
    (
      await action(
        "finish",
        { id: free.data.id, notes: "Teste concluído" },
        worker,
      )
    ).status,
    200,
    "OS without client registration completes",
  );
  console.log(`${checks} checks passed.`);
} finally {
  // Exact fixture IDs only, including sessions minted for the existing coordinator.
  await sql.transaction([
    sql`DELETE FROM horacerta.audit WHERE actor_id IN (${worker}::uuid,${other}::uuid)`,
    sql`DELETE FROM horacerta.entries WHERE user_id IN (${worker}::uuid,${other}::uuid)`,
    sql`DELETE FROM horacerta.timers WHERE user_id IN (${worker}::uuid,${other}::uuid)`,
    ...[
      "order_events",
      "order_acknowledgements",
      "order_pdfs",
      "vehicle_trips",
    ].map((table) =>
      sql.query(
        `DELETE FROM horacerta.${table} WHERE order_id=ANY($1::uuid[])`,
        [orders],
      ),
    ),
    sql`DELETE FROM horacerta.orders WHERE id=ANY(${orders}::uuid[])`,
    sql`DELETE FROM horacerta.vehicles WHERE id=${resources.vehicle}::uuid`,
    sql`DELETE FROM horacerta.clients WHERE id=${resources.client}::uuid`,
    sql`DELETE FROM horacerta.sessions WHERE token_hash=ANY(${hashes}::text[])`,
    sql`DELETE FROM horacerta.users WHERE id IN (${worker}::uuid,${other}::uuid)`,
  ]);
  console.log("Temporary OS fixtures and test sessions removed.");
}
