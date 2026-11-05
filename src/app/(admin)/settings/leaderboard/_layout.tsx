import { coreColor, coreAlpha } from '@/constants/coreTheme';
import { ui } from "@/constants/designSystem";
import { ConsoliumLogo } from '@/components/ui/ConsoliumLogo';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Slot, useRouter, usePathname } from 'expo-router';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Eye,
  Image,
  Download,
  ListFilter,
  Radio,
  ShieldCheck,
  Trophy,
  UserRound,
  Users,
  X,
  Zap,
} from 'lucide-react-native';
import { useAdminLeaderboard } from '../../../../core/hooks/useAdminLeaderboard';
import { useFestival } from '../../../../core/hooks/useFestival';
import {
  useGetLeaderboardSettings,
} from '../../../../core/hooks/useLeaderboardSettings';
import { useResultVisibility } from '../../../../core/hooks/useResultVisibility';
import { useAuthStore } from '../../../../core/store/authStore';
import { LeaderboardRow } from '../../../../services/leaderboardService';

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

const Sidebar = ({
  compact,
  onClose,
  activeItem,
}: {
  compact: boolean;
  onClose?: () => void;
  activeItem: 'unit' | 'item' | 'individual' | 'poster' | 'media-center' | 'controls';
}) => {
  const router = useRouter();

  return (
    <LinearGradient colors={[colors.navy, coreColor('#082B4B', 'infoSoft')]} style={styles.sidebar}>
      <View>
        <View style={styles.brandRow}>
          <View style={styles.logoMark}>
            <ConsoliumLogo size={42} borderRadius={13} />
          </View>
          {!compact && (
            <View style={{ flex: 1 }}>
              <Text style={styles.brandTitle}>Festos</Text>
              <Text style={styles.brandYear}>2026 Admin</Text>
            </View>
          )}
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.mobileClose}>
              <X size={18} color={coreColor("#D6F7FF", 'textMuted')} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.navBlock}>
          <TouchableOpacity
            onPress={() => {
              router.push('/(admin)/settings/leaderboard/unit-rankings');
              onClose?.();
            }}
            style={[styles.navItem, activeItem === 'unit' && styles.navItemActive, compact && styles.navItemCompact]}
          >
            <BarChart3 size={20} color={ui.colors.onPrimary} />
            {!compact && <Text style={activeItem === 'unit' ? styles.navTextActive : styles.navTextInactive}>Unit Rankings</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              router.push('/(admin)/settings/leaderboard/controls');
              onClose?.();
            }}
            style={[styles.navItem, activeItem === 'controls' && styles.navItemActive, compact && styles.navItemCompact]}
          >
            <ShieldCheck size={20} color={ui.colors.onPrimary} />
            {!compact && <Text style={activeItem === 'controls' ? styles.navTextActive : styles.navTextInactive}>Leaderboard Controls</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              router.push('/(admin)/settings/leaderboard/item-results');
              onClose?.();
            }}
            style={[styles.navItem, activeItem === 'item' && styles.navItemActive, compact && styles.navItemCompact]}
          >
            <ListFilter size={20} color={ui.colors.onPrimary} />
            {!compact && <Text style={activeItem === 'item' ? styles.navTextActive : styles.navTextInactive}>Item Results</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              router.push('/(admin)/settings/leaderboard/individual-rankings');
              onClose?.();
            }}
            style={[styles.navItem, activeItem === 'individual' && styles.navItemActive, compact && styles.navItemCompact]}
          >
            <Users size={20} color={ui.colors.onPrimary} />
            {!compact && <Text style={activeItem === 'individual' ? styles.navTextActive : styles.navTextInactive}>Individual Rankings</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              router.push('/(admin)/settings/leaderboard/poster-studio');
              onClose?.();
            }}
            style={[styles.navItem, activeItem === 'poster' && styles.navItemActive, compact && styles.navItemCompact]}
          >
            <Image size={20} color={ui.colors.onPrimary} />
            {!compact && <Text style={activeItem === 'poster' ? styles.navTextActive : styles.navTextInactive}>Poster Studio</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              router.push('/(admin)/settings/leaderboard/media-center');
              onClose?.();
            }}
            style={[styles.navItem, activeItem === 'media-center' && styles.navItemActive, compact && styles.navItemCompact]}
          >
            <Download size={20} color={ui.colors.onPrimary} />
            {!compact && <Text style={activeItem === 'media-center' ? styles.navTextActive : styles.navTextInactive}>Media Center</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.profileBox, compact && styles.profileBoxCompact]}>
        <View style={styles.profileAvatar}>
          <UserRound size={18} color={colors.cyan} />
        </View>
        {!compact && (
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>Festival Admin</Text>
            <Text style={styles.profileRole}>Leaderboard Control</Text>
          </View>
        )}
        {!compact && (
          <TouchableOpacity onPress={() => router.push('/(admin)/settings')}>
            <Text style={styles.profileLogout}>Back</Text>
          </TouchableOpacity>
        )}
      </View>
    </LinearGradient>
  );
};

