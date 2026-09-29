CREATE OR REPLACE FUNCTION horacerta.order_can_delete(target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM horacerta.orders o WHERE o.id=target AND o.status IN ('Agendada','Cancelada'))
 AND NOT EXISTS(SELECT 1 FROM horacerta.timers WHERE order_id=target)
 AND NOT EXISTS(SELECT 1 FROM horacerta.entries WHERE order_id=target)
 AND NOT EXISTS(SELECT 1 FROM horacerta.vehicle_trips WHERE order_id=target)
 AND NOT EXISTS(SELECT 1 FROM horacerta.order_events e WHERE e.order_id=target AND e.action IN ('Atendimento iniciado','Ponto iniciado','OS concluída','Saída do veículo','Retorno do veículo'))
 AND NOT EXISTS(SELECT 1 FROM horacerta.order_checklists c WHERE c.order_id=target AND
   (c.status='completed' OR c.notes<>'' OR c.identification<>'' OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.items) i
    WHERE coalesce((i->>'outgoing')::boolean,false) OR coalesce((i->>'incoming')::boolean,false) OR coalesce((i->>'na')::boolean,false)
      OR i->>'outgoing_qty' IS NOT NULL OR i->>'incoming_qty' IS NOT NULL OR coalesce(i->>'notes','')<>'')))
 AND NOT EXISTS(SELECT 1 FROM horacerta.checklist_history h JOIN horacerta.order_checklists c ON c.id=h.checklist_id WHERE c.order_id=target
    AND (h.action IN ('Checklist salvo','Checklist concluído') OR h.action LIKE 'Checklist reaberto:%'))
$$;
-- statement-break
CREATE OR REPLACE FUNCTION horacerta.order_pending_checklists(target uuid) RETURNS integer LANGUAGE sql STABLE AS $$
 SELECT count(*)::int FROM horacerta.order_checklists c JOIN horacerta.orders o ON o.id=c.order_id
 WHERE o.id=target AND c.model_id=ANY(o.model_ids) AND c.status='open'
 AND (o.status<>'Cancelada' OR EXISTS(SELECT 1 FROM horacerta.checklist_history h WHERE h.checklist_id=c.id AND h.action IN ('Checklist salvo','Checklist concluído'))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.items) i WHERE coalesce((i->>'outgoing')::boolean,false) OR i->>'outgoing_qty' IS NOT NULL))
$$;
