// Estado das notificações neste aparelho. A ativação só acontece por clique:
// uma inscrição local que o servidor não reconhece (por exemplo, após troca ou
// redefinição de PIN) nunca é reenviada automaticamente.
export type PushDeviceInput = {
  supported: boolean;
  configured: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  /** Resposta de GET /api/push?endpoint=…; `undefined` quando não houve consulta. */
  registered?: boolean;
};

export function pushDeviceState(input: PushDeviceInput): { active: boolean; message: string } {
  if (!input.supported)
    return { active: false, message: "Neste navegador não foi possível ativar. No iPhone, adicione à Tela de Início e abra pelo ícone. Use um navegador atualizado." };
  if (!input.configured) return { active: false, message: "As notificações ainda não foram configuradas no servidor." };
  if (input.permission === "denied")
    return { active: false, message: "Notificações bloqueadas. Libere nas configurações do navegador/celular e tente novamente." };
  if (input.subscribed && input.permission === "granted" && input.registered)
    return { active: true, message: "Ativadas neste aparelho. Novas OS designadas a você poderão gerar avisos." };
  if (input.subscribed && input.registered === false)
    return { active: false, message: "Este aparelho não está mais ativo para avisos, por exemplo após troca ou redefinição do PIN, saída da conta ou desativação. Ative novamente se quiser recebê-los." };
  return { active: false, message: "Ative neste aparelho para receber avisos de novas OS." };
}
