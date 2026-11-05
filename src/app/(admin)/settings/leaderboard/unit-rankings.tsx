import { coreColor, coreAlpha } from '@/constants/coreTheme';
import { ui } from "@/constants/designSystem";
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  ChevronDown,
  MoreHorizontal,
  RefreshCw,
  Rocket,
  ShieldCheck,
} from 'lucide-react-native';
import { useAdminLeaderboard } from '../../../../core/hooks/useAdminLeaderboard';
import { useFestival } from '../../../../core/hooks/useFestival';
import {
  useGetLeaderboardSettings,
  useUpdateLeaderboardSettings,
} from '../../../../core/hooks/useLeaderboardSettings';
import { useAuthStore } from '../../../../core/store/authStore';
import { LeaderboardRow } from '../../../../services/leaderboardService';
import { LeaderboardSettings } from '../../../../services/leaderboardSettingsService';

const colors = {
  navy: ui.colors.primaryHover,
  blue: ui.colors.primary,
  cyan: ui.colors.info,
  teal: ui.colors.primary,
  green: ui.colors.success,
  bg: ui.colors.background,
  card: ui.colors.surface,
  border: ui.colors.border,
  text: ui.colors.text,
  muted: ui.colors.textMuted,
  soft: ui.colors.infoSoft,
};

const rankPalette = ['#F59E0B', ui.colors.textSubtle, '#B45309'];

type UiLeaderboardRow = LeaderboardRow & {
  district: string;
  movement: number;
};

const formatNumber = (value: number) => new Intl.NumberFormat('en-IN').format(value);

