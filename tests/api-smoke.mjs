import assert from "node:assert/strict";
import {
  DEFAULT_INITIAL_PIN,
  hashPin,
  verifyPin,
} from "../lib/pin.ts";
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL),
  base = "http://localhost:5173",
  tag = crypto.randomUUID(),
  adminSeed = crypto.randomUUID(),
  worker = crypto.randomUUID(),
  other = crypto.randomUUID(),
  client = crypto.randomUUID();
let admin = adminSeed;
const email = (id) => "qa-" + id + "@example.invalid";
let passed = 0;
const cookies = new Map();
const accessCodes = new Map();
const username = (id) => "qa_" + id.slice(0, 8);
const adminUsername = username(adminSeed);
async function call(path, body, user = admin, method = "POST") {
  const headers =
    user && cookies.has(user) ? { cookie: cookies.get(user) } : {};
  if (body) headers["Content-Type"] = "application/json";
  const r = await fetch(base + path, {
    method: body ? method : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
const check = (actual, expected, label) => {
  assert.equal(actual, expected, label);
  passed++;
  console.log("OK " + label);
};
const count = await sql`SELECT count(*)::int n FROM horacerta.users`;
if (count[0].n !== 0)
  throw new Error(
    "Teste isolado requer equipe vazia; nenhum dado foi alterado.",
  );
try {
  const firstAccess = await call(
    "/api/session",
    {
      name: "QA Coordenador",
      username: adminUsername,
      hourly_rate: 30,
    },
    null,
  );
  check(firstAccess.status, 200, "primeiro coordenador cria o próprio acesso");
  assert.ok(firstAccess.cookie?.startsWith("hc_session="));
  assert.match(firstAccess.data.person?.access_code || "", /^HC-\d{6}$/);
  const createdAdmin =
    await sql`SELECT id,access_code,pin_hash,pin_change_required,pin_change_prompted FROM horacerta.users WHERE username=${adminUsername}`;
  assert.equal(createdAdmin.length, 1);
  assert.equal(
    await verifyPin(DEFAULT_INITIAL_PIN, createdAdmin[0].pin_hash),
    true,
    "primeiro coordenador recebe o PIN padrão",
  );
  assert.equal(createdAdmin[0].pin_change_required, true);
  assert.equal(createdAdmin[0].pin_change_prompted, false);
  admin = createdAdmin[0].id;
  accessCodes.set(admin, createdAdmin[0].access_code);
  cookies.set(admin, firstAccess.cookie);
  check(
    (
      await call(
        "/api/session",
        {
          name: "QA Segundo Coordenador",
          username: "qa_second_" + tag.slice(0, 8),
          hourly_rate: 30,
        },
        null,
      )
    ).status,
    409,
    "segundo primeiro acesso é bloqueado",
  );
  await sql.transaction([
    sql`INSERT INTO horacerta.users(id,subject,name,email,role,hourly_rate) VALUES(${worker},${"qa-" + worker},'QA Colaborador',${email(worker)},'employee',30),(${other},${"qa-" + other},'QA Outro',${email(other)},'employee',30)`,
    sql`INSERT INTO horacerta.clients(id,name) VALUES(${client},${"QA temporário " + tag})`,
  ]);
  const pinHash = await hashPin("582941");
  for (const id of [worker, other]) {
    await sql`UPDATE horacerta.users SET username=${username(id)},pin_hash=${pinHash} WHERE id=${id}`;
    const person =
      await sql`SELECT access_code FROM horacerta.users WHERE id=${id}`;
    accessCodes.set(id, person[0].access_code);
    const login = await call(
      "/api/login",
      { access_code: accessCodes.get(id), pin: "582941", remember: true },
      null,
    );
    check(
      login.status,
      200,
      "login individual do colaborador",
    );
    assert.equal(login.data.person?.access_code, accessCodes.get(id));
    assert.ok(login.cookie?.startsWith("hc_session="));
    cookies.set(id, login.cookie);
  }
  const found = await call("/api/login?name=QA", null, null);
  check(found.status, 200, "busca pública encontra colaboradores pelo nome");
  assert.ok(found.data.people.length >= 3);
  assert.equal(
    new Set(found.data.people.map((person) => person.access_code)).size,
    found.data.people.length,
    "cada resultado tem código único",
  );
  passed++;
  console.log("OK resultados com códigos únicos");
  check(
    (
      await call(
        "/api/login",
        { access_code: accessCodes.get(worker), pin: "000000" },
        null,
      )
    ).status,
    401,
    "PIN incorreto rejeitado",
  );
  const extraPrefix = "qa_more_" + tag.slice(0, 8);
  for (let i = 1; i <= 3; i++) {
    check(
      (
        await call(
          "/api/manage",
          {
            entity: "user",
            data: {
              name: "QA Novo " + i,
              username: extraPrefix + "_" + i,
              job: "Técnico",
              phone: "",
              active: true,
              can_edit: true,
            },
          },
          admin,
        )
      ).status,
      200,
      "coordenador adiciona colaborador " + i,
    );
  }
  const expanded =
    await sql`SELECT count(*)::int n,count(DISTINCT access_code)::int codes FROM horacerta.users WHERE username LIKE ${extraPrefix + "%"}`;
  check(expanded[0].n, 3, "equipe pode ultrapassar quatro pessoas");
  check(expanded[0].codes, 3, "novos colaboradores recebem códigos únicos");
  const defaultAccess =
    await sql`SELECT pin_hash,pin_change_required,pin_change_prompted FROM horacerta.users WHERE username=${extraPrefix + "_1"}`;
  assert.equal(
    await verifyPin(DEFAULT_INITIAL_PIN, defaultAccess[0].pin_hash),
    true,
    "novo colaborador recebe o PIN padrão",
  );
  assert.equal(defaultAccess[0].pin_change_required, true);
  assert.equal(defaultAccess[0].pin_change_prompted, false);
  check(
    (
      await call(
        "/api/manage",
        {
          entity: "user",
          data: {
            id: worker,
            name: "QA Colaborador",
            username: username(worker),
            pin: "271828",
            job: "Técnico",
            phone: "",
            active: true,
            can_edit: true,
          },
        },
        admin,
      )
    ).status,
    200,
    "coordenador troca PIN do colaborador",
  );
  check(
    (
      await call(
        "/api/login",
        {
          access_code: accessCodes.get(worker),
          pin: "582941",
          remember: true,
        },
        null,
      )
    ).status,
    401,
    "PIN anterior deixa de funcionar",
  );
  const relogin = await call(
    "/api/login",
    {
      access_code: accessCodes.get(worker),
      pin: "271828",
      remember: true,
    },
    null,
  );
  check(relogin.status, 200, "novo PIN permite acesso");
  assert.equal(relogin.data.person?.access_code, accessCodes.get(worker));
  cookies.set(worker, relogin.cookie);
  const draft = {
    user_id: worker,
    client_id: client,
    date: "2026-09-21",
    start: "08:00",
    end: "19:00",
    break_minutes: 60,
    company: "Empresa de Teste",
    service: "Teste temporário de jornada",
    service_type: "QA",
    notes: tag,
    holiday: false,
  };
  check(
    (await call("/api/state?from=2026-09-01&to=2026-09-30", null, null)).status,
    401,
    "requisição sem identidade negada",
  );
  const created = await call("/api/entries", draft, worker);
  check(created.status, 200, "colaborador cria jornada própria");
  check(
    (await call("/api/entries", { ...draft, user_id: other }, worker)).status,
    403,
    "não lança jornada de outra pessoa",
  );
  check(
    (await call("/api/entries", draft, worker)).status,
    409,
    "sobreposição rejeitada",
  );
  check(
    (
      await call(
        "/api/entries",
        { ...draft, start: "23:00", end: "04:00" },
        worker,
      )
    ).status,
    400,
    "virada de dia explícita e rejeitada",
  );
  const own = await call(
    "/api/state?from=2026-09-01&to=2026-09-30",
    null,
    worker,
  );
  check(
    own.data.users.length,
    1,
    "cadastros privados restritos ao próprio usuário",
  );
  check(own.data.entries.length, 1, "próprio registro visível");
  const restricted = await call(
    "/api/state?from=2026-09-01&to=2026-09-30",
    null,
    other,
  );
  check(
    restricted.data.entries.length,
    0,
    "registros de outro colaborador ocultos",
  );
  check(
    (
      await call(
        "/api/entries",
        { id: created.data.id, version: 1, status: "Aprovado" },
        worker,
        "PATCH",
      )
    ).status,
    403,
    "colaborador não aprova",
  );
  check(
    (
      await call(
        "/api/entries",
        { id: created.data.id, version: 1, status: "Aprovado" },
        admin,
        "PATCH",
      )
    ).status,
    200,
    "coordenador aprova",
  );
  check(
    (
      await call(
        "/api/entries",
        { ...draft, id: created.data.id, version: 2 },
        worker,
      )
    ).status,
    403,
    "registro aprovado protegido contra edição de colaborador",
  );
  const open = await call(
    "/api/entries",
    { ...draft, date: "2026-09-22", end: null },
    worker,
  );
  check(open.status, 200, "registro em aberto persistido");
  check(
    (
      await call(
        "/api/entries",
        { id: open.data.id, version: 1, status: "Aprovado" },
        admin,
        "PATCH",
      )
    ).status,
    409,
    "incompleto não pode ser aprovado",
  );
  check(
    (
      await call(
        "/api/entries",
        { id: created.data.id, version: 1 },
        admin,
        "DELETE",
      )
    ).status,
    409,
    "controle de concorrência rejeita versão antiga",
  );
  check(
    (
      await call(
        "/api/entries",
        { id: created.data.id, version: 2 },
        admin,
        "DELETE",
      )
    ).status,
    200,
    "exclusão lógica com auditoria",
  );

  const profile = {
    entity: "profile",
    data: {
      name: "QA Colaborador",
      hourly_rate: 47.5,
      job: "Técnico",
      phone: "",
    },
  };
  check(
    (await call("/api/manage", profile, worker)).status,
    200,
    "colaborador configura sua própria hora",
  );
  const profileState = await call(
    "/api/state?from=2026-09-01&to=2026-09-30",
    null,
    worker,
  );
  check(
    Number(profileState.data.me.hourly_rate),
    47.5,
    "valor-hora individual persistido",
  );
  const oldRate =
    await sql`SELECT rate FROM horacerta.entries WHERE id=${open.data.id}`;
  check(
    Number(oldRate[0].rate),
    30,
    "mudança de hora preserva registros anteriores",
  );
  check(
    (
      await call(
        "/api/manage",
        { entity: "user", data: { id: other, name: "Intruso" } },
        worker,
      )
    ).status,
    403,
    "colaborador não gerencia outra conta",
  );
  check(
    (await call("/api/entries", draft, admin)).status,
    403,
    "novo ponto vinculado somente ao próprio login",
  );

  const startedAt = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(new Date())
      .replace(" ", "T"),
    clockStart = {
      action: "start",
      started_at: startedAt,
      company: "Cliente do relógio",
      service: "Inspeção dos equipamentos",
      notes: "Formulário automático",
    };
  check(
    (await call("/api/clock", clockStart, other)).status,
    200,
    "serviço iniciado com formulário preenchido",
  );
  check(
    (await call("/api/clock", clockStart, other)).status,
    409,
    "serviço duplicado bloqueado",
  );
  check(
    (await call("/api/clock", { action: "pause" }, other)).status,
    200,
    "pausa registrada",
  );
  const active = await call(
    "/api/state?from=2026-09-01&to=2026-09-30",
    null,
    other,
  );
  assert.ok(active.data.timer.paused_at);
  check(
    active.data.teamTimers.length,
    0,
    "colaborador não recebe relógios da equipe",
  );
  const overview = await call(
    "/api/state?from=2026-09-01&to=2026-09-30",
    null,
    admin,
  );
  check(
    overview.data.teamTimers.length,
    1,
    "coordenador vê quem está em serviço",
  );
  check(
    (await call("/api/clock", { action: "resume" }, other)).status,
    200,
    "retomada registrada",
  );
  check(
    (await call("/api/clock", { action: "stop" }, other)).status,
    200,
    "encerramento salva ponto de curta duração",
  );
  const clockEntry =
    await sql`SELECT company,service,notes FROM horacerta.entries WHERE user_id=${other} ORDER BY created_at DESC LIMIT 1`;
  check(
    clockEntry[0].company,
    clockStart.company,
    "empresa do serviço persistida",
  );
  check(
    clockEntry[0].service,
    clockStart.service,
    "descrição do serviço persistida",
  );
  check(
    (await call("/api/clock", { action: "stop" }, other)).status,
    409,
    "encerramento duplicado bloqueado",
  );
  check(
    (
      await call(
        "/api/clock",
        {
          ...clockStart,
          started_at: new Intl.DateTimeFormat("sv-SE", {
            timeZone: "America/Sao_Paulo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          })
            .format(new Date())
            .replace(" ", "T"),
        },
        other,
      )
    ).status,
    200,
    "novo serviço após encerrar",
  );
  // Shift only the disposable fixture across midnight; preserve real user data.
  await sql`DELETE FROM horacerta.audit WHERE actor_id=${other}`;
  await sql`DELETE FROM horacerta.entries WHERE user_id=${other}`;
  await sql`UPDATE horacerta.timers SET started_at=((now() AT TIME ZONE 'America/Sao_Paulo')::date-1+time '23:00') AT TIME ZONE 'America/Sao_Paulo',pauses='[]',paused_at=NULL WHERE user_id=${other}`;
  check(
    (await call("/api/clock", { action: "stop" }, other)).status,
    200,
    "serviço atravessa meia-noite",
  );
  const split =
    await sql`SELECT date::text,start::text,"end"::text FROM horacerta.entries WHERE user_id=${other} ORDER BY date`;
  check(split.length, 2, "virada separada por data");
  check(split[0].end, "24:00:00", "primeiro dia encerra à meia-noite");
  const invalidated = await call("/api/login", {}, worker, "DELETE");
  check(invalidated.status, 200, "saída encerra sessão");
  check(
    (await call("/api/state?from=2026-09-01&to=2026-09-30", null, worker))
      .status,
    403,
    "sessão encerrada não pode ser reutilizada",
  );
  const audit =
    await sql`SELECT count(*)::int n FROM horacerta.audit WHERE actor_id IN (${admin},${worker},${other})`;
  assert.ok(audit[0].n >= 4);
  passed++;
  console.log("OK trilha de auditoria");
  console.log(passed + " verificações de API concluídas.");
} finally {
  await sql.transaction([
    sql`DELETE FROM horacerta.sessions WHERE user_id IN (SELECT id FROM horacerta.users WHERE username=${adminUsername})`,
    sql`DELETE FROM horacerta.sessions WHERE user_id IN (SELECT id FROM horacerta.users WHERE username LIKE ${"qa_more_" + tag.slice(0, 8) + "%"})`,
    sql`DELETE FROM horacerta.users WHERE username LIKE ${"qa_more_" + tag.slice(0, 8) + "%"}`,
    sql`DELETE FROM horacerta.audit WHERE actor_id IN (${admin},${worker},${other})`,
    sql`DELETE FROM horacerta.entries WHERE user_id IN (${admin},${worker},${other})`,
    sql`DELETE FROM horacerta.clients WHERE id=${client}`,
    sql`DELETE FROM horacerta.sessions WHERE user_id IN (${admin},${worker},${other})`,
    sql`DELETE FROM horacerta.timers WHERE user_id IN (${admin},${worker},${other})`,
    sql`DELETE FROM horacerta.users WHERE id IN (${admin},${worker},${other})`,
    sql`DELETE FROM horacerta.users WHERE username=${adminUsername}`,
  ]);
  console.log(
    "Dados temporários de teste removidos; banco pronto para o primeiro acesso.",
  );
}
