import { supabase } from '../../core/config/supabase';

export const organisationRepository = {
  async getOrganisation(tenantId: string) {
    const { data, error } = await supabase
      .from('tenants')
      .select('organisation:organisations!tenants_organisation_id_fkey(id, name, org_type)')
      .eq('id', tenantId)
      .maybeSingle();

    const organisation = data?.organisation as unknown as
      | { id: string; name: string; org_type: string }
      | { id: string; name: string; org_type: string }[]
      | null
      | undefined;

    return {
      data: Array.isArray(organisation) ? organisation[0] ?? null : organisation ?? null,
      error,
    };
  },

  async getChildOrganisations(parentId: string, archived = false) {
    let query = supabase
      .from('organisations')
      .select('id, tenant_id, name, org_type, parent_id, admin_email, archived_at, created_at')
      .eq('parent_id', parentId)
      .order('created_at', { ascending: false });

    query = archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
    return await query;
  },

  async archiveChildOrganisation(orgId: string) {
    return await supabase.rpc('archive_child_organisation', {
      p_org_id: orgId,
      p_reason: 'Archived from organisation management',
    });
  },

  async restoreChildOrganisation(orgId: string) {
    return await supabase.rpc('restore_child_organisation', {
      p_org_id: orgId,
      p_reason: 'Restored from organisation management',
    });
  },

  async deleteArchivedOrganisation(orgId: string) {
    return await supabase.rpc('delete_archived_organisation', {
      p_org_id: orgId,
    });
  },
};
