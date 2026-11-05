-- Source-only target prerequisites required by later application migrations.
-- Source catalog was queried read-only; no source rows are copied by this migration.
-- Tenant-scoped result award rows and delete authorization rows are intentionally omitted.

CREATE TABLE public.result_team_awards (
  result_id uuid NOT NULL,
  organisation_id uuid NOT NULL,
  first_awarded_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT result_team_awards_pkey PRIMARY KEY (result_id),
  CONSTRAINT result_team_awards_result_id_fkey
    FOREIGN KEY (result_id) REFERENCES public.results(id) ON DELETE CASCADE,
  CONSTRAINT result_team_awards_organisation_id_fkey
    FOREIGN KEY (organisation_id) REFERENCES public.organisations(id) ON DELETE RESTRICT
);

ALTER TABLE public.result_team_awards OWNER TO postgres;
ALTER TABLE public.result_team_awards ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.result_team_awards FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.result_team_awards TO postgres, service_role;

CREATE TABLE group_entry_private.registration_delete_authorizations (
  transaction_id bigint NOT NULL,
  registration_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  CONSTRAINT registration_delete_authorizations_pkey PRIMARY KEY (transaction_id, registration_id)
);

ALTER TABLE group_entry_private.registration_delete_authorizations OWNER TO postgres;

REVOKE ALL PRIVILEGES ON TABLE group_entry_private.registration_delete_authorizations FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE group_entry_private.registration_delete_authorizations TO postgres;

