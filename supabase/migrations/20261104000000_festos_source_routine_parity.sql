-- Target-only parity migration; function bodies and trigger shape verified from read-only source catalog.
DO $guard$
BEGIN
  IF to_regprocedure('public.capture_result_team_award()') IS NOT NULL THEN RAISE EXCEPTION 'Expected source-only routine already exists: capture_result_team_award'; END IF;
  IF to_regprocedure('public.edit_participant_profile(uuid, jsonb, uuid, text, timestamptz, uuid, text)') IS NOT NULL THEN RAISE EXCEPTION 'Expected source-only routine already exists: edit_participant_profile'; END IF;
  IF to_regprocedure('public.get_team_leader_program_candidates(uuid, text)') IS NOT NULL THEN RAISE EXCEPTION 'Expected source-only routine already exists: get_team_leader_program_candidates'; END IF;
  IF to_regprocedure('public.notify_participant_profile_change()') IS NOT NULL THEN RAISE EXCEPTION 'Expected source-only routine already exists: notify_participant_profile_change'; END IF;
  IF to_regprocedure('public.safe_delete_general_team_entry(uuid, text)') IS NOT NULL THEN RAISE EXCEPTION 'Expected source-only routine already exists: safe_delete_general_team_entry'; END IF;
  IF to_regprocedure('public.safe_delete_participants(uuid[], text)') IS NOT NULL THEN RAISE EXCEPTION 'Expected source-only routine already exists: safe_delete_participants'; END IF;
  IF to_regprocedure('public.team_leader_bulk_assign_program(uuid, text, uuid[])') IS NOT NULL THEN RAISE EXCEPTION 'Expected source-only routine already exists: team_leader_bulk_assign_program'; END IF;
  IF to_regprocedure('public.team_leader_unassign_program(uuid)') IS NOT NULL THEN RAISE EXCEPTION 'Expected source-only routine already exists: team_leader_unassign_program'; END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='notify_participant_profile_change' AND tgrelid='public.participants'::regclass AND NOT tgisinternal) THEN RAISE EXCEPTION 'Expected source-only trigger already exists: notify_participant_profile_change'; END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='capture_result_team_award' AND tgrelid='public.results'::regclass AND NOT tgisinternal) THEN RAISE EXCEPTION 'Expected source-only trigger already exists: capture_result_team_award'; END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.capture_result_team_award()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE team uuid;
BEGIN
  IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.result_team_awards WHERE result_id=NEW.id) AND
    (OLD.registration_id,OLD.item_id,OLD.festival_id) IS DISTINCT FROM (NEW.registration_id,NEW.item_id,NEW.festival_id) THEN
    RAISE EXCEPTION 'An awarded result identity cannot be reassigned.'; END IF;
  IF NEW.published IS NOT TRUE AND NEW.points_calculation IS NULL AND NEW.points_awarded IS NULL THEN RETURN NEW; END IF;
  -- Serialize actual publication with transfer; corrections keep first ownership.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(NEW.festival_id::text),pg_catalog.hashtext('participant-chest-number'));
  IF EXISTS(SELECT 1 FROM public.result_team_awards WHERE result_id=NEW.id) THEN RETURN NEW; END IF;
  SELECT COALESCE(r.organisation_id,p.organisation_id) INTO team
  FROM public.registrations r LEFT JOIN public.participants p ON p.id=r.participant_id
  WHERE r.id=NEW.registration_id AND r.festival_id=NEW.festival_id;
  IF team IS NULL THEN RAISE EXCEPTION 'A published result must have an owned registration team.'; END IF;
  INSERT INTO public.result_team_awards(result_id,organisation_id) VALUES(NEW.id,team)
    ON CONFLICT(result_id) DO NOTHING;
  RETURN NEW;
