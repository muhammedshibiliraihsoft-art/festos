-- All tenants use Stage read v2 unless an explicit tenant override sets v1.
-- Old Stage reads are rejected by stage_venue_portal_data_with_letters when v2.
CREATE OR REPLACE FUNCTION public.stage_venue_portal_read_mode(p_venue_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT v.tenant_id INTO v_tenant_id FROM public.venues v WHERE v.id = p_venue_id;
  IF v_tenant_id IS NULL THEN RETURN 'v2'; END IF;
  RETURN COALESCE((SELECT m.mode FROM stage_portal_private.stage_read_modes m
                   WHERE m.tenant_id = v_tenant_id), 'v2');
END;
$function$;

CREATE OR REPLACE FUNCTION public.stage_management_read_mode()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_tenant_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();
  RETURN COALESCE((SELECT m.mode FROM stage_portal_private.stage_read_modes m
                   WHERE m.tenant_id = v_tenant_id), 'v2');
END;
$function$;

-- Global kill switch for the Main Admin Dashboard. This private table is
-- intentionally not exposed through PostgREST. Re-enable by setting true.
CREATE TABLE IF NOT EXISTS stage_portal_private.application_feature_flags (
  flag text PRIMARY KEY,
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON stage_portal_private.application_feature_flags FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.main_admin_dashboard_enabled()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT p.* INTO v_profile FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT FOUND OR (v_profile.role IS DISTINCT FROM 'admin' AND v_profile.is_superadmin IS NOT TRUE) THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((SELECT f.enabled FROM stage_portal_private.application_feature_flags f
                   WHERE f.flag = 'main_admin_dashboard'), false);
END;
$function$;
REVOKE ALL ON FUNCTION public.main_admin_dashboard_enabled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.main_admin_dashboard_enabled() TO authenticated, service_role;

-- Roll back Stage to v1 per tenant:
-- INSERT INTO stage_portal_private.stage_read_modes(tenant_id, mode)
-- VALUES ('<tenant-uuid>', 'v1') ON CONFLICT (tenant_id)
-- DO UPDATE SET mode='v1', updated_at=now();
-- Restore v2 by setting mode='v2' or deleting the tenant override.
-- Re-enable Dashboard only after reviewing its load: UPDATE
-- stage_portal_private.application_feature_flags SET enabled=true, updated_at=now()
-- WHERE flag='main_admin_dashboard';
