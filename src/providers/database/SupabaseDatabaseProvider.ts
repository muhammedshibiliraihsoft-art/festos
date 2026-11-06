import { supabase } from '../../core/config/supabase';
import { organisationRepository } from '../../lib/repositories/organisationRepository';
import { CompetitionItemUpdate, DatabaseProvider, ListResult, QueryResult } from './DatabaseProvider';
import { CompetitionPublication, competitionArguments } from '../../types/scoring';

const normalizeError = (error: any): QueryResult<never>['error'] => {
  if (!error) return null;
  return {
    code: error.code,
    message: error.message || 'Database request failed',
  };
};

export class SupabaseDatabaseProvider implements DatabaseProvider {
  async getActiveFestival<T>(tenantId: string): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('festival_calendar')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async getPointsConfig<T>(festivalId: string): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('points_config')
      .select('*')
      .eq('festival_id', festivalId)
      .order('config_version', { ascending: false })
      .limit(1)
      .maybeSingle();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async upsertPointsConfig<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .rpc('save_scoring_configuration', {
        p_festival_id: payload.festival_id,
        p_expected_version: payload.expected_version,
        p_config: payload,
        p_reason: payload.change_reason,
      });

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async upsertFestival<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('festival_calendar')
      .upsert(payload)
      .select()
      .single();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async getActiveItemCodes(festivalId: string): Promise<ListResult<{ item_code: string }>> {
    const { data, error } = await supabase
      .from('items')
      .select('item_code')
      .eq('festival_id', festivalId)
      .eq('is_active', true);

    return {
      data: data ?? [],
      error: normalizeError(error),
    };
  }

