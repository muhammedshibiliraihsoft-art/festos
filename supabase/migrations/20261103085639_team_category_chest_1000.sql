-- Category subranges apply only to the team template with a range of 1000.
-- Existing 100-number festivals retain their current allocation functions.
BEGIN;

-- NOT VALID preserves any legacy category/1000 festivals on older installations,
-- while new settings cannot enter that incompatible combination.
ALTER TABLE public.festival_calendar ADD CONSTRAINT festival_1000_requires_team_template
  CHECK (chest_number_category_range <> 1000 OR chest_number_template = 'team') NOT VALID;

CREATE TABLE public.festival_team_category_chest_slots (
  festival_id uuid NOT NULL REFERENCES public.festival_calendar(id) ON DELETE CASCADE,
  category_code text NOT NULL,
  slot_number integer NOT NULL CHECK (slot_number BETWEEN 1 AND 9),
  PRIMARY KEY (festival_id, category_code),
  UNIQUE (festival_id, slot_number),
  CHECK (category_code = lower(btrim(category_code)) AND category_code <> '')
);
ALTER TABLE public.festival_team_category_chest_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.festival_team_category_chest_slots FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.festival_team_category_chest_slot(p_festival_id uuid, p_category_code text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_code text := lower(btrim(p_category_code)); v_slot integer; v_next integer; v_category record;
BEGIN
  IF v_code IS NULL OR v_code = '' THEN RAISE EXCEPTION 'Participant category is required.'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text), pg_catalog.hashtext('participant-chest-number'));
  SELECT slot_number INTO v_slot FROM public.festival_team_category_chest_slots
  WHERE festival_id=p_festival_id AND category_code=v_code;
  IF v_slot IS NOT NULL THEN RETURN v_slot; END IF;
  SELECT COALESCE(max(slot_number),0) INTO v_next FROM public.festival_team_category_chest_slots WHERE festival_id=p_festival_id;
  FOR v_category IN
    SELECT codes.code FROM (
      SELECT lower(btrim(fc.code)) AS code FROM public.festival_categories fc
      WHERE fc.festival_id=p_festival_id AND btrim(COALESCE(fc.code,''))<>''
      UNION SELECT lower(btrim(p.category_code)) FROM public.participants p
      WHERE p.festival_id=p_festival_id AND btrim(COALESCE(p.category_code,''))<>''
      UNION SELECT v_code
    ) codes
    LEFT JOIN LATERAL (
      SELECT min(fc.sort_order) AS sort_order FROM public.festival_categories fc
      WHERE fc.festival_id=p_festival_id AND lower(btrim(fc.code))=codes.code
    ) fc ON true
    WHERE NOT EXISTS (SELECT 1 FROM public.festival_team_category_chest_slots s
      WHERE s.festival_id=p_festival_id AND s.category_code=codes.code)
    ORDER BY fc.sort_order NULLS LAST,codes.code
  LOOP
    v_next:=v_next+1;
    IF v_next>9 THEN RAISE EXCEPTION 'The 1000-number team rule supports at most nine categories per festival.'; END IF;
    INSERT INTO public.festival_team_category_chest_slots(festival_id,category_code,slot_number)
    VALUES (p_festival_id,v_category.code,v_next);
  END LOOP;
  SELECT slot_number INTO v_slot FROM public.festival_team_category_chest_slots
  WHERE festival_id=p_festival_id AND category_code=v_code;
  RETURN v_slot;
