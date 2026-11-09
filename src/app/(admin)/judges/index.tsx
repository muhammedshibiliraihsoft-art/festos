import { fixedCoreOutputVariables, legacyCoreOutputColors } from '@/constants/coreThemeOutput';
import { coreColor } from '@/constants/coreTheme';
import { Modal } from '@/components/ui/CoreModal';
import { ui } from '@/constants/designSystem';
import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Clipboard, Share, TextInput, useWindowDimensions, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Users,
  Search,
  Plus,
  MoreVertical,
  CheckCircle2,
  X,
  MapPin,
  Clock,
  QrCode,
  Copy,
  Share2,
  RefreshCw,
  Activity,
  Printer,
  ArrowLeft,
  Trash2,
  UserCheck,
  Phone,
  Key,
  ListFilter,
  ClipboardCheck
} from 'lucide-react-native';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { SsfInput } from '../../../components/ui/SsfInput';
import { useJudges } from '../../../core/hooks/useJudges';
import { getCurrentOriginAppUrl } from '@/core/utils/appUrls';
import { useAuthStore } from '../../../core/store/authStore';
import { getCategoryFilterOptions } from '../../../core/utils/categoryFilterOptions';
import { judgeTokenService } from '../../../services/judgeTokenService';
import { useSchedule } from '../../../core/hooks/useSchedule';
import { supabase } from '../../../core/config/supabase';
import QRCode from 'react-native-qrcode-svg';
import { SsfTableSkeleton } from '../../../components/ui/SsfSkeleton';
import { SsfSelectMenu } from '../../../components/ui/SsfSelectMenu';
import { ConsoliumLogo } from '../../../components/ui/ConsoliumLogo';
import { codeLetterAt } from '../../../core/utils/codeLetters';