  async getItems<T>(festivalId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('festival_id', festivalId)
      .eq('is_active', true);
      
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async getSelectableItems<T>(festivalId: string, tenantId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('festival_id', festivalId)
      .eq('tenant_id', tenantId);
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async updateCompetitionItem(input: CompetitionItemUpdate): Promise<QueryResult<void>> {
    const { error } = await supabase.rpc('update_competition_item', {
      p_festival_id: input.festivalId,
      p_item_id: input.itemId,
      p_item_name_ml: input.itemNameMl,
      p_category_codes: input.categoryCodes,
      p_group_member_count: input.groupMemberCount,
      p_item_type: input.itemType,
      p_max_participants_per_team: input.maxParticipantsPerTeam,
      p_expected_updated_at: input.expectedUpdatedAt,
    });
    return { data: undefined, error: normalizeError(error) };
  }

  async applyItemChanges(
    festivalId: string,
    activateCodes: string[],
    deactivateCodes: string[],
    itemRecords: any[] = [],
  ): Promise<QueryResult<void>> {
    const { error } = await supabase.rpc('apply_competition_item_changes', {
      p_festival_id: festivalId,
      p_activate_codes: activateCodes,
      p_deactivate_codes: deactivateCodes,
      p_records: itemRecords,
    });
    return { data: undefined, error: normalizeError(error) };
  }

  async setActiveItemCodes(
    festivalId: string,
    tenantId: string,
    itemCodes: string[],
    itemRecords?: {
      item_code: string;
      item_name_ml: string;
      participation_type: string;
      category_codes: string[];
      duration_minutes?: number;
      group_min_members?: number;
      group_max_members?: number;
    }[],
  ): Promise<QueryResult<void>> {
    const { error } = await supabase.rpc('save_competition_items', {
      p_festival_id: festivalId, p_codes: itemCodes, p_records: itemRecords ?? [],
    });
    return { data: undefined, error: normalizeError(error) };
  }

  async listParticipants<T>(): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('participants')
      .select('*, organisations(id, name, org_type)')
      .order('created_at', { ascending: false });

    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async getParticipant<T>(participantId: string): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('participants')
      .select('*, organisations(id, name, org_type)')
      .eq('id', participantId)
      .single();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async getPublicCandidateProfile<T>(slug: string): Promise<QueryResult<T>> {
    const { data, error } = await supabase.rpc('get_public_candidate_profile', {
      p_slug: slug,
    });

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async getParticipantRegistrations<T>(participantId: string): Promise<ListResult<T>> {
    const [participantRows, groupMembershipRows] = await Promise.all([
      supabase
        .from('registrations')
        .select('*, items(*)')
        .eq('participant_id', participantId),
      supabase
        .from('group_members')
        .select('registration:registrations!inner(*, items(*))')
        .eq('participant_id', participantId),
    ]);

    const error = participantRows.error || groupMembershipRows.error;
    if (error) return { data: [], error: normalizeError(error) };

    const registrations = [
      ...((participantRows.data ?? []) as any[]),
      ...((groupMembershipRows.data ?? []) as any[]).flatMap((membership: any) => {
        const registration = membership.registration;
        return Array.isArray(registration) ? registration : registration ? [registration] : [];
      }),
    ];
    const uniqueRegistrations = Array.from(
      new Map(registrations.map((registration: any) => [registration.id, registration])).values(),
    );

    return { data: uniqueRegistrations as T[], error: null };
  }

  async getRegistrationsByItem<T>(itemId: string, tenantId: string, festivalId?: string): Promise<ListResult<T>> {
    let query = supabase
      .from('registrations')
      .select('*, participants:participants!registrations_participant_id_fkey(*, organisations(id, name, org_type))')
      .eq('item_id', itemId)
      .eq('tenant_id', tenantId);
    if (festivalId) query = query.eq('festival_id', festivalId);
    const { data, error } = await query;
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async getAdminRegistrationsBySchedule<T>(scheduleId: string): Promise<ListResult<T>> {
    const scoped = await supabase.rpc('get_stage_management_registrations_scoped', {
      p_schedule_id: scheduleId,
      p_festival_id: null,
    });

    if (!scoped.error && scoped.data && scoped.data.length > 0) {
      const normalized = (scoped.data as any[]).map((row) => ({
        ...row,
        participants: {
          id: row.participant_id,
          name: row.participant_name,
          chest_number: row.participant_chest_number,
          category_code: row.participant_category_code,
          organisations: row.organisation_id
            ? {
                id: row.organisation_id,
                name: row.organisation_name,
                org_type: row.organisation_type,
              }
            : null,
        },
      }));
      return { data: normalized as T[], error: null };
    }

    const scopedRpcUnavailable = scoped.error
      && ['42883', 'PGRST202'].includes((scoped.error as any).code);
    if (scoped.error && !scopedRpcUnavailable) {
      return { data: [], error: normalizeError(scoped.error) };
    }

    const { data, error } = await supabase.rpc('get_schedule_registrations', {
      p_schedule_id: scheduleId,
    });
    if (error && (error as any).code === '42883') {
      const { data: schedule, error: scheduleError } = await supabase
        .from('schedules')
        .select('tenant_id, festival_id, item_id')
        .eq('id', scheduleId)
        .single();
      if (scheduleError || !schedule) return { data: [], error: normalizeError(scheduleError ?? error) };
      const legacy = await supabase
        .from('registrations')
        .select('*, participants:participants!registrations_participant_id_fkey(*, organisations(id, name, org_type))')
        .eq('tenant_id', schedule.tenant_id)
        .eq('festival_id', schedule.festival_id)
        .eq('item_id', schedule.item_id);
      return { data: (legacy.data as T[]) ?? [], error: normalizeError(legacy.error) };
    }
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async listRegistrationsByFestival<T>(festivalId: string): Promise<ListResult<T>> {
    const registrations: T[] = [];
    let lastId: string | null = null;
    // Keep each request below the Data API row limit. An ordered cursor avoids
    // offset shifts while registrations are added or removed during loading.
    while (true) {
      let query = supabase
        .from('registrations')
        .select('id, item_id, participant_id, organisation_id, tenant_id, festival_id, entry_kind, status, is_verified, code_letter')
        .eq('festival_id', festivalId)
        .order('id', { ascending: true })
        .limit(500);
      if (lastId) query = query.gt('id', lastId);
      const { data, error } = await query;
      if (error) return { data: [], error: normalizeError(error) };
      if (!data?.length) return { data: registrations, error: null };
      registrations.push(...(data as T[]));
      const nextId = data[data.length - 1].id;
      if (!nextId || nextId === lastId) {
        return { data: [], error: new Error('Registration pagination did not advance.') };
      }
      lastId = nextId;
    }
  }

  async updateRegistration<T>(registrationId: string, updates: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('registrations')
      .update(updates)
      .eq('id', registrationId)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async safeUnassignRegistration<T>(registrationId: string, reason?: string | null): Promise<QueryResult<T>> {
    const { data, error } = await supabase.rpc('safe_unassign_registration', {
      p_registration_id: registrationId,
      p_reason: reason ?? null,
    });
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async updateParticipant<T>(
    participantId: string,
    updates: Record<string, unknown>,
  ): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('participants')
      .update(updates)
      .eq('id', participantId)
      .select()
      .single();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async deleteParticipant(participantId: string): Promise<QueryResult<void>> {
    const { error } = await supabase.from('participants').delete().eq('id', participantId);
    return { data: undefined, error: normalizeError(error) };
  }

  async terminateParticipant(participantId: string, reason: string): Promise<QueryResult<void>> {
    const { error } = await supabase.rpc('terminate_participant', {
      p_participant_id: participantId,
      p_reason: reason
    });
    return { data: undefined, error: normalizeError(error) };
  }

  async revokeTermination(participantId: string): Promise<QueryResult<void>> {
    const { error } = await supabase.rpc('revoke_termination', {
      p_participant_id: participantId
    });
    return { data: undefined, error: normalizeError(error) };
  }

  async deleteParticipants(participantIds: string[]): Promise<QueryResult<void>> {
    const { error } = await supabase.from('participants').delete().in('id', participantIds);
    return { data: undefined, error: normalizeError(error) };
  }

  async updateParticipants(
    participantIds: string[],
    updates: Record<string, unknown>,
  ): Promise<QueryResult<void>> {
    const { error } = await supabase.from('participants').update(updates).in('id', participantIds);
    return { data: undefined, error: normalizeError(error) };
  }

  async countParticipantsByCategory(categoryCode: string, festivalId?: string): Promise<QueryResult<number>> {
    let query = supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('category_code', categoryCode);
    if (festivalId) query = query.eq('festival_id', festivalId);
    const { count, error } = await query;

    return { data: count ?? 0, error: normalizeError(error) };
  }

  async createParticipant<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('participants')
      .insert(payload)
      .select()
      .single();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async createParticipants<T>(payloads: Record<string, unknown>[]): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('participants')
      .insert(payloads)
      .select();

    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async createRegistration<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('registrations')
      .insert(payload)
      .select()
      .single();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async listParticipantDuplicateKeys(
    tenantId: string,
  ): Promise<ListResult<{ name: string | null; dob: string | null }>> {
    const { data, error } = await supabase
      .from('participants')
      .select('name, dob')
      .eq('tenant_id', tenantId);

    return { data: data ?? [], error: normalizeError(error) };
  }

  async getTenantOrgType(tenantId: string): Promise<QueryResult<{ org_type: string | null }>> {
    const { data, error } = await supabase
      .from('tenants')
      .select('org_type')
      .eq('id', tenantId)
      .maybeSingle();

    return { data: data ?? null, error: normalizeError(error) };
  }

  async listOrganisations<T>(tenantId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .rpc('get_visible_organisations', { p_tenant_id: tenantId });

    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async getAdminDashboardStats(tenantId: string): Promise<QueryResult<{
    orgName: string;
    orgType: string;
    participantsCount: number;
    participantsLast7Days: number;
    itemsCount: number;
    pendingRegsCount: number;
    pendingRegsLast7Days: number;
    activeSchedulesCount: number;
    categoryGraph: { name: string; count: number }[];
    unitGraph: { name: string; count: number }[];
    recentRegistrations: {
      id: string;
      participantName: string;
      itemName: string;
      organisationName: string;
      status: string;
      createdAt: string;
    }[];
  }>> {
    try {
      const { data: org, error: orgErr } = await organisationRepository.getOrganisation(tenantId);

      if (orgErr) throw orgErr;

      // Fetch active festival for the tenant
      const { data: activeFest, error: activeFestError } = await supabase
        .from('festival_calendar')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (activeFestError) throw activeFestError;

      const { data: visibleOrganisations, error: visibleOrganisationsError } =
        await supabase.rpc('get_visible_organisations', { p_tenant_id: tenantId });

      if (visibleOrganisationsError) throw visibleOrganisationsError;

      const organisationIds = ((visibleOrganisations as any[]) ?? [])
        .map((organisation) => organisation.id)
        .filter(Boolean);
      const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      let pQuery = supabase.from('participants').select('id', { count: 'exact', head: true });
      let recentPQuery = supabase
        .from('participants')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', last7Days);
      let iQuery = supabase.from('items').select('id', { count: 'exact', head: true }).eq('is_active', true);
      let rQuery = supabase.from('registrations').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      let recentRQuery = supabase
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .gte('created_at', last7Days);
      let partsQuery = supabase.from('participants').select('category_code, organisations(name)');
      let schedulesQuery = supabase
        .from('schedules')
        .select('id', { count: 'exact', head: true })
        .in('status', ['scheduled', 'ongoing', 'in_progress']);
      let recentRegistrationsQuery = supabase
        .from('registrations')
        .select(`
          id,
          status,
          created_at,
          participants:participants!registrations_participant_id_fkey(name, organisations(name)),
          leader:participants!registrations_group_leader_participant_id_fkey(name),
          items(item_name_en, item_name_ml),
          organisations(name)
        `)
        .order('created_at', { ascending: false })
        .limit(5);

      if (activeFest?.id) {
        pQuery = pQuery.eq('festival_id', activeFest.id);
        recentPQuery = recentPQuery.eq('festival_id', activeFest.id);
        iQuery = iQuery.eq('festival_id', activeFest.id);
        rQuery = rQuery.eq('festival_id', activeFest.id);
        recentRQuery = recentRQuery.eq('festival_id', activeFest.id);
        partsQuery = partsQuery.eq('festival_id', activeFest.id);
        schedulesQuery = schedulesQuery.eq('festival_id', activeFest.id);
        recentRegistrationsQuery = recentRegistrationsQuery.eq('festival_id', activeFest.id);
      } else {
        pQuery = pQuery.eq('tenant_id', tenantId);
        recentPQuery = recentPQuery.eq('tenant_id', tenantId);
        iQuery = iQuery.eq('tenant_id', tenantId);
        rQuery = rQuery.eq('tenant_id', tenantId);
        recentRQuery = recentRQuery.eq('tenant_id', tenantId);
        partsQuery = partsQuery.eq('tenant_id', tenantId);
        schedulesQuery = schedulesQuery.eq('tenant_id', tenantId);
        recentRegistrationsQuery = recentRegistrationsQuery.eq('tenant_id', tenantId);
      }

      if (organisationIds.length > 0) {
        pQuery = pQuery.in('organisation_id', organisationIds);
        recentPQuery = recentPQuery.in('organisation_id', organisationIds);
        partsQuery = partsQuery.in('organisation_id', organisationIds);
      }

      const [
        pCount,
        recentPCount,
        iCount,
        rCount,
        recentRCount,
        allParts,
        schedulesCount,
        recentRegistrationsResult,
      ] = await Promise.all([
        pQuery,
        recentPQuery,
        iQuery,
        rQuery,
        recentRQuery,
        partsQuery,
        schedulesQuery,
        recentRegistrationsQuery,
      ]);

      const firstError = [
        pCount.error,
        recentPCount.error,
        iCount.error,
        rCount.error,
        recentRCount.error,
        allParts.error,
        schedulesCount.error,
        recentRegistrationsResult.error,
      ].find(Boolean);
      if (firstError) throw firstError;

      const partsData = allParts.data || [];
      const catCountMap: Record<string, number> = {};
      const unitCountMap: Record<string, number> = {};

      partsData.forEach((p: any) => {
        const cat = p.category_code || 'Unknown';
        const unit = p.organisations?.name || 'Unknown';
        catCountMap[cat] = (catCountMap[cat] || 0) + 1;
        unitCountMap[unit] = (unitCountMap[unit] || 0) + 1;
      });

      const categoryGraph = Object.keys(catCountMap).map(k => ({ name: k, count: catCountMap[k] }));
      const unitGraph = Object.keys(unitCountMap).map(k => ({ name: k, count: unitCountMap[k] })).sort((a,b) => b.count - a.count);
      const recentRegistrations = ((recentRegistrationsResult.data as any[]) ?? []).map((registration) => {
        const participant = Array.isArray(registration.participants)
          ? registration.participants[0]
          : registration.participants;
        const item = Array.isArray(registration.items)
          ? registration.items[0]
          : registration.items;
        const organisation = Array.isArray(registration.organisations)
          ? registration.organisations[0]
          : registration.organisations;
        const participantOrganisation = Array.isArray(participant?.organisations)
          ? participant.organisations[0]
          : participant?.organisations;

        return {
          id: registration.id,
          participantName: participant?.name || registration.leader?.name || 'Participant',
          itemName: item?.item_name_en || item?.item_name_ml || 'Festival item',
          organisationName:
            organisation?.name ||
            participantOrganisation?.name ||
            'Organisation not assigned',
          status: registration.status || 'registered',
          createdAt: registration.created_at,
        };
      });

      return {
        data: {
          orgName: org?.name || 'Unknown',
          orgType: org?.org_type || 'Unknown',
          participantsCount: pCount.count || 0,
          participantsLast7Days: recentPCount.count || 0,
          itemsCount: iCount.count || 0,
          pendingRegsCount: rCount.count || 0,
          pendingRegsLast7Days: recentRCount.count || 0,
          activeSchedulesCount: schedulesCount.count || 0,
          categoryGraph,
          unitGraph,
          recentRegistrations,
        },
        error: null
      };
    } catch (err: any) {
      return { data: null, error: normalizeError(err) };
    }
  }

  // --- Schedule & Venue Methods ---
  async listVenues<T>(tenantId: string, festivalId?: string): Promise<ListResult<T>> {
    let query = supabase
      .from('venues')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name');
    if (festivalId) query = query.or(`festival_id.eq.${festivalId},festival_id.is.null`);
    const { data, error } = await query;
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async createVenue<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('venues')
      .insert(payload)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async updateVenue<T>(id: string, payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('venues')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async deleteVenue(id: string): Promise<QueryResult<void>> {
    const { data, error } = await supabase.rpc('safe_delete_venue', {
      p_venue_id: id,
      p_reason: 'Deleted from Schedule Management',
    });
    if (error && error.code !== '42883') return { data: null, error: normalizeError(error) };
    if (!error && data?.status === 'blocked') {
      return { data: null, error: normalizeError({ code: '409', message: data.message || 'Venue has dependent schedules.' }) };
    }
    if (!error) return { data: null, error: null };

    // Compatibility fallback for local databases before the hardening migration.
    const { error: legacyError } = await supabase.from('venues').delete().eq('id', id);
    return { data: null, error: normalizeError(legacyError) };
  }

  async listSchedules<T>(tenantId: string, festivalId?: string): Promise<ListResult<T>> {
    let schedulesQuery = supabase
      .from('schedules')
      .select('*, venues(*), items(*)')
      .eq('tenant_id', tenantId)
      .order('start_time');
    if (festivalId) schedulesQuery = schedulesQuery.eq('festival_id', festivalId);
    const { data, error } = await schedulesQuery;

    if (error || !data) {
      return { data: [], error: normalizeError(error) };
    }

    const { data: assignments, error: assignmentsError } = await supabase
      .from('schedule_judge_assignments')
      .select('schedule_id, judge_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    // Judge assignments are enrichment data for the schedule list. If that
    // secondary read is unavailable (for example because an older production
    // schema/cache does not expose it), do not hide otherwise valid schedules.
    // The schedule itself remains tenant/festival scoped; the UI simply gets
    // an empty assigned-judge list until the enrichment query is available.
    if (assignmentsError) {
      console.warn('[listSchedules] Unable to load judge assignments; returning schedules without panel metadata.', assignmentsError);
      return {
        data: (data as T[]).map((schedule: any) => ({
          ...schedule,
          assigned_judge_ids: [],
        })),
        error: null,
      };
    }

    const judgeIdsBySchedule = new Map<string, string[]>();
    for (const assignment of assignments ?? []) {
      const current = judgeIdsBySchedule.get(assignment.schedule_id) ?? [];
      current.push(assignment.judge_id);
      judgeIdsBySchedule.set(assignment.schedule_id, current);
    }

    const schedulesWithPanels = data.map((schedule) => ({
      ...schedule,
      assigned_judge_ids: judgeIdsBySchedule.get(schedule.id) ?? [],
    }));

    return { data: schedulesWithPanels as T[], error: null };
  }

  async createSchedule<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('schedules')
      .insert(payload)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async createSchedules<T>(festivalId: string, payloads: Record<string, unknown>[]): Promise<ListResult<T>> {
    const { data, error } = await supabase.rpc('bulk_create_schedules', {
      p_festival_id: festivalId,
      p_schedules: payloads,
    });
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async updateSchedule<T>(id: string, payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('schedules')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async deleteSchedule(id: string): Promise<QueryResult<void>> {
    const { data, error } = await supabase.rpc('safe_delete_schedule', {
      p_schedule_id: id,
      p_reason: 'Deleted from Schedule Management',
    });
    if (error && error.code !== '42883') return { data: null, error: normalizeError(error) };
    if (!error && data?.status === 'blocked') {
      return { data: null, error: normalizeError({ code: '409', message: data.message || 'Schedule has dependent operational data.' }) };
    }
    if (!error) return { data: null, error: null };

    // Compatibility fallback for local databases before the hardening migration.
    const { error: legacyError } = await supabase.from('schedules').delete().eq('id', id);
    return { data: null, error: normalizeError(legacyError) };
  }

  // --- Code Letter Management ---
  async getParticipantConflicts(participantIds: string[], currentScheduleId: string, tenantId?: string): Promise<QueryResult<Record<string, Set<string>>>> {
    try {
      if (!participantIds.length) return { data: {}, error: null };

      // 1. Fetch current schedule to get its time
      const { data: currentSchedule, error: err1 } = await supabase
        .from('schedules')
        .select('start_time, end_time, tenant_id, festival_id')
        .eq('id', currentScheduleId)
        .single();
      
      if (err1) throw err1;
      if (!currentSchedule || !currentSchedule.start_time || !currentSchedule.end_time) {
        // If the current event is not scheduled with time, it can't overlap
        return { data: {}, error: null };
      }

      // 2. Fetch all OTHER registrations for these participants that HAVE a code letter assigned
      let otherRegsQuery = supabase
        .from('registrations')
        .select('participant_id, code_letter, item_id')
        .in('participant_id', participantIds)
        .not('code_letter', 'is', null);
      if (tenantId) otherRegsQuery = otherRegsQuery.eq('tenant_id', tenantId);
      if (currentSchedule.festival_id) otherRegsQuery = otherRegsQuery.eq('festival_id', currentSchedule.festival_id);
      const { data: otherRegs, error: err2 } = await otherRegsQuery;

      if (err2) throw err2;

      const itemIds = Array.from(new Set((otherRegs || []).map(r => r.item_id)));
      if (!itemIds.length) return { data: {}, error: null };

      // 3. Fetch schedules for these items
      let schedulesQuery = supabase
        .from('schedules')
        .select('id, item_id, start_time, end_time')
        .in('item_id', itemIds);
      if (tenantId) schedulesQuery = schedulesQuery.eq('tenant_id', tenantId);
      if (currentSchedule.festival_id) schedulesQuery = schedulesQuery.eq('festival_id', currentSchedule.festival_id);
      const { data: schedules, error: err3 } = await schedulesQuery;

      if (err3) throw err3;

      const conflicts: Record<string, Set<string>> = {};
      participantIds.forEach(id => { conflicts[id] = new Set<string>(); });

      const cStart = new Date(currentSchedule.start_time).getTime();
      const cEnd = new Date(currentSchedule.end_time).getTime();

      const itemSchedulesMap: Record<string, any[]> = {};
      (schedules || []).forEach(s => {
        if (!itemSchedulesMap[s.item_id]) itemSchedulesMap[s.item_id] = [];
        itemSchedulesMap[s.item_id].push(s);
      });

      for (const reg of otherRegs || []) {
        const scheds = itemSchedulesMap[reg.item_id] || [];
        for (const s of scheds) {
          if (s.id === currentScheduleId) continue;
          if (!s.start_time || !s.end_time) continue;

          const oStart = new Date(s.start_time).getTime();
          const oEnd = new Date(s.end_time).getTime();

          // Check overlap: oStart < cEnd && oEnd > cStart
          if (oStart < cEnd && oEnd > cStart) {
            conflicts[reg.participant_id].add(reg.code_letter);
            break;
          }
        }
      }

      return { data: conflicts, error: null };
    } catch (error: any) {
      return { data: null, error: normalizeError(error) };
    }
  }

  async updateCodeLetter(registrationId: string, codeLetter: string): Promise<QueryResult<void>> {
    const { error } = await supabase
      .from('registrations')
      .update({ code_letter: codeLetter })
      .eq('id', registrationId);
    return { data: null, error: normalizeError(error) };
  }

  async stageUpdateCodeLetter(scheduleId: string, registrationId: string, codeLetter: string): Promise<QueryResult<unknown>> {
    const { data, error } = await supabase.rpc('stage_update_code_letter', {
      p_schedule_id: scheduleId,
      p_registration_id: registrationId,
      p_code_letter: codeLetter,
    });
    return { data: data ?? null, error: normalizeError(error) };
  }

  // --- Leaderboard Settings & Poster Template Methods ---
  async getLeaderboardSettings<T>(festivalId: string): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('festival_leaderboard_settings')
      .select('*')
      .eq('festival_id', festivalId)
      .maybeSingle();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async upsertLeaderboardSettings<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('festival_leaderboard_settings')
      .upsert(payload, { onConflict: 'tenant_id,festival_id' })
      .select()
      .single();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async getPosterTemplates<T>(festivalId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('poster_templates')
      .select('*')
      .eq('festival_id', festivalId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async upsertPosterTemplate<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('poster_templates')
      .upsert(payload)
      .select()
      .single();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async deletePosterTemplate(templateId: string): Promise<QueryResult<void>> {
    const { error } = await supabase
      .from('poster_templates')
      .delete()
      .eq('id', templateId);

    return { data: null, error: normalizeError(error) };
  }

  async saveGeneratedPoster<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('generated_posters')
      .insert([payload])
      .select()
      .single();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  // --- Super Admin Methods ---
  
  async getSuperAdminStats(): Promise<QueryResult<{ orgs: number; tenants: number }>> {
    const [orgsRes, tenantsRes] = await Promise.all([
      supabase.from('organisations').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('tenant_id', { count: 'exact', head: true }).not('tenant_id', 'is', null),
    ]);
    
    return {
      data: {
        orgs: orgsRes.count ?? 0,
        tenants: tenantsRes.count ?? 0,
      },
      error: normalizeError(orgsRes.error || tenantsRes.error)
    };
  }

  async listGlobalOrganisations<T>(): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('organisations')
      .select('*')
      .order('org_type')
      .order('name');
      
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async createGlobalOrganisation<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('organisations')
      .insert(payload)
      .select()
      .single();
      
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async archiveGlobalOrganisation(id: string): Promise<QueryResult<void>> {
    const { error } = await supabase.rpc('archive_child_organisation', {
      p_org_id: id,
      p_reason: 'Archived from global organisation management',
    });
    return { data: undefined, error: normalizeError(error) };
  }

  async restoreGlobalOrganisation(id: string): Promise<QueryResult<void>> {
    const { error } = await supabase.rpc('restore_child_organisation', {
      p_org_id: id,
      p_reason: 'Restored from global organisation management',
    });
    return { data: undefined, error: normalizeError(error) };
  }

  async permanentlyDeleteArchivedOrganisation(id: string): Promise<QueryResult<void>> {
    const { error } = await supabase.rpc('delete_archived_organisation', {
      p_org_id: id,
    });
    return { data: undefined, error: normalizeError(error) };
  }

  async listTenantAccounts<T>(): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('organisations')
      .select('id, name, org_type, tenant_id, admin_email, tenants!organisations_tenant_id_fkey(access_disabled)')
      .order('created_at', { ascending: false });

    // Ensure query errors are not suppressed and returned as empty arrays.
    if (error) {
      console.error("listTenantAccounts query failed:", error);
      return { data: [], error: normalizeError(error) };
    }

    const flattened = (data ?? []).map((o: any) => {
      const embedded = o.tenants;
      const access_disabled = Array.isArray(embedded)
        ? embedded[0]?.access_disabled ?? false
        : embedded?.access_disabled ?? false;
      return { ...o, access_disabled, tenants: undefined };
    });

    return { data: (flattened as T[]) ?? [], error: null };
  }

  async revokeTenantAccess(orgId: string): Promise<QueryResult<void>> {
    const { data, error } = await supabase.rpc('revoke_tenant_access', { p_org_id: orgId });
    if (error || (data && !data.success)) {
      return { data: undefined, error: normalizeError(error || new Error(data?.error || 'Failed to revoke access')) };
    }
    return { data: undefined, error: null };
  }

  async disableTenantAccess(orgId: string, reason?: string): Promise<QueryResult<void>> {
    const { data, error } = await supabase.rpc('disable_tenant_access', {
      p_org_id: orgId,
      p_reason: reason ?? null,
    });
    if (error || (data && !data.success)) {
      return { data: undefined, error: normalizeError(error || new Error(data?.error || 'Failed to disable tenant access')) };
    }
    return { data: undefined, error: null };
  }

  async enableTenantAccess(orgId: string, reason?: string): Promise<QueryResult<void>> {
    const { data, error } = await supabase.rpc('enable_tenant_access', {
      p_org_id: orgId,
      p_reason: reason ?? null,
    });
    if (error || (data && !data.success)) {
      return { data: undefined, error: normalizeError(error || new Error(data?.error || 'Failed to enable tenant access')) };
    }
    return { data: undefined, error: null };
  }

  async getTenantLeaderboardAgentPrompt<T>(tenantId: string): Promise<QueryResult<T>> {
    const { data, error } = await supabase.rpc('get_tenant_leaderboard_agent_prompt', {
      p_tenant_id: tenantId,
    });
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  // ─── Judge Methods ───────────────────────────────────────────────────────────

  async listJudges<T>(tenantId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('judges')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name');
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async createJudge<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('judges')
      .insert(payload)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async updateJudge<T>(id: string, payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('judges')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async deleteJudge(id: string): Promise<QueryResult<void>> {
    const { error } = await supabase.rpc('delete_judge_safely', {
      p_judge_id: id,
    });
    return { data: undefined, error: normalizeError(error) };
  }

  async listJudgeActivityLogs<T>(tenantId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('judge_activity_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error || !data) {
      return { data: [], error: normalizeError(error) };
    }

    const judgeIds = Array.from(
      new Set(data.map((log: any) => log.judge_id).filter(Boolean))
    );
    const scheduleIds = Array.from(
      new Set(data.map((log: any) => log.schedule_id).filter(Boolean))
    );

    const [
      { data: judgeRows, error: judgesError },
      { data: scheduleRows, error: schedulesError },
    ] = await Promise.all([
      judgeIds.length > 0
        ? supabase.from('judges').select('id, name').in('id', judgeIds)
        : Promise.resolve({ data: [], error: null }),
      scheduleIds.length > 0
        ? supabase
            .from('schedules')
            .select('id, items(item_name_en, item_name_ml, item_code)')
            .in('id', scheduleIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (judgesError || schedulesError) {
      return {
        data: [],
        error: normalizeError(judgesError ?? schedulesError),
      };
    }

    const judgesById = new Map(
      (judgeRows ?? []).map((judge: any) => [judge.id, judge])
    );
    const schedulesById = new Map(
      (scheduleRows ?? []).map((schedule: any) => [schedule.id, schedule])
    );

    const normalizedLogs = (data ?? []).map((log: any) => ({
      ...log,
      // Backward compatibility for databases that created this table with the
      // older generic audit column names.
      action_type: log.action_type ?? log.action ?? 'UNKNOWN',
      action_details: log.action_details ?? log.details ?? log.new_value ?? {},
      actor_type: log.actor_type ?? (log.user_id ? 'admin' : 'system'),
      judges: judgesById.get(log.judge_id) ?? null,
      schedules: schedulesById.get(log.schedule_id) ?? null,
    }));

    return { data: normalizedLogs as T[], error: normalizeError(error) };
  }

  async assignJudgesToSchedule(scheduleId: string, judgeIds: string[]): Promise<QueryResult<void>> {
    const { error } = await supabase.rpc('set_schedule_judges', {
      p_schedule_id: scheduleId,
      p_judge_ids: judgeIds,
    });
    return { data: undefined, error: normalizeError(error) };
  }

  async removeJudgeFromSchedule(
    scheduleId: string,
    judgeId: string,
    force = false
  ): Promise<QueryResult<void>> {
    const { error } = await supabase.rpc('remove_schedule_judge', {
      p_schedule_id: scheduleId,
      p_judge_id: judgeId,
      p_force: force,
    });
    return { data: undefined, error: normalizeError(error) };
  }

  async getScheduleJudges<T>(scheduleId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('schedule_judge_assignments')
      .select('judges(*)')
      .eq('schedule_id', scheduleId)
      .eq('status', 'active');

    const judges = (data ?? [])
      .map((assignment: any) => assignment.judges)
      .filter(Boolean);

    return { data: judges as T[], error: normalizeError(error) };
  }

  // ─── Mark Entry Methods ───────────────────────────────────────────────────────

  async getRegistrationsBySchedule<T>(scheduleId: string): Promise<ListResult<T>> {
    // Use RPC function (SECURITY DEFINER) to bypass RLS.
    // Judge portal is accessed by unauthenticated (anon) users.
    // Direct table queries fail because schedules/registrations/participants have authenticated-only RLS.
    const { data, error } = await supabase.rpc('get_judge_registrations', {
      p_schedule_id: scheduleId,
    });

    if (error) {
      console.error('[getRegistrationsBySchedule] RPC error:', error);
      return { data: [], error: normalizeError(error) };
    }

    const mapped = ((data as any[]) ?? []).map((row) => ({
      id: row.id,
      item_id: row.item_id,
      tenant_id: row.tenant_id,
      code_letter: row.code_letter,
      participants: {
        name: row.participant_name,
        chest_number: row.chest_number,
        photo_url: row.photo_url,
        category_code: row.category_code,
      },
    }));

    return { data: mapped as unknown as T[], error: null };
  }

  async listMarkEntries<T>(scheduleId: string): Promise<ListResult<T>> {
    const { data: assignments, error: assignmentsError } = await supabase
      .from('schedule_judge_assignments')
      .select('judge_id')
      .eq('schedule_id', scheduleId)
      .eq('status', 'active');

    if (assignmentsError) {
      return { data: [], error: normalizeError(assignmentsError) };
    }

    const activeJudgeIds = (assignments ?? []).map((assignment) => assignment.judge_id);
    if (activeJudgeIds.length === 0) {
      return { data: [], error: null };
    }

    const { data, error } = await supabase
      .from('mark_entries')
      .select('*, judges(name)')
      .eq('schedule_id', scheduleId)
      .in('judge_id', activeJudgeIds);
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async upsertMarkEntry<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('mark_entries')
      .upsert(payload, { onConflict: 'schedule_id,judge_id,registration_id' })
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async finalizeMarkEntry(markEntryId: string): Promise<QueryResult<void>> {
    const { error } = await supabase
      .from('mark_entries')
      .update({ is_draft: false, is_final: true, submitted_at: new Date().toISOString() })
      .eq('id', markEntryId);
    return { data: undefined, error: normalizeError(error) };
  }

  async unlockJudgeMarks(scheduleId: string, judgeId: string): Promise<QueryResult<void>> {
    const { error } = await supabase.rpc('unlock_judge_marks', {
      p_schedule_id: scheduleId,
      p_judge_id: judgeId,
    });
    return { data: undefined, error: normalizeError(error) };
  }

  async unlockScheduleMarks(scheduleId: string): Promise<QueryResult<void>> {
    const { error } = await supabase.rpc('unlock_schedule_marks', {
      p_schedule_id: scheduleId,
    });
    return { data: undefined, error: normalizeError(error) };
  }

  async getJudgeRegistrationsByToken<T>(token: string): Promise<ListResult<T>> {
    // Token-bound RPC. The judge, schedule, tenant and festival are derived
    // server-side from the approved token; the caller cannot choose a schedule.
    const { data, error } = await supabase.rpc('get_judge_registrations', {
      p_token: token.toUpperCase().trim(),
    });

    if (error) {
      console.error('[getJudgeRegistrationsByToken] RPC error:', error);
      return { data: [], error: normalizeError(error) };
    }

    const mapped = ((data as any[]) ?? []).map((row) => ({
      id: row.id,
      item_id: row.item_id,
      tenant_id: row.tenant_id,
      code_letter: row.code_letter,
      existing_mark: row.existing_mark ?? null,
      participants: {
        name: row.participant_name,
        chest_number: row.chest_number,
        photo_url: row.photo_url,
        category_code: row.category_code,
      },
    }));

    return { data: mapped as unknown as T[], error: null };
  }

  async submitJudgeMark<T>(payload: {
    token: string;
    registrationId: string;
    criteriaScores: Record<string, number>;
    totalMark: number;
    status: 'draft' | 'final';
    entryMode?: 'criteria' | 'total_only';
    maxMark?: number;
    criteriaSnapshot?: { key: string; label: string; max: number }[];
  }): Promise<QueryResult<T>> {
    // Secure token-bound RPC for draft and final mark writes. The judge,
    // schedule and tenant are derived from the approved token server-side.
    const { data, error } = await supabase.rpc('upsert_judge_mark', {
      p_token: payload.token.toUpperCase().trim(),
      p_registration_id: payload.registrationId,
      p_criteria_scores: payload.criteriaScores ?? {},
      p_total_mark: payload.totalMark,
      p_status: payload.status,
      p_entry_mode: payload.entryMode ?? 'criteria',
      p_max_mark: payload.maxMark ?? null,
      p_criteria_snapshot: payload.criteriaSnapshot ?? [],
    });

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  // ─── Results Methods ───────────────────────────────────────────────────────────

  async listResults<T>(scheduleId: string): Promise<ListResult<T>> {
    const { data: scheduleData, error: scheduleError } = await supabase
      .from('schedules')
      .select('tenant_id, festival_id, item_id')
      .eq('id', scheduleId)
      .single();

    if (scheduleError || !scheduleData) {
      return { data: [], error: normalizeError(scheduleError) };
    }

    const scoped = await supabase
      .from('results')
      .select('*')
      .eq('schedule_id', scheduleId);
    if (!scoped.error) return { data: (scoped.data as T[]) ?? [], error: null };

    // Compatibility with databases before migration 143. This fallback is
    // intentionally tenant + festival + item scoped, never item-only.
    const legacy = await supabase
      .from('results')
      .select('*')
      .eq('tenant_id', scheduleData.tenant_id)
      .eq('festival_id', scheduleData.festival_id)
      .eq('item_id', scheduleData.item_id);
    return { data: (legacy.data as T[]) ?? [], error: normalizeError(legacy.error) };
  }

  async publishResults(input: CompetitionPublication): Promise<QueryResult<void>> {
    const { error } = await supabase.rpc('publish_competition_results', {
      ...competitionArguments(input), p_request_id: input.requestId,
    });
    return { data: undefined, error: normalizeError(error) };
  }

  async getLeaderboardPreview<T>(
    tenantId?: string | null,
    festivalId?: string | null,
    rankingMode?: string,
    itemLimit?: number | null,
    usePublicOnly: boolean = false,
  ): Promise<ListResult<T>> {
    const { data, error } = await supabase.rpc('get_leaderboard_preview', {
      p_tenant_id: tenantId ?? null,
      p_festival_id: festivalId ?? null,
      p_ranking_mode: rankingMode ?? 'ALL',
      p_item_limit: itemLimit ?? null,
      p_use_public_only: usePublicOnly,
    });
    return { data: data as T[], error: normalizeError(error) };
  }

  async listPublicLeaderboard<T>(
    tenantId?: string | null,
    festivalId?: string | null,
  ): Promise<ListResult<T>> {
    let { data, error } = await supabase.rpc('get_public_leaderboard_scoped', {
      p_tenant_id: tenantId ?? null,
      p_festival_id: festivalId ?? null,
    });

    // Keep older environments usable until migration 146 is applied. The
    // fallback still receives both scope identifiers; it never auto-detects a
    // global festival from this tenant-scoped call site.
    if (error && ['PGRST202', '42883'].includes((error as any).code)) {
      ({ data, error } = await supabase.rpc('get_public_leaderboard', {
        p_tenant_id: tenantId ?? null,
        p_festival_id: festivalId ?? null,
      }));
    }

    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async listAdminLeaderboard<T>(
    tenantId?: string | null,
    festivalId?: string | null,
  ): Promise<ListResult<T>> {
    const { data, error } = await supabase.rpc('get_admin_leaderboard', {
      p_tenant_id: tenantId ?? null,
      p_festival_id: festivalId ?? null,
    });

    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async listPublicPublishedResults<T>(
    tenantId?: string | null,
    festivalId?: string | null,
    includeParticipantDetails = true,
  ): Promise<ListResult<T>> {
    let { data, error } = await supabase.rpc('get_public_published_results_scoped', {
      p_tenant_id: tenantId ?? null,
      p_festival_id: festivalId ?? null,
      p_include_participant_details: includeParticipantDetails,
    });

    if (error && ['PGRST202', '42883'].includes((error as any).code)) {
      ({ data, error } = await supabase.rpc('get_public_published_results', {
        p_tenant_id: tenantId ?? null,
        p_festival_id: festivalId ?? null,
        p_include_participant_details: includeParticipantDetails,
      }));
    }

    if (error || !data) {
      return { data: [], error: normalizeError(error) };
    }

    // Fetch item_codes for these results
    const itemIds = Array.from(new Set(data.map((r: any) => r.item_id).filter(Boolean)));
    let itemCodeMap: Record<string, string> = {};
    if (itemIds.length > 0) {
      const { data: itemsData } = await supabase
        .from('items')
        .select('id, item_code')
        .in('id', itemIds);
      if (itemsData) {
        itemsData.forEach((itm) => {
          itemCodeMap[itm.id] = itm.item_code;
        });
      }
    }

    const mappedData = data.map((row: any) => ({
      ...row,
      item_code: itemCodeMap[row.item_id] || '',
    }));

    return { data: (mappedData as T[]) ?? [], error: null };
  }

  async getPublicLeaderboardSettings<T>(
    tenantId?: string | null,
    festivalId?: string | null,
  ): Promise<QueryResult<T>> {
    const { data, error } = await supabase.rpc('get_public_leaderboard_settings', {
      p_tenant_id: tenantId ?? null,
      p_festival_id: festivalId ?? null,
    });

    return { data: ((data as T[]) ?? [])[0] ?? null, error: normalizeError(error) };
  }

  // ─── Result Visibility Management ────────────────────────────────────────────

  async listFestivalResults<T>(
    tenantId?: string | null,
    festivalId?: string | null,
  ): Promise<ListResult<T>> {
    return this.listAdminPublishedResults<T>(tenantId, festivalId);
  }

  async listAdminPublishedResults<T>(
    tenantId?: string | null,
    festivalId?: string | null,
  ): Promise<ListResult<T>> {
    const { data, error } = await supabase.rpc('get_admin_published_results', {
      p_tenant_id: tenantId ?? null,
      p_festival_id: festivalId ?? null,
    });
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async updateResultVisibility(
    resultId: string,
    status: 'draft' | 'ready' | 'published' | 'hidden' | 'archived',
  ): Promise<QueryResult<void>> {
    const updatePayload: Record<string, unknown> = {};
    if (status === 'published') {
      updatePayload.result_status = 'published';
      updatePayload.published = true;
      updatePayload.published_at = new Date().toISOString();
      updatePayload.public_visible = true;
    }
    if (status === 'hidden') {
      updatePayload.public_visible = false;
    }
    if (status === 'archived') {
      updatePayload.result_status = 'archived';
      updatePayload.published = false;
      updatePayload.published_at = null;
      updatePayload.public_visible = false;
    }
    if (status === 'draft' || status === 'ready') {
      updatePayload.result_status = status;
      updatePayload.public_visible = false;
      updatePayload.published = false;
      updatePayload.published_at = null;
    }

    const { error } = await supabase
      .from('results')
      .update(updatePayload)
      .eq('id', resultId);
    return { data: undefined, error: normalizeError(error) };
  }

  async bulkUpdateResultVisibility(
    resultIds: string[],
    status: 'draft' | 'ready' | 'published' | 'hidden' | 'archived',
  ): Promise<QueryResult<void>> {
    if (resultIds.length === 0) return { data: undefined, error: null };
    const updatePayload: Record<string, unknown> = {};
    if (status === 'published') {
      updatePayload.result_status = 'published';
      updatePayload.published = true;
      updatePayload.published_at = new Date().toISOString();
      updatePayload.public_visible = true;
    }
    if (status === 'hidden') {
      updatePayload.public_visible = false;
    }
    if (status === 'archived') {
      updatePayload.result_status = 'archived';
      updatePayload.published = false;
      updatePayload.published_at = null;
      updatePayload.public_visible = false;
    }
    if (status === 'draft' || status === 'ready') {
      updatePayload.result_status = status;
      updatePayload.public_visible = false;
      updatePayload.published = false;
      updatePayload.published_at = null;
    }

    const { error } = await supabase
      .from('results')
      .update(updatePayload)
      .in('id', resultIds);
    return { data: undefined, error: normalizeError(error) };
  }

  // ─── Judge Token Methods ──────────────────────────────────────────────────────


  async generateJudgeToken<T>(payload: {
    judgeId: string;
    scheduleId: string;
    tenantId: string;
    createdBy: string;
    forceRefresh?: boolean;
  }): Promise<QueryResult<T>> {
    // Use RPC function to bypass PostgREST schema cache issues
    const { data, error } = await supabase.rpc('generate_judge_token', {
      p_tenant_id: payload.tenantId,
      p_judge_id: payload.judgeId,
      p_schedule_id: payload.scheduleId,
      p_created_by: payload.createdBy && payload.createdBy.length === 36 ? payload.createdBy : null,
      p_force_refresh: payload.forceRefresh ?? false,
    });

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async validateJudgeToken<T>(token: string): Promise<QueryResult<T>> {
    // Use RPC function (SECURITY DEFINER) to bypass RLS.
    // Judge portal is accessed by unauthenticated (anon) users.
    // Direct table joins fail because schedules/judges/venues have authenticated-only RLS.
    const { data, error } = await supabase.rpc('validate_judge_token', {
      p_token: token.toUpperCase().trim(),
    });

    if (error) {
      console.error('[validateJudgeToken] RPC error:', error);
      return {
        data: null,
        error: { message: `DB Error: ${error.message}` },
      };
    }

    if (!data) {
      return {
        data: null,
        error: { message: 'Invalid or expired access code. Please contact the administrator.' },
      };
    }

    return { data: (data as T), error: null };
  }

  async expireJudgeToken(token: string): Promise<QueryResult<void>> {
    const { error } = await supabase.rpc('expire_judge_token', {
      p_token: token.toUpperCase().trim(),
    });
    return { data: undefined, error: normalizeError(error) };
  }

  async logJudgeActivity(payload: { judgeId: string; scheduleId: string; tenantId: string; actionType: string; actionDetails: Record<string, any>; token?: string }): Promise<QueryResult<void>> {
    const { error } = await supabase.rpc('log_judge_activity', {
      p_judge_id: payload.judgeId,
      p_schedule_id: payload.scheduleId,
      p_tenant_id: payload.tenantId,
      p_action_type: payload.actionType,
      p_action_details: payload.actionDetails,
      p_token: payload.token ?? null,
    });
    return { data: undefined, error: normalizeError(error) };
  }



  async listJudgeTokens<T>(scheduleId: string): Promise<ListResult<T>> {
    const { data: tokens, error } = await supabase
      .from('judge_tokens')
      .select('*')
      .eq('schedule_id', scheduleId)
      .order('created_at', { ascending: false });

    if (error || !tokens?.length) {
      return { data: (tokens as T[]) ?? [], error: normalizeError(error) };
    }

    const judgeIds = [...new Set(tokens.map((token: any) => token.judge_id).filter(Boolean))];
    if (judgeIds.length === 0) {
      return { data: tokens as T[], error: null };
    }

    const { data: judges, error: judgesError } = await supabase
      .from('judges')
      .select('id, name')
      .in('id', judgeIds);

    if (judgesError) {
      return { data: [], error: normalizeError(judgesError) };
    }

    const judgesById = new Map((judges ?? []).map((judge: any) => [judge.id, judge]));
    const joined = tokens.map((token: any) => ({
      ...token,
      judges: judgesById.get(token.judge_id) ?? null,
    }));
    return { data: joined as T[], error: null };
  }

  async getJudgeSubmissionSummary<T>(scheduleId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .rpc('get_judge_submission_summary', { p_schedule_id: scheduleId });
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async getScheduleReadiness<T>(scheduleId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .rpc('get_schedule_readiness', { p_schedule_id: scheduleId });
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async previewBulkUnitAssignment(participantIds: string[], targetUnitId: string, tenantId: string): Promise<ListResult<any>> {
    const { data, error } = await supabase
      .rpc('preview_bulk_unit_assignment', {
        p_participant_ids: participantIds,
        p_target_unit_id: targetUnitId,
        p_tenant_id: tenantId
      });
    return { data: data ?? [], error: normalizeError(error) };
  }

  async executeBulkUnitAssignment(
    participantIds: string[],
    expectedHashes: string[],
    targetUnitId: string,
    batchId: string,
    tenantId: string
  ): Promise<QueryResult<any>> {
    const { data, error } = await supabase
      .rpc('execute_bulk_unit_assignment', {
        p_participant_ids: participantIds,
        p_expected_hashes: expectedHashes,
        p_target_unit_id: targetUnitId,
        p_batch_id: batchId,
        p_tenant_id: tenantId
      });
    return { data: data ?? null, error: normalizeError(error) };
  }

  async rollbackUnitAssignment(batchId: string): Promise<QueryResult<any>> {
    const { data, error } = await supabase
      .rpc('rollback_unit_assignment', { p_batch_id: batchId });
    return { data: data ?? null, error: normalizeError(error) };
  }

  async listParticipantUnitAuditLogs<T>(): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('participant_unit_audit_logs')
      .select('*, participants(name, chest_number), old_unit:organisations!old_unit_id(name), new_unit:organisations!new_unit_id(name)')
      .order('changed_at', { ascending: false });
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async listParticipantUnitBatches<T>(tenantId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('participant_unit_batches')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('started_at', { ascending: false });
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async createParticipantUnitBatch<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('participant_unit_batches')
      .insert(payload)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async updateParticipantUnitBatch<T>(id: string, updates: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('participant_unit_batches')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async createSystemEvent<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('system_events')
      .insert(payload)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  // Junior Dataset Import
  async createImportSession<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('import_sessions')
      .insert(payload)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async updateImportSession<T>(id: string, updates: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('import_sessions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async executeJuniorImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>> {
    const { data, error } = await supabase.rpc('execute_junior_import_chunk', {
      p_tenant_id: payload.tenant_id,
      p_festival_id: payload.festival_id,
      p_session_id: payload.session_id,
      p_participants: payload.participants
    });
    return { data, error: normalizeError(error) };
  }

  async executeSeniorImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>> {
    const { data, error } = await supabase.rpc('execute_senior_import_chunk', {
      p_tenant_id: payload.tenant_id,
      p_festival_id: payload.festival_id,
      p_session_id: payload.session_id,
      p_participants: payload.participants
    });
    return { data, error: normalizeError(error) };
  }

  async executeUpperPrimaryImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>> {
    const { data, error } = await supabase.rpc('execute_upper_primary_import_chunk', {
      p_tenant_id: payload.tenant_id,
      p_festival_id: payload.festival_id,
      p_session_id: payload.session_id,
      p_participants: payload.participants
    });
    return { data, error: normalizeError(error) };
  }

  async executeLpImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>> {
    const { data, error } = await supabase.rpc('execute_lp_import_chunk', {
      p_tenant_id: payload.tenant_id,
      p_festival_id: payload.festival_id,
      p_session_id: payload.session_id,
      p_participants: payload.participants
    });
    return { data, error: normalizeError(error) };
  }

  async executeHsImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>> {
    const { data, error } = await supabase.rpc('execute_hs_import_chunk', {
      p_tenant_id: payload.tenant_id,
      p_festival_id: payload.festival_id,
      p_session_id: payload.session_id,
      p_participants: payload.participants
    });
    return { data, error: normalizeError(error) };
  }

  async executeHssImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>> {
    const { data, error } = await supabase.rpc('execute_hss_import_chunk', {
      p_tenant_id: payload.tenant_id,
      p_festival_id: payload.festival_id,
      p_session_id: payload.session_id,
      p_participants: payload.participants
    });
    return { data, error: normalizeError(error) };
  }

  async executeGeneralImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>> {
    const { data, error } = await supabase.rpc('execute_general_import_chunk', {
      p_tenant_id: payload.tenant_id,
      p_festival_id: payload.festival_id,
      p_session_id: payload.session_id,
      p_participants: payload.participants
    });
    return { data, error: normalizeError(error) };
  }

  async executeScheduleImportChunk(payload: { tenant_id: string; festival_id: string; schedules: any[] }): Promise<QueryResult<any>> {
    const { data, error } = await supabase.rpc('execute_schedule_import_chunk', {
      p_tenant_id: payload.tenant_id,
      p_festival_id: payload.festival_id,
      p_schedules: payload.schedules
    });
    return { data, error: normalizeError(error) };
  }

  async validateChestNumbers(festivalId: string, chestNumbers: string[]): Promise<ListResult<{ chest_number: string; name: string }>> {
    const { data, error } = await supabase
      .from('participants')
      .select('chest_number, name')
      .eq('festival_id', festivalId)
      .in('chest_number', chestNumbers);
    return { data: data ?? [], error: normalizeError(error) };
  }
}
