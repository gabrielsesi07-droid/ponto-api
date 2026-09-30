"use client";
import {useEffect,useState} from 'react';
import {Bell,BellOff,LoaderCircle} from 'lucide-react';
import {Button} from './ui/button';
import {api} from './editors';

export function PushSettings({userId,demo,admin=false}:{userId:string;demo:boolean;admin?:boolean}) {
  const [key,setKey]=useState(''),[active,setActive]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('Verificando notificações…'),[supported,setSupported]=useState(false);
  useEffect(()=>{
    let cancelled=false;
    async function load() {
      if (demo) {if(!cancelled)setMessage('Entre com seu login no celular para ativar.');return;}
      const available='serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
      if(!cancelled)setSupported(available);
      if(!available){if(!cancelled)setMessage('Neste navegador não foi possível ativar. No iPhone, adicione à Tela de Início e abra pelo ícone. Use um navegador atualizado.');return;}
      try {
        const config=await api<{publicKey:string|null}>('/api/push');
        if(cancelled)return;
        setKey(config.publicKey || '');
        const registration=await navigator.serviceWorker.getRegistration('/');
        const subscription=await registration?.pushManager.getSubscription();
        if(subscription && Notification.permission==='granted') {
          await api('/api/push',subscription.toJSON());
          if(!cancelled){setActive(true);setMessage('Ativadas neste aparelho. Novas OS designadas a você poderão gerar avisos.');}
        } else if(!cancelled)setMessage(Notification.permission==='denied'?'Notificações bloqueadas. Libere nas configurações do navegador/celular e tente novamente.':'Ative neste aparelho para receber novas OS.');
        if(!config.publicKey && !cancelled)setMessage('As notificações ainda não foram configuradas no servidor.');
      } catch {if(!cancelled)setMessage('Não foi possível verificar. Atualize a página e tente novamente.');}
    }
    void load(); return()=>{cancelled=true;};
  },[userId,demo]);
  async function enable() {
    setBusy(true);
    try {
      // Permission request must start directly from this user gesture (including iOS).
      const permission=await Notification.requestPermission();
      if(permission!=='granted')throw new Error('Permissão não concedida. Você pode ativar depois nas configurações do aparelho.');
      await navigator.serviceWorker.register('/sw.js',{scope:'/'});
      const registration=await navigator.serviceWorker.ready;
      const bytes=Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
      const subscription=await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
      await api('/api/push',subscription.toJSON());
      setActive(true);setMessage('Notificações ativadas neste aparelho. Você receberá avisos das próximas OS designadas a você.');
    } catch(e){setMessage((e as Error).message || 'Não foi possível ativar. Tente novamente.');}
    finally{setBusy(false);}
  }
  async function disable() {
    setBusy(true);
    try {
      const registration=await navigator.serviceWorker.getRegistration('/');
      const subscription=await registration?.pushManager.getSubscription();
      if(subscription){await api('/api/push',{endpoint:subscription.endpoint},'DELETE');await subscription.unsubscribe();}
      setActive(false);setMessage('Notificações desativadas neste aparelho. Suas OS continuam disponíveis no sistema.');
    } catch {setMessage('Não foi possível desativar. Tente novamente.');}
    finally{setBusy(false);}
  }
  return <section className="panel mx-auto my-5 max-w-4xl p-5" aria-label="Notificações no celular">
    <h2 className="flex items-center gap-2 font-semibold"><Bell className="size-5"/>Avisos de novas OS no celular</h2>
    <p role="status" className="my-3 text-sm">{message}</p>
    <p className="mb-3 text-sm muted">No iPhone (iOS 16.4 ou superior): Compartilhar → Adicionar à Tela de Início. Abra pelo ícone, entre na sua conta e ative aqui. Android: abra este sistema no navegador atualizado e permita notificações.</p>
    <Button className="h-auto min-h-11 max-w-full whitespace-normal" variant={active?'outline':'default'} disabled={busy || !supported || !key || demo} onClick={()=>void(active?disable():enable())}>
      {busy?<LoaderCircle className="animate-spin"/>:active?<BellOff/>:<Bell/>}{busy?'Aguarde…':active?'Desativar neste aparelho':'Ativar notificações neste aparelho'}
    </Button>
    {admin && !demo && <Button className="mt-2 h-auto min-h-11 max-w-full whitespace-normal sm:ml-2" variant="outline" disabled={busy} onClick={async()=>{
      setBusy(true);try{await api('/api/push',{action:'retry'});setMessage('Nova tentativa solicitada para os avisos pendentes das últimas 24 horas. Isso não confirma entrega nem leitura.');}
      catch{setMessage('Não foi possível solicitar nova tentativa.');}finally{setBusy(false);}
    }}>Tentar avisos pendentes novamente</Button>}
    <p className="mt-3 text-xs muted">Ative em cada aparelho. Sair da conta interrompe novos envios para esta sessão. Permissão, conexão e ajustes do celular afetam a entrega; conferir a OS continua sendo necessário.</p>
  </section>;
}
