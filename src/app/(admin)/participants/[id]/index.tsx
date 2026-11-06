import { coreColor, coreAlpha } from '@/constants/coreTheme';
import { ui } from '@/constants/designSystem';
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, TextInput, Platform, Switch, useWindowDimensions, Image, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useGoBack } from '../../../../core/hooks/useGoBack';
import { SsfCard } from '../../../../components/ui/SsfCard';
import { SsfButton } from '../../../../components/ui/SsfButton';
import { useAuthStore } from '../../../../core/store/authStore';
import { useParticipants } from '../../../../core/hooks/useParticipants';
import { organisationService } from '../../../../services/organisationService';
import {
  ArrowLeft,
  Lock,
  Unlock,
  Edit3,
  Trash2,
  AlertTriangle,
  Eye,
  EyeOff,
  ExternalLink,
  CheckCircle2,
  CircleUserRound,
  ChevronDown,
  ChevronRight,
  Globe2,
  ShieldCheck,
  Trophy,
  Upload,
  Search,
} from 'lucide-react-native';
import { useFestival } from '../../../../core/hooks/useFestival';
import { CATEGORIES } from '../../../../constants/categories';
import { useFestivalCategories } from '../../../../core/hooks/useFestivalCategories';
import { SsfSelectMenu } from '../../../../components/ui/SsfSelectMenu';
import { SsfSheet } from '../../../../components/ui/SsfSheet';
import { SsfProfileSkeleton } from '../../../../components/ui/SsfSkeleton';
import { SsfDatePicker } from '../../../../components/ui/SsfDatePicker';

function InfoTile({
  label,
  value,
  tone = 'default',
  style,
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'success' | 'warning';
  style?: any;
}) {
  const valueColor =
    tone === 'success' ? 'text-core-success-emerald-700' : tone === 'warning' ? 'text-core-warning-amber-700' : 'text-ssf-text';

  return (
    <View
      className="min-h-[48px] justify-center border-b border-core-border-slate-200 py-1.5 pr-3"
      style={style}
    >
      <Text className="font-poppins text-[10px] uppercase tracking-wide text-ssf-text-muted">{label}</Text>
      <Text selectable className={`mt-0.5 font-poppins-bold text-[13px] leading-5 ${valueColor}`}>
        {value || '–'}
      </Text>
    </View>
  );
}

function DetailAccordion({
  title,
  subtitle,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View className="border-b border-core-border-slate-200">
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className="min-h-[50px] flex-row items-center py-2"
      >
        <View className="h-8 w-8 items-center justify-center">
          {expanded
            ? <ChevronDown size={16} color={coreColor("#047857", 'success')} />
            : <ChevronRight size={16} color={ui.colors.textMuted} />}
        </View>
        <View className="ml-2.5 flex-1">
          <Text className={`font-poppins-bold text-[12px] ${expanded ? 'text-core-success-emerald-800' : 'text-ssf-text'}`}>{title}</Text>
          <Text className="font-poppins text-[9px] text-ssf-text-muted">{subtitle}</Text>
        </View>
        <Text className={`font-poppins-bold text-[9px] uppercase ${expanded ? 'text-core-success-emerald-700' : 'text-core-text-muted-slate-400'}`}>
          {expanded ? 'Hide' : 'View'}
        </Text>
      </TouchableOpacity>
      {expanded && (
        <View className="pb-3 pl-10">
          {children}
        </View>
      )}
    </View>
  );
}