END $function$;
REVOKE ALL ON FUNCTION public.festival_team_category_chest_slot(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.regenerate_festival_chest_numbers_internal(p_festival_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(participant_count integer, category_range integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_tenant_id uuid; v_range integer; v_template text; v_category_order_enabled boolean;
  v_category_order text[]; v_invalid_count integer; v_oversized_key text;
  v_count integer; v_expected_count integer; v_category text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text), pg_catalog.hashtext('participant-chest-number'));
  SELECT tenant_id,chest_number_category_range,chest_number_template
    INTO v_tenant_id,v_range,v_template FROM public.festival_calendar WHERE id=p_festival_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Festival not found.'; END IF;
  SELECT COALESCE(c.category_order_enabled,false),COALESCE(c.category_order,'{}'::text[])
    INTO v_category_order_enabled,v_category_order
    FROM public.festival_chest_number_controls c WHERE c.festival_id=p_festival_id;
  v_category_order_enabled:=COALESCE(v_category_order_enabled,false);
  v_category_order:=COALESCE(v_category_order,'{}'::text[]);

  IF v_template='team' THEN
    PERFORM public.ensure_festival_team_chest_slots(p_festival_id);
    SELECT count(*) INTO v_invalid_count FROM public.participants p
    WHERE p.festival_id=p_festival_id AND NOT EXISTS (
      SELECT 1 FROM public.festival_team_chest_slots s
      WHERE s.festival_id=p_festival_id AND s.organisation_id=p.organisation_id);
    IF v_invalid_count>0 THEN
      RAISE EXCEPTION 'Cannot regenerate: % participant(s) are not assigned to a team under this festival organisation.',v_invalid_count;
    END IF;
    SELECT s.organisation_id::text INTO v_oversized_key
    FROM public.participants p JOIN public.festival_team_chest_slots s
      ON s.festival_id=p_festival_id AND s.organisation_id=p.organisation_id
    WHERE p.festival_id=p_festival_id GROUP BY s.organisation_id HAVING count(*)>v_range LIMIT 1;
    IF v_oversized_key IS NOT NULL THEN RAISE EXCEPTION 'Team % exceeds the configured chest-number capacity (%).',v_oversized_key,v_range; END IF;
  ELSE
    SELECT count(*) INTO v_invalid_count FROM public.participants p
    WHERE p.festival_id=p_festival_id AND (p.category_code IS NULL OR pg_catalog.btrim(p.category_code)='');
    IF v_invalid_count>0 THEN RAISE EXCEPTION 'Cannot regenerate: % participant(s) do not have a category.',v_invalid_count; END IF;
    SELECT pg_catalog.lower(pg_catalog.btrim(p.category_code)) INTO v_oversized_key
    FROM public.participants p WHERE p.festival_id=p_festival_id
    GROUP BY pg_catalog.lower(pg_catalog.btrim(p.category_code)) HAVING count(*)>v_range LIMIT 1;
    IF v_oversized_key IS NOT NULL THEN RAISE EXCEPTION 'Category % exceeds the configured chest-number capacity (%).',v_oversized_key,v_range; END IF;
  END IF;

  IF v_template='team' AND v_range=1000 THEN
    FOR v_category IN
      SELECT lower(btrim(fc.code)) FROM public.festival_categories fc
      WHERE fc.festival_id=p_festival_id AND btrim(COALESCE(fc.code,''))<>''
      UNION SELECT DISTINCT lower(btrim(p.category_code)) FROM public.participants p
      WHERE p.festival_id=p_festival_id
    LOOP
      PERFORM public.festival_team_category_chest_slot(p_festival_id,v_category);
    END LOOP;
    SELECT p.organisation_id::text||':'||lower(btrim(p.category_code)) INTO v_oversized_key FROM public.participants p
    WHERE p.festival_id=p_festival_id GROUP BY p.organisation_id,lower(btrim(p.category_code)) HAVING count(*)>100 LIMIT 1;
    IF v_oversized_key IS NOT NULL THEN RAISE EXCEPTION 'Team/category % exceeds 100 participants.',v_oversized_key; END IF;
  END IF;
  DROP TABLE IF EXISTS pg_temp.chest_number_plan;
  CREATE TEMP TABLE chest_number_plan(participant_id uuid PRIMARY KEY,new_chest_number text NOT NULL UNIQUE) ON COMMIT DROP;
  IF v_template='team' THEN
    INSERT INTO pg_temp.chest_number_plan(participant_id,new_chest_number)
    SELECT p.id,((s.slot_number*v_range)+CASE WHEN v_range=1000 THEN cs.slot_number*100 ELSE 0 END+row_number() OVER (
      PARTITION BY p.organisation_id,CASE WHEN v_range=1000 THEN lower(btrim(p.category_code)) ELSE '' END ORDER BY
        CASE WHEN v_category_order_enabled THEN
          pg_catalog.array_position(v_category_order,pg_catalog.lower(pg_catalog.btrim(p.category_code)))
        END NULLS LAST,
        CASE WHEN v_category_order_enabled THEN fc.sort_order END NULLS LAST,
        CASE WHEN v_category_order_enabled THEN pg_catalog.lower(pg_catalog.btrim(p.category_code)) END NULLS LAST,
        NULLIF(pg_catalog.regexp_replace(COALESCE(p.chest_number,''),'[^0-9]','','g'),'')::numeric NULLS LAST,
        pg_catalog.lower(p.name),p.id
    )-1)::text
    FROM public.participants p JOIN public.festival_team_chest_slots s
      ON s.festival_id=p_festival_id AND s.organisation_id=p.organisation_id
    LEFT JOIN public.festival_team_category_chest_slots cs ON v_range=1000 AND cs.festival_id=p_festival_id AND cs.category_code=lower(btrim(p.category_code))
    LEFT JOIN LATERAL (
      SELECT min(x.sort_order) AS sort_order FROM public.festival_categories x
      WHERE x.festival_id=p_festival_id AND pg_catalog.lower(pg_catalog.btrim(x.code))=pg_catalog.lower(pg_catalog.btrim(p.category_code))
    ) fc ON true
    WHERE p.festival_id=p_festival_id;
  ELSE
    INSERT INTO pg_temp.chest_number_plan(participant_id,new_chest_number)
    WITH category_codes AS (
      SELECT pg_catalog.lower(pg_catalog.btrim(fc.code)) AS category_code FROM public.festival_categories fc
      WHERE fc.festival_id=p_festival_id AND pg_catalog.btrim(COALESCE(fc.code,''))<>''
      UNION SELECT pg_catalog.lower(pg_catalog.btrim(p.category_code)) FROM public.participants p WHERE p.festival_id=p_festival_id
    ),category_order AS (
      SELECT codes.category_code,row_number() OVER (ORDER BY fc.sort_order NULLS LAST,codes.category_code) AS category_position
      FROM category_codes codes LEFT JOIN LATERAL (
        SELECT min(fc.sort_order) AS sort_order FROM public.festival_categories fc
        WHERE fc.festival_id=p_festival_id AND pg_catalog.lower(pg_catalog.btrim(fc.code))=codes.category_code
      ) fc ON true
    )
    SELECT p.id,((co.category_position*v_range)+row_number() OVER (
      PARTITION BY pg_catalog.lower(pg_catalog.btrim(p.category_code)) ORDER BY
        NULLIF(pg_catalog.regexp_replace(COALESCE(p.chest_number,''),'[^0-9]','','g'),'')::numeric NULLS LAST,
        pg_catalog.lower(p.name),p.id
    )-1)::text
    FROM public.participants p JOIN category_order co
      ON co.category_code=pg_catalog.lower(pg_catalog.btrim(p.category_code)) WHERE p.festival_id=p_festival_id;
  END IF;
  SELECT count(*) INTO v_expected_count FROM public.participants p WHERE p.festival_id=p_festival_id;
  SELECT count(*) INTO v_count FROM pg_temp.chest_number_plan;
  IF v_count IS DISTINCT FROM v_expected_count THEN
    RAISE EXCEPTION 'Cannot regenerate: the numbering plan does not cover every participant (% of %).',v_count,v_expected_count;
  END IF;
  UPDATE public.participants p SET chest_number='__regen__'||p.id::text WHERE p.festival_id=p_festival_id;
  UPDATE public.participants p SET chest_number=plan.new_chest_number FROM pg_temp.chest_number_plan plan WHERE p.id=plan.participant_id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count IS DISTINCT FROM v_expected_count THEN RAISE EXCEPTION 'Cannot regenerate: only % of % participants were updated.',v_count,v_expected_count; END IF;
  INSERT INTO public.chest_number_regeneration_audits(tenant_id,festival_id,category_range,participant_count,regenerated_by,chest_number_template)
  VALUES(v_tenant_id,p_festival_id,v_range,v_count,p_actor_id,v_template);
  RETURN QUERY SELECT v_count,v_range;
END $function$;

CREATE OR REPLACE FUNCTION public.create_participant_with_chest_number(
  p_tenant_id uuid,p_festival_id uuid,p_organisation_id uuid,p_name text,p_category_code text,
  p_status text,p_age integer,p_class_std text,p_dob date,p_gender text,
  p_public_profile_enabled boolean,p_show_organisation_public boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_actor public.profiles%ROWTYPE; v_festival_tenant uuid; v_organisation_tenant uuid;
  v_template text; v_range integer; v_position integer; v_ordinal integer;
  v_candidate text; v_constraint_name text; v_participant public.participants%ROWTYPE; v_category_slot integer;
BEGIN
  IF p_festival_id IS NULL OR p_category_code IS NULL OR pg_catalog.btrim(p_category_code)='' THEN
    RAISE EXCEPTION 'Festival and category are required to create a participant.';
  END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid();
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text),pg_catalog.hashtext('participant-chest-number'));
  SELECT tenant_id,chest_number_category_range,chest_number_template
    INTO v_festival_tenant,v_range,v_template FROM public.festival_calendar WHERE id=p_festival_id;
  IF NOT FOUND OR v_actor.id IS NULL THEN RAISE EXCEPTION 'Festival not found or authentication is required.'; END IF;
  IF v_actor.is_superadmin IS NOT TRUE AND
     (v_actor.role IS DISTINCT FROM 'admin' OR v_actor.tenant_id IS DISTINCT FROM v_festival_tenant) THEN
    RAISE EXCEPTION 'Only the owning tenant admin can create participants.';
  END IF;
  SELECT tenant_id INTO v_organisation_tenant FROM public.organisations WHERE id=p_organisation_id;
  IF NOT FOUND OR v_organisation_tenant IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'Participant organisation does not match its tenant.';
  END IF;
  IF v_actor.is_superadmin IS NOT TRUE AND NOT public.is_org_visible(p_organisation_id) THEN
    RAISE EXCEPTION 'You cannot create participants in this organisation.';
  END IF;
  IF v_template='team' THEN
    v_position:=public.festival_team_chest_slot(p_festival_id,p_organisation_id);
    IF v_range=1000 THEN v_category_slot:=public.festival_team_category_chest_slot(p_festival_id,p_category_code); END IF;
  ELSE
    WITH category_codes AS (
      SELECT pg_catalog.lower(pg_catalog.btrim(fc.code)) AS category_code FROM public.festival_categories fc
      WHERE fc.festival_id=p_festival_id AND pg_catalog.btrim(COALESCE(fc.code,''))<>''
      UNION SELECT DISTINCT pg_catalog.lower(pg_catalog.btrim(p.category_code)) FROM public.participants p
      WHERE p.festival_id=p_festival_id AND pg_catalog.btrim(COALESCE(p.category_code,''))<>''
      UNION SELECT pg_catalog.lower(pg_catalog.btrim(p_category_code))
    ),ordered_categories AS (
      SELECT codes.category_code,row_number() OVER (ORDER BY fc.sort_order NULLS LAST,codes.category_code) AS position
      FROM category_codes codes LEFT JOIN LATERAL (
        SELECT min(fc.sort_order) AS sort_order FROM public.festival_categories fc
        WHERE fc.festival_id=p_festival_id AND pg_catalog.lower(pg_catalog.btrim(fc.code))=codes.category_code
      ) fc ON true
    )
    SELECT position INTO v_position FROM ordered_categories
    WHERE category_code=pg_catalog.lower(pg_catalog.btrim(p_category_code));
    IF v_position IS NULL THEN RAISE EXCEPTION 'Unable to resolve the participant category position.'; END IF;
  END IF;
  FOR v_ordinal IN 1..(CASE WHEN v_template='team' AND v_range=1000 THEN 100 ELSE v_range END) LOOP
    v_candidate:=((v_position*v_range)+CASE WHEN v_template='team' AND v_range=1000 THEN v_category_slot*100 ELSE 0 END+v_ordinal-1)::text;
    BEGIN
      INSERT INTO public.participants(
        tenant_id,festival_id,organisation_id,name,category_code,chest_number,
        status,age,class_std,dob,gender,public_profile_enabled,show_organisation_public
      ) VALUES (
        p_tenant_id,p_festival_id,p_organisation_id,p_name,p_category_code,v_candidate,
        p_status,p_age,NULLIF(pg_catalog.btrim(p_class_std),'')::integer,p_dob,p_gender,
        p_public_profile_enabled,p_show_organisation_public
      ) RETURNING * INTO v_participant;
      SELECT * INTO v_participant FROM public.participants WHERE id=v_participant.id;
      RETURN pg_catalog.to_jsonb(v_participant);
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name=CONSTRAINT_NAME;
      IF v_constraint_name IS DISTINCT FROM 'unique_active_chest_number' THEN RAISE; END IF;
    END;
  END LOOP;
  IF v_template='team' THEN RAISE EXCEPTION 'Team chest-number capacity (%) reached.',v_range; END IF;
  RAISE EXCEPTION 'Category capacity (%) reached. Change the festival range to Under 1000.',v_range;