END $function$;
ALTER FUNCTION public.capture_result_team_award() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.capture_result_team_award() FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.capture_result_team_award() TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.edit_participant_profile(p_participant_id uuid, p_updates jsonb, p_new_org_id uuid, p_chest_number text, p_expected_updated_at timestamp with time zone, p_expected_org_id uuid, p_expected_chest_number text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  before public.participants;
  edited public.participants;
  f public.festival_calendar;
  target_team uuid;
  target_number integer;
  first_gap integer;
  old_number integer;
  slot integer;
  source_slot integer;
  target_start integer;
  target_end integer;
  source_start integer;
  source_end integer;
  initial_festival uuid;
  plan jsonb;
  originals jsonb;
  row record;
  new_number integer;
  team_changed boolean;
  category_changed boolean;
  requested_number boolean;
  reorder_numbers boolean;
  numbering_changed boolean;
  same_scope boolean;
  source_row boolean;
  target_row boolean;
BEGIN
  SELECT * INTO before FROM public.participants WHERE id=p_participant_id;
  IF before.id IS NULL THEN RAISE EXCEPTION 'Participant not found.'; END IF;
  initial_festival:=before.festival_id;
  PERFORM public.assert_festival_chest_admin(before.festival_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(before.festival_id::text),pg_catalog.hashtext('participant-chest-number'));
  SELECT * INTO before FROM public.participants WHERE id=p_participant_id FOR UPDATE;
  IF before.id IS NULL OR before.festival_id IS DISTINCT FROM initial_festival THEN
    RAISE EXCEPTION 'Participant festival changed. Reload before saving.' USING ERRCODE='40001'; END IF;
  PERFORM public.assert_festival_chest_admin(before.festival_id);
  IF before.updated_at IS DISTINCT FROM p_expected_updated_at OR before.organisation_id IS DISTINCT FROM p_expected_org_id
    OR before.chest_number IS DISTINCT FROM p_expected_chest_number THEN
    RAISE EXCEPTION 'Participant changed after opening. Reload before saving.' USING ERRCODE='40001'; END IF;
  IF before.is_locked IS TRUE THEN RAISE EXCEPTION 'Unlock this participant before editing.' USING ERRCODE='55000'; END IF;
  IF jsonb_typeof(p_updates) IS DISTINCT FROM 'object' OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_updates) k WHERE k NOT IN
      ('name','dob','category_code','class_std','education_type','gender','public_profile_enabled','show_organisation_public')) THEN
    RAISE EXCEPTION 'Unsupported participant edit fields.'; END IF;
  edited:=jsonb_populate_record(before,p_updates);
  edited.name:=btrim(edited.name);
  IF edited.name IS NULL OR edited.name='' THEN RAISE EXCEPTION 'Name is required.'; END IF;
  target_team:=COALESCE(p_new_org_id,before.organisation_id);
  team_changed:=target_team IS DISTINCT FROM before.organisation_id;
  category_changed:=COALESCE(pg_catalog.lower(pg_catalog.btrim(edited.category_code)),'') IS DISTINCT FROM
    COALESCE(pg_catalog.lower(pg_catalog.btrim(before.category_code)),'');
  requested_number:=nullif(pg_catalog.btrim(p_chest_number),'') IS NOT NULL;
  SELECT * INTO f FROM public.festival_calendar WHERE id=before.festival_id;
  IF f.id IS NULL THEN RAISE EXCEPTION 'Festival not found.'; END IF;

  reorder_numbers:=(f.chest_number_template='team' AND (team_changed OR requested_number AND pg_catalog.btrim(p_chest_number) IS DISTINCT FROM before.chest_number))
    OR (f.chest_number_template IS DISTINCT FROM 'team' AND
      (requested_number AND pg_catalog.btrim(p_chest_number) IS DISTINCT FROM before.chest_number OR category_changed
        AND nullif(pg_catalog.btrim(before.category_code),'') IS NOT NULL AND nullif(pg_catalog.btrim(edited.category_code),'') IS NOT NULL));
  numbering_changed:=team_changed OR reorder_numbers OR
    (f.chest_number_template IS DISTINCT FROM 'team' AND category_changed);
  IF numbering_changed AND EXISTS(SELECT 1 FROM public.festival_chest_number_controls WHERE festival_id=f.id AND locked) THEN
    RAISE EXCEPTION 'Chest numbers are finally locked. Unlock before changing team, category or number.' USING ERRCODE='55000'; END IF;

  IF reorder_numbers THEN
    IF f.chest_number_template='team' THEN
      IF NOT EXISTS(SELECT 1 FROM public.organisations o JOIN public.tenants t ON o.parent_id=t.organisation_id
        WHERE t.id=f.tenant_id AND o.id=target_team) THEN RAISE EXCEPTION 'Select a team under this festival organisation.'; END IF;
      slot:=public.festival_team_chest_slot(f.id,target_team);
      SELECT slot_number INTO source_slot FROM public.festival_team_chest_slots WHERE festival_id=f.id AND organisation_id=before.organisation_id;
      IF before.chest_number IS NULL OR before.chest_number !~ '^[0-9]+$' OR source_slot IS NULL THEN
        RAISE EXCEPTION 'Generate valid team chest numbers before reordering.'; END IF;
      target_start:=slot*f.chest_number_category_range;
      target_end:=(slot+1)*f.chest_number_category_range;
      source_start:=source_slot*f.chest_number_category_range;
      source_end:=(source_slot+1)*f.chest_number_category_range;
      same_scope:=target_team=before.organisation_id;
    ELSE
      IF nullif(pg_catalog.btrim(edited.category_code),'') IS NULL THEN
        RAISE EXCEPTION 'Select a category before changing this chest number.'; END IF;
      WITH category_codes AS (
        SELECT pg_catalog.lower(pg_catalog.btrim(fc.code)) AS category_code FROM public.festival_categories fc
          WHERE fc.festival_id=f.id AND pg_catalog.btrim(COALESCE(fc.code,''))<>''
        UNION SELECT DISTINCT pg_catalog.lower(pg_catalog.btrim(p.category_code)) FROM public.participants p
          WHERE p.festival_id=f.id AND pg_catalog.btrim(COALESCE(p.category_code,''))<>''
        UNION SELECT pg_catalog.lower(pg_catalog.btrim(edited.category_code))
        UNION SELECT pg_catalog.lower(pg_catalog.btrim(before.category_code)) WHERE pg_catalog.btrim(COALESCE(before.category_code,''))<>''
      ), ordered_categories AS (
        SELECT codes.category_code,row_number() OVER (ORDER BY fc.sort_order NULLS LAST,codes.category_code)::integer AS position
        FROM category_codes codes LEFT JOIN LATERAL (
          SELECT min(fc.sort_order) AS sort_order FROM public.festival_categories fc
          WHERE fc.festival_id=f.id AND pg_catalog.lower(pg_catalog.btrim(fc.code))=codes.category_code
        ) fc ON true
      )
      SELECT max(position) FILTER(WHERE category_code=pg_catalog.lower(pg_catalog.btrim(before.category_code))),
        max(position) FILTER(WHERE category_code=pg_catalog.lower(pg_catalog.btrim(edited.category_code)))
      INTO source_slot,slot FROM ordered_categories;
      IF slot IS NULL THEN RAISE EXCEPTION 'Unable to resolve the participant category number range.'; END IF;
      IF source_slot IS NOT NULL THEN
        source_start:=source_slot*f.chest_number_category_range;
        source_end:=(source_slot+1)*f.chest_number_category_range;
      END IF;
      target_start:=slot*f.chest_number_category_range;
      target_end:=(slot+1)*f.chest_number_category_range;
      same_scope:=source_slot IS NOT NULL AND source_slot=slot;
    END IF;

    IF source_slot IS NOT NULL THEN
      IF before.chest_number IS NULL OR before.chest_number !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Generate valid chest numbers before reordering.'; END IF;
      old_number:=before.chest_number::integer;
      IF old_number<source_start OR old_number>=source_end THEN
        RAISE EXCEPTION 'Current chest number is outside its existing range.'; END IF;
    END IF;

    IF f.chest_number_template='team' AND requested_number THEN
      IF pg_catalog.btrim(p_chest_number) !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Enter a numeric chest number.'; END IF;
      target_number:=pg_catalog.btrim(p_chest_number)::integer;
    ELSIF f.chest_number_template IS DISTINCT FROM 'team' AND requested_number
      AND pg_catalog.btrim(p_chest_number) IS DISTINCT FROM before.chest_number THEN
      IF pg_catalog.btrim(p_chest_number) !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Enter a numeric chest number.'; END IF;
      target_number:=pg_catalog.btrim(p_chest_number)::integer;
    ELSE
      SELECT n INTO target_number FROM generate_series(target_start,target_end-1) n
      WHERE NOT EXISTS(SELECT 1 FROM public.participants p WHERE p.festival_id=f.id AND p.id<>before.id
        AND CASE WHEN f.chest_number_template='team' THEN p.organisation_id=target_team
          ELSE pg_catalog.lower(pg_catalog.btrim(p.category_code))=pg_catalog.lower(pg_catalog.btrim(edited.category_code)) END
        AND p.chest_number=n::text) ORDER BY n LIMIT 1;
    END IF;
    IF target_number IS NULL OR target_number<target_start OR target_number>=target_end THEN
      IF f.chest_number_template='team' THEN RAISE EXCEPTION 'Choose a number inside the destination team range.';
      ELSE RAISE EXCEPTION 'Choose a number inside the selected category range.'; END IF;
    END IF;

    SELECT n INTO first_gap FROM generate_series(target_number,target_end-1) n
    WHERE NOT EXISTS(SELECT 1 FROM public.participants p WHERE p.festival_id=f.id AND p.id<>before.id
      AND CASE WHEN f.chest_number_template='team' THEN p.organisation_id=target_team
        ELSE pg_catalog.lower(pg_catalog.btrim(p.category_code))=pg_catalog.lower(pg_catalog.btrim(edited.category_code)) END
      AND CASE WHEN p.chest_number ~ '^[0-9]+$' THEN p.chest_number::integer-
        CASE WHEN same_scope AND p.chest_number::integer>old_number THEN 1 ELSE 0 END END=n)
    ORDER BY n LIMIT 1;
    IF first_gap IS NULL THEN RAISE EXCEPTION 'No room to shift chest numbers inside the selected range.'; END IF;

    plan:='{}'::jsonb;
    FOR row IN SELECT p.* FROM public.participants p WHERE p.festival_id=f.id AND p.id<>before.id
      AND CASE WHEN f.chest_number_template='team' THEN p.organisation_id IN(before.organisation_id,target_team)
        ELSE pg_catalog.lower(pg_catalog.btrim(p.category_code)) IN
          (pg_catalog.lower(pg_catalog.btrim(before.category_code)),pg_catalog.lower(pg_catalog.btrim(edited.category_code))) END
      ORDER BY p.id FOR UPDATE LOOP
      source_row:=CASE WHEN f.chest_number_template='team' THEN row.organisation_id=before.organisation_id
        ELSE source_slot IS NOT NULL AND pg_catalog.lower(pg_catalog.btrim(row.category_code))=pg_catalog.lower(pg_catalog.btrim(before.category_code)) END;
      target_row:=CASE WHEN f.chest_number_template='team' THEN row.organisation_id=target_team
        ELSE pg_catalog.lower(pg_catalog.btrim(row.category_code))=pg_catalog.lower(pg_catalog.btrim(edited.category_code)) END;
      IF row.chest_number IS NULL OR row.chest_number !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Generate valid chest numbers before reordering.'; END IF;
      new_number:=row.chest_number::integer;
      IF source_row AND (new_number<source_start OR new_number>=source_end) THEN
        RAISE EXCEPTION 'A source chest number is outside its existing range.'; END IF;
      IF target_row AND (new_number<target_start OR new_number>=target_end) THEN
        RAISE EXCEPTION 'A destination chest number is outside its range.'; END IF;
      IF source_row AND new_number>old_number THEN new_number:=new_number-1; END IF;
      IF target_row AND new_number>=target_number AND new_number<first_gap THEN new_number:=new_number+1; END IF;
      IF target_row AND new_number>=target_end THEN RAISE EXCEPTION 'No room to shift chest numbers inside the selected range.'; END IF;
      IF new_number::text IS DISTINCT FROM row.chest_number THEN plan:=plan||jsonb_build_object(row.id::text,new_number::text); END IF;
    END LOOP;
    plan:=plan||jsonb_build_object(before.id::text,target_number::text);
    SELECT jsonb_agg(to_jsonb(p)) INTO originals FROM public.participants p WHERE p.id::text IN(SELECT jsonb_object_keys(plan));
    UPDATE public.participants p SET chest_number='__regen__'||p.id::text WHERE p.id::text IN(SELECT jsonb_object_keys(plan));
  END IF;

  UPDATE public.participants SET name=edited.name,dob=edited.dob,category_code=edited.category_code,
    class_std=edited.class_std,education_type=edited.education_type,gender=edited.gender,
    public_profile_enabled=edited.public_profile_enabled,show_organisation_public=edited.show_organisation_public,
    updated_at=clock_timestamp() WHERE id=before.id;
  IF team_changed THEN
    PERFORM public.transfer_participant_team(before.id,target_team,auth.uid());
  END IF;
  IF plan IS NOT NULL THEN
    UPDATE public.participants SET chest_number='__regen__'||id::text WHERE id=before.id;
    UPDATE public.participants p SET chest_number=e.value,updated_at=clock_timestamp()
      FROM jsonb_each_text(plan) e WHERE p.id::text=e.key;
    INSERT INTO public.participant_chest_number_changes
      (tenant_id,festival_id,participant_id,old_chest_number,new_chest_number,old_organisation_id,new_organisation_id,changed_by)
    SELECT f.tenant_id,f.id,p.id,old->>'chest_number',p.chest_number,(old->>'organisation_id')::uuid,p.organisation_id,auth.uid()
    FROM jsonb_array_elements(originals) old JOIN public.participants p ON p.id=(old->>'id')::uuid
    WHERE old->>'chest_number' IS DISTINCT FROM p.chest_number;
  END IF;
  SELECT * INTO edited FROM public.participants WHERE id=before.id;
  RETURN to_jsonb(edited);
