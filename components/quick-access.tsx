"use client";
import { useEffect, useState } from 'react';
import { ArrowRight, ClipboardList, LoaderCircle, Plus, Search, Users } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty } from './ui/command';
import { api } from './editors';
import { demoOperations } from '@/lib/demo';
import { normalizeSearch } from '@/lib/library';
import { orderLabel } from '@/lib/order-label.mjs';
import type { State } from '@/lib/domain';
import type { OperationsData } from '@/lib/orders';

export type QuickPage = {key:string;label:string;admin?:boolean};
export function QuickAccess({state,demo,pages,onNavigate,onOrder,onPerson,onCreateOrder,onRegister}:{
  state:State;demo:boolean;pages:QuickPage[];onNavigate:(view:string)=>void;onOrder:(id:string)=>void;onPerson:(id:string)=>void;onCreateOrder:()=>void;onRegister:()=>void;
}) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[ops,setOps]=useState<OperationsData|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
  const admin=state.me.role==='coordinator';
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setOpen(value=>!value);}};
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[]);
  useEffect(()=>{
    if(!open)return;
    let active=true;
    const timer=window.setTimeout(()=>{
      setLoading(true);setError('');
      (demo?Promise.resolve(demoOperations(state.me)):api<OperationsData>('/api/operations'))
        .then(result=>{if(active)setOps(result);})
        .catch(e=>{if(active)setError((e as Error).message);})
        .finally(()=>{if(active)setLoading(false);});
    },0);
    return()=>{active=false;clearTimeout(timer);};
  },[open,demo,state.me,revision]);
  const text=normalizeSearch(query.trim()), matches=(value:string)=>normalizeSearch(value).includes(text);
  const run=(action:()=>void)=>{setOpen(false);action();};
  const availablePages=pages.filter(page=>(!page.admin||admin)&&matches(page.label));
  const orders=(!error?ops?.orders||[]:[]).filter(order=>matches(`${orderLabel(order.number,order.official_number)} ${order.title} ${order.client_name}`)).slice(0,8);
  const people=admin&&text?state.users.filter(person=>person.active&&matches(person.name+' '+person.access_code)).slice(0,6):[];
  return <>
    <Button variant="outline" className="quick-access-trigger" onClick={()=>setOpen(true)} aria-label="Buscar e abrir atalhos (Ctrl K)"><Search size={17}/><span className="hidden sm:inline">Buscar e acessar</span><kbd className="hidden lg:inline">Ctrl K</kbd></Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="command-palette overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="sr-only"><DialogTitle>Busca e atalhos</DialogTitle><DialogDescription>Encontre ordens de serviço, colaboradores e áreas do sistema. Use as setas e Enter para abrir.</DialogDescription></DialogHeader>
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Buscar OS, cliente, colaborador ou área…" aria-label="Buscar no sistema" />
          <CommandList className="max-h-[min(60svh,28rem)] p-2">
            <CommandEmpty>Nenhum resultado. Tente o número da OS, nome ou outra palavra.</CommandEmpty>
            {!text&&<CommandGroup heading="Ações rápidas">
              {admin&&<CommandItem value="create-order" onSelect={()=>run(onCreateOrder)}><span className="command-icon"><Plus/></span>Gerar ordem de serviço</CommandItem>}
              <CommandItem value="register" onSelect={()=>run(onRegister)}><span className="command-icon"><Plus/></span>Registrar horas trabalhadas</CommandItem>
              {admin&&<CommandItem value="attention" onSelect={()=>run(()=>onNavigate('dashboard'))}><span className="command-icon"><ArrowRight/></span>Resolver pendências da operação</CommandItem>}
            </CommandGroup>}
            {!!orders.length&&<CommandGroup heading="Ordens de serviço">{orders.map(order=><CommandItem key={order.id} value={'order:'+order.id} onSelect={()=>run(()=>onOrder(order.id))}><span className="command-icon"><ClipboardList/></span><span className="command-text"><b>{orderLabel(order.number,order.official_number)} · {order.title}</b><small>{order.client_name}</small></span><span className="command-status">{order.status}</span></CommandItem>)}</CommandGroup>}
            {!!people.length&&<CommandGroup heading="Colaboradores">{people.map(person=><CommandItem key={person.id} value={'person:'+person.id} onSelect={()=>run(()=>onPerson(person.id))}><span className="command-icon"><Users/></span><span className="command-text"><b>{person.name}</b><small>Ver pontos · {person.access_code}</small></span></CommandItem>)}</CommandGroup>}
            <CommandGroup heading="Áreas do sistema">{availablePages.map(page=><CommandItem key={page.key} value={'page:'+page.key} onSelect={()=>run(()=>onNavigate(page.key))}><span className="command-icon"><ArrowRight/></span>{page.label}</CommandItem>)}</CommandGroup>
          </CommandList>
        </Command>
        <div className="command-footer" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span></div>
        {loading&&<p role="status" className="flex items-center gap-2 px-4 pb-3 text-xs text-slate-500"><LoaderCircle size={14} className="animate-spin"/>Buscando as OS permitidas para seu acesso…</p>}
        {error&&<div role="alert" className="border-t bg-amber-50 p-3 text-sm">As OS não puderam ser consultadas. Os atalhos continuam disponíveis.<Button variant="ghost" onClick={()=>setRevision(v=>v+1)}>Tentar novamente</Button></div>}
      </DialogContent>
    </Dialog>
  </>;
}