END $function$;

CREATE OR REPLACE FUNCTION public.renumber_participant_on_team_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_template text; v_range integer; v_slot integer; v_ordinal integer; v_candidate text; v_category_slot integer;
BEGIN
  IF OLD.festival_id IS DISTINCT FROM NEW.festival_id THEN
    RAISE EXCEPTION 'Team transfer cannot change the participant festival.';
  END IF;
  SELECT f.chest_number_template, f.chest_number_category_range
  INTO v_template, v_range FROM public.festival_calendar f WHERE f.id = NEW.festival_id;
  IF v_template IS DISTINCT FROM 'team' THEN RETURN NEW; END IF;
  IF NEW.organisation_id IS NULL THEN RAISE EXCEPTION 'Team-based chest numbers require a team.'; END IF;
  IF NEW.tenant_id IS DISTINCT FROM (SELECT tenant_id FROM public.organisations WHERE id = NEW.organisation_id) THEN
    RAISE EXCEPTION 'Participant tenant must match the destination team.';
  END IF;
  v_slot := public.festival_team_chest_slot(NEW.festival_id, NEW.organisation_id);
  IF v_range=1000 THEN v_category_slot:=public.festival_team_category_chest_slot(NEW.festival_id,NEW.category_code); END IF;
  FOR v_ordinal IN 1..(CASE WHEN v_range=1000 THEN 100 ELSE v_range END) LOOP
    v_candidate := ((v_slot * v_range) + CASE WHEN v_range=1000 THEN v_category_slot*100 ELSE 0 END + v_ordinal - 1)::text;
    IF v_candidate IS DISTINCT FROM OLD.chest_number
       AND NOT EXISTS (SELECT 1 FROM public.participants p
                   WHERE p.festival_id = NEW.festival_id AND p.chest_number = v_candidate AND p.id <> NEW.id) THEN
      NEW.chest_number := v_candidate;
      RETURN NEW;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'Team chest-number capacity (%) reached.', v_range;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_team_chest_number_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_range integer; v_slot integer; v_template text; v_category_slot integer;