END $function$;
ALTER FUNCTION public.edit_participant_profile(uuid, jsonb, uuid, text, timestamptz, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.edit_participant_profile(uuid, jsonb, uuid, text, timestamptz, uuid, text) FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.edit_participant_profile(uuid, jsonb, uuid, text, timestamptz, uuid, text) TO postgres, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_team_leader_program_candidates(p_item_id uuid, p_category_code text)
 RETURNS TABLE(participant_id uuid, name text, chest_number text, category_code text, is_eligible boolean, registration_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_context record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND THEN RAISE EXCEPTION 'An active Team Leader portal assignment is required.' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id=p_item_id AND i.festival_id=v_context.festival_id
      AND (i.tenant_id IS NULL OR i.tenant_id=v_context.parent_tenant_id)
      AND i.is_active IS TRUE AND lower(COALESCE(i.participation_type,''))='individual'
      AND p_category_code = ANY(i.category_codes)
  ) THEN RAISE EXCEPTION 'Select an active individual program and category.' USING ERRCODE='22023'; END IF;

  RETURN QUERY
  SELECT p.id, p.name, p.chest_number, p.category_code, option.is_eligible, r.id
  FROM (SELECT * FROM public.get_team_leader_participants()
        WHERE status IS DISTINCT FROM 'rejected') p
  JOIN public.participants source_participant ON source_participant.id=p.id
  JOIN LATERAL public.get_team_leader_programs(p.id) option
    ON option.item_id=p_item_id AND option.entry_kind='participant'
  LEFT JOIN public.registrations r ON r.participant_id=p.id AND r.item_id=p_item_id
    AND r.festival_id=v_context.festival_id AND r.organisation_id=v_context.organisation_id
    AND r.entry_kind='participant'
  WHERE (
      upper(btrim(COALESCE(p.category_code,''))) = upper(btrim(p_category_code))
      OR (upper(btrim(COALESCE(p.category_code,''))) IN ('JR','JUNIOR') AND upper(btrim(p_category_code)) IN ('JR','JUNIOR'))
      OR (upper(btrim(COALESCE(p.category_code,''))) IN ('SR','SENIOR') AND upper(btrim(p_category_code)) IN ('SR','SENIOR'))
      OR (upper(btrim(COALESCE(p.category_code,''))) IN ('CA','CAMPUS') AND upper(btrim(p_category_code)) IN ('CA','CAMPUS'))
      OR upper(btrim(p_category_code)) IN ('GN','GENERAL')
      OR (COALESCE((to_jsonb(source_participant)->>'is_post_hs_religious')::boolean,false)
          AND upper(btrim(p_category_code)) IN ('JR','JUNIOR','SR','SENIOR'))
    )
  ORDER BY p.name, p.id;
END;
$function$;
ALTER FUNCTION public.get_team_leader_program_candidates(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_team_leader_program_candidates(uuid, text) FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.get_team_leader_program_candidates(uuid, text) TO postgres, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.notify_participant_profile_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE changed record;
BEGIN
  FOR changed IN SELECT DISTINCT n.festival_id FROM participant_new n JOIN participant_old o ON n.id=o.id
    WHERE (to_jsonb(n)-'updated_at') IS DISTINCT FROM (to_jsonb(o)-'updated_at')
      AND left(COALESCE(n.chest_number,''),9)<>'__regen__' LOOP
    PERFORM realtime.send('{}'::jsonb,'changed','participant-profiles:'||changed.festival_id::text,false);
    -- Existing stage/PIN screens already subscribe to these label topics.
    PERFORM realtime.send('{}'::jsonb,'changed','code-letters:festival:'||changed.festival_id::text,false);
    PERFORM realtime.send('{}'::jsonb,'changed','code-letters:schedule:'||s.id::text,false)
      FROM public.schedules s WHERE s.festival_id=changed.festival_id;
    PERFORM realtime.send('{}'::jsonb,'changed','code-letters:venue:'||s.venue_id::text,false)
      FROM (SELECT DISTINCT venue_id FROM public.schedules WHERE festival_id=changed.festival_id AND venue_id IS NOT NULL) s;
  END LOOP;
  RETURN NULL;
END $function$;
ALTER FUNCTION public.notify_participant_profile_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.notify_participant_profile_change() FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.notify_participant_profile_change() TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.safe_delete_general_team_entry(p_registration_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_registration public.registrations%ROWTYPE;
  v_festival public.festival_calendar%ROWTYPE;
  v_organisation public.organisations%ROWTYPE;
  v_item_code text;
  v_dependencies jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_auth_transaction_id bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid();
  IF NOT FOUND OR (v_actor.is_superadmin IS NOT TRUE
      AND v_actor.role IS DISTINCT FROM 'admin'
      AND v_actor.role IS DISTINCT FROM 'admin_leader') THEN
    RAISE EXCEPTION 'Only festival administrators can delete a group entry.' USING ERRCODE='42501';
  END IF;

  SELECT r.* INTO v_registration
  FROM public.registrations r WHERE r.id=p_registration_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found','registration_id',p_registration_id);
  END IF;
  IF v_registration.entry_kind IS DISTINCT FROM 'general_team'
     OR v_registration.is_group_registration IS NOT TRUE
     OR v_registration.participant_id IS NOT NULL THEN
    RAISE EXCEPTION 'This operation only deletes General group entries.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_festival FROM public.festival_calendar f WHERE f.id=v_registration.festival_id;
  SELECT * INTO v_organisation FROM public.organisations o WHERE o.id=v_registration.organisation_id;
  IF NOT FOUND OR v_festival.id IS NULL OR v_organisation.id IS NULL
     OR v_organisation.tenant_id IS DISTINCT FROM v_registration.tenant_id THEN
    RETURN jsonb_build_object('status','not_found','registration_id',p_registration_id);
  END IF;
  IF v_actor.is_superadmin IS NOT TRUE AND (
      v_actor.tenant_id IS DISTINCT FROM v_festival.tenant_id
      OR NOT public.is_org_visible(v_registration.organisation_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied for this group entry.' USING ERRCODE='42501';
  END IF;

  SELECT i.item_code INTO v_item_code FROM public.items i
  WHERE i.id=v_registration.item_id AND i.festival_id=v_registration.festival_id;

  IF EXISTS (SELECT 1 FROM public.mark_entries me WHERE me.registration_id=v_registration.id) THEN
    v_dependencies := v_dependencies || jsonb_build_array('judge_marks');
  END IF;
  IF EXISTS (SELECT 1 FROM public.results result WHERE result.registration_id=v_registration.id) THEN
    v_dependencies := v_dependencies || jsonb_build_array('results_or_points');
  END IF;
  IF v_registration.is_verified IS TRUE OR v_registration.code_letter_fixed IS TRUE
     OR NULLIF(btrim(COALESCE(v_registration.code_letter,'')),'') IS NOT NULL THEN
    v_dependencies := v_dependencies || jsonb_build_array('check_in_or_code_letter');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.attendance attendance
    JOIN public.schedules schedule ON schedule.id=attendance.schedule_id
    JOIN public.group_members member ON member.participant_id=attendance.participant_id
    WHERE member.registration_id=v_registration.id
      AND schedule.item_id=v_registration.item_id
      AND schedule.festival_id=v_registration.festival_id
  ) THEN
    v_dependencies := v_dependencies || jsonb_build_array('member_attendance');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.certificates certificate
    JOIN public.group_members member ON member.participant_id=certificate.participant_id
    WHERE member.registration_id=v_registration.id AND certificate.item_id=v_registration.item_id
  ) THEN
    v_dependencies := v_dependencies || jsonb_build_array('member_certificates');
  END IF;

  IF jsonb_array_length(v_dependencies)>0 THEN
    INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
    VALUES(v_registration.tenant_id,auth.uid(),'GROUP_ENTRY_DELETE_BLOCKED','registrations',v_registration.id,
      to_jsonb(v_registration),jsonb_build_object('status','blocked','reason',NULLIF(btrim(p_reason),''),'dependencies',v_dependencies));
    RETURN jsonb_build_object('status','blocked',
      'message',format('This group entry cannot be deleted because history exists: %s. Nothing was deleted.',
        array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_dependencies)),', ')),
      'registration_id',v_registration.id,'dependencies',v_dependencies);
  END IF;

  SELECT to_jsonb(v_registration) || jsonb_build_object(
      'members',COALESCE(jsonb_agg(jsonb_build_object(
        'participant_id',participant.id,'name',participant.name,'chest_number',participant.chest_number
      ) ORDER BY participant.id) FILTER (WHERE participant.id IS NOT NULL),'[]'::jsonb))
  INTO v_snapshot
  FROM public.group_members member
  JOIN public.participants participant ON participant.id=member.participant_id
  WHERE member.registration_id=v_registration.id;

  v_auth_transaction_id:=pg_catalog.txid_current();
  INSERT INTO group_entry_private.registration_delete_authorizations(transaction_id,registration_id,actor_id)
  VALUES(v_auth_transaction_id,v_registration.id,auth.uid());

  BEGIN
    DELETE FROM public.group_members member WHERE member.registration_id=v_registration.id;
    DELETE FROM public.registrations registration WHERE registration.id=v_registration.id;
  EXCEPTION WHEN foreign_key_violation THEN
    DELETE FROM group_entry_private.registration_delete_authorizations
    WHERE transaction_id=v_auth_transaction_id AND registration_id=v_registration.id AND actor_id=auth.uid();
    INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
    VALUES(v_registration.tenant_id,auth.uid(),'GROUP_ENTRY_DELETE_BLOCKED','registrations',v_registration.id,
      v_snapshot,jsonb_build_object('status','blocked','reason',NULLIF(btrim(p_reason),''),'database_constraint','dependent_history'));
    RETURN jsonb_build_object('status','blocked',
      'message','This group entry has linked history that prevents deletion. Nothing was deleted.',
      'registration_id',v_registration.id);
  END;

  DELETE FROM group_entry_private.registration_delete_authorizations
  WHERE transaction_id=v_auth_transaction_id AND registration_id=v_registration.id AND actor_id=auth.uid();

  INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
  VALUES(v_registration.tenant_id,auth.uid(),'GROUP_ENTRY_DELETE','registrations',v_registration.id,
    v_snapshot,jsonb_build_object('status','removed','reason',NULLIF(btrim(p_reason),''),
      'tenant_id',v_registration.tenant_id,'festival_id',v_registration.festival_id,
      'item_id',v_registration.item_id,'organisation_id',v_registration.organisation_id,
      'deleted_by',auth.uid(),'deleted_at',pg_catalog.now()));

  RETURN jsonb_build_object('status','removed','registration_id',v_registration.id,
    'festival_id',v_registration.festival_id,'item_id',v_registration.item_id,
    'organisation_id',v_registration.organisation_id);
