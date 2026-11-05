BEGIN;

-- Existing schedules were already returned by the public schedule view. Keep
-- that existing visibility during rollout; new schedules start private.
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS is_public_visible boolean;

ALTER TABLE public.schedules
  ALTER COLUMN is_public_visible SET DEFAULT false,
  ALTER COLUMN is_public_visible SET NOT NULL;

-- Do not expose the unscoped view/table to anonymous clients. Public schedule
-- readers must use the tenant + festival checked RPC below.
REVOKE SELECT ON TABLE public.vw_public_schedule FROM anon, authenticated;
REVOKE SELECT ON TABLE public.schedules FROM anon;

DROP POLICY IF EXISTS team_foundation_public_schedule_read ON public.schedules;

CREATE OR REPLACE FUNCTION public.get_public_schedules_scoped(
  p_tenant_id uuid,
  p_festival_id uuid
)
RETURNS TABLE (
  schedule_id uuid,
  festival_id uuid,
  item_id uuid,
  venue_id uuid,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  venue_name text,
  venue_location text,
  item_name text,
  item_name_ml text,
  item_code text,
  item_type text,
  item_category_codes text[],
  is_published boolean,
  has_results boolean,
  has_marks boolean,
  has_codes boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    s.id,
    s.festival_id,
    s.item_id,
    s.venue_id,
    s.start_time,
    s.end_time,
    s.status,
    v.name,
    v.location,
    i.item_name_en,
    i.item_name_ml,
    i.item_code,
    i.item_type,
    COALESCE(i.category_codes, ARRAY[]::text[]),
    EXISTS (
      SELECT 1
      FROM public.results r
      WHERE r.schedule_id = s.id
        AND r.tenant_id = p_tenant_id
        AND r.festival_id = p_festival_id
        AND r.published IS TRUE
        AND r.public_visible IS TRUE
        AND COALESCE(r.result_status, 'draft') = 'published'
    ),
    EXISTS (
      SELECT 1
      FROM public.results r
      WHERE r.schedule_id = s.id
        AND r.tenant_id = p_tenant_id
        AND r.festival_id = p_festival_id
    ),
    EXISTS (
      SELECT 1
      FROM public.mark_entries m
      WHERE m.schedule_id = s.id
        AND m.tenant_id = p_tenant_id
        AND m.is_final IS TRUE
    ),
    EXISTS (
      SELECT 1
      FROM public.registrations r
      WHERE r.tenant_id = p_tenant_id
        AND r.festival_id = p_festival_id
        AND r.item_id = s.item_id
        AND r.code_letter IS NOT NULL
    )
  FROM public.schedules s
  JOIN public.festival_calendar f
    ON f.id = s.festival_id
   AND f.tenant_id = s.tenant_id
  LEFT JOIN public.items i
    ON i.id = s.item_id
   AND i.tenant_id = p_tenant_id
   AND i.festival_id = p_festival_id
  LEFT JOIN public.venues v
    ON v.id = s.venue_id
   AND v.tenant_id = p_tenant_id
   AND v.festival_id = p_festival_id
  WHERE p_tenant_id IS NOT NULL
    AND p_festival_id IS NOT NULL
    AND s.tenant_id = p_tenant_id
    AND s.festival_id = p_festival_id
    AND s.is_public_visible IS TRUE
  ORDER BY s.start_time NULLS LAST, s.id;
$function$;

ALTER FUNCTION public.get_public_schedules_scoped(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_public_schedules_scoped(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_schedules_scoped(uuid, uuid) TO anon, authenticated, service_role;

-- Keep the older verification RPC callable for compatibility, but limit it to
-- schedules explicitly made public and correlate all workflow flags to that
-- schedule's tenant and festival.
CREATE OR REPLACE FUNCTION public.get_public_verification_status(p_tenant_id uuid)
RETURNS TABLE(schedule_id uuid, has_results boolean, has_marks boolean, has_codes boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    s.id,
    EXISTS (
      SELECT 1 FROM public.results r
      WHERE r.schedule_id = s.id AND r.tenant_id = s.tenant_id AND r.festival_id = s.festival_id
    ),
    EXISTS (
      SELECT 1 FROM public.mark_entries m
      WHERE m.schedule_id = s.id AND m.tenant_id = s.tenant_id AND m.is_final IS TRUE
    ),
    EXISTS (
      SELECT 1 FROM public.registrations r
      WHERE r.tenant_id = s.tenant_id AND r.festival_id = s.festival_id
        AND r.item_id = s.item_id AND r.code_letter IS NOT NULL
    )
  FROM public.schedules s
  WHERE p_tenant_id IS NOT NULL
    AND s.tenant_id = p_tenant_id
    AND s.is_public_visible IS TRUE;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';