"use client";
import { useRef, useState } from 'react';
import { Archive, RotateCcw, Trash2, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { ServiceClient } from '@/lib/orders';
import { api } from './editors';
import { Button } from './ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from './ui/alert-dialog';

export function ClientLifecycle({ client, demo, onSaved }: { client: ServiceClient; demo: boolean; onSaved: () => Promise<void> }) {
  const [action, setAction] = useState<'delete_client' | 'archive_client' | 'restore_client' | null>(null);
  const [confirmation, setConfirmation] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const deleting = action === 'delete_client';
  const title = deleting ? 'Excluir cliente' : action === 'archive_client' ? 'Arquivar cliente' : 'Reativar cliente';
  async function submit() {
    if (!action || sending.current) return;
    if (demo) { setError('Entre com seu login de coordenador para alterar clientes.'); return; }
    sending.current = true; setBusy(true); setError('');
    try {
      await api('/api/operations', { action, data: { id: client.id, confirmation: deleting ? confirmation : client.name } });
      setAction(null); await onSaved();
      toast.success(deleting ? 'Cliente excluído.' : action === 'archive_client' ? 'Cliente arquivado. Histórico preservado.' : 'Cliente reativado.');
    } catch (e) { setError((e as Error).message); }
    finally { sending.current = false; setBusy(false); }
  }
  function open(next: typeof action) { setConfirmation(''); setError(''); setAction(next); }
  return <div className="mt-4 space-y-2 border-t pt-3">
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => open(client.active ? 'archive_client' : 'restore_client')}>
        {client.active ? <Archive /> : <RotateCcw />}{client.active ? 'Arquivar cliente' : 'Reativar cliente'}
      </Button>
      <Button variant="outline" className="text-red-700" disabled={client.has_history !== false} onClick={() => open('delete_client')}><Trash2 />Excluir cliente</Button>
    </div>
    {client.has_history && <p className="text-xs text-slate-600">Possui OS ou pontos associados. Arquive para retirar dos novos cadastros sem apagar o histórico.</p>}
    <AlertDialog open={!!action} onOpenChange={value => { if (!value && !busy) setAction(null); }}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto bg-white">
        <AlertDialogHeader><AlertDialogTitle>{title} · {client.name}</AlertDialogTitle><AlertDialogDescription>
          {deleting ? 'Remove somente este cadastro, sem histórico associado. A exclusão é permanente; se preferir, volte e use Arquivar cliente.' : client.active ? 'O cliente deixará de aparecer nas sugestões para novas OS. Os registros anteriores serão preservados. Você pode reativá-lo na lista de arquivados.' : 'O cliente voltará a aparecer nas sugestões para novas OS.'}
        </AlertDialogDescription></AlertDialogHeader>
        {deleting && <label className="text-sm font-medium">Digite {client.name} para confirmar<input className="mt-2 w-full rounded-lg border p-3" value={confirmation} disabled={busy} onChange={e => setConfirmation(e.target.value)} autoComplete="off" /></label>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Voltar sem alterar</AlertDialogCancel><AlertDialogAction variant={deleting ? 'destructive' : 'default'} disabled={busy || (deleting && confirmation.trim() !== client.name)} onClick={e => { e.preventDefault(); void submit(); }}>{busy && <LoaderCircle className="animate-spin" />}{busy ? 'Processando…' : title}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
