CREATE OR REPLACE FUNCTION horacerta.client_has_history(target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM horacerta.clients c WHERE c.id=target AND (
   EXISTS(SELECT 1 FROM horacerta.orders o WHERE o.client_id=c.id OR (o.client_id IS NULL AND horacerta.client_name_key(o.client_name)=horacerta.client_name_key(c.name)))
   OR EXISTS(SELECT 1 FROM horacerta.entries e WHERE e.client_id=c.id OR (e.client_id IS NULL AND horacerta.client_name_key(e.company)=horacerta.client_name_key(c.name)))
   OR EXISTS(SELECT 1 FROM horacerta.timers t WHERE horacerta.client_name_key(t.company)=horacerta.client_name_key(c.name))
 ))
$$;
