-- Match spelling variants, never guess identity from a fuzzy match.
CREATE OR REPLACE FUNCTION horacerta.client_name_key(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT regexp_replace(trim(regexp_replace(normalize(lower(value),NFD),U&'[\0300-\036f]','','g')),'\s+',' ','g')
$$;
