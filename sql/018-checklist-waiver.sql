ALTER TABLE horacerta.order_checklists ADD COLUMN IF NOT EXISTS waived_reason text;
-- statement-break
ALTER TABLE horacerta.order_checklists ADD COLUMN IF NOT EXISTS waived_at timestamptz;
-- statement-break
ALTER TABLE horacerta.order_checklists ADD COLUMN IF NOT EXISTS waived_by uuid REFERENCES horacerta.users(id);
-- statement-break
ALTER TABLE horacerta.order_checklists DROP CONSTRAINT IF EXISTS order_checklists_status_check;
-- statement-break
ALTER TABLE horacerta.order_checklists ADD CONSTRAINT order_checklists_status_check CHECK(status IN ('open','completed','waived'));
-- statement-break
CREATE OR REPLACE FUNCTION horacerta.waive_order_checklist(actor uuid,target uuid,expected_version integer,reason text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE c horacerta.order_checklists%ROWTYPE;o horacerta.orders%ROWTYPE;before_value jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(2849061701);
 IF NOT EXISTS(SELECT 1 FROM horacerta.users WHERE id=actor AND active AND role='coordinator') THEN RAISE EXCEPTION 'Somente o coordenador pode dispensar checklists.'; END IF;
 IF length(trim(coalesce(reason,'')))<10 OR length(reason)>500 THEN RAISE EXCEPTION 'Informe uma justificativa de 10 a 500 caracteres.'; END IF;
 SELECT * INTO c FROM horacerta.order_checklists WHERE id=target FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Checklist não encontrado.'; END IF;
 SELECT * INTO o FROM horacerta.orders WHERE id=c.order_id FOR UPDATE;
 IF o.status IS DISTINCT FROM 'Cancelada' THEN RAISE EXCEPTION 'Somente checklists de OS canceladas podem ser dispensados.'; END IF;
 IF c.version IS DISTINCT FROM expected_version THEN RAISE EXCEPTION 'Checklist atualizado. Reabra antes de dispensar.'; END IF;
 IF c.status<>'open' THEN RAISE EXCEPTION 'Somente checklists pendentes podem ser dispensados.'; END IF;
 IF NOT c.model_id=ANY(o.model_ids) THEN RAISE EXCEPTION 'Equipamento removido da OS. Histórico somente para consulta.'; END IF;
 before_value:=to_jsonb(c);
 UPDATE horacerta.order_checklists SET status='waived',waived_reason=trim(reason),waived_at=now(),waived_by=actor,
  updated_by=actor,updated_at=now(),version=version+1 WHERE id=target RETURNING * INTO c;
 INSERT INTO horacerta.checklist_history(checklist_id,actor_id,action,snapshot)
 VALUES(target,actor,'Checklist dispensado: '||trim(reason),jsonb_build_object('before',before_value,'after',to_jsonb(c)));
 INSERT INTO horacerta.order_events(order_id,actor_id,action,detail) VALUES(o.id,actor,'Checklist dispensado',c.title||' · '||trim(reason));
 RETURN jsonb_build_object('ok',true,'id',c.id,'version',c.version);
END $$;