const MetricCard = ({
  cardWidth,
  label,
  value,
  tone,
  icon,
  sub,
  valueColor,
}: {
  cardWidth: number | `${number}%`;
  label: string;
  value: string;
  tone: string;
  icon: React.ReactNode;
  sub?: string;
  valueColor?: string;
}) => (
  <View style={[styles.metricCard, { width: cardWidth, flexBasis: cardWidth }]}>
    <View style={styles.metricTop}>
      <View style={[styles.metricIcon, { backgroundColor: `${tone}14` }]}>{icon}</View>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
    <Text style={[styles.metricValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>{value}</Text>
    {sub && <Text style={styles.metricSub}>{sub}</Text>}
  </View>
);

export default function LeaderboardLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { tenant_id } = useAuthStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1180;
  const isMobile = width < 760;

  const activeItem = useMemo(() => {
    if (pathname.includes('individual-rankings')) return 'individual';
    if (pathname.includes('item-results')) return 'item';
    if (pathname.includes('poster-studio')) return 'poster';
    if (pathname.includes('media-center')) return 'media-center';
    if (pathname.includes('controls')) return 'controls';
    return 'unit';
  }, [pathname]);

  // Load active festival ID
  const { useActiveFestival } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const festivalId = activeFestival?.id;

  // Load database settings
  const { data: settings } = useGetLeaderboardSettings(festivalId);

  const isPublicVisible = settings?.is_public_visible ?? false;
  const autoRefreshEnabled = settings?.auto_refresh_enabled ?? false;
  const autoRefreshInterval = settings?.auto_refresh_interval ?? 30;

  const { data: leaderboardData = [] } = useAdminLeaderboard(festivalId ? tenant_id : null, festivalId);
  const { results: festivalResults = [] } = useResultVisibility(festivalId ? tenant_id : null, festivalId);

  const rows = useMemo(() => {
    return leaderboardData.map((row) => ({
      ...row,
      district: getDistrictLabel(row),
    }));
  }, [leaderboardData]);

  const latestUpdate = rows.reduce<string | null>((latest, row) => {
    if (!row.latest_published_at) return latest;
    if (!latest || new Date(row.latest_published_at) > new Date(latest)) return row.latest_published_at;
    return latest;
  }, null);

  const totalPoints = rows.reduce((sum, row) => sum + row.total_points, 0);
  const eventsCounted = rows.reduce((sum, row) => sum + row.result_count, 0);
  const totalWins = rows.reduce((sum, row) => sum + row.first_place_count, 0);

  const publicItemsCount = useMemo(() => {
    const publicItems = new Set<string>();
    festivalResults.forEach(r => {
      if (r.public_visible === true && r.item_id) {
        publicItems.add(r.item_id);
      }
    });
    return publicItems.size;
  }, [festivalResults]);


  const pageTitle = useMemo(() => {
    if (activeItem === 'individual') return 'Individual Rankings';
    if (activeItem === 'item') return 'Item Results';
    if (activeItem === 'controls') return 'Leaderboard Controls';
    return 'Unit Rankings';
  }, [activeItem]);

  const contentMaxWidth = isDesktop ? undefined : 980;
  const metricCardWidth: number | `${number}%` = isMobile
    ? 220
    : width >= 1650
      ? '18%'
      : width >= 1380
        ? '22%'
        : width >= 1180
          ? '30%'
          : '47%';

  return (
    <View style={styles.page}>
      <View style={[styles.main, (activeItem === 'poster' || activeItem === 'media-center') && { padding: 0, paddingHorizontal: 0, overflow: 'hidden' }]}>
        {activeItem === 'poster' || activeItem === 'media-center' ? (
          <Slot />
        ) : (
          <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}>
            <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <TouchableOpacity onPress={() => router.push('/(admin)')} style={styles.menuButton}>
                <ArrowLeft size={21} color={coreColor(colors.navy, 'primaryText')} />
              </TouchableOpacity>
              <View>
                <Text style={styles.eyebrow}>Festos</Text>
                <Text style={styles.pageTitle}>{pageTitle}</Text>
              </View>
            </View>
            <View style={styles.headerActions}>
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Live</Text>
              </View>
              {!isMobile && (
                <Text style={styles.updatedText}>Updated {formatDateTime(latestUpdate)}</Text>
              )}
              <TouchableOpacity
                onPress={() => router.push({
                  pathname: '/(public)/leaderboard',
                  params: { tenant_id: tenant_id ?? '' },
                } as any)}
                style={styles.previewButton}
              >
                <Eye size={17} color={ui.colors.onPrimary} />
                {!isMobile && <Text style={styles.previewButtonText}>Preview</Text>}
              </TouchableOpacity>
            </View>
          </View>

          {isMobile && (
            <Text style={[styles.updatedText, { marginTop: -10, marginBottom: 16 }]}>
              Updated {formatDateTime(latestUpdate)}
            </Text>
          )}

          <ScrollView
            horizontal={isMobile}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.metricsGrid, isMobile ? styles.metricsGridMobile : styles.metricsGridWrap]}
          >
            <MetricCard
              cardWidth={metricCardWidth}
              label="Units Included"
              value={formatNumber(rows.length)}
              sub="Unit ranking only"
              tone={colors.cyan}
              icon={<ShieldCheck size={19} color={colors.cyan} />}
            />
            <MetricCard
              cardWidth={metricCardWidth}
              label="Total Points Distributed"
              value={formatNumber(totalPoints)}
              sub="Published results"
              tone={colors.teal}
              icon={<Zap size={19} color={coreColor(colors.teal, 'primaryText')} />}
            />
            <MetricCard
              cardWidth={metricCardWidth}
              label="Publicly Published"
              value={formatNumber(publicItemsCount)}
              sub="Items on public page"
              tone={ui.colors.danger}
              icon={<Trophy size={19} color={ui.colors.danger} />}
              valueColor={ui.colors.danger}
            />
            <MetricCard
              cardWidth={metricCardWidth}
              label="Leaderboard Status"
              value={isPublicVisible ? 'Active' : 'Paused'}
              sub="Public sync ready"
              tone={colors.green}
              icon={<Radio size={19} color={colors.green} />}
            />
            <MetricCard
              cardWidth={metricCardWidth}
              label="Auto Update Interval"
              value={autoRefreshInterval >= 60 ? `${autoRefreshInterval / 60} min` : `${autoRefreshInterval} sec`}
              sub={autoRefreshEnabled ? 'Automatic refresh' : 'Manual refresh'}
              tone={colors.cyan}
              icon={<Activity size={19} color={colors.cyan} />}
            />
          </ScrollView>

          {isMobile && (
            <View style={{ marginBottom: 20 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20 }}>
                <TouchableOpacity onPress={() => router.push('/(admin)/settings/leaderboard/unit-rankings')} style={[styles.mobileNavTab, activeItem === 'unit' && styles.mobileNavTabActive]}>
                  <Text style={[styles.mobileNavText, activeItem === 'unit' && styles.mobileNavTextActive]}>Unit Rankings</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/(admin)/settings/leaderboard/controls')} style={[styles.mobileNavTab, activeItem === 'controls' && styles.mobileNavTabActive]}>
                  <Text style={[styles.mobileNavText, activeItem === 'controls' && styles.mobileNavTextActive]}>Controls</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/(admin)/settings/leaderboard/item-results')} style={[styles.mobileNavTab, activeItem === 'item' && styles.mobileNavTabActive]}>
                  <Text style={[styles.mobileNavText, activeItem === 'item' && styles.mobileNavTextActive]}>Item Results</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/(admin)/settings/leaderboard/individual-rankings')} style={[styles.mobileNavTab, activeItem === 'individual' && styles.mobileNavTabActive]}>
                  <Text style={[styles.mobileNavText, activeItem === 'individual' && styles.mobileNavTextActive]}>Individual Rankings</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}

            {/* Renders unit-rankings, item-results, individual-rankings */}
            <Slot />
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
    flexDirection: 'row',
  },
  sidebar: {
    width: 258,
    minHeight: '100%',
    paddingHorizontal: 18,
    paddingTop: 28,
    paddingBottom: 18,
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 34,
  },
  logoMark: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: coreAlpha(coreColor('#16b8d9', 'overlay'), 0.22),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: coreAlpha(coreColor('#ffffff', 'border'), 0.18),
  },
  brandTitle: {
    color: ui.colors.onPrimary,
    fontFamily: 'Poppins_900Black',
    fontSize: 18,
    lineHeight: 21,
  },
  brandYear: {
    color: coreColor('#9DEBFF', 'textMuted'),
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  navBlock: {
    gap: 8,
  },
  navItem: {
    minHeight: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 12,
  },
  navItemCompact: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  navItemActive: {
    backgroundColor: coreAlpha(coreColor('#16b8d9', 'overlay'), 0.22),
    borderWidth: 1,
    borderColor: coreAlpha(coreColor('#9debff', 'border'), 0.24),
  },
  navTextActive: {
    color: ui.colors.onPrimary,
    fontFamily: 'Poppins_700Bold',
    fontSize: 14,
  },
  navTextInactive: {
    color: coreColor('#9DEBFF', 'textMuted'),
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
    opacity: 0.85,
  },
  profileBox: {
    minHeight: 74,
    borderRadius: 18,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: coreAlpha(coreColor('#ffffff', 'overlay'), 0.08),
    borderWidth: 1,
    borderColor: coreAlpha(coreColor('#ffffff', 'border'), 0.12),
  },
  profileBoxCompact: {
    justifyContent: 'center',
  },
  profileAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: ui.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    color: ui.colors.onPrimary,
    fontFamily: 'Poppins_700Bold',
    fontSize: 13,
  },
  profileRole: {
    color: coreColor('#B6EFFF', 'textMuted'),
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
  },
  profileLogout: {
    color: coreColor('#9DEBFF', 'textMuted'),
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
  },
  mobileClose: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: coreAlpha(coreColor('#ffffff', 'overlay'), 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: {
    flex: 1,
  },
  content: {
    width: '100%',
    alignSelf: 'center',
    padding: 20,
    paddingBottom: 34,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 20,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: ui.colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color: coreColor(colors.teal, 'primaryText'),
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  pageTitle: {
    color: colors.text,
    fontFamily: 'Poppins_800ExtraBold',
    fontSize: 24,
    lineHeight: 30,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  livePill: {
    height: 36,
    borderRadius: 18,
    backgroundColor: ui.colors.successSoft,
    borderWidth: 1,
    borderColor: coreColor('#BBF7D0', 'border'),
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  liveText: {
    color: coreColor('#15803D', 'success'),
    fontFamily: 'Poppins_700Bold',
    fontSize: 12,
  },
  updatedText: {
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
  previewButton: {
    height: 40,
    borderRadius: ui.radius.xl,
    backgroundColor: ui.colors.primary,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: colors.navy,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  previewButtonText: {
    color: ui.colors.onPrimary,
    fontFamily: 'Poppins_700Bold',
    fontSize: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 18,
  },
  metricsGridWrap: {
    flexWrap: 'wrap',
  },
  metricsGridMobile: {
    paddingRight: 20,
  },
  metricCard: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 180,
    backgroundColor: colors.card,
    borderRadius: ui.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    shadowColor: ui.shadow.shadowColor,
    shadowOpacity: 0.025,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  metricTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: {
    flex: 1,
    color: colors.muted,
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  metricValue: {
    color: colors.text,
    fontFamily: 'Poppins_900Black',
    fontSize: 26,
    lineHeight: 31,
  },
  metricSub: {
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    marginTop: 4,
  },
  mobileNavTab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mobileNavTabActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  mobileNavText: {
    color: colors.muted,
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
  },
  mobileNavTextActive: {
    color: ui.colors.onPrimary,
  },
});
