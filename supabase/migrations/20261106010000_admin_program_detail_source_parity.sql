CREATE OR REPLACE FUNCTION public.admin_program_detail(p_tenant_id uuid,p_festival_id uuid,p_item_id uuid,p_category text,p_include_eligible boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM program_read_private.authorize(p_tenant_id,p_festival_id);
 IF NOT EXISTS (SELECT 1 FROM public.items i WHERE i.id=p_item_id AND i.festival_id=p_festival_id AND i.tenant_id=p_tenant_id
   AND EXISTS(SELECT 1 FROM unnest(i.category_codes) code WHERE upper(btrim(code))=upper(btrim(p_category))))
 THEN RAISE EXCEPTION 'Program unavailable'; END IF;
 WITH orgs AS MATERIALIZED (SELECT id FROM public.get_visible_organisations(p_tenant_id)),
 regs AS MATERIALIZED (SELECT r.id,r.item_id,r.participant_id,r.organisation_id,r.tenant_id,r.festival_id,r.entry_kind,r.status,r.is_verified,r.code_letter
  FROM public.registrations r LEFT JOIN public.participants rp ON rp.id=r.participant_id AND rp.festival_id=p_festival_id
   AND (rp.tenant_id=p_tenant_id OR EXISTS (SELECT 1 FROM public.organisations rpo WHERE rpo.id=rp.organisation_id AND rpo.tenant_id=rp.tenant_id))
  WHERE (r.tenant_id=p_tenant_id OR r.tenant_id IS NULL OR r.tenant_id=rp.tenant_id)
   AND r.item_id=p_item_id AND r.festival_id=p_festival_id
   AND coalesce(r.organisation_id,rp.organisation_id) IN (SELECT id FROM orgs)
   AND (r.entry_kind='general_team' OR rp.id IS NOT NULL)),
 people AS (
  SELECT p.id,p.tenant_id,p.festival_id,p.organisation_id,p.name,p.chest_number,p.category_code,p.gender,p.status,
   coalesce((pg_catalog.to_jsonb(p)->>'is_post_hs_religious')::boolean,false) AS is_post_hs_religious,p.plagiarism_ban_until,
   jsonb_build_object('id',o.id,'name',o.name,'org_type',o.org_type) AS organisations
  FROM public.participants p JOIN public.organisations o ON o.id=p.organisation_id
  JOIN public.items i ON i.id=p_item_id AND i.festival_id=p_festival_id
  WHERE p.festival_id=p_festival_id AND p.organisation_id IN (SELECT id FROM orgs)
    AND (p.tenant_id=p_tenant_id OR p.tenant_id=o.tenant_id)
    AND (EXISTS(SELECT 1 FROM regs r WHERE r.participant_id=p.id)
      OR (p_include_eligible AND p.status IS DISTINCT FROM 'rejected'
       AND program_read_private.matches_category(p.category_code,p_category,coalesce((pg_catalog.to_jsonb(p)->>'is_post_hs_religious')::boolean,false))
       AND (i.gender IS NULL OR i.gender IN ('','both') OR i.gender=p.gender)))
 ) SELECT jsonb_build_object('participants',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.name,p.id) FROM people p),'[]'::jsonb),
   'registrations',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM regs r),'[]'::jsonb),
   'organisation_ids',coalesce((SELECT jsonb_agg(id) FROM orgs),'[]'::jsonb)) INTO result;
 RETURN result;
END;
$$;
ALTER FUNCTION public.admin_program_detail(uuid,uuid,uuid,text,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_program_detail(uuid,uuid,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_program_detail(uuid,uuid,uuid,text,boolean) TO authenticated;