END;
$function$;
ALTER FUNCTION public.safe_delete_general_team_entry(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.safe_delete_general_team_entry(uuid, text) FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.safe_delete_general_team_entry(uuid, text) TO postgres, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.safe_delete_participants(p_participant_ids uuid[], p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_participant public.participants%ROWTYPE;
  v_participant_ids uuid[];
  v_count integer;
  v_registration_id uuid;
  v_group_result jsonb;
  v_block_message text;
  v_block_dependencies jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid();
  IF NOT FOUND OR (v_actor.is_superadmin IS NOT TRUE
      AND v_actor.role IS DISTINCT FROM 'admin'
      AND v_actor.role IS DISTINCT FROM 'admin_leader') THEN
    RAISE EXCEPTION 'Only festival administrators can delete participants.' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[])
    INTO v_participant_ids
  FROM (SELECT DISTINCT unnest(COALESCE(p_participant_ids, ARRAY[]::uuid[])) AS id) requested;

  IF cardinality(v_participant_ids)=0 THEN
    RETURN jsonb_build_object('status','removed','deleted_count',0,'participant_ids','[]'::jsonb);
  END IF;

  -- Lock in a stable order. The all-or-nothing bulk operation must not race
  -- roster edits or another deletion of the same participants.
  PERFORM participant.id
  FROM public.participants participant
  WHERE participant.id=ANY(v_participant_ids)
  ORDER BY participant.id
  FOR UPDATE;

  SELECT count(*) INTO v_count
  FROM public.participants participant
  WHERE participant.id=ANY(v_participant_ids)
    AND (v_actor.is_superadmin IS TRUE OR (
      participant.tenant_id=v_actor.tenant_id
      AND public.is_org_visible(participant.organisation_id)
    ));

  IF v_count <> cardinality(v_participant_ids) THEN
    RAISE EXCEPTION 'One or more participants were not found or are outside your organisation.' USING ERRCODE='42501';
  END IF;

  v_block_dependencies := '[]'::jsonb;
  IF EXISTS (SELECT 1 FROM public.registrations registration
      WHERE registration.participant_id=ANY(v_participant_ids)) THEN
    v_block_dependencies := v_block_dependencies || jsonb_build_array('individual_competition_registrations');
  END IF;
  IF EXISTS (SELECT 1 FROM public.attendance attendance
      WHERE attendance.participant_id=ANY(v_participant_ids)) THEN
    v_block_dependencies := v_block_dependencies || jsonb_build_array('attendance_or_check_in');
  END IF;
  IF EXISTS (SELECT 1 FROM public.certificates certificate
      WHERE certificate.participant_id=ANY(v_participant_ids)) THEN
    v_block_dependencies := v_block_dependencies || jsonb_build_array('certificates');
  END IF;
  IF EXISTS (SELECT 1 FROM public.participant_chest_number_changes change_log
      WHERE change_log.participant_id=ANY(v_participant_ids)) THEN
    v_block_dependencies := v_block_dependencies || jsonb_build_array('chest_number_change_history');
  END IF;
  IF EXISTS (SELECT 1 FROM public.participant_unit_audit_logs audit_log
      WHERE audit_log.participant_id=ANY(v_participant_ids)) THEN
    v_block_dependencies := v_block_dependencies || jsonb_build_array('organisation_transfer_history');
  END IF;

  IF jsonb_array_length(v_block_dependencies)>0 THEN
    FOR v_participant IN SELECT * FROM public.participants WHERE id=ANY(v_participant_ids) ORDER BY id LOOP
      INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
      VALUES(v_participant.tenant_id,auth.uid(),'PARTICIPANT_DELETE_BLOCKED','participants',v_participant.id,
        to_jsonb(v_participant),jsonb_build_object('status','blocked',
          'reason',NULLIF(btrim(p_reason),''),'dependencies',v_block_dependencies));
    END LOOP;
    RETURN jsonb_build_object('status','blocked',
      'message',format('Participant deletion is blocked because history or individual registrations exist: %s. Nothing was deleted.',
        array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_block_dependencies)),', ')),
      'participant_ids',to_jsonb(v_participant_ids),'dependencies',v_block_dependencies);
  END IF;

  -- Group removals and participant deletion share one subtransaction. The
  -- existing group RPC remains the authority for marks/results/check-in and
  -- other protected group history. A blocked group rolls the whole batch back.
  BEGIN
    FOR v_registration_id IN
      SELECT registration.id
      FROM public.registrations registration
      WHERE registration.entry_kind='general_team'
        AND (EXISTS (SELECT 1 FROM public.group_members member
              WHERE member.registration_id=registration.id
                AND member.participant_id=ANY(v_participant_ids))
          OR NULLIF(to_jsonb(registration)->>'group_leader_participant_id','')::uuid=ANY(v_participant_ids)
          OR NULLIF(to_jsonb(registration)->>'group_representative_id','')::uuid=ANY(v_participant_ids))
      ORDER BY registration.id
      FOR UPDATE OF registration
    LOOP
      v_group_result:=public.safe_delete_general_team_entry(v_registration_id,p_reason);
      IF v_group_result->>'status' IS DISTINCT FROM 'removed' THEN
        v_block_message:=COALESCE(v_group_result->>'message','A related group entry could not be safely removed.');
        RAISE EXCEPTION 'Participant group deletion blocked' USING ERRCODE='ZX001';
      END IF;
    END LOOP;

    -- Capture the row before removing it so the participant's admin audit is
    -- durable even after the participant no longer exists.
    FOR v_participant IN SELECT * FROM public.participants WHERE id=ANY(v_participant_ids) ORDER BY id LOOP
      INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
      VALUES(v_participant.tenant_id,auth.uid(),'PARTICIPANT_DELETE','participants',v_participant.id,
        to_jsonb(v_participant),jsonb_build_object('status','removed',
          'reason',NULLIF(btrim(p_reason),''),'deleted_by',auth.uid(),'deleted_at',pg_catalog.now()));
    END LOOP;

    DELETE FROM public.participants participant WHERE participant.id=ANY(v_participant_ids);
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN
    -- Any earlier group removals and their audit rows in this batch are
    -- rolled back with this block. Record only the participant-level block.
    FOR v_participant IN SELECT * FROM public.participants WHERE id=ANY(v_participant_ids) ORDER BY id LOOP
      INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
      VALUES(v_participant.tenant_id,auth.uid(),'PARTICIPANT_DELETE_BLOCKED','participants',v_participant.id,
        to_jsonb(v_participant),jsonb_build_object('status','blocked',
          'reason',NULLIF(btrim(p_reason),''),'group_entry_message',v_block_message));
    END LOOP;
    RETURN jsonb_build_object('status','blocked','message',v_block_message,
      'participant_ids',to_jsonb(v_participant_ids));
  WHEN foreign_key_violation THEN
    FOR v_participant IN SELECT * FROM public.participants WHERE id=ANY(v_participant_ids) ORDER BY id LOOP
      INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
      VALUES(v_participant.tenant_id,auth.uid(),'PARTICIPANT_DELETE_BLOCKED','participants',v_participant.id,
        to_jsonb(v_participant),jsonb_build_object('status','blocked',
          'reason',NULLIF(btrim(p_reason),''),'dependencies','["linked_history"]'::jsonb));
    END LOOP;
    RETURN jsonb_build_object('status','blocked',
      'message','Participant deletion is blocked because linked history exists. Nothing was deleted.',
      'participant_ids',to_jsonb(v_participant_ids),'dependencies',jsonb_build_array('linked_history'));
  END;

  RETURN jsonb_build_object('status','removed','deleted_count',cardinality(v_participant_ids),
    'participant_ids',to_jsonb(v_participant_ids));