const formatDateTime = (value: string | null) => {
  if (!value) return 'Awaiting first publish';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const getDistrictLabel = (row: LeaderboardRow) => {
  if (row.organisation_type?.toLowerCase().includes('district')) return row.organisation_name;
  return 'Festos District';
};

const RankBadge = ({ rank }: { rank: number }) => {
  const isTop = rank <= 3;
  return (
    <View
      style={[
        styles.rankBadge,
        isTop && { backgroundColor: `${rankPalette[rank - 1]}18`, borderColor: rankPalette[rank - 1] },
      ]}
    >
      <Text style={[styles.rankBadgeText, isTop && { color: rankPalette[rank - 1] }]}>#{rank}</Text>
    </View>
  );
};

export default function UnitRankingsPage() {
  const { tenant_id } = useAuthStore();
  const { width } = useWindowDimensions();
  const isMobile = width < 760;

  // Load active festival ID
  const { useActiveFestival } = useFestival();
  const { data: activeFestival, isLoading: isFestivalLoading } = useActiveFestival();
  const festivalId = activeFestival?.id;

  const { data = [], isLoading: isLeaderboardLoading, isRefetching, refetch } = useAdminLeaderboard(tenant_id, festivalId);

  const isLoading = isLeaderboardLoading || isFestivalLoading;

  const rows = useMemo<UiLeaderboardRow[]>(() => {
    return data.map((row, index) => ({
      ...row,
      district: getDistrictLabel(row),
      movement: 0,
    }));
  }, [data]);

  const renderTable = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={coreColor(colors.teal, 'primaryText')} />
          <Text style={styles.loadingText}>Loading leaderboard control data</Text>
        </View>
      );
    }

    if (isMobile) {
      return (
        <View style={{ gap: 12 }}>
          {rows.map((row, index) => (
            <View key={row.organisation_id ?? row.organisation_name} style={styles.mobileRowCard}>
              <View style={styles.mobileRowHeader}>
                <RankBadge rank={index + 1} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.unitName}>{row.organisation_name}</Text>
                  <Text style={styles.unitMeta}>{row.district}</Text>
                </View>
                <Text style={styles.pointsValue}>{formatNumber(row.total_points)}</Text>
              </View>
              <View style={styles.mobileRowFooter}>
                <Text style={styles.mobileStat}>{row.first_place_count} wins</Text>
                <Text style={styles.mobileStat}>{row.result_count} events</Text>
              </View>
            </View>
          ))}
        </View>
      );
    }

    return (
      <View>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, { flex: 0.7 }]}>Rank</Text>
          <Text style={[styles.th, { flex: 2.2 }]}>Unit</Text>
          <Text style={[styles.th, { flex: 1.5 }]}>District</Text>
          <Text style={[styles.th, { flex: 1.1 }]}>Events Won</Text>
          <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>Total Points</Text>
          <Text style={[styles.th, { flex: 0.5, textAlign: 'right' }]} />
        </View>
        {rows.map((row, index) => (
          <View key={row.organisation_id ?? row.organisation_name} style={styles.tableRow}>
            <View style={{ flex: 0.7 }}>
              <RankBadge rank={index + 1} />
            </View>
            <View style={{ flex: 2.2 }}>
              <Text style={styles.unitName}>{row.organisation_name}</Text>
              <Text style={styles.unitMeta}>{row.result_count} counted results</Text>
            </View>
            <Text style={[styles.td, { flex: 1.5 }]}>{row.district}</Text>
            <Text style={[styles.tdStrong, { flex: 1.1 }]}>{row.first_place_count}</Text>
            <Text style={[styles.pointsValue, { flex: 1.2, textAlign: 'right' }]}>
              {formatNumber(row.total_points)}
            </Text>
            <TouchableOpacity style={{ flex: 0.5, alignItems: 'flex-end' }}>
              <MoreHorizontal size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.workbench}>
      <View style={styles.tableCard}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Unit Rankings</Text>
            <Text style={styles.cardSubTitle}>
              Published team/unit scores, ordered by total points.
            </Text>
          </View>
          <TouchableOpacity onPress={() => refetch()} style={styles.secondaryAction}>
            <RefreshCw size={16} color={coreColor(colors.teal, 'primaryText')} />
            {!isMobile && (
              <Text style={styles.secondaryActionText}>
                {isRefetching ? 'Refreshing' : 'Refresh'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
        {renderTable()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingBox: {
    paddingVertical: 46,
    alignItems: 'center',
  },
  loadingText: {
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    marginTop: 10,
  },
  workbench: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'flex-start',
    width: '100%',
  },
  workbenchStacked: {
    flexDirection: 'column',
  },
  tableCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: ui.shadow.shadowColor,
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  cardHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  cardTitle: {
    color: colors.text,
    fontFamily: 'Poppins_900Black',
    fontSize: 20,
  },
  cardSubTitle: {
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  secondaryAction: {
    height: 38,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: ui.colors.background,
  },
  secondaryActionText: {
    color: coreColor(colors.teal, 'primaryText'),
    fontFamily: 'Poppins_700Bold',
    fontSize: 12,
  },
  tableHeader: {
    minHeight: 44,
    backgroundColor: ui.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  th: {
    color: colors.muted,
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  tableRow: {
    minHeight: 74,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: ui.colors.border,
  },
  rankBadge: {
    alignSelf: 'flex-start',
    minWidth: 46,
    height: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    color: coreColor(colors.navy, 'primaryText'),
    fontFamily: 'Poppins_900Black',
    fontSize: 13,
  },
  unitName: {
    color: colors.text,
    fontFamily: 'Poppins_700Bold',
    fontSize: 14,
  },
  unitMeta: {
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  td: {
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
  },
  tdStrong: {
    color: colors.text,
    fontFamily: 'Poppins_700Bold',
    fontSize: 14,
  },
  pointsValue: {
    color: coreColor(colors.blue, 'primaryText'),
    fontFamily: 'Poppins_900Black',
    fontSize: 18,
  },
  changePill: {
    minWidth: 44,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  changePillText: {
    fontFamily: 'Poppins_900Black',
    fontSize: 12,
  },
  mobileRowCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: ui.colors.surface,
    padding: 14,
  },
  mobileRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mobileRowFooter: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: ui.colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mobileStat: {
    color: colors.muted,
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
  },
  controlPanel: {
    width: 320,
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    shadowColor: ui.shadow.shadowColor,
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  controlPanelWide: {
    width: '100%',
  },
  controlTitle: {
    color: colors.text,
    fontFamily: 'Poppins_900Black',
    fontSize: 18,
  },
  controlSub: {
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 16,
  },
  controlList: {
    marginBottom: 12,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: ui.colors.border,
  },
  controlLabel: {
    color: colors.text,
    fontFamily: 'Poppins_700Bold',
    fontSize: 13,
  },
  controlHint: {
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    marginTop: 1,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 12,
    backgroundColor: ui.colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 6,
    marginBottom: 6,
  },
  dropdownValue: {
    color: colors.text,
    fontFamily: 'Poppins_700Bold',
    fontSize: 12,
    marginTop: 2,
  },
  textInput: {
    backgroundColor: ui.colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
  },
  actionBlock: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  blockTitle: {
    color: colors.muted,
    fontFamily: 'Poppins_700Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  primaryAction: {
    height: 44,
    borderRadius: 13,
    backgroundColor: colors.teal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: colors.teal,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  primaryActionText: {
    color: ui.colors.onPrimary,
    fontFamily: 'Poppins_700Bold',
    fontSize: 13,
  },
  outlineAction: {
    height: 42,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.teal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  outlineActionText: {
    color: coreColor(colors.teal, 'primaryText'),
    fontFamily: 'Poppins_700Bold',
    fontSize: 13,
  },
  summaryBlock: {
    marginTop: 16,
    padding: 12,
    borderRadius: 14,
    backgroundColor: ui.colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  summaryLabel: {
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
  },
  summaryValue: {
    color: colors.text,
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
  },
  infoStrip: {
    marginTop: 24,
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.soft,
    borderWidth: 1,
    borderColor: coreAlpha(coreColor('#16b8d9', 'border'), 0.18),
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: ui.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    flex: 1,
    color: coreColor('#0F5868', 'info'),
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
});