BEGIN
  -- Serialize direct inserts with a template switch before reading the mode.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(NEW.festival_id::text), pg_catalog.hashtext('participant-chest-number'));
  SELECT chest_number_template, chest_number_category_range
  INTO v_template, v_range FROM public.festival_calendar WHERE id = NEW.festival_id;
  IF v_template IS DISTINCT FROM 'team' THEN RETURN NEW; END IF;
  IF NEW.organisation_id IS NULL OR NEW.tenant_id IS DISTINCT FROM
     (SELECT tenant_id FROM public.organisations WHERE id = NEW.organisation_id) THEN
    RAISE EXCEPTION 'Select a valid team before creating a participant.';
  END IF;
  v_slot := public.festival_team_chest_slot(NEW.festival_id, NEW.organisation_id);
  IF NEW.chest_number IS NULL OR NEW.chest_number !~ '^[0-9]+$' OR
     NEW.chest_number::numeric < v_slot * v_range OR
     NEW.chest_number::numeric >= (v_slot + 1) * v_range THEN
    RAISE EXCEPTION 'The participant chest number must be allocated from the selected team range.';
  END IF;
  IF v_range=1000 THEN
    v_category_slot:=public.festival_team_category_chest_slot(NEW.festival_id,NEW.category_code);
    IF NEW.chest_number::numeric < v_slot*1000+v_category_slot*100 OR NEW.chest_number::numeric >= v_slot*1000+(v_category_slot+1)*100 THEN
      RAISE EXCEPTION 'The chest number must be in its team/category range.'; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.renumber_team_chest_categories_after_participant_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_festival uuid; v_locked boolean;