export default function JudgesPage() {
  const router = useRouter();
  const { user, tenant_id } = useAuthStore();
  const {
    judges,
    isLoadingJudges,
    createJudge,
    deleteJudge,
    assignJudges,
    removeJudgeFromSchedule,
  } = useJudges();
  const { schedules, venues } = useSchedule();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [activeTab, setActiveTab] = useState<'judges' | 'assignments'>('judges');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [printRowCount, setPrintRowCount] = useState(18);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [isPanelEditModalOpen, setIsPanelEditModalOpen] = useState(false);
  const [selectedScheduleForPanel, setSelectedScheduleForPanel] = useState<any>(null);
  const [selectedJudgeIdsForPanel, setSelectedJudgeIdsForPanel] = useState<string[]>([]);
  const [panelJudgeSearchQuery, setPanelJudgeSearchQuery] = useState('');

  const [form, setForm] = useState({ name: '', phone: '', specialization: '' });
  const [selectedJudgeForToken, setSelectedJudgeForToken] = useState<any>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [deletingJudgeId, setDeletingJudgeId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  const [panelErrorMessage, setPanelErrorMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (selectedScheduleId) {
      const schedule = (schedules as any[])?.find((s) => s.id === selectedScheduleId);
      if (schedule && schedule.item_id) {
        supabase
          .from('registrations')
          .select('id', { count: 'exact', head: true })
          .eq('item_id', schedule.item_id)
          .neq('status', 'rejected')
          .then(({ count }) => {
            setPrintRowCount(count && count > 0 ? count : 18);
          });
      } else {
        setPrintRowCount(18);
      }
    }
  }, [selectedScheduleId, schedules]);

  React.useEffect(() => {
    if (!isGenerating) return;
    const timeoutId = setTimeout(() => {
      setIsGenerating(false);
      setErrorMessage('The server took too long to regenerate the code. Please try again.');
    }, 16000);
    return () => clearTimeout(timeoutId);
  }, [isGenerating]);

  // Pending Approvals State
  const [pendingTokens, setPendingTokens] = useState<any[]>([]);
  const [allTokens, setAllTokens] = useState<any[]>([]);
  const [workflowStatusBySchedule, setWorkflowStatusBySchedule] = useState<Record<string, any>>({});

  const fetchJudgeManagementData = React.useCallback(async () => {
    if (!tenant_id) return;

    const [
      { data: tokenData, error: tokenError },
      { data: workflowData, error: workflowError },
    ] = await Promise.all([
      supabase
        .from('judge_tokens')
        .select(`
          id,
          token,
          judge_id,
          schedule_id,
          status,
          is_used,
          is_revoked,
          expires_at,
          created_at
        `)
        .eq('tenant_id', tenant_id)
        .order('created_at', { ascending: false }),
      supabase.rpc('get_judge_management_status', {
        p_tenant_id: tenant_id,
      }),
    ]);

    if (tokenError) {
      console.error('[JudgeManagement] Failed to load tokens:', tokenError);
    } else {
      const now = Date.now();
      const activeTokens = (tokenData ?? []).filter((token: any) =>
        !token.is_used
        && !token.is_revoked
        && token.status !== 'rejected'
        && (!token.expires_at || new Date(token.expires_at).getTime() > now)
      );
      setAllTokens(activeTokens);
      setPendingTokens(
        activeTokens.filter((token: any) => token.status === 'pending_approval')
      );
    }

    if (workflowError) {
      console.error('[JudgeManagement] Failed to load workflow status:', workflowError);
    } else {
      const statusMap = Object.fromEntries(
        (workflowData ?? []).map((status: any) => [status.schedule_id, status])
      );
      setWorkflowStatusBySchedule(statusMap);
    }
  }, [tenant_id]);

  // Fetch and subscribe to token, mark and assignment changes.
  React.useEffect(() => {
    if (!tenant_id) return;

    fetchJudgeManagementData();

    const channel = supabase
      .channel(`admin_judge_management_${tenant_id}_${Math.random().toString(36).substring(7)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'judge_tokens', filter: `tenant_id=eq.${tenant_id}` },
        fetchJudgeManagementData
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mark_entries', filter: `tenant_id=eq.${tenant_id}` },
        fetchJudgeManagementData
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'schedule_judge_assignments', filter: `tenant_id=eq.${tenant_id}` },
        fetchJudgeManagementData
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant_id, fetchJudgeManagementData]);

  const handleApproveToken = async (tokenId: string) => {
    try {
      await judgeTokenService.approveLogin(tokenId);
      await fetchJudgeManagementData();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleRejectToken = async (tokenId: string) => {
    try {
      await judgeTokenService.rejectLogin(tokenId);
      await fetchJudgeManagementData();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  // Filters for Assignments Tab
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedVenue, setSelectedVenue] = useState('All');
  const [selectedAssignedJudge, setSelectedAssignedJudge] = useState('All');

  const categoriesList = getCategoryFilterOptions(
    (schedules as any[]).flatMap((schedule) => {
      const categories = schedule.items?.category_codes;
      return Array.isArray(categories) ? categories : [categories];
    }),
  );

  const filteredSchedules = useMemo(() => {
    return (schedules as any[]).filter(schedule => {
      let matchesSearch = true;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchNameEn = schedule.items?.item_name_en?.toLowerCase().includes(query);
        const matchNameMl = schedule.items?.item_name_ml?.toLowerCase().includes(query);
        const matchCode = schedule.items?.item_code?.toLowerCase().includes(query);
        matchesSearch = matchNameEn || matchNameMl || matchCode;
      }
      
      let matchesCategory = true;
      if (selectedCategory !== 'All') {
        const codes = Array.isArray(schedule.items?.category_codes) 
          ? schedule.items.category_codes 
          : (schedule.items?.category_codes ? [schedule.items.category_codes] : []);
        
        const catShort = selectedCategory === 'SENIOR' ? 'SR' : (selectedCategory === 'JUNIOR' ? 'JR' : (selectedCategory === 'CAMPUS' ? 'CA' : (selectedCategory === 'GENERAL' ? 'GN' : selectedCategory)));
        const catLong = selectedCategory === 'SR' ? 'SENIOR' : (selectedCategory === 'JR' ? 'JUNIOR' : (selectedCategory === 'CA' ? 'CAMPUS' : (selectedCategory === 'GN' ? 'GENERAL' : selectedCategory)));

        matchesCategory = codes.includes(selectedCategory) || codes.includes(catShort) || codes.includes(catLong);
      }
      
      let matchesVenue = true;
      if (selectedVenue !== 'All') {
        matchesVenue = schedule.venue_id === selectedVenue || schedule.venues?.id === selectedVenue;
      }

      let matchesJudge = true;
      if (selectedAssignedJudge !== 'All') {
        matchesJudge = schedule.assigned_judge_ids?.includes(selectedAssignedJudge);
      }

      return matchesSearch && matchesCategory && matchesVenue && matchesJudge;
    });
  }, [schedules, searchQuery, selectedCategory, selectedVenue, selectedAssignedJudge]);

  const modalFilteredSchedules = useMemo(() => {
    if (!eventSearchQuery.trim()) return schedules as any[];
    const query = eventSearchQuery.toLowerCase().trim();
    return (schedules as any[]).filter(s => {
      const nameEn = s.items?.item_name_en?.toLowerCase() || '';
      const nameMl = s.items?.item_name_ml?.toLowerCase() || '';
      const code = s.items?.item_code?.toLowerCase() || '';
      return nameEn.includes(query) || nameMl.includes(query) || code.includes(query);
    });
  }, [schedules, eventSearchQuery]);

  const filteredJudgesForPanel = useMemo(() => {
    if (!panelJudgeSearchQuery.trim()) return judges as any[];
    const query = panelJudgeSearchQuery.toLowerCase().trim();
    return (judges as any[]).filter(j => 
      j.name?.toLowerCase().includes(query) ||
      j.phone?.includes(query) ||
      (Array.isArray(j.specialization) && j.specialization.some((s: string) => s.toLowerCase().includes(query)))
    );
  }, [judges, panelJudgeSearchQuery]);

  const openPanelEditModal = (schedule: any) => {
    setSelectedScheduleForPanel(schedule);
    setSelectedJudgeIdsForPanel(
      Array.isArray(schedule.assigned_judge_ids)
        ? schedule.assigned_judge_ids
        : []
    );
    setPanelJudgeSearchQuery('');
    setPanelErrorMessage(null);
    setIsPanelEditModalOpen(true);
  };

  const handleToggleJudgeForPanel = (judgeId: string) => {
    setPanelErrorMessage(null);
    setSelectedJudgeIdsForPanel(prev => {
      if (prev.includes(judgeId)) {
        return prev.filter(id => id !== judgeId);
      }

      const capacity = selectedScheduleForPanel?.expected_judge_count || 3;
      if (prev.length >= capacity) {
        setPanelErrorMessage(
          `Panel is full. This event requires only ${capacity} judge(s).`
        );
        return prev;
      }

      return [...prev, judgeId];
    });
  };

  const handleSavePanel = async () => {
    if (!selectedScheduleForPanel) return;
    const capacity = selectedScheduleForPanel.expected_judge_count || 3;
    if (selectedJudgeIdsForPanel.length > capacity) {
      setPanelErrorMessage(
        `Remove ${selectedJudgeIdsForPanel.length - capacity} extra judge(s) before saving.`
      );
      return;
    }

    try {
      await assignJudges.mutateAsync({
        scheduleId: selectedScheduleForPanel.id,
        judgeIds: selectedJudgeIdsForPanel
      });
      await fetchJudgeManagementData();
      setIsPanelEditModalOpen(false);
      Alert.alert('Success', 'Judge panel updated successfully!');
    } catch (e: any) {
      setPanelErrorMessage(e.message || 'Failed to update panel');
    }
  };

  const handleQuickRemoveJudge = async (schedule: any, judgeIdToRemove: string) => {
    const judge = judges.find((item: any) => item.id === judgeIdToRemove);
    const eventName = schedule.items?.item_name_en || schedule.items?.item_name_ml || 'this event';
    const confirmationMessage =
      `Remove ${judge?.name || 'this judge'} from "${eventName}"? `
      + 'Any active access code for this event will be revoked.';

    const showRemovalError = (message: string) => {
      if (Platform.OS === 'web') {
        window.alert(`Cannot Remove Judge: ${message}`);
      } else {
        Alert.alert('Cannot Remove Judge', message);
      }
    };

    const performRemoval = async (force = false): Promise<void> => {
      try {
        await removeJudgeFromSchedule.mutateAsync({
          scheduleId: schedule.id,
          judgeId: judgeIdToRemove,
          force,
        });
        await fetchJudgeManagementData();
      } catch (e: any) {
        const message = e.message || 'Failed to remove judge';
        if (!force && message.includes('FINAL_MARKS_CONFIRMATION_REQUIRED')) {
          const strictWarning =
            `${judge?.name || 'This judge'} has already submitted final marks for "${eventName}". `
            + 'Removing the judge will keep those marks in audit history but exclude them from result calculations. Continue?';

          if (Platform.OS === 'web') {
            if (window.confirm(strictWarning)) {
              await performRemoval(true);
            }
          } else {
            Alert.alert('Final Marks Already Submitted', strictWarning, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Remove Anyway',
                style: 'destructive',
                onPress: () => performRemoval(true),
              },
            ]);
          }
          return;
        }
        showRemovalError(message);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmationMessage)) {
        await performRemoval(false);
      }
      return;
    }

    Alert.alert('Remove Judge', confirmationMessage, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => performRemoval(false) },
    ]);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('Error', 'Judge name is required');
      return;
    }
    try {
      await createJudge.mutateAsync({
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        specialization: form.specialization
          ? form.specialization.split(',').map(s => s.trim()).filter(Boolean)
          : [],
      });
      setForm({ name: '', phone: '', specialization: '' });
      setIsAddModalOpen(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const message =
      `Delete "${name}"? Judges with assignment, access-code, marks, or audit history cannot be deleted.`;

    const performDelete = async () => {
      setDeletingJudgeId(id);
      try {
        await deleteJudge.mutateAsync(id);
      } catch (deleteError: any) {
        const errorText = deleteError?.message || 'Failed to delete judge.';
        if (Platform.OS === 'web') {
          window.alert(`Cannot Delete Judge: ${errorText}`);
        } else {
          Alert.alert('Cannot Delete Judge', errorText);
        }
      } finally {
        setDeletingJudgeId(null);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        await performDelete();
      }
      return;
    }

    Alert.alert('Delete Judge', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: performDelete },
    ]);
  };

  const openTokenModal = (judge: any, scheduleId: string = '') => {
    setIsGenerating(false);
    setErrorMessage(null);
    setSelectedJudgeForToken(judge);
    const existingToken = scheduleId
      ? allTokens.find(
          (token: any) => token.judge_id === judge.id && token.schedule_id === scheduleId
        )
      : null;
    setGeneratedToken(existingToken?.token ?? null);
    setSelectedScheduleId(scheduleId);
    setEventSearchQuery('');
    setIsTokenModalOpen(true);
    fetchJudgeManagementData();
  };

  const handleGenerateToken = async (forceRefresh: boolean = false) => {
    setErrorMessage(null);
    if (!selectedScheduleId) {
      setErrorMessage('Please select an event for this judge.');
      return;
    }
    if (!selectedJudgeForToken?.id) {
      setErrorMessage('No judge selected. Please try again.');
      return;
    }
    if (!tenant_id) {
      setErrorMessage('Session error: tenant_id is missing.');
      return;
    }

    setIsGenerating(true);
    try {
      const result = await Promise.race([
        judgeTokenService.generateToken({
          judgeId: selectedJudgeForToken.id,
          scheduleId: selectedScheduleId,
          tenantId: tenant_id,
          createdBy: user?.id ?? '',
          forceRefresh,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error('The server took too long to regenerate the code. Please try again.')),
            15000,
          );
        }),
      ]);

      const tokenString = typeof result === 'string' ? result : result?.token;
      if (!tokenString) {
        setErrorMessage('Token was not returned from server.');
        return;
      }
      
      setGeneratedToken(tokenString);
      await fetchJudgeManagementData();
    } catch (e: any) {
      setErrorMessage(e.message ?? 'Unknown error occurred.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToken = () => {
    if (generatedToken) {
      Clipboard.setString(generatedToken);
      Alert.alert('Copied!', 'Access code copied to clipboard.');
    }
  };

  const shareToken = async () => {
    if (generatedToken && selectedJudgeForToken) {
      const schedule = schedules?.find((s: any) => s.id === selectedScheduleId);
      await Share.share({
        message: `السلام عليكم ${selectedJudgeForToken.name},\n\nYour judge access code for "${schedule?.items?.item_name_ml ?? 'the event'}" is:\n\n🔑 ${generatedToken}\n\nVisit the Judge Portal to enter marks.\n\nThis code is for single use only.`,
      });
    }
  };

  return (
    <>
    <View className="flex-1 bg-ssf-bg print:hidden">
      <View className="bg-core-surface-white border-b border-ui-border px-5 py-4">
        <View className="flex-row flex-wrap items-center justify-between gap-3">
          <View className="flex-row items-center">
            <TouchableOpacity
              onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/schedule' as any)}
              className="mr-3 h-9 w-9 bg-core-surface-white border border-ui-border rounded-lg items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Back to schedule"
            >
              <ArrowLeft size={18} color={coreColor("#334155", 'text')} />
            </TouchableOpacity>
            <View>
              <Text className="text-xl font-poppins-black text-ui-text">Judge Panel</Text>
              <Text className="font-poppins text-xs text-ui-text-muted mt-0.5">
                {judges.length} judge{judges.length !== 1 ? 's' : ''} registered
              </Text>
            </View>
          </View>
          <View className="flex-row items-center gap-x-2">
            <TouchableOpacity
              onPress={() => router.push('/(admin)/judges/approvals' as any)}
              className="h-9 flex-row items-center bg-core-surface-white px-3 rounded-lg border border-ui-border"
              accessibilityRole="button"
              accessibilityLabel={`Open approvals${pendingTokens.length ? `, ${pendingTokens.length} pending` : ''}`}
            >
              <ClipboardCheck size={15} color={coreColor("#0F766E", 'primaryText')} />
              <Text className="font-poppins-bold text-core-primary-text-teal-700 text-xs ml-2">Approvals</Text>
              {pendingTokens.length > 0 && (
                <View className="ml-2 min-w-5 h-5 px-1 rounded-full bg-core-danger-action-red-500 items-center justify-center">
                  <Text className="font-poppins-bold text-core-on-primary-white text-[10px]">
                    {pendingTokens.length > 99 ? '99+' : pendingTokens.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/(admin)/judges/audit' as any)}
              className="h-9 flex-row items-center bg-core-surface-white px-3 rounded-lg border border-ui-border"
              accessibilityRole="button"
              accessibilityLabel="Open judge audit log"
            >
              <Activity size={15} color={coreColor("#B45309", 'warning')} />
              <Text className="font-poppins-bold text-core-warning-amber-700 text-xs ml-2">Audit Log</Text>
            </TouchableOpacity>
            {activeTab === 'judges' && (
              <TouchableOpacity
                onPress={() => setIsAddModalOpen(true)}
                className="h-9 flex-row items-center bg-core-primary-teal-700 px-3 rounded-lg"
                accessibilityLabel="Add judge"
              >
                <Plus size={15} color={ui.colors.onPrimary} />
                <Text className="font-poppins-bold text-core-on-primary-white text-xs ml-1.5">Add Judge</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View className="flex-row mt-4 border-b border-ui-border">
          <TouchableOpacity 
            onPress={() => setActiveTab('judges')} 
            className={`px-4 pb-2 border-b-2 ${activeTab === 'judges' ? 'border-core-primary-teal-700' : 'border-transparent'}`}
            accessibilityRole="tab"
            accessibilityLabel="Judges Directory"
            accessibilityState={{ selected: activeTab === 'judges' }}
          >
            <Text className={`font-poppins-bold text-xs ${activeTab === 'judges' ? 'text-core-primary-text-teal-700' : 'text-ui-text-muted'}`}>Judges Directory</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setActiveTab('assignments')} 
            className={`px-4 pb-2 border-b-2 ${activeTab === 'assignments' ? 'border-core-primary-teal-700' : 'border-transparent'}`}
            accessibilityRole="tab"
            accessibilityLabel="Assignments and Codes"
            accessibilityState={{ selected: activeTab === 'assignments' }}
          >
            <Text className={`font-poppins-bold text-xs ${activeTab === 'assignments' ? 'text-core-primary-text-teal-700' : 'text-ui-text-muted'}`}>Assignments & Codes</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4">
        {pendingTokens.length > 0 && (
          <View className="mb-6 p-4 rounded-2xl bg-core-warning-action-yellow-400/10 border border-core-warning-yellow-400/30">
            <View className="flex-row items-center mb-3">
              <Activity size={20} color={coreColor("#F59E0B", 'warning')} />
              <Text className="font-poppins-black text-core-warning-yellow-600 ml-2 text-base">Pending Login Requests ({pendingTokens.length})</Text>
            </View>
            <View className="gap-y-3">
              {pendingTokens.map(token => {
                const j = judges.find((x: any) => x.id === token.judge_id);
                const s = schedules?.find((x: any) => x.id === token.schedule_id);
                return (
                  <View key={token.id} className="bg-core-surface-white p-3 rounded-xl border border-core-border-gray-100 flex-row items-center justify-between shadow-sm">
                    <View className="flex-1">
                      <Text className="font-poppins-bold text-ssf-text">{j?.name || 'Unknown Judge'}</Text>
                      <Text className="font-poppins text-xs text-ssf-text-muted mt-0.5">
                        {s?.items?.item_name_en || 'Unknown Event'} - Code: {token.token}
                      </Text>
                      <Text className="font-poppins text-[10px] text-core-text-muted-gray-400 mt-1">
                        {new Date(token.created_at).toLocaleTimeString()}
                      </Text>
                    </View>
                  <View className="flex-row items-center gap-x-2">
                    <TouchableOpacity
                      onPress={() => handleRejectToken(token.id)}
                      className="p-2 bg-core-danger-soft-red-100 rounded-lg"
                      accessibilityRole="button"
                      accessibilityLabel={`Reject login request from ${j?.name || 'judge'}`}
                    >
                      <X size={16} color={coreColor("#DC2626", 'danger')} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleApproveToken(token.id)}
                      className="px-3 py-2 bg-core-success-action-green-500 rounded-lg flex-row items-center"
                      accessibilityRole="button"
                      accessibilityLabel={`Approve login request from ${j?.name || 'judge'}`}
                    >
                      <UserCheck size={14} color={ui.colors.onPrimary} />
                      <Text className="font-poppins-bold text-core-on-primary-white text-xs ml-1">Approve</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                );
              })}
            </View>
          </View>
        )}
        {isLoadingJudges ? (
          <SsfTableSkeleton rows={7} columns={4} compact={isMobile} />
        ) : activeTab === 'judges' ? (
          /* ================= JUDGES DIRECTORY ================= */
          judges.length === 0 ? (
            <SsfCard className="items-center py-10">
              <UserCheck size={48} color={ui.colors.border} />
              <Text className="font-poppins-bold text-ssf-text-muted mt-3">No judges added yet</Text>
              <Text className="font-poppins text-ssf-text-muted text-sm text-center mt-1">
                Add judges who will evaluate participants
              </Text>
            </SsfCard>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ flexGrow: 1 }}>
              <View className="flex-1 bg-core-surface-white border border-ui-border rounded-xl overflow-hidden mb-24" style={{ minWidth: 760 }}>
                <View className="h-11 px-4 flex-row items-center bg-ui-muted border-b border-ui-border">
                  <Text style={{ flex: 1.4 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Judge</Text>
                  <Text style={{ flex: 1 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Phone</Text>
                  <Text style={{ flex: 1.5 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Specialization</Text>
                  <Text style={{ width: 245 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted text-right">Actions</Text>
                </View>
                {judges.map((judge: any) => {
                  const judgeTokens = allTokens.filter((token: any) => token.judge_id === judge.id);
                  const latestToken = judgeTokens[0];
                  return (
                  <View key={judge.id} className="min-h-16 px-4 flex-row items-center border-b border-ui-border bg-core-surface-white">
                    <View style={{ flex: 1.4 }} className="flex-row items-center pr-3">
                      <View className="h-8 w-8 rounded-lg bg-core-primary-soft-teal-50 items-center justify-center mr-2.5">
                        <Text className="font-poppins-black text-xs text-core-primary-text-teal-700">
                          {judge.name?.charAt(0)?.toUpperCase() ?? '?'}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text numberOfLines={1} className="font-poppins-bold text-xs text-ui-text">{judge.name}</Text>
                        {judgeTokens.length > 0 && (
                          <View className="self-start mt-1 px-2 py-0.5 rounded-full bg-core-info-soft-blue-50 border border-core-info-soft-blue-200">
                            <Text className="font-poppins-bold text-[9px] text-core-info-blue-700">
                              {judgeTokens.length} active code{judgeTokens.length !== 1 ? 's' : ''}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={{ flex: 1 }} className="flex-row items-center pr-3">
                      {judge.phone && <Phone size={12} color={ui.colors.textMuted} />}
                      <Text numberOfLines={1} className="font-poppins text-xs text-ui-text-muted ml-1.5">{judge.phone || '—'}</Text>
                    </View>
                    <Text style={{ flex: 1.5 }} numberOfLines={1} className="font-poppins text-xs text-ui-text-muted pr-3">
                      {Array.isArray(judge.specialization) && judge.specialization.length
                        ? judge.specialization.join(', ')
                        : '—'}
                    </Text>
                    <View style={{ width: 245 }} className="flex-row justify-end gap-x-2">
                      <TouchableOpacity
                        onPress={() => openTokenModal(judge, latestToken?.schedule_id || '')}
                        className={`h-8 flex-row items-center justify-center border rounded-lg px-3 ${latestToken ? 'bg-core-info-soft-blue-50 border-core-info-soft-blue-200' : 'bg-core-primary-soft-teal-50 border-core-primary-soft-teal-200'}`}
                        accessibilityRole="button"
                        accessibilityLabel={latestToken ? `View active access code for ${judge.name}` : `Generate access code for ${judge.name} in an assigned event`}
                      >
                        {latestToken ? <Copy size={13} color={ui.colors.info} /> : <Key size={13} color={coreColor("#0F766E", 'primaryText')} />}
                        <Text className={`font-poppins-bold text-[10px] ml-1.5 ${latestToken ? 'text-core-info-blue-700' : 'text-core-primary-text-teal-700'}`}>
                          {latestToken ? 'View / Copy Code' : 'Generate Code'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDelete(judge.id, judge.name)}
                        className="h-8 w-8 rounded-lg border border-core-danger-soft-red-200 bg-core-surface-white items-center justify-center"
                        disabled={deletingJudgeId === judge.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete judge ${judge.name}`}
                        accessibilityState={{ disabled: deletingJudgeId === judge.id, busy: deletingJudgeId === judge.id }}
                      >
                        {deletingJudgeId === judge.id
                          ? <ActivityIndicator size="small" color={coreColor("#EF4444", 'danger')} />
                          : <Trash2 size={14} color={coreColor("#EF4444", 'danger')} />}
                      </TouchableOpacity>
                    </View>
                  </View>
                  );
                })}
              </View>
            </ScrollView>
          )
        ) : (
          /* ================= ASSIGNMENTS TABLE ================= */
          <View className="mb-24">
            {/* Filters */}
            <View className="flex-row flex-wrap items-center gap-2 mb-4 bg-core-surface-white p-3 rounded-xl border border-ui-border">
              <View className="flex-row items-center bg-core-surface-white rounded-lg px-3 h-10 border border-ui-border flex-1 min-w-[260px]">
                <Search size={16} color={coreColor("#9CA3AF", 'textMuted')} />
                <TextInput
                  className="flex-1 ml-2 font-poppins text-sm text-ssf-text h-full outline-none"
                  placeholder="Search by Item Name or Code..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  accessibilityLabel="Search events by name or code"
                />
              </View>
              
              <SsfSelectMenu
                value={selectedCategory}
                onValueChange={setSelectedCategory}
                accessibilityLabel="Filter assignments by category"
                width={145}
                compact
                active={selectedCategory !== 'All'}
                options={categoriesList.map((value) => ({
                  label: value === 'All' ? 'Category: All' : value,
                  value,
                }))}
              />
              <SsfSelectMenu
                value={selectedVenue}
                onValueChange={setSelectedVenue}
                accessibilityLabel="Filter assignments by venue"
                searchable
                searchPlaceholder="Search venue..."
                width={165}
                compact
                active={selectedVenue !== 'All'}
                options={[
                  { label: 'Venue: All', value: 'All' },
                  ...(venues as any[]).map((venue) => ({ label: venue.name, value: venue.id })),
                ]}
              />
              <SsfSelectMenu
                value={selectedAssignedJudge}
                onValueChange={setSelectedAssignedJudge}
                accessibilityLabel="Filter assignments by judge"
                searchable
                searchPlaceholder="Search judge..."
                width={175}
                compact
                active={selectedAssignedJudge !== 'All'}
                options={[
                  { label: 'Judge: All', value: 'All' },
                  ...(judges as any[]).map((judge) => ({ label: judge.name, value: judge.id })),
                ]}
              />
              <View className="h-9 px-3 rounded-lg bg-ui-muted items-center justify-center">
                <Text className="font-poppins-bold text-[10px] text-ui-text-muted">{filteredSchedules.length} results</Text>
              </View>
            </View>

            {filteredSchedules.length === 0 ? (
              <View className="items-center py-10 bg-core-surface-white rounded-xl border border-core-border-gray-100">
                <ListFilter size={40} color={ui.colors.border} />
                <Text className="font-poppins text-ssf-text-muted mt-3">No assignments match your filters.</Text>
              </View>
            ) : isMobile ? (
              /* Mobile Cards Layout */
              <View className="gap-y-3">
                {filteredSchedules.map(schedule => (
                  <SsfCard key={schedule.id} className="p-4">
                    <View className="flex-row justify-between items-start mb-2">
                      <View className="flex-1">
                        <Text className="font-poppins-bold text-ssf-text text-base">
                          {schedule.items?.item_name_en}
                          {schedule.items?.item_code ? ` (${schedule.items.item_code})` : ''}
                        </Text>
                        {schedule.items?.item_name_ml && <Text className="font-poppins text-xs text-ssf-text-muted">{schedule.items.item_name_ml}</Text>}
                        {schedule.items?.category_codes && (
                          <Text className="font-poppins text-[10px] text-ui-primary-text mt-1">{(schedule.items.category_codes as string[]).join(', ')}</Text>
                        )}
                      </View>
                      <View className="bg-core-info-soft-blue-100 px-2 py-0.5 rounded-full">
                        <Text className="font-poppins-bold text-[10px] text-core-info-blue-700">{schedule.venues?.name || 'No Venue'}</Text>
                      </View>
                    </View>

                    {(() => {
                      const required = schedule.expected_judge_count || 3;
                      const assigned = schedule.assigned_judge_ids?.length || 0;
                      const difference = required - assigned;
                      return (
                        <View className="flex-row flex-wrap items-center gap-2 border-t border-core-border-gray-100 pt-2 mt-2 mb-2">
                          <Text className="font-poppins-bold text-sm text-ssf-text">
                            Assigned Judges: {assigned} / {required}
                          </Text>
                          <View className={`px-2 py-0.5 rounded-full ${
                            difference > 0 ? 'bg-core-warning-soft-amber-100' : difference === 0 ? 'bg-core-success-soft-green-100' : 'bg-core-danger-soft-red-100'
                          }`}>
                            <Text className={`font-poppins-bold text-[10px] ${
                              difference > 0 ? 'text-core-warning-amber-700' : difference === 0 ? 'text-core-success-green-700' : 'text-core-danger-red-700'
                            }`}>
                              {difference > 0
                                ? `${difference} Remaining`
                                : difference === 0
                                  ? 'Panel Full'
                                  : `${Math.abs(difference)} Extra — Remove Required`}
                            </Text>
                          </View>
                        </View>
                      );
                    })()}
                    {schedule.assigned_judge_ids && schedule.assigned_judge_ids.length > 0 ? (
                      <View className="gap-y-2">
                        {schedule.assigned_judge_ids.map((jid: string) => {
                          const j = judges.find((x: any) => x.id === jid);
                          if (!j) return null;
                          const existingToken = allTokens.find((t: any) => t.judge_id === jid && t.schedule_id === schedule.id);
                          return (
                            <View key={jid} className="flex-row justify-between items-center bg-core-surface-muted-gray-50 p-2 rounded-lg border border-core-border-gray-100">
                              <View className="flex-row items-center gap-x-2 flex-1 pr-2">
                                <View className="w-6 h-6 rounded-full bg-ssf-primary/20 items-center justify-center">
                                  <Text className="font-poppins-bold text-ui-primary-text text-[10px]">{j.name.charAt(0)}</Text>
                                </View>
                                <Text className="font-poppins text-xs text-ssf-text flex-1">{j.name}</Text>
                              </View>
                              <View className="flex-row items-center gap-x-1.5">
                                {existingToken ? (
                                  <>
                                    <View className="bg-core-surface-strong-gray-200 px-2.5 py-1 rounded-md">
                                      <Text className="font-poppins-bold text-core-text-gray-700 text-[10px]">Code: {existingToken.token}</Text>
                                    </View>
                                  <TouchableOpacity
                                    onPress={() => openTokenModal(j, schedule.id)}
                                    className="bg-core-danger-action-red-500 px-2.5 py-1 rounded-md"
                                    accessibilityRole="button"
                                    accessibilityLabel={`Regenerate access code for ${j.name}`}
                                  >
                                      <Text className="font-poppins-bold text-core-on-primary-white text-[10px]">Regenerate</Text>
                                    </TouchableOpacity>
                                  </>
                                ) : (
                                  <TouchableOpacity
                                    onPress={() => openTokenModal(j, schedule.id)}
                                    className="bg-ssf-primary px-2.5 py-1 rounded-md"
                                    accessibilityRole="button"
                                    accessibilityLabel={`Generate access code for ${j.name}`}
                                  >
                                    <Text className="font-poppins-bold text-core-on-primary-white text-[10px]">Gen Code</Text>
                                  </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                  onPress={() => handleQuickRemoveJudge(schedule, jid)}
                                  className="bg-core-danger-soft-red-50 p-1 rounded-md border border-core-danger-soft-red-100"
                                  accessibilityRole="button"
                                  accessibilityLabel={`Remove ${j.name} from this event`}
                                >
                                  <Trash2 size={13} color={coreColor("#EF4444", 'danger')} />
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <Text className="font-poppins text-xs text-core-text-muted-gray-400 italic mb-2">No judges assigned</Text>
                    )}
                    
                    <TouchableOpacity 
                      className="mt-3 flex-row items-center justify-center gap-x-1 border border-dashed border-core-border-gray-300 py-2 rounded-lg"
                      onPress={() => openPanelEditModal(schedule)}
                      accessibilityRole="button"
                      accessibilityLabel={`Manage judge panel for ${schedule.items?.item_name_en || 'event'}`}
                    >
                      <Users size={14} color={coreColor("#6B7280", 'text')} />
                      <Text className="font-poppins-bold text-xs text-core-text-muted-gray-500">Manage Panel in Event</Text>
                    </TouchableOpacity>
                  </SsfCard>
                ))}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ flexGrow: 1 }}>
              <View className="flex-1 bg-core-surface-white rounded-xl border border-ui-border overflow-hidden" style={{ minWidth: 1150 }}>
                <View className="h-11 px-4 flex-row items-center bg-ui-muted border-b border-ui-border">
                  <Text style={{ width: 340 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Event Details</Text>
                  <Text style={{ width: 210 }} className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Venue</Text>
                  <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted flex-1">Assigned Judges & Codes</Text>
                </View>
                {filteredSchedules.map(schedule => (
                  <View key={schedule.id} className="flex-row px-4 py-4 border-b border-ui-border items-start bg-core-surface-white">
                    <View style={{ width: 340 }} className="pr-5">
                      <Text className="font-poppins-bold text-sm text-ui-text">
                        {schedule.items?.item_name_en} {schedule.items?.item_code ? `(${schedule.items.item_code})` : ''}
                      </Text>
                      {schedule.items?.item_name_ml && <Text className="font-poppins text-xs text-core-text-muted-gray-500">{schedule.items.item_name_ml}</Text>}
                      {schedule.items?.category_codes && (
                        <Text className="font-poppins text-[10px] text-ui-primary-text mt-1">{(schedule.items.category_codes as string[]).join(', ')}</Text>
                      )}
                      {(() => {
                        const required = schedule.expected_judge_count || 3;
                        const assigned = schedule.assigned_judge_ids?.length || 0;
                        const difference = required - assigned;
                        return (
                          <View className="flex-row flex-wrap items-center gap-1.5 mt-2">
                            <Text className="font-poppins-bold text-[10px] text-ui-text-muted">
                              Judges: {assigned}/{required}
                            </Text>
                            <View className={`px-2 py-0.5 rounded-full ${
                              difference > 0 ? 'bg-core-warning-soft-amber-100' : difference === 0 ? 'bg-core-success-soft-green-100' : 'bg-core-danger-soft-red-100'
                            }`}>
                              <Text className={`font-poppins-bold text-[9px] ${
                                difference > 0 ? 'text-core-warning-amber-700' : difference === 0 ? 'text-core-success-green-700' : 'text-core-danger-red-700'
                              }`}>
                                {difference > 0
                                  ? `${difference} Remaining`
                                  : difference === 0
                                    ? 'Panel Full'
                                    : `${Math.abs(difference)} Extra`}
                              </Text>
                            </View>
                          </View>
                        );
                      })()}
                    </View>
                    <View style={{ width: 210 }} className="justify-center pr-5">
                      <View className="bg-core-info-soft-blue-50 self-start px-2.5 py-1 rounded-lg border border-core-info-soft-blue-100">
                        <Text className="font-poppins text-[10px] text-core-info-blue-700" numberOfLines={1}>{schedule.venues?.name || 'N/A'}</Text>
                      </View>
                    </View>
                    <View className="flex-1 gap-y-2">
                      {schedule.assigned_judge_ids && schedule.assigned_judge_ids.length > 0 ? (
                        schedule.assigned_judge_ids.map((jid: string) => {
                          const j = judges.find((x: any) => x.id === jid);
                          if (!j) return null;
                          const existingToken = allTokens.find((t: any) => t.judge_id === jid && t.schedule_id === schedule.id);
                          return (
                            <View key={jid} className="min-h-11 flex-row justify-between items-center bg-ui-muted px-3 rounded-lg border border-ui-border">
                              <View className="flex-row items-center flex-1 pr-3">
                                <View className="h-7 w-7 rounded-lg bg-core-surface-white border border-ui-border items-center justify-center mr-2">
                                  <Text className="font-poppins-black text-[10px] text-core-primary-text-teal-700">{j.name?.charAt(0)?.toUpperCase()}</Text>
                                </View>
                                <Text className="font-poppins-bold text-xs text-ui-text">{j.name}</Text>
                              </View>
                              <View className="flex-row items-center gap-x-2">
                                {existingToken ? (
                                  <>
                                    <View className="bg-core-info-soft-blue-50 px-2.5 py-1.5 rounded-lg border border-core-info-soft-blue-200">
                                      <Text className="font-poppins-bold text-core-info-blue-700 text-[10px] tracking-wider">Code: {existingToken.token}</Text>
                                    </View>
                                    <TouchableOpacity
                                      onPress={() => openTokenModal(j, schedule.id)}
                                      className="bg-core-surface-white px-3 py-1.5 rounded-lg border border-ui-border"
                                      accessibilityRole="button"
                                      accessibilityLabel={`View or copy access code for ${j.name}`}
                                    >
                                      <Text className="font-poppins-bold text-core-primary-text-teal-700 text-[10px]">View / Copy</Text>
                                    </TouchableOpacity>
                                  </>
                                ) : (
                                  <TouchableOpacity
                                    onPress={() => openTokenModal(j, schedule.id)}
                                    className="bg-core-primary-soft-teal-50 px-3 py-1.5 rounded-lg border border-core-primary-soft-teal-200"
                                    accessibilityRole="button"
                                    accessibilityLabel={`Generate access code for ${j.name}`}
                                  >
                                    <Text className="font-poppins-bold text-core-primary-text-teal-700 text-[10px]">Generate Code</Text>
                                  </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                  onPress={() => handleQuickRemoveJudge(schedule, jid)}
                                  className="bg-core-danger-soft-red-50 p-1.5 rounded-lg border border-core-danger-soft-red-100"
                                  accessibilityRole="button"
                                  accessibilityLabel={`Remove ${j.name} from this event`}
                                >
                                  <Trash2 size={14} color={coreColor("#EF4444", 'danger')} />
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })
                      ) : (
                        <Text className="font-poppins text-xs text-core-text-muted-gray-400 italic">No judges assigned.</Text>
                      )}
                      <TouchableOpacity 
                        className="self-start mt-1"
                        onPress={() => openPanelEditModal(schedule)}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit judge panel for ${schedule.items?.item_name_en || 'event'}`}
                      >
                        <Text className="font-poppins-bold text-[10px] text-core-primary-text-teal-700">+ Edit Panel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
              </ScrollView>
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Add Judge Modal ── */}
      <Modal visible={isAddModalOpen} transparent animationType="slide">
        <View className="flex-1 bg-core-surface-strong-black/50 justify-end">
          <View className="bg-core-surface-white p-6 rounded-t-3xl">
            <Text className="text-xl font-poppins-black text-ssf-text mb-5">Add Judge</Text>
            <SsfInput label="Full Name *" placeholder="e.g., Abdul Rahman" value={form.name} onChangeText={v => setForm({ ...form, name: v })} className="mb-4" />
            <SsfInput label="Phone Number" placeholder="e.g., 9876543210" value={form.phone} onChangeText={v => setForm({ ...form, phone: v })} className="mb-4" />
            <SsfInput label="Specialization (comma-separated)" placeholder="e.g., Mappilappattu, Elocution" value={form.specialization} onChangeText={v => setForm({ ...form, specialization: v })} className="mb-6" />
            <SsfButton label="Add Judge" onPress={handleSave} isLoading={createJudge.isPending} className="mb-3" />
            <SsfButton label="Cancel" variant="outline" onPress={() => { setForm({ name: '', phone: '', specialization: '' }); setIsAddModalOpen(false); }} />
          </View>
        </View>
      </Modal>

      {/* ── Generate Token Modal ── */}
      <Modal visible={isTokenModalOpen} transparent animationType="slide">
        <View className="flex-1 bg-core-surface-strong-black/50 items-center justify-center p-4">
          <View className="w-full max-w-3xl max-h-[90%] bg-core-surface-white p-5 rounded-2xl border border-ui-border shadow-lg">
            <View className="flex-row items-start justify-between mb-4">
              <View>
                <Text className="text-xl font-poppins-black text-ui-text">Access Code</Text>
                <Text className="font-poppins text-ui-text-muted text-xs mt-0.5">Judge: {selectedJudgeForToken?.name}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsTokenModalOpen(false)}
                className="h-9 w-9 rounded-lg border border-ui-border bg-core-surface-white items-center justify-center"
                accessibilityLabel="Close access code dialog"
              >
                <X size={17} color={ui.colors.textMuted} />
              </TouchableOpacity>
            </View>

            {!generatedToken ? (
              <>
                <Text className="font-poppins-bold text-xs text-ui-text mb-2">Select assigned event</Text>
                
                <View className="flex-row items-center bg-core-surface-white rounded-lg px-3 h-10 border border-ui-border w-full mb-3">
                  <Search size={16} color={coreColor("#9CA3AF", 'textMuted')} />
                  <TextInput
                    className="flex-1 ml-2 font-poppins text-sm text-ssf-text h-full outline-none"
                    placeholder="Search by event name or code..."
                    value={eventSearchQuery}
                    onChangeText={setEventSearchQuery}
                    accessibilityLabel="Search assigned events"
                  />
                </View>

                <ScrollView style={{ maxHeight: 310 }} className="mb-4 border border-ui-border rounded-xl">
                  {modalFilteredSchedules?.map(s => {
                    const hasToken = allTokens.some((t: any) => t.judge_id === selectedJudgeForToken?.id && t.schedule_id === s.id);
                    const isCompleted = workflowStatusBySchedule[s.id]?.marks_completed === true;
                    const assignedJudgeIds = Array.isArray(s.assigned_judge_ids)
                      ? s.assigned_judge_ids
                      : [];
                    const isAssigned = assignedJudgeIds.includes(selectedJudgeForToken?.id);
                    return (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => {
                        if (!isAssigned) return;
                        setSelectedScheduleId(s.id);
                        const existing = allTokens.find(
                          (token: any) => token.judge_id === selectedJudgeForToken?.id && token.schedule_id === s.id
                        );
                        if (existing?.token) setGeneratedToken(existing.token);
                      }}
                      disabled={!isAssigned}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${s.items?.item_name_en || s.items?.item_name_ml || 'event'} for access code`}
                      accessibilityState={{
                        disabled: !isAssigned,
                        selected: selectedScheduleId === s.id,
                      }}
                      className={`px-4 min-h-14 justify-center border-b border-ui-border ${
                        selectedScheduleId === s.id
                          ? 'bg-core-primary-soft-teal-50'
                          : isAssigned
                            ? 'bg-core-surface-white'
                            : 'bg-ui-muted opacity-50'
                      }`}
                    >
                      <View className="flex-row justify-between items-start">
                        <View className="flex-1 pr-2">
                          <Text className={`font-poppins-bold text-sm ${selectedScheduleId === s.id ? 'text-ui-primary-text' : 'text-ssf-text'}`}>
                            {s.items?.item_name_ml ?? s.items?.item_name_en ?? 'Unknown'}
                            {s.items?.category_codes ? ` - ${(s.items.category_codes as string[]).join(', ')}` : ''}
                          </Text>
                          <Text className="font-poppins text-xs text-ssf-text-muted mt-0.5">
                            {s.venues?.name} · {new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                        <View className="items-end gap-y-1">
                          {hasToken && (
                            <View className="bg-core-success-soft-green-100 px-2 py-0.5 rounded border border-core-success-soft-green-200">
                              <Text className="text-[10px] text-core-success-green-700 font-poppins-bold">Code Generated</Text>
                            </View>
                          )}
                          {isCompleted && (
                            <View className="bg-core-danger-soft-red-100 px-2 py-0.5 rounded border border-core-danger-soft-red-200">
                              <Text className="text-[10px] text-core-danger-red-700 font-poppins-bold">Marks Entered</Text>
                            </View>
                          )}
                          {!isAssigned && (
                            <View className="bg-core-surface-strong-gray-200 px-2 py-0.5 rounded border border-core-border-gray-300">
                              <Text className="text-[10px] text-core-text-gray-600 font-poppins-bold">Not Assigned</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {(() => {
                  const selectedS = modalFilteredSchedules?.find((s: any) => s.id === selectedScheduleId);
                  if (selectedS && workflowStatusBySchedule[selectedS.id]?.marks_completed === true) {
                    return (
                      <View className="bg-core-danger-soft-red-50 p-3 rounded-xl mb-3 border border-core-danger-soft-red-200 flex-row items-center">
                        <Activity size={16} color={coreColor("#DC2626", 'danger')} />
                        <Text className="font-poppins-bold text-core-danger-red-700 text-xs ml-2 flex-1 leading-relaxed">
                          Strict Warning: Marks entry is already completed for this event. 
                        </Text>
                      </View>
                    )
                  }
                  return null;
                })()}

                {errorMessage && (
                  <View className="bg-core-danger-soft-red-50 p-3 rounded-xl mb-3 border border-core-danger-soft-red-100">
                    <Text className="font-poppins text-core-danger-red-600 text-sm">{errorMessage}</Text>
                  </View>
                )}

                <View className="flex-row justify-end gap-x-2">
                  <SsfButton label="Cancel" variant="outline" onPress={() => setIsTokenModalOpen(false)} />
                  <SsfButton
                    label="Generate Code & QR"
                    onPress={() => handleGenerateToken()}
                    isLoading={isGenerating}
                    disabled={!selectedScheduleId}
                  />
                </View>
              </>
            ) : (
              <>
                {errorMessage && (
                  <View className="bg-core-danger-soft-red-50 p-3 rounded-lg mb-3 border border-core-danger-soft-red-200">
                    <Text className="font-poppins text-core-danger-red-700 text-xs">{errorMessage}</Text>
                  </View>
                )}
                <View className="bg-ui-muted rounded-xl p-4 items-center mb-4 border border-ui-border">
                  <View className="bg-core-surface-white p-2.5 rounded-xl mb-3 border border-ui-border">
                    <QRCode
                      value={getCurrentOriginAppUrl(`/judge?code=${encodeURIComponent(generatedToken)}`) || ''}
                      size={150}
                      color={coreColor("#065F46", 'success')}
                      backgroundColor={ui.colors.surface}
                    />
                  </View>
                  <Text className="font-poppins text-ui-text-muted text-[10px] uppercase tracking-wider">6-character code</Text>
                  <Text className="font-poppins-black text-2xl text-core-primary-text-teal-700 tracking-widest mt-1">{generatedToken}</Text>
                  <Text className="font-poppins text-ui-text-muted text-[10px] text-center mt-2 px-4">
                    Judge can scan this QR using their phone camera to instantly login, or type the code manually. Code expires after single use.
                  </Text>
                </View>

                <View className="flex-row gap-x-2 mb-3">
                  <TouchableOpacity
                    onPress={copyToken}
                    className="flex-1 h-10 flex-row items-center justify-center gap-x-2 bg-core-surface-white border border-ui-border rounded-lg"
                    accessibilityRole="button"
                    accessibilityLabel="Copy access code"
                  >
                    <Copy size={16} color={coreColor("#374151", 'text')} />
                    <Text className="font-poppins-bold text-core-text-gray-700 text-sm">Copy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      if (Platform.OS === 'web') {
                        setTimeout(() => window.print(), 100);
                      }
                    }}
                    className="flex-1 h-10 flex-row items-center justify-center gap-x-2 bg-core-primary-indigo-600 rounded-lg"
                    accessibilityRole="button"
                    accessibilityLabel="Print evaluation sheet"
                  >
                    <Printer size={16} color={ui.colors.onPrimary} />
                    <Text className="font-poppins-bold text-core-on-primary-white text-sm">Print</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={shareToken}
                    className="flex-1 h-10 flex-row items-center justify-center gap-x-2 bg-core-primary-teal-700 rounded-lg"
                    accessibilityRole="button"
                    accessibilityLabel="Share access code and judge portal link"
                  >
                    <Share2 size={16} color={ui.colors.onPrimary} />
                    <Text className="font-poppins-bold text-core-on-primary-white text-sm">Share</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={() => handleGenerateToken(true)}
                  disabled={isGenerating}
                  className="h-10 flex-row items-center justify-center gap-x-2 bg-core-warning-soft-amber-50 border border-core-warning-soft-amber-200 rounded-lg mb-3 active:opacity-80"
                  accessibilityRole="button"
                  accessibilityLabel="Regenerate access code and QR code"
                  accessibilityState={{ disabled: isGenerating, busy: isGenerating }}
                >
                  <RefreshCw size={15} color={coreColor("#B45309", 'warning')} />
                  <Text className="font-poppins-bold text-core-warning-amber-700 text-xs">
                    {isGenerating ? 'Regenerating...' : 'Regenerate Code & QR'}
                  </Text>
                </TouchableOpacity>

                <SsfButton label="Done" variant="outline" onPress={() => setIsTokenModalOpen(false)} />
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Manage Panel Modal ── */}
      <Modal visible={isPanelEditModalOpen} transparent animationType="slide">
        <View className="flex-1 bg-core-surface-strong-black/50 justify-end">
          <View className="bg-core-surface-white p-6 rounded-t-3xl max-h-[85%]">
            <View className="flex-row justify-between items-start mb-3">
              <View className="flex-1 pr-3">
                <Text className="text-xl font-poppins-black text-ssf-text">Manage Judge Panel</Text>
                <Text className="font-poppins-bold text-sm text-ui-primary-text mt-1">
                  {selectedScheduleForPanel?.items?.item_name_ml || selectedScheduleForPanel?.items?.item_name_en}
                  {selectedScheduleForPanel?.items?.item_code ? ` (${selectedScheduleForPanel.items.item_code})` : ''}
                </Text>
                <Text className="font-poppins text-xs text-core-text-muted-gray-500 mt-0.5">
                  Venue: {selectedScheduleForPanel?.venues?.name || 'N/A'}
                </Text>
              </View>
              <View className="bg-ssf-primary/10 px-3 py-1.5 rounded-full border border-ssf-primary/20">
                <Text className="font-poppins-bold text-ui-primary-text text-xs">
                  {selectedJudgeIdsForPanel.length} / {selectedScheduleForPanel?.expected_judge_count || 3} Selected
                </Text>
                <Text className="font-poppins-bold text-ui-primary-text text-[9px] text-center mt-0.5">
                  {Math.max(
                    (selectedScheduleForPanel?.expected_judge_count || 3) - selectedJudgeIdsForPanel.length,
                    0
                  )} Remaining
                </Text>
              </View>
            </View>

            {selectedJudgeIdsForPanel.length > (selectedScheduleForPanel?.expected_judge_count || 3) && (
              <View className="bg-core-danger-soft-red-50 p-3 rounded-xl mb-3 border border-core-danger-soft-red-200">
                <Text className="font-poppins-bold text-core-danger-red-700 text-xs">
                  {selectedJudgeIdsForPanel.length - (selectedScheduleForPanel?.expected_judge_count || 3)}
                  {' '}extra judge(s) assigned. Remove the extra judge(s) before saving.
                </Text>
              </View>
            )}

            {panelErrorMessage && (
              <View className="bg-core-danger-soft-red-50 p-3 rounded-xl mb-3 border border-core-danger-soft-red-200">
                <Text className="font-poppins-bold text-core-danger-red-700 text-xs">{panelErrorMessage}</Text>
              </View>
            )}

            <View className="flex-row items-center bg-core-surface-muted-gray-50 rounded-lg px-3 h-10 border border-core-border-gray-200 w-full mb-3">
              <Search size={16} color={coreColor("#9CA3AF", 'textMuted')} />
              <TextInput
                className="flex-1 ml-2 font-poppins text-sm text-ssf-text h-full outline-none"
                placeholder="Search judge by name or spec..."
                value={panelJudgeSearchQuery}
                onChangeText={setPanelJudgeSearchQuery}
                accessibilityLabel="Search judges by name or specialization"
              />
            </View>

            <ScrollView style={{ maxHeight: 260 }} className="mb-4">
              {filteredJudgesForPanel.length > 0 ? (
                filteredJudgesForPanel.map(j => {
                  const isSelected = selectedJudgeIdsForPanel.includes(j.id);
                  const panelIsFull = selectedJudgeIdsForPanel.length
                    >= (selectedScheduleForPanel?.expected_judge_count || 3);
                  const isDisabled = panelIsFull && !isSelected;
                  return (
                    <TouchableOpacity
                      key={j.id}
                      onPress={() => handleToggleJudgeForPanel(j.id)}
                      disabled={isDisabled}
                      accessibilityRole="checkbox"
                      accessibilityLabel={`${isSelected ? 'Remove' : 'Add'} ${j.name} ${isSelected ? 'from' : 'to'} this judge panel`}
                      accessibilityState={{ checked: isSelected, disabled: isDisabled }}
                      className={`flex-row items-center justify-between p-3 rounded-xl mb-2 border ${
                        isSelected
                          ? 'bg-ssf-primary/10 border-ssf-primary'
                          : isDisabled
                            ? 'bg-core-surface-muted-gray-100 border-core-border-gray-200 opacity-40'
                            : 'bg-core-surface-muted-gray-50 border-core-border-gray-200'
                      }`}
                    >
                      <View className="flex-row items-center flex-1 pr-2">
                        <View className={`w-8 h-8 rounded-full items-center justify-center mr-3 ${isSelected ? 'bg-ssf-primary' : 'bg-core-surface-strong-gray-200'}`}>
                          <Text className={`font-poppins-bold text-xs ${isSelected ? 'text-core-on-primary-white' : 'text-core-text-gray-600'}`}>{j.name.charAt(0)}</Text>
                        </View>
                        <View className="flex-1">
                          <Text className={`font-poppins-bold text-sm ${isSelected ? 'text-ui-primary-text' : 'text-ssf-text'}`}>{j.name}</Text>
                          {j.specialization && j.specialization.length > 0 && (
                            <Text className="font-poppins text-xs text-core-text-muted-gray-500">{Array.isArray(j.specialization) ? j.specialization.join(', ') : j.specialization}</Text>
                          )}
                        </View>
                      </View>
                      <View className={`w-6 h-6 rounded-md items-center justify-center border ${isSelected ? 'bg-ssf-primary border-ssf-primary' : 'border-core-border-gray-300 bg-core-surface-white'}`}>
                        {isSelected && <Text className="font-poppins-bold text-core-on-primary-white text-xs">✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <Text className="font-poppins text-xs text-core-text-muted-gray-400 italic text-center py-4">No judges found matching search.</Text>
              )}
            </ScrollView>

            <SsfButton
              label="Save Panel Changes"
              onPress={handleSavePanel}
              isLoading={assignJudges.isPending}
              className="mb-3"
            />
            <SsfButton label="Cancel" variant="outline" onPress={() => setIsPanelEditModalOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>

    {/* ── Print Evaluation Sheet ── */}
    {Platform.OS === 'web' && generatedToken && selectedScheduleId && (
      <>
        <style dangerouslySetInnerHTML={{ __html: `
          @media screen {
            #print-evaluation-sheet {
              display: none !important;
            }
          }
          @media print {
            .no-print, [role="dialog"], [aria-modal="true"] {
              display: none !important;
            }
            #print-evaluation-sheet {
              display: block !important;
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              height: auto;
              background-color: white !important;
              z-index: 999999;
            }
            #print-evaluation-sheet,
            #print-evaluation-sheet * {
              box-sizing: border-box !important;
            }
            .print-evaluation-header,
            .print-evaluation-row {
              break-inside: avoid;
              page-break-inside: avoid;
            }
            @page {
              margin: 8mm;
              size: A4 portrait;
            }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        `}} />
        <View id="print-evaluation-sheet" style={{ ...fixedCoreOutputVariables, display: 'none' }}>
          <View className="print-evaluation-page" style={{ width: '100%', minHeight: '281mm', backgroundColor: 'white', position: 'relative', boxSizing: 'border-box' }}>
          <View className="print-evaluation-header" style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: '#000080', paddingBottom: 14, marginBottom: 12, width: '100%' }}>
            {/* Left Side: Inviting Message & Event Details */}
            <View style={{ flex: 1, minWidth: 0, paddingRight: 12, justifyContent: 'flex-start' }}>
              <ConsoliumLogo size={42} style={{ marginBottom: 5 }} />
              <Text style={{ fontSize: 24, fontFamily: 'Poppins_900Black', color: '#000080', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 2 }}>
                FESTOS
              </Text>
              <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: legacyCoreOutputColors.text, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                OFFICIAL EVALUATION SHEET
              </Text>
              
              <Text style={{ fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#000080', marginBottom: 10, lineHeight: 16 }}>
                Respected <Text style={{ fontFamily: 'Poppins_700Bold', color: '#000080' }}>{selectedJudgeForToken?.name || 'Judge'}</Text>, we cordially invite you to evaluate the upcoming competition. Please scan the QR code to login digitally to the Judge Portal.
              </Text>
              
              {(() => {
                const selectedS = modalFilteredSchedules?.find((s: any) => s.id === selectedScheduleId);
                return (
                  <View style={{ borderLeftWidth: 4, borderLeftColor: '#000080', paddingLeft: 10, marginTop: 2, minWidth: 0 }}>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: '#555', textTransform: 'uppercase', marginBottom: 2 }}>Event / Item</Text>
                    <Text style={{ fontSize: 20, lineHeight: 25, fontFamily: 'Poppins_900Black', color: '#000080', flexShrink: 1 }}>
                      {selectedS?.items?.item_name_ml || selectedS?.items?.item_name_en}
                    </Text>
                    <Text style={{ fontSize: 12, lineHeight: 17, fontFamily: 'Poppins_700Bold', color: legacyCoreOutputColors.text, marginTop: 2 }}>
                      Category: {selectedS?.items?.category || (selectedS?.items?.category_codes ? (selectedS.items.category_codes as string[]).join(', ') : '-')}
                    </Text>
                  </View>
                );
              })()}
            </View>

            {/* Right Side: QR Code & Access Code (No border, Dark Blue QR) */}
            <View style={{ width: 112, flexShrink: 0, alignItems: 'center', justifyContent: 'center', padding: 4 }}>
              <QRCode
                value={getCurrentOriginAppUrl(`/judge?code=${encodeURIComponent(generatedToken)}`) || ''}
                size={96}
                color="#000080"
                backgroundColor={legacyCoreOutputColors.surface}
              />
              <Text style={{ fontFamily: 'Poppins_900Black', fontSize: 20, color: '#000080', letterSpacing: 3, marginTop: 6 }}>
                {generatedToken}
              </Text>
            </View>
          </View>

          {/* Grid for manual marking */}
          <View id="print-evaluation-table" style={{ width: '100%', borderWidth: 1, borderColor: '#000080', marginTop: 8 }}>
            {/* Table Header */}
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#000080', backgroundColor: '#f0f0f0' }}>
              <View style={{ width: 44, borderRightWidth: 1, borderColor: '#000080', padding: 6, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 11, color: '#000080' }}>Sl No</Text>
              </View>
              <View style={{ flex: 1, borderRightWidth: 1, borderColor: '#000080', padding: 6, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 11, color: '#000080' }}>Code Letter</Text>
              </View>
              <View style={{ flex: 1.5, borderRightWidth: 1, borderColor: '#000080', padding: 6, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 11, color: '#000080' }}>Marks</Text>
              </View>
              <View style={{ flex: 2.5, padding: 6, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 11, color: '#000080' }}>Remarks</Text>
              </View>
            </View>
            
            {/* Table Rows */}
            {Array.from({ length: printRowCount }).map((_, i) => (
              <View key={i} className="print-evaluation-row" style={{ flexDirection: 'row', borderBottomWidth: i === printRowCount - 1 ? 0 : 1, borderColor: '#000080', minHeight: 30 }}>
                <View style={{ width: 44, borderRightWidth: 1, borderColor: '#000080', justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 10, color: '#000080' }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, borderRightWidth: 1, borderColor: '#000080', justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 12, color: '#000080' }}>
                    {codeLetterAt(i)}
                  </Text>
                </View>
                <View style={{ flex: 1.5, borderRightWidth: 1, borderColor: '#000080' }} />
                <View style={{ flex: 2.5 }} />
              </View>
            ))}
          </View>
          </View>
        </View>
      </>
    )}
    </>
  );
}