END;
$function$;
ALTER FUNCTION public.safe_delete_participants(uuid[], text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.safe_delete_participants(uuid[], text) FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.safe_delete_participants(uuid[], text) TO postgres, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.team_leader_bulk_assign_program(p_item_id uuid, p_category_code text, p_participant_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_id uuid; v_allowed uuid[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.' USING ERRCODE='42501'; END IF;
  IF p_participant_ids IS NULL OR cardinality(p_participant_ids) = 0
    OR array_position(p_participant_ids, NULL) IS NOT NULL
    OR (SELECT count(DISTINCT id) FROM unnest(p_participant_ids) ids(id)) <> cardinality(p_participant_ids)
  THEN RAISE EXCEPTION 'Select distinct students.' USING ERRCODE='22023'; END IF;

  SELECT array_agg(c.participant_id) INTO v_allowed
  FROM public.get_team_leader_program_candidates(p_item_id,p_category_code) c
  WHERE c.is_eligible AND c.registration_id IS NULL;
  IF EXISTS (SELECT 1 FROM unnest(p_participant_ids) ids(id)
             WHERE NOT ids.id = ANY(COALESCE(v_allowed, ARRAY[]::uuid[])))
  THEN RAISE EXCEPTION 'Selection contains an assigned or ineligible student.' USING ERRCODE='42501'; END IF;

  FOREACH v_id IN ARRAY p_participant_ids LOOP
    PERFORM public.team_leader_assign_program(v_id,p_item_id);
  END LOOP;
  RETURN jsonb_build_object('added_count',cardinality(p_participant_ids));
END;
$function$;
ALTER FUNCTION public.team_leader_bulk_assign_program(uuid, text, uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.team_leader_bulk_assign_program(uuid, text, uuid[]) FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.team_leader_bulk_assign_program(uuid, text, uuid[]) TO postgres, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.team_leader_unassign_program(p_registration_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_context record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND THEN RAISE EXCEPTION 'An active Team Leader portal assignment is required.' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.registrations r
    JOIN public.participants p ON p.id=r.participant_id
    WHERE r.id=p_registration_id AND r.festival_id=v_context.festival_id
      AND r.organisation_id=v_context.organisation_id AND r.entry_kind='participant'
      AND p.festival_id=v_context.festival_id AND p.organisation_id=v_context.organisation_id
      AND p.tenant_id IN (v_context.parent_tenant_id,
        (SELECT o.tenant_id FROM public.organisations o WHERE o.id=v_context.organisation_id)))
  THEN RAISE EXCEPTION 'This assignment is outside your team.' USING ERRCODE='42501'; END IF;
  RETURN public.safe_unassign_registration(p_registration_id,'Team Leader program correction');
END;
$function$;
ALTER FUNCTION public.team_leader_unassign_program(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.team_leader_unassign_program(uuid) FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.team_leader_unassign_program(uuid) TO postgres, authenticated, service_role;

CREATE TRIGGER notify_participant_profile_change AFTER UPDATE ON public.participants REFERENCING OLD TABLE AS participant_old NEW TABLE AS participant_new FOR EACH STATEMENT EXECUTE FUNCTION public.notify_participant_profile_change();

CREATE TRIGGER capture_result_team_award AFTER INSERT OR UPDATE ON public.results FOR EACH ROW EXECUTE FUNCTION public.capture_result_team_award();