export default function ParticipantDetails() {
  const tenant_id = useAuthStore((state) => state.tenant_id);
  const validTenantId = tenant_id;
  const { id } = useLocalSearchParams();
  const participantId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const { width } = useWindowDimensions();
  // The admin sidebar consumes significant width on tablets; use the stacked
  // profile layout until the remaining content area can support two columns.
  const isDesktopProfile = width >= 1200;
  const goBack = useGoBack('/(admin)/participants');
  const [eventsSectionExpanded, setEventsSectionExpanded] = useState(false);
  
  const {
    participant,
    isLoadingDetail,
    registrations: events,
    isLoadingRegistrations,
    registrationsError,
    registrationsFetched,
    retryRegistrations,
    updateStatus,
    updateParticipant,
    deleteParticipant,
    terminateParticipant,
    revokeTermination,
    isTerminating,
    isRevokingTermination,
    isUpdatingParticipant,
    uploadProfilePhoto,
    removeProfilePhoto,
    isUploadingProfilePhoto,
    isRemovingProfilePhoto,
  } = useParticipants(participantId, { loadList: false, loadRegistrations: eventsSectionExpanded });

  const { useActiveFestival } = useFestival();
  const { data: festival } = useActiveFestival();
  const isCollegeFest = festival?.festival_template === 'college_fest';
  const { data: collegeCategories = [], isLoading: categoriesLoading } =
    useFestivalCategories(isCollegeFest ? festival?.id : undefined, false);

  const [isEditing, setIsEditing] = useState(false);

  // Editable fields
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [organisations, setOrganisations] = useState<any[]>([]);
  const [tenantOrganisationId, setTenantOrganisationId] = useState<string | null>(null);
  const [categoryCode, setCategoryCode] = useState('');
  const [gender, setGender] = useState('');
  const [classStd, setClassStd] = useState('');
  const [educationType, setEducationType] = useState('');
  const [publicProfileEnabled, setPublicProfileEnabled] = useState(true);
  const [showOrganisationPublic, setShowOrganisationPublic] = useState(true);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);
  const [expandedProfileSection, setExpandedProfileSection] = useState<'competition' | 'contact' | 'verification' | null>(
    isDesktopProfile ? 'competition' : null,
  );
  const [publicSectionExpanded, setPublicSectionExpanded] = useState(false);
  const [eventParticipationType, setEventParticipationType] = useState<'individual' | 'group'>('individual');
  const [assignedItemSearch, setAssignedItemSearch] = useState('');
  const assignedItems = events.filter((event: any) =>
    (event.items?.participation_type === 'group' ? 'group' : 'individual') === eventParticipationType,
  );
  const filteredAssignedItems = assignedItems.filter((event: any) =>
    `${event.items?.item_name_en ?? ''} ${event.items?.item_name_ml ?? ''} ${event.items?.item_code ?? ''} ${event.level ?? ''}`
      .toLowerCase()
      .includes(assignedItemSearch.trim().toLowerCase()),
  );
  const festivalLevel = String(festival?.level || '').trim().toLowerCase();
  const availableOrganisations = festival?.chest_number_template === 'team' || festivalLevel === 'sector' || festivalLevel === 'division'
    ? organisations.filter((organisation) => organisation.parent_id === tenantOrganisationId)
    : organisations;

  // Custom Action Modal State
  const [actionModal, setActionModal] = useState<{
    visible: boolean;
    type: 'alert' | 'confirm' | 'prompt_reason' | 'prompt_date' | 'status_select';
    title: string;
    message: string;
    inputValue?: string;
    action: ((value?: any) => void) | null;
  }>({
    visible: false,
    type: 'alert',
    title: '',
    message: '',
    inputValue: '',
    action: null
  });

  const closeActionModal = () => setActionModal({ ...actionModal, visible: false, action: null });


  // Update local state when participant data loads
  useEffect(() => {
    if (participant) {
      setName(participant.name || '');
      setDob(participant.dob || '');
      setCategoryCode(participant.category_code || '');
      setGender(participant.gender || '');
      setClassStd(participant.class_std || '');
      setEducationType(participant.education_type || '');
      setPublicProfileEnabled(participant.public_profile_enabled !== false);
      setShowOrganisationPublic(participant.show_organisation_public !== false);
      setPhotoPreviewUrl(participant.photo_url || null);
      setPhotoFile(null);
      setRemoveExistingPhoto(false);
      setSelectedOrgId(participant.organisation_id || '');
    }
  }, [participant]);

  useEffect(() => {
    if (!validTenantId) {
      setOrganisations([]);
      setTenantOrganisationId(null);
      return;
    }

    let cancelled = false;
    setOrganisations([]);
    setTenantOrganisationId(null);
    Promise.all([
      import('../../../../services/participantService').then(({ participantService }) =>
        participantService.listOrganisations(validTenantId),
      ),
      organisationService.getMyOrganisation(validTenantId),
    ])
      .then(([data, tenantOrganisation]) => {
        if (cancelled) return;
        setOrganisations(data);
        setTenantOrganisationId(tenantOrganisation?.id ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setOrganisations([]);
        setTenantOrganisationId(null);
      });

    return () => { cancelled = true; };
  }, [validTenantId]);

  const toggleLock = async () => {
    if (!participant || !participantId) return;
    try {
      await updateParticipant({ id: participantId, updates: { is_locked: !participant.is_locked } });
      if (!participant.is_locked) setIsEditing(false);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const chooseProfilePhoto = () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Upload unavailable', 'Photo selection is currently supported on web.');
      return;
    }
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/png,image/jpeg,image/webp';
    picker.onchange = () => {
      const file = picker.files?.[0];
      if (!file) return;
      if (photoPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(photoPreviewUrl);
      setPhotoFile(file);
      setPhotoPreviewUrl(URL.createObjectURL(file));
      setRemoveExistingPhoto(false);
    };
    picker.click();
  };

  const clearProfilePhoto = () => {
    if (photoPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPreviewUrl(null);
    setPhotoFile(null);
    setRemoveExistingPhoto(Boolean(participant?.photo_url));
  };

  const handleSave = async () => {
    if (!name) return Alert.alert('Error', 'Name is required');
    if (!participantId) return;
    if (isCollegeFest) {
      const selected = collegeCategories.find(category => category.code === categoryCode);
      const unchangedArchived = selected && !selected.is_active && categoryCode === participant.category_code;
      if (!selected || (!selected.is_active && !unchangedArchived)) {
        return Alert.alert('Error', 'Select an active College Fest category.');
      }
    }

    try {
      const changingTeam = Boolean(selectedOrgId && selectedOrgId !== participant.organisation_id);
      if (changingTeam) {
        // Team has changed! We need to confirm and call RPC.
        const confirm = await new Promise((resolve) => {
          Alert.alert(
            "Change Team?",
            `You are changing the team. All Solo items and their future points will be transferred to the new team. Group items will remain with the old team.${festival?.chest_number_template === 'team' ? ' The participant will receive a new chest number from the destination team.' : ''} Proceed?`,
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
              { text: "Yes, Change Team", style: "destructive", onPress: () => resolve(true) }
            ]
          );
        });

        if (!confirm) return;

        // Note: Admin Auth usually sets `auth.uid()`, we can pass user.id for audit
        const { supabase } = await import('@/core/config/supabase');
        const { useAuthStore } = await import('@/core/store/authStore');
        const adminId = useAuthStore.getState().user?.id;

        const { error: rpcError } = await supabase.rpc('transfer_participant_team', {
          p_participant_id: participantId,
          p_new_org_id: selectedOrgId,
          p_admin_id: adminId || '00000000-0000-0000-0000-000000000000'
        });

        if (rpcError) {
          throw new Error(rpcError.message || 'Failed to transfer team.');
        }
      }

      await updateParticipant({ 
        id: participantId, 
        updates: {
          name, 
          dob: dob || null,
          category_code: categoryCode || null,
          class_std: isCollegeFest ? null : classStd || null,
          education_type: isCollegeFest ? null : educationType || null,
          gender: festival?.gender_mode === 'boys_only' ? 'boys' : festival?.gender_mode === 'girls_only' ? 'girls' : gender,
          public_profile_enabled: publicProfileEnabled,
          show_organisation_public: showOrganisationPublic,
        }
      });
      setIsEditing(false);
      try {
        if (photoFile) {
          const photoTenantId = changingTeam
            ? availableOrganisations.find((organisation) => organisation.id === selectedOrgId)?.tenant_id
            : participant.tenant_id;
          if (!photoTenantId) throw new Error('Destination team tenant could not be resolved.');
          await uploadProfilePhoto({ id: participantId, file: photoFile, tenantId: photoTenantId, festivalId: participant.festival_id });
        } else if (removeExistingPhoto) {
          await removeProfilePhoto(participantId);
        }
      } catch (photoError: any) {
        Alert.alert('Details saved; photo update failed', photoError?.message || 'Retry the photo change from Edit profile.');
        return;
      }
      Alert.alert('Success', 'Participant updated.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleTerminate = async () => {
    if (!participantId) return;
    setActionModal({
      visible: true,
      type: 'prompt_reason',
      title: 'Terminate Participant',
      message: 'Enter reason for termination:',
      inputValue: '',
      action: async (reason: string) => {
        if (!reason) {
          Alert.alert('Error', 'Termination reason is required.');
          return;
        }
        try {
          await terminateParticipant({ id: participantId, reason });
        } catch (error: any) {
          setTimeout(() => {
            setActionModal({ visible: true, type: 'alert', title: 'Error', message: error.message, action: null });
          }, 300);
        }
      }
    });
  };

  const handleRevokeTermination = async () => {
    if (!participantId) return;
    setActionModal({
      visible: true,
      type: 'confirm',
      title: 'Revoke Termination',
      message: 'Are you sure you want to revoke this termination?',
      action: async () => {
        try {
          await revokeTermination(participantId);
        } catch (error: any) {
          setActionModal({ visible: true, type: 'alert', title: 'Error', message: error.message, action: null });
        }
      }
    });
  };

  const handleDelete = async () => {
    if (!participantId) return;
    const msg = 'Are you sure you want to delete this participant?';
    setActionModal({
      visible: true,
      type: 'confirm',
      title: 'Confirm Delete',
      message: msg,
      action: async () => {
        try {
          await deleteParticipant(participantId);
          goBack();
        } catch (error: any) {
          setActionModal({ visible: true, type: 'alert', title: 'Error', message: error.message, action: null });
        }
      }
    });
  };

  const handleStatusUpdate = async (newStatus: string, reason: string | null = null) => {
    if (!participantId) return;
    try {
      await updateStatus({ id: participantId, status: newStatus as any, reason });
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const promptStatusChange = () => {
    if (participant.is_locked) return;
    
    setActionModal({
      visible: true,
      type: 'status_select',
      title: 'Update Status',
      message: isBanned && participant.status !== 'approved' ? 'Participant is banned. Approval blocked.' : `Select new status for ${participant.name}`,
      inputValue: participant.status || 'pending',
      action: async (val: any) => {
        if (!val) return;
        if (val.status === 'approved' && isBanned && participant.status !== 'approved') {
          setTimeout(() => {
            setActionModal({ visible: true, type: 'alert', title: 'Error', message: 'Cannot approve a banned participant.', action: null });
          }, 300);
          return;
        }
        if (val.status === 'rejected') {
          setTimeout(() => {
            setActionModal({
              visible: true,
              type: 'prompt_reason',
              title: 'Rejection Reason',
              message: 'Enter rejection reason:',
              inputValue: isBanned ? 'Plagiarism Ban' : '',
              action: async (reason: string) => {
                await handleStatusUpdate('rejected', reason);
              }
            });
          }, 300);
        } else {
          await handleStatusUpdate(val.status, null);
        }
      }
    });
  };

  const handleBan = async () => {
    setActionModal({
      visible: true,
      type: 'prompt_date',
      title: 'Plagiarism Ban',
      message: 'Enter ban until date (YYYY-MM-DD) or leave empty to remove ban:',
      inputValue: participant.plagiarism_ban_until ? new Date(participant.plagiarism_ban_until).toISOString().split('T')[0] : '',
      action: async (banUntil: string) => {
        const newDate = banUntil ? new Date(banUntil).toISOString() : null;
        try {
          await updateParticipant({ id: participantId!, updates: { plagiarism_ban_until: newDate } });
        } catch (error: any) {
          setTimeout(() => {
            setActionModal({ visible: true, type: 'alert', title: 'Error', message: error.message, action: null });
          }, 300);
        }
      }
    });
  };

  if (isLoadingDetail) return <SsfProfileSkeleton />;

  if (!participant) {
    return (
      <View className="flex-1 bg-ssf-bg p-6 justify-center items-center">
        <Text className="font-poppins text-ssf-text">Participant not found.</Text>
        <SsfButton label="Go Back" onPress={goBack} className="mt-4" />
      </View>
    );
  }

  const locked = participant.is_locked;
  const isBanned = participant.plagiarism_ban_until && new Date(participant.plagiarism_ban_until) > new Date();
  const categoryOptions = isCollegeFest
    ? [
        { label: '-- Select Category --', value: '' },
        ...collegeCategories.filter(category => category.code.toUpperCase() !== 'GN' && (category.is_active || category.code === participant.category_code)).map((category) => ({
          label: `${category.name}${category.is_active ? '' : ' (Archived)'}`,
          value: category.code,
        })),
        ...(!collegeCategories.some(category => category.code === categoryCode) && categoryCode
          ? [{ label: `${categoryCode} (Historical)`, value: categoryCode }]
          : []),
      ]
    : [
        { label: '-- Select Category --', value: '' },
        ...CATEGORIES.map((cat) => ({
          label: `${cat.code} - ${cat.name_en}`,
          value: cat.code,
        })),
        ...(!CATEGORIES.find((category) => category.code === categoryCode) && categoryCode
          ? [{ label: categoryCode, value: categoryCode }]
          : []),
      ];

  const getStatusColor = (status: string) => {
    switch((status || 'pending').toLowerCase()) {
      case 'approved': return { bg: 'bg-core-success-soft-green-100', text: 'text-core-success-green-700', border: 'border-core-success-soft-green-200' };
      case 'rejected': return { bg: 'bg-core-danger-soft-red-100', text: 'text-core-danger-red-700', border: 'border-core-danger-soft-red-200' };
      default: return { bg: 'bg-core-warning-soft-yellow-100', text: 'text-core-warning-yellow-700', border: 'border-core-warning-soft-yellow-200' };
    }
  };
  const statColor = getStatusColor(participant.status);
  const avatarInitials = (participant.name || 'Participant')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part: string) => part.charAt(0))
    .join('')
    .toUpperCase();

  return (
    <ScrollView
      className="flex-1 bg-ssf-bg"
      contentContainerStyle={{
        width: '100%',
        maxWidth: 1360,
        alignSelf: 'center',
        paddingHorizontal: isDesktopProfile ? 8 : 10,
        paddingTop: isDesktopProfile ? 8 : 12,
        paddingBottom: isDesktopProfile ? 18 : 28,
      }}
    >
      {!isDesktopProfile && (
        <View className="mb-3 flex-row items-center">
          <TouchableOpacity
            onPress={goBack}
            className="mr-3 h-10 w-10 items-center justify-center rounded-xl border border-core-border-slate-200 bg-core-surface-white"
          >
            <ArrowLeft size={19} color={ui.colors.text} />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-lg font-poppins-black text-ssf-text">Participant profile</Text>
            <Text className="text-[10px] font-poppins text-ssf-text-muted">Identity, eligibility and registrations</Text>
          </View>
        </View>
      )}

      {participant.is_terminated && (
        <View className="bg-core-warning-soft-amber-100 border border-core-warning-soft-amber-300 rounded-xl p-4 mb-4 flex-row items-center gap-x-3">
          <AlertTriangle size={24} color={coreColor("#D97706", 'warning')} />
          <View className="flex-1">
            <Text className="font-poppins-bold text-core-warning-amber-700">Participant Terminated</Text>
            <Text className="font-poppins text-xs text-core-warning-amber-600">Reason: {participant.termination_reason || 'No reason provided'}</Text>
          </View>
        </View>
      )}

      {isBanned && (
        <View className="bg-core-danger-soft-red-100 border border-core-danger-soft-red-300 rounded-xl p-4 mb-4 flex-row items-center gap-x-3">
          <AlertTriangle size={24} color={coreColor("#DC2626", 'danger')} />
          <View className="flex-1">
            <Text className="font-poppins-bold text-core-danger-red-700">Plagiarism Ban Active</Text>
            <Text className="font-poppins text-xs text-core-danger-red-600">Banned until: {new Date(participant.plagiarism_ban_until).toLocaleDateString()}</Text>
          </View>
          <TouchableOpacity onPress={handleBan} className="bg-core-surface-white px-3 py-1 rounded-lg border border-core-danger-soft-red-200">
            <Text className="font-poppins-bold text-xs text-core-danger-red-700">Manage</Text>
          </TouchableOpacity>
        </View>
      )}

      <View className={isDesktopProfile ? 'gap-y-2' : 'gap-y-3'}>
        <View>
      <SsfCard
        className="mb-0 w-full overflow-hidden"
        style={{ padding: 0, borderRadius: 10 }}
      >
        <LinearGradient
          colors={[coreColor('#D8F1EB', 'surface'), coreColor('#E2F4F0', 'surface'), coreColor('#DDF2ED', 'surface')]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: isDesktopProfile ? 70 : 88 }}
        />
        <View className={isDesktopProfile ? 'px-4 pb-4' : 'px-3 pb-3'}>
          <View
            className={`rounded-[10px] border border-core-success-soft-emerald-100 bg-core-surface-white shadow-sm ${isDesktopProfile ? 'p-3' : 'p-4'}`}
            style={{ marginTop: isDesktopProfile ? -24 : -38 }}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1 flex-row items-center">
                <View className={`${isDesktopProfile ? 'h-14 w-14 rounded-2xl' : 'h-16 w-16 rounded-[18px]'} items-center justify-center border border-core-success-soft-emerald-100 bg-core-success-soft-emerald-50`}>
                  <Text className={`${isDesktopProfile ? 'text-lg' : 'text-xl'} font-poppins-black text-core-success-emerald-800`}>
                    {avatarInitials}
                  </Text>
                </View>
                <View className="ml-3 flex-1">
                  <Text numberOfLines={2} className={`${isDesktopProfile ? 'text-[16px] leading-5' : 'text-[17px] leading-6'} font-poppins-black text-ssf-text`}>
                    {participant.name}
                  </Text>
                  <Text numberOfLines={1} className="mt-0.5 font-poppins text-[10px] text-ssf-text-muted">
                    {participant.email || participant.unique_code || 'Participant profile'}
                  </Text>
                  <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
                    {participant.category_code && (
                      <View className="rounded-lg border border-core-border-slate-200 bg-core-surface-muted-slate-50 px-2 py-1">
                        <Text className="font-poppins-bold text-[9px] uppercase text-core-text-slate-600">
                          {participant.category_code}
                        </Text>
                      </View>
                    )}
                    <View className="rounded-lg border border-core-success-soft-emerald-100 bg-core-success-soft-emerald-50 px-2 py-1">
                      <Text className="font-poppins-bold text-[9px] text-core-success-emerald-700">
                        Chest {participant.chest_number || 'N/A'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      disabled={locked}
                      onPress={promptStatusChange}
                      className={`rounded-lg border px-2 py-1 ${statColor.bg} ${statColor.border}`}
                    >
                      <Text className={`font-poppins-bold text-[9px] uppercase ${statColor.text}`}>
                        {participant.status || 'Pending'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              {isDesktopProfile && (
                <View className="ml-3 flex-row items-center gap-x-2">
                  <TouchableOpacity
                    onPress={toggleLock}
                    className={`h-9 w-9 items-center justify-center rounded-lg border ${locked ? 'border-core-danger-soft-red-200 bg-core-danger-soft-red-50' : 'border-core-success-soft-emerald-200 bg-core-surface-white'}`}
                  >
                    {locked ? <Lock size={15} color={coreColor("#DC2626", 'danger')} /> : <Unlock size={15} color={coreColor("#047857", 'success')} />}
                  </TouchableOpacity>
                  {!locked && !isEditing && (
                  <TouchableOpacity
                    className="flex-row items-center rounded-lg bg-ssf-primary px-4 py-2.5"
                    onPress={() => setIsEditing(true)}
                  >
                    <Edit3 size={15} color={ui.colors.onPrimary} />
                    <Text className="ml-1.5 font-poppins-bold text-[11px] text-core-on-primary-white">Edit</Text>
                  </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            {isEditing ? (
              <View className="mt-3 border-t border-core-border-slate-100 pt-2.5">
                <Text className="font-poppins text-ssf-text-muted mb-2 text-xs">Organisation (Team) *</Text>
                {availableOrganisations.length > 0 ? (
                  <View className="flex-row flex-wrap gap-2">
                    {availableOrganisations.map((org: any) => (
                      <TouchableOpacity
                        key={org.id}
                        className={`px-3 py-1.5 rounded-lg border ${selectedOrgId === org.id ? 'bg-ssf-primary border-ssf-primary' : 'bg-ssf-surface border-ssf-border'}`}
                        onPress={() => setSelectedOrgId(org.id)}
                      >
                        <Text className={`font-poppins-bold text-xs ${selectedOrgId === org.id ? 'text-core-on-primary-white' : 'text-ssf-text'}`}>
                          {org.name} <Text className="font-poppins font-normal text-[10px] opacity-80">({org.org_type})</Text>
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : organisations.length > 0 && (festivalLevel === 'sector' || festivalLevel === 'division') ? (
                  <Text className="font-poppins text-xs italic text-core-warning-amber-700">No subordinate organisations are available for this {festivalLevel}.</Text>
                ) : (
                  <Text className="font-poppins text-xs italic text-core-danger-red-500">Loading organisations...</Text>
                )}
              </View>
            ) : participant.organisations && (
              <View className="mt-3 flex-row items-center border-t border-core-border-slate-100 pt-2.5">
                <ShieldCheck size={14} color={coreColor("#047857", 'success')} />
                <Text numberOfLines={1} className="ml-2 flex-1 font-poppins-bold text-[10px] uppercase text-ssf-text">
                  {participant.organisations.name}
                </Text>
                <Text className="font-poppins text-[9px] uppercase text-ssf-text-muted">
                  {participant.organisations.org_type}
                </Text>
              </View>
            )}

            {!isDesktopProfile && (
              <View className="mt-3 flex-row gap-x-2 border-t border-core-border-slate-100 pt-3">
                <TouchableOpacity
                  onPress={toggleLock}
                  className={`h-11 flex-1 flex-row items-center justify-center rounded-xl border ${
                    locked ? 'border-core-danger-soft-red-200 bg-core-danger-soft-red-50' : 'border-core-success-soft-emerald-200 bg-core-success-soft-emerald-50'
                  }`}
                >
                  {locked ? <Lock size={16} color={coreColor("#DC2626", 'danger')} /> : <Unlock size={16} color={coreColor("#047857", 'success')} />}
                  <Text className={`ml-2 font-poppins-bold text-[11px] ${locked ? 'text-core-danger-red-600' : 'text-core-success-emerald-700'}`}>
                    {locked ? 'Unlock profile' : 'Lock profile'}
                  </Text>
                </TouchableOpacity>
                {!locked && !isEditing && (
                  <TouchableOpacity
                    className="h-11 flex-1 flex-row items-center justify-center rounded-xl bg-ssf-primary"
                    onPress={() => setIsEditing(true)}
                  >
                    <Edit3 size={16} color={ui.colors.onPrimary} />
                    <Text className="ml-2 font-poppins-bold text-[11px] text-core-on-primary-white">Edit details</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

        {participant.status === 'rejected' && participant.rejection_reason && (
          <View className="bg-core-danger-soft-red-50 p-3 rounded-lg mb-4 border border-core-danger-soft-red-100">
            <Text className="font-poppins-bold text-xs text-core-danger-red-700">Rejection Reason:</Text>
            <Text className="font-poppins text-sm text-core-danger-red-600">{participant.rejection_reason}</Text>
          </View>
        )}

        {isEditing ? (
          <SsfSheet
            visible={isEditing}
            onClose={() => setIsEditing(false)}
            title="Edit profile"
            description="Update participant details and public profile settings. Save when you’re done."
            footer={
              <>
                <SsfButton
                  label={isUpdatingParticipant ? 'Saving...' : 'Save changes'}
                  onPress={handleSave}
                  disabled={isUpdatingParticipant || (isCollegeFest && categoriesLoading)}
                />
                <SsfButton
                  label="Close"
                  variant="outline"
                  onPress={() => setIsEditing(false)}
                  disabled={isUpdatingParticipant}
                />
              </>
            }
          >
          <View className="gap-y-4">
            <View className="items-center rounded-2xl border border-core-success-soft-emerald-100 bg-core-success-soft-emerald-50 p-5">
              <Text className="mb-3 font-poppins-bold text-[10px] uppercase tracking-widest text-core-success-emerald-700">Live preview</Text>
              <View className="h-20 w-20 items-center justify-center rounded-full border-4 border-core-border-white bg-core-success-soft-emerald-200 shadow-sm">
                <Text className="font-poppins-black text-2xl text-core-success-emerald-900">
                  {(name || 'Participant').trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase()}
                </Text>
              </View>
              <Text className="mt-3 font-poppins-black text-xl text-ssf-text">{name || 'Participant name'}</Text>
              <Text className="font-poppins text-xs text-ssf-text-muted">
                {[categoryCode, participant.chest_number].filter(Boolean).join(' · ') || 'Candidate profile'}
              </Text>
            </View>
            <View>
              <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Name</Text>
              <TextInput className="border border-ssf-border rounded-xl p-3 font-poppins" value={name} onChangeText={setName} />
            </View>
            <View className="flex-row gap-x-3" style={{ zIndex: 50 }}>
              <View className="flex-1" style={{ zIndex: 50 }}>
                <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Category Code</Text>
                <SsfSelectMenu
                  value={categoryCode}
                  onValueChange={setCategoryCode}
                  placeholder="-- Select Category --"
                  accessibilityLabel="Select category"
                  options={categoryOptions}
                />
              </View>
              {(!festival?.gender_mode || festival.gender_mode === 'both') && <View className="flex-1" style={{ zIndex: 40 }}>
                <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Gender (boys/girls)</Text>
                <View className="flex-row gap-2">
                  {(['boys', 'girls'] as const).map(option => <TouchableOpacity key={option} onPress={() => setGender(option)} className={`min-h-10 flex-1 items-center justify-center rounded-lg border px-3 py-2 ${gender === option ? 'border-ssf-primary bg-ssf-primary' : 'border-core-border-slate-300 bg-core-surface-white'}`}><Text className={`font-poppins-bold text-sm capitalize ${gender === option ? 'text-core-on-primary-white' : 'text-ssf-text'}`}>{option}</Text></TouchableOpacity>)}
                </View>
              </View>}
            </View>
            <View>
              <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Date of Birth (YYYY-MM-DD)</Text>
              <SsfDatePicker value={dob} onValueChange={setDob} placeholder="Pick a date" />
            </View>
            {!isCollegeFest && <View className="flex-row gap-x-3">
              <View className="flex-1">
                <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Class / Standard</Text>
                <TextInput className="border border-ssf-border rounded-xl p-3 font-poppins" value={classStd} onChangeText={setClassStd} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Education Type</Text>
                <TextInput className="border border-ssf-border rounded-xl p-3 font-poppins" value={educationType} onChangeText={setEducationType} />
              </View>
            </View>}
            <View className="border-t border-core-border-gray-100 pt-4 gap-y-4">
              <View className="flex-row items-center gap-x-2">
                <Eye size={18} color={ui.colors.info} />
                <Text className="font-poppins-bold text-base text-ssf-text">Public Candidate Profile</Text>
              </View>
              <View>
                <Text className="text-sm font-poppins text-ssf-text-muted mb-2">Profile Photo</Text>
                <View className="flex-row items-center gap-3">
                  {photoPreviewUrl ? <Image source={{ uri: photoPreviewUrl }} style={{ width: 56, height: 56, borderRadius: 28 }} /> : <View className="h-14 w-14 items-center justify-center rounded-full border border-ssf-border bg-core-surface-muted-slate-50"><Text className="font-poppins text-xl text-ssf-text-muted">?</Text></View>}
                  <TouchableOpacity onPress={chooseProfilePhoto} className="min-h-10 flex-row items-center gap-2 rounded-xl border border-core-info-soft-blue-100 bg-core-info-soft-blue-50 px-3"><Upload size={15} color={coreColor("#2563EB", 'info')}/><Text className="font-poppins-bold text-xs text-core-info-blue-700">Select Photo</Text></TouchableOpacity>
                  {!!photoPreviewUrl && <TouchableOpacity onPress={clearProfilePhoto} className="min-h-10 rounded-xl border border-core-danger-soft-red-100 bg-core-danger-soft-red-50 px-3"><Text className="font-poppins-bold text-xs text-core-danger-red-700">Remove</Text></TouchableOpacity>}
                  {(isUploadingProfilePhoto || isRemovingProfilePhoto) && <ActivityIndicator size="small" color={ui.colors.primaryText} />}
                </View>
              </View>
              <View className="flex-row justify-between items-center bg-core-info-soft-blue-50 border border-core-info-soft-blue-100 rounded-xl p-3">
                <View className="flex-1 pr-3">
                  <Text className="font-poppins-bold text-sm text-ssf-text">Public profile enabled</Text>
                  <Text className="font-poppins text-xs text-ssf-text-muted">Allow this candidate profile to be opened publicly.</Text>
                </View>
                <Switch
                  value={publicProfileEnabled}
                  onValueChange={setPublicProfileEnabled}
                  trackColor={{ false: coreColor('#CBD5E1', 'primarySoft'), true: coreColor('#B9EBD1', 'primarySoft') }}
                  thumbColor={publicProfileEnabled ? ui.colors.success : coreColor('#F8FAFC', 'primary')}
                />
              </View>
              <View className="flex-row justify-between items-center bg-core-success-soft-green-50 border border-core-success-soft-green-100 rounded-xl p-3">
                <View className="flex-1 pr-3">
                  <Text className="font-poppins-bold text-sm text-ssf-text">Show organisation publicly</Text>
                  <Text className="font-poppins text-xs text-ssf-text-muted">Display organisation name on the public profile.</Text>
                </View>
                <Switch
                  value={showOrganisationPublic}
                  onValueChange={setShowOrganisationPublic}
                  trackColor={{ false: coreColor('#CBD5E1', 'primarySoft'), true: coreColor('#B9EBD1', 'primarySoft') }}
                  thumbColor={showOrganisationPublic ? ui.colors.success : coreColor('#F8FAFC', 'primary')}
                />
              </View>
            </View>
          </View>
          </SsfSheet>
        ) : (
          <View className={`${isDesktopProfile ? 'gap-y-2 border-t border-core-border-gray-100 pt-3' : 'gap-y-2 pt-3'}`}>
            <DetailAccordion
              title="Competition details"
              subtitle="Category, age and eligibility"
              expanded={expandedProfileSection === 'competition'}
              onToggle={() => setExpandedProfileSection((current) => current === 'competition' ? null : 'competition')}
            >
              <View className="flex-row flex-wrap gap-x-2 gap-y-1">
                <InfoTile label="Category" value={participant.category_code || '–'} style={{ width: '48.5%' }} />
                <InfoTile label="Gender" value={participant.gender || '–'} style={{ width: '48.5%' }} />
                <InfoTile label="Age" value={participant.age || '–'} style={{ width: '48.5%' }} />
                <InfoTile label="Date of birth" value={participant.dob || '–'} style={{ width: '48.5%' }} />
                <InfoTile label="Class / Standard" value={participant.class_std || '–'} style={{ width: '48.5%' }} />
                <InfoTile label="Education type" value={participant.education_type || '–'} style={{ width: '48.5%' }} />
                {participant.is_campus_parallel && (
                  <InfoTile label="Campus / Parallel" value="Yes" style={{ width: '48.5%' }} />
                )}
              </View>
            </DetailAccordion>

            <DetailAccordion
              title="Contact & institution"
              subtitle="Contact and membership information"
              expanded={expandedProfileSection === 'contact'}
              onToggle={() => setExpandedProfileSection((current) => current === 'contact' ? null : 'contact')}
            >
              <View className="flex-row flex-wrap gap-x-2 gap-y-1">
                <InfoTile label="Phone" value={participant.phone || '–'} style={{ width: '48.5%' }} />
                <InfoTile label="Email" value={participant.email || '–'} style={{ width: '48.5%' }} />
                <InfoTile label="Institution" value={participant.institution_name || '–'} style={{ width: '48.5%' }} />
                <InfoTile label="Membership no." value={participant.membership_no || '–'} style={{ width: '48.5%' }} />
              </View>
            </DetailAccordion>

            <DetailAccordion
              title="Verification"
              subtitle="Festival verification and identity"
              expanded={expandedProfileSection === 'verification'}
              onToggle={() => setExpandedProfileSection((current) => current === 'verification' ? null : 'verification')}
            >
              <View className="flex-row flex-wrap gap-x-2 gap-y-1">
                <InfoTile label="Unique code" value={participant.unique_code || '–'} style={{ width: '48.5%' }} />
                <InfoTile
                  label="Verification"
                  value={participant.is_verified ? 'Verified' : 'Not verified'}
                  tone={participant.is_verified ? 'success' : 'warning'}
                  style={{ width: '48.5%' }}
                />
                <InfoTile label="ID card" value={participant.id_card_uploaded ? 'Uploaded' : 'Not uploaded'} style={{ width: '48.5%' }} />
                {participant.residence_changed && (
                  <InfoTile label="Residence changed" value="Yes" style={{ width: '48.5%' }} />
                )}
              </View>
            </DetailAccordion>

            {!isBanned && (
              <TouchableOpacity onPress={handleBan} className="mt-1 self-start rounded-lg border border-core-danger-soft-red-100 bg-core-danger-soft-red-50 px-3 py-2">
                <Text className="font-poppins-bold text-[10px] text-core-danger-red-600">Add plagiarism ban</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        </View>
      </SsfCard>
        </View>

        <View
          className={isDesktopProfile ? 'flex-row items-start gap-2' : 'gap-y-3'}
        >
      <View style={isDesktopProfile ? { flex: 1 } : undefined}>
      <SsfCard
        className="mb-0 w-full p-3"
        style={{ borderRadius: 10 }}
      >
        <View className={`flex-row justify-between items-start ${publicSectionExpanded ? 'mb-3' : ''}`}>
          <TouchableOpacity
            onPress={() => setPublicSectionExpanded((current) => !current)}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityState={{ expanded: publicSectionExpanded }}
            className={`${isDesktopProfile ? 'gap-x-3' : 'gap-x-2.5'} flex-1 flex-row items-center`}
          >
            <View className={`h-10 w-10 items-center justify-center rounded-lg border ${participant.public_profile_enabled === false ? 'border-core-border-slate-200 bg-core-surface-muted-slate-100' : 'border-core-success-soft-emerald-100 bg-core-success-soft-emerald-50'}`}>
              {participant.public_profile_enabled === false ? (
                <EyeOff size={20} color={ui.colors.textMuted} />
              ) : (
                <Globe2 size={20} color={ui.colors.success} />
              )}
            </View>
            <View className="flex-1">
              <Text numberOfLines={isDesktopProfile ? 2 : 1} className="font-poppins-bold text-base text-ssf-text">
                {isDesktopProfile ? 'Public Candidate Profile' : 'Public Profile'}
              </Text>
              <Text numberOfLines={1} className={`${isDesktopProfile ? 'text-xs' : 'text-[10px]'} font-poppins text-ssf-text-muted`}>
                {isDesktopProfile ? 'Public-safe identity and leaderboard profile.' : 'Public identity & leaderboard'}
              </Text>
            </View>
            {publicSectionExpanded
              ? <ChevronDown size={17} color={coreColor("#047857", 'success')} />
              : <ChevronRight size={17} color={ui.colors.textMuted} />}
          </TouchableOpacity>
          {participant.profile_slug && participant.public_profile_enabled !== false && (
            <TouchableOpacity
              onPress={() => router.push(`/candidate/${participant.profile_slug}` as any)}
              accessibilityRole="button"
              accessibilityLabel="Open public profile"
              className={`${isDesktopProfile ? 'ml-3 px-3' : 'ml-2 w-9'} h-9 rounded-xl border border-core-info-soft-blue-100 bg-core-info-soft-blue-50 flex-row items-center justify-center gap-x-1.5`}
            >
              <ExternalLink size={15} color={ui.colors.info} />
              {isDesktopProfile && <Text className="font-poppins-bold text-[11px] text-core-info-blue-700">Open</Text>}
            </TouchableOpacity>
          )}
        </View>
        {publicSectionExpanded && <View className="border-t border-core-border-slate-100">
          <View className="flex-row">
            <View className="flex-1 py-3 pr-3">
              <View className="flex-row items-center">
                {participant.public_profile_enabled === false
                  ? <EyeOff size={14} color={ui.colors.textMuted} />
                  : <CheckCircle2 size={14} color={coreColor("#047857", 'success')} />}
                <Text className="ml-1.5 font-poppins text-[10px] uppercase tracking-wide text-ssf-text-muted">Visibility</Text>
              </View>
              <Text className={`mt-1 font-poppins-bold text-[13px] ${participant.public_profile_enabled === false ? 'text-core-text-muted-gray-500' : 'text-core-success-emerald-700'}`}>
                {participant.public_profile_enabled === false ? 'Disabled' : 'Public'}
              </Text>
            </View>
            <View className="flex-1 border-l border-core-border-slate-100 py-3 pl-3">
              <View className="flex-row items-center">
                <ShieldCheck size={14} color={participant.show_organisation_public === false ? ui.colors.textMuted : coreColor('#2563EB', 'info')} />
                <Text className="ml-1.5 font-poppins text-[10px] uppercase tracking-wide text-ssf-text-muted">Organisation</Text>
              </View>
              <Text className={`mt-1 font-poppins-bold text-[13px] ${participant.show_organisation_public === false ? 'text-core-text-muted-gray-500' : 'text-core-info-blue-700'}`}>
                {participant.show_organisation_public === false ? 'Hidden publicly' : 'Shown publicly'}
              </Text>
            </View>
          </View>
          <View className="border-t border-core-border-slate-100 py-3">
            <View className="mb-1 flex-row items-center">
              <CircleUserRound size={14} color={ui.colors.textMuted} />
              <Text className="ml-1.5 font-poppins text-[10px] uppercase tracking-wide text-ssf-text-muted">Profile slug</Text>
            </View>
            <Text selectable className="font-poppins-bold text-xs leading-5 text-ssf-text">
              {participant.profile_slug || 'Will be generated on save'}
            </Text>
          </View>
          <View className="border-t border-core-border-slate-100 pt-3">
            <Text className="mb-1 font-poppins text-[10px] uppercase tracking-wide text-ssf-text-muted">Public bio</Text>
            <Text className="font-poppins text-[13px] leading-5 text-ssf-text">
              {participant.profile_bio || 'No public bio added yet.'}
            </Text>
          </View>
        </View>}
      </SsfCard>
          </View>

          <View style={isDesktopProfile ? { flex: 1 } : undefined}>
      <SsfCard
        className="mb-0 w-full p-3"
        style={{ borderRadius: 10 }}
      >
        <View className={`flex-row justify-between items-center ${eventsSectionExpanded ? 'mb-3' : ''}`}>
          <TouchableOpacity
            onPress={() => setEventsSectionExpanded((current) => !current)}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityState={{ expanded: eventsSectionExpanded }}
            className="flex-row items-center flex-1"
          >
            <View className="h-10 w-10 items-center justify-center rounded-lg bg-core-warning-soft-amber-50">
              <Trophy size={17} color={ui.colors.warning} />
            </View>
            <View className="ml-2.5">
              <Text className="font-poppins-bold text-base">Assigned Items</Text>
              <Text className="font-poppins text-[10px] text-ssf-text-muted">
                {!registrationsFetched || registrationsError ? 'Tap to view items' : `${assignedItems.length} ${eventParticipationType} ${assignedItems.length === 1 ? 'item' : 'items'}`}
              </Text>
            </View>
            <View className="ml-auto mr-3">
              {eventsSectionExpanded
                ? <ChevronDown size={17} color={coreColor("#047857", 'success')} />
                : <ChevronRight size={17} color={ui.colors.textMuted} />}
            </View>
          </TouchableOpacity>
        </View>
        {eventsSectionExpanded && (
          <View className="gap-y-3">
            <SsfSelectMenu
              value={eventParticipationType}
              onValueChange={(value) => setEventParticipationType(value as 'individual' | 'group')}
              options={[
                { label: 'Individual', value: 'individual' },
                { label: 'Group', value: 'group' },
              ]}
              compact
              accessibilityLabel="Filter assigned items by participation type"
            />
            <View className="h-10 flex-row items-center rounded-lg border border-ui-border bg-core-surface-white px-3">
              <Search size={16} color={ui.colors.textMuted} />
              <TextInput
                value={assignedItemSearch}
                onChangeText={setAssignedItemSearch}
                placeholder={`Search ${eventParticipationType} items`}
                placeholderTextColor={ui.colors.textMuted}
                accessibilityLabel={`Search ${eventParticipationType} assigned items`}
                returnKeyType="search"
                className="ml-2 min-w-0 flex-1 py-0 font-poppins text-xs text-ui-text"
              />
            </View>
            {isLoadingRegistrations ? (
              <View className="flex-row items-center gap-x-2 py-2"><ActivityIndicator size="small" color={ui.colors.primary} /><Text className="font-poppins text-xs text-ssf-text-muted">Loading items...</Text></View>
            ) : registrationsError ? (
              <View className="flex-row items-center gap-x-2 py-2"><Text className="font-poppins text-xs text-ssf-text-muted">Unable to load items.</Text><TouchableOpacity accessibilityRole="button" onPress={() => { void retryRegistrations(); }}><Text className="font-poppins-bold text-xs text-ssf-primary">Retry</Text></TouchableOpacity></View>
            ) : assignedItems.length === 0 ? (
              <View className="items-center rounded-xl border border-dashed border-core-border-slate-200 bg-core-surface-muted-slate-50 px-4 py-6">
                <Trophy size={26} color={coreColor("#CBD5E1", 'text')} />
                <Text className="mt-2 font-poppins-bold text-xs text-ssf-text-muted">
                  {events.length === 0 ? 'No items assigned yet' : `No ${eventParticipationType} items assigned`}
                </Text>
              </View>
            ) : (
              filteredAssignedItems.length === 0 ? (
                <View className="rounded-xl border border-dashed border-core-border-slate-200 px-4 py-5">
                  <Text className="text-center font-poppins text-xs text-ssf-text-muted">No {eventParticipationType} items match this search.</Text>
                </View>
              ) : <View className="gap-y-2">
                {filteredAssignedItems.map((ev: any, index: number) => (
                  <View key={ev.id} className="flex-row items-center border-b border-core-border-slate-100 py-3 last:border-b-0">
                    <View className="h-8 w-8 items-center justify-center rounded-lg bg-core-surface-white">
                      <Text className="font-poppins-bold text-[11px] text-core-success-emerald-700">{index + 1}</Text>
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="font-poppins-bold text-[13px]">{ev.items?.item_name_en || 'Unknown Event'}</Text>
                      <Text className="font-poppins text-[10px] uppercase text-ssf-text-muted">{ev.level || 'Festival'} level</Text>
                    </View>
                    {ev.items?.item_code && (
                      <View className="rounded-lg border border-core-info-soft-blue-100 bg-core-info-soft-blue-50 px-2 py-1">
                        <Text className="font-poppins-bold text-[9px] text-core-info-blue-700">{ev.items.item_code}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </SsfCard>
          </View>
        </View>

      {!locked && (
        <View className={`mt-4 ${isDesktopProfile ? 'flex-row justify-end gap-x-2' : 'flex-col gap-y-2'}`}>
          {!participant.is_terminated ? (
            <SsfButton
              label="Terminate Participant"
              variant="outline"
              size={isDesktopProfile ? 'md' : 'sm'}
              className={isDesktopProfile ? 'border-core-warning-soft-amber-200 bg-core-warning-soft-amber-50' : 'w-full border-core-warning-soft-amber-200 bg-core-warning-soft-amber-50'}
              icon={<AlertTriangle size={16} color={coreColor("#D97706", 'warning')} />}
              onPress={handleTerminate}
              disabled={isTerminating}
            />
          ) : (
            <SsfButton
              label="Revoke Termination"
              variant="outline"
              size={isDesktopProfile ? 'md' : 'sm'}
              className={isDesktopProfile ? 'border-core-success-soft-emerald-200 bg-core-success-soft-emerald-50' : 'w-full border-core-success-soft-emerald-200 bg-core-success-soft-emerald-50'}
              icon={<Unlock size={16} color={coreColor("#059669", 'success')} />}
              onPress={handleRevokeTermination}
              disabled={isRevokingTermination}
            />
          )}
          <SsfButton
            label="Delete Participant"
            variant="outline"
            size={isDesktopProfile ? 'md' : 'sm'}
            className={isDesktopProfile ? '' : 'w-full border-core-danger-soft-red-100 bg-core-danger-soft-red-50'}
            icon={<Trash2 size={16} color={coreColor("#DC2626", 'danger')} />}
            onPress={handleDelete}
          />
        </View>
      )}
      </View>

      {/* Action Modal */}
      {actionModal.visible && (
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: coreAlpha(coreColor('#000000', 'overlay'), 0.6), justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: 20 }}>
          <View style={{ backgroundColor: ui.colors.surface, borderRadius: 16, width: '100%', maxWidth: 400, padding: 24, zIndex: 10000, elevation: 10 }}>
            <Text className="font-poppins-bold text-lg mb-2 text-ssf-text">{actionModal.title}</Text>
            {!!actionModal.message && <Text className="font-poppins text-sm text-ssf-text-muted mb-4">{actionModal.message}</Text>}
            
            {actionModal.type === 'status_select' && (
              <View className="mb-4">
                <SsfSelectMenu
                  value={actionModal.inputValue || 'pending'}
                  onValueChange={(val) => setActionModal({ ...actionModal, inputValue: val })}
                  options={[
                    { label: 'Pending', value: 'pending' },
                    { label: 'Approved', value: 'approved' },
                    { label: 'Rejected', value: 'rejected' },
                  ]}
                  placeholder="Select Status"
                />
              </View>
            )}

            {(actionModal.type === 'prompt_reason' || actionModal.type === 'prompt_date') && (
              <View className="mb-4">
                <TextInput
                  className="border border-ssf-border rounded-xl p-3 font-poppins text-ssf-text"
                  value={actionModal.inputValue}
                  onChangeText={(val) => setActionModal({ ...actionModal, inputValue: val })}
                  placeholder={actionModal.type === 'prompt_date' ? 'YYYY-MM-DD' : 'Enter reason here...'}
                  autoFocus
                />
              </View>
            )}

            <View className="flex-row justify-end gap-x-3 mt-2">
              {actionModal.type !== 'alert' && (
                <TouchableOpacity onPress={closeActionModal} className="px-4 py-2 rounded-xl border border-core-border-slate-200">
                  <Text className="font-poppins-bold text-ssf-text">Cancel</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => {
                  const action = actionModal.action;
                  const type = actionModal.type;
                  const val = type === 'status_select' ? { status: actionModal.inputValue } : actionModal.inputValue;
                  closeActionModal();
                  if (action) {
                    if (type === 'alert' || type === 'confirm') action();
                    else action(val);
                  }
                }}
                className={`px-4 py-2 rounded-xl ${actionModal.type === 'alert' ? 'bg-ssf-primary w-full items-center' : (actionModal.title.includes('Delete') || actionModal.title.includes('Remove') || actionModal.title.includes('Ban') ? 'bg-core-danger-action-red-600' : 'bg-ssf-primary')}`}
              >
                <Text className="font-poppins-bold text-core-on-primary-white">
                  {actionModal.type === 'alert' ? 'OK' : (actionModal.title.includes('Delete') || actionModal.title.includes('Remove') ? 'Confirm' : 'Proceed')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}


