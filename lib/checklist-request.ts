// A bounded request preserves the draft on errors; optimistic versions prevent
// a retry from overwriting a save whose response was lost.
export async function submitChecklist(payload: Record<string, unknown>, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/api/checklists', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: controller.signal,
    });
    let result: { ok?: boolean; error?: string } | null;
    try { result = await response.json(); }
    catch { throw new Error('O servidor não retornou uma confirmação válida. Seus campos foram mantidos; consulte a OS antes de tentar novamente.'); }
    if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'Não foi possível salvar a conferência. Seus campos foram mantidos.');
    if (result?.ok !== true) throw new Error('O servidor não confirmou a gravação. Seus campos foram mantidos; consulte a OS antes de tentar novamente.');
    return result;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('A confirmação demorou demais. Seus campos foram mantidos. O pedido pode ter sido salvo: consulte a OS antes de tentar novamente.');
    if (error instanceof TypeError) throw new Error('Falha de conexão. Seus campos foram mantidos. Confira sua internet e consulte a OS antes de tentar novamente.');
    throw error;
  } finally { clearTimeout(timeout); }
}
