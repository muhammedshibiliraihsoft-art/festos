CREATE OR REPLACE FUNCTION public.admin_dashboard_aggregates(p_tenant_id uuid, p_festival_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_org_ids uuid[]; v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authenticated tenant required' USING ERRCODE='42501';
  END IF;
  IF p_festival_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.festival_calendar f WHERE f.id=p_festival_id AND f.tenant_id=p_tenant_id
  ) THEN RAISE EXCEPTION 'Festival unavailable' USING ERRCODE='42501'; END IF;
  SELECT array_agg(o.id) INTO v_org_ids FROM public.get_visible_organisations(p_tenant_id) o;
  WITH people AS MATERIALIZED (
    SELECT p.category_code, p.organisation_id FROM public.participants p
    WHERE ((p_festival_id IS NULL AND p.tenant_id=p_tenant_id) OR (p_festival_id IS NOT NULL AND p.festival_id=p_festival_id))
      AND (coalesce(cardinality(v_org_ids),0)=0 OR p.organisation_id=ANY(v_org_ids))
  ), categories AS (
    SELECT coalesce(nullif(category_code,''),'Unknown') AS name, count(*) AS count
    FROM people GROUP BY coalesce(nullif(category_code,''),'Unknown')
  ), teams AS (
    SELECT organisation_id AS id, count(*) AS count FROM people GROUP BY organisation_id
  )
  SELECT jsonb_build_object(
    'orgName',coalesce((SELECT o.name FROM public.tenants t JOIN public.organisations o ON o.id=t.organisation_id WHERE t.id=p_tenant_id),'Organisation'),
    'orgType',coalesce((SELECT o.org_type FROM public.tenants t JOIN public.organisations o ON o.id=t.organisation_id WHERE t.id=p_tenant_id),'Admin'),
    'participantsCount',(SELECT count(*) FROM people),
    'itemsCount',(SELECT count(*) FROM public.items i WHERE i.is_active=true AND ((p_festival_id IS NULL AND i.tenant_id=p_tenant_id) OR (p_festival_id IS NOT NULL AND i.festival_id=p_festival_id))),
    'activeSchedulesCount',(SELECT count(*) FROM public.schedules s WHERE s.status IN ('scheduled','ongoing','in_progress') AND ((p_festival_id IS NULL AND s.tenant_id=p_tenant_id) OR (p_festival_id IS NOT NULL AND s.festival_id=p_festival_id))),
    'categoryGraph',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.name,'name',c.name,'count',c.count) ORDER BY c.name) FROM categories c),'[]'::jsonb),
    'unitGraph',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',coalesce(o.name,'Unknown'),'count',t.count) ORDER BY t.count DESC,t.id) FROM teams t LEFT JOIN public.organisations o ON o.id=t.id),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_dashboard_aggregates(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_aggregates(uuid,uuid) TO authenticated;