BEGIN
  IF TG_OP='INSERT' THEN
    FOR v_festival IN SELECT DISTINCT r.festival_id FROM inserted_rows r WHERE r.festival_id IS NOT NULL ORDER BY r.festival_id LOOP
      SELECT c.locked INTO v_locked
      FROM public.festival_calendar f JOIN public.festival_chest_number_controls c ON c.festival_id=f.id
      WHERE f.id=v_festival AND f.chest_number_template='team' AND c.category_order_enabled;
      IF FOUND THEN
        IF v_locked THEN
          RAISE EXCEPTION 'Unlock chest numbers with the tenant ID before adding or changing participants.' USING ERRCODE='55000';
        END IF;
        PERFORM public.regenerate_festival_chest_numbers_internal(v_festival,auth.uid());
      END IF;
    END LOOP;
  ELSE
    FOR v_festival IN
      SELECT DISTINCT n.festival_id FROM updated_rows n JOIN old_rows o ON o.id=n.id
      WHERE n.festival_id IS NOT NULL AND
        (n.category_code IS DISTINCT FROM o.category_code OR n.organisation_id IS DISTINCT FROM o.organisation_id)
      ORDER BY n.festival_id
    LOOP
      SELECT c.locked INTO v_locked
      FROM public.festival_calendar f LEFT JOIN public.festival_chest_number_controls c ON c.festival_id=f.id
      WHERE f.id=v_festival AND f.chest_number_template='team' AND (f.chest_number_category_range=1000 OR COALESCE(c.category_order_enabled,false));
      IF FOUND THEN
        IF v_locked THEN
          RAISE EXCEPTION 'Unlock chest numbers with the tenant ID before adding or changing participants.' USING ERRCODE='55000';
        END IF;
        PERFORM public.regenerate_festival_chest_numbers_internal(v_festival,auth.uid());
      END IF;
    END LOOP;
  END IF;
  RETURN NULL;
END $function$;

COMMIT;