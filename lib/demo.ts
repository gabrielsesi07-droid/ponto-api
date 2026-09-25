import { defaults, today, type State } from "./domain";
export function demoState(): State {
  const month = today().slice(0, 7),
    last = Number(today().slice(8)),
    users = [
      {
        id: "demo-1",
        name: "Gabriel Souza",
        access_code: "HC-001001",
        username: "gabriel",
        email: "coordenador@example.com",
        role: "coordinator" as const,
        job: "Coordenador técnico",
        phone: "",
        hourly_rate: 34,
        active: true,
        can_edit: true,
        pin_change_required: false,
        pin_change_prompted: false,
      },
      ...["Ana Lima", "Carlos Mendes", "Marina Costa"].map((name, i) => ({
        id: "demo-" + (i + 2),
        name,
        access_code: "HC-" + String(i + 1002).padStart(6, "0"),
        username: name.split(" ")[0].toLowerCase(),
        email: "colaborador" + i + "@example.com",
        role: "employee" as const,
        job: "Técnico de campo",
        phone: "",
        hourly_rate: [29, 31.5, 28.5][i],
        active: true,
        can_edit: true,
        pin_change_required: false,
        pin_change_prompted: false,
      })),
    ],
    clients = [
      "Unidade Industrial Sul",
      "Centro Logístico Aurora",
      "Edifício Horizonte",
      "Fábrica Nova Era",
    ].map((name, i) => ({
      id: "client-" + i,
      name,
      city: ["Curitiba", "São Paulo", "Campinas", "Joinville"][i],
      state: ["PR", "SP", "SP", "SC"][i],
      service_type: ["Manutenção", "Instalação", "Inspeção", "Comissionamento"][
        i
      ],
      notes: "",
      active: true,
    }));
  const entries = Array.from({ length: Math.max(1, last - 1) }, (_, i) => i + 1)
    .flatMap((d) =>
      users.map((u, i) => ({
        id: "entry-" + d + "-" + i,
        user_id: u.id,
        client_id: clients[(d + i) % 4].id,
        date: month + "-" + String(d).padStart(2, "0"),
        start: "08:00",
        end: 17 + ((d + i) % 4) + ":" + ((d + i) % 2 ? "30" : "00"),
        break_minutes: 60,
        service: [
          "Manutenção preventiva de equipamentos",
          "Instalação e testes de sensores",
          "Inspeção técnica das instalações",
          "Acompanhamento de comissionamento",
        ][(d + i) % 4],
        service_type: clients[(d + i) % 4].service_type,
        notes: "Dados fictícios de demonstração",
        holiday: false,
        status: d > last - 4 ? ("Pendente" as const) : ("Aprovado" as const),
        rate: u.hourly_rate,
        rules: defaults,
        version: 1,
      })),
    )
    .filter(
      (e) =>
        new Date(e.date + "T12:00:00").getDay() !== 0 ||
        Number(e.user_id.slice(-1)) === 3,
    );
  const historical = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(month + "-01T12:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - i - 1);
    const key = d.toISOString().slice(0, 7);
    return entries
      .filter((e) => Number(e.date.slice(8)) < 22 - i)
      .map((e) => ({
        ...e,
        id: e.id + "-" + key,
        date: key + e.date.slice(7),
        end: 18 + (i % 3) + ":00",
        status: "Aprovado" as const,
      }));
  }).flat();
  return {
    me: users[0],
    users,
    clients,
    entries: [...historical, ...entries],
    settings: defaults,
  };
}
