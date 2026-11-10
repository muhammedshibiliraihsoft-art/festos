import { coreColor, coreAlpha } from '@/constants/coreTheme';
import { findParticipantQrEntry } from '../../../../core/utils/checkInIdentity';
import { GroupEntryRoster } from '../../../../components/stage/GroupEntryRoster';
import { ui } from '@/constants/designSystem';
import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SsfCard } from '../../../../components/ui/SsfCard';
import { SsfButton } from '../../../../components/ui/SsfButton';
import { SsfSelectMenu } from '@/components/ui/SsfSelectMenu';
import { useSchedule } from '../../../../core/hooks/useSchedule';
import { useStageManagement } from '../../../../core/hooks/useStageManagement';
import { stageManagementService } from '../../../../services/stageManagementService';
import { useQuery } from '@tanstack/react-query';
import { substageForChest } from '@/core/utils/scheduleSubstages';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Camera,
  Search,
  QrCode,
  Users,
  ShieldCheck,
  Lock,
} from 'lucide-react-native';

export default function CheckIn() {
  const [warningModal, setWarningModal] = useState<{ visible: boolean; title: string; message: string; action: (() => void) | null }>({
    visible: false,
    title: '',
    message: '',
    action: null
  });
  const [warningCountdown, setWarningCountdown] = useState(0);

  React.useEffect(() => {
    let timer: any;
    if (warningModal.visible && warningCountdown > 0) {
      timer = setTimeout(() => setWarningCountdown(c => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [warningModal.visible, warningCountdown]);

  const executeWithWarning = (title: string, message: string, action: () => void) => {
    setWarningModal({ visible: true, title, message, action });
    setWarningCountdown(8);
  };
  const { id } = useLocalSearchParams();
  const scheduleId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();

  const { schedules, isLoadingSchedules } = useSchedule();
  const schedule = schedules.find((s: any) => s.id === scheduleId);
  const substages = schedule?.substage_config ?? [];
  const [selectedSubstageId, setSelectedSubstageId] = useState('all');
  const [showCancelled, setShowCancelled] = useState(false);
  const [showUnverified, setShowUnverified] = useState(false);
  const checkinStateQuery = useQuery({
    queryKey: ['admin-schedule-checkin-state', scheduleId],
    queryFn: () => stageManagementService.getScheduleCheckinState(scheduleId!),
    enabled: !!scheduleId,
    staleTime: 10_000,
  });
  const cancelledIds = new Set(checkinStateQuery.data?.cancelled_ids ?? []);
  const submittedStageIds = new Set(checkinStateQuery.data?.submitted_stage_ids ?? []);

  const { registrations, registrationsQuery } = useStageManagement({ scheduleId });
  const {
    isLoading: isLoadingRegs,
    refetch,
  } = registrationsQuery;

  const [searchQuery, setSearchQuery] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [verifyModal, setVerifyModal] = useState<{
    reg: any;
    visible: boolean;
  }>({ reg: null, visible: false });

  // QR scanner state
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const hasScannedRef = useRef(false);
  const [scannerError, setScannerError] = useState('');

  // Starts the platform camera and its QR decoder.
  const startWebScanner = async () => {
    setScannerError('');
    hasScannedRef.current = false;

    if (Platform.OS === 'web') {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setScannerError('Camera scanning requires HTTPS (or localhost) and a browser with camera access.');
        setIsScannerOpen(true);
        return;
      }
    } else if (!cameraPermission?.granted) {
      try {
        const permission = await requestCameraPermission();
        if (!permission.granted) {
          setScannerError(
            permission.canAskAgain
              ? 'Camera permission is required to scan a chest card.'
              : 'Camera access is blocked in device settings. Enable camera permission and try again.'
          );
          setIsScannerOpen(true);
          return;
        }
      } catch {
        setScannerError('Unable to request camera permission. Check camera access in device settings.');
        setIsScannerOpen(true);
        return;
      }
    }

    setIsScannerOpen(true);
  };

  const stopWebScanner = () => {
    setIsScannerOpen(false);
  };

  const handleQRResult = (rawValue: string) => {
    if (hasScannedRef.current) return;
    hasScannedRef.current = true;
    stopWebScanner();
    try {
      let parsed: { chest?: string; pid?: string; cat?: string } = {};

      // Try parsing as URL first (New Format)
      try {
        const url = new URL(rawValue);
        if (url.pathname.includes('/candidate/')) {
           const pid = url.pathname.split('/').pop();
           const chest = url.searchParams.get('chest');
           const cat = url.searchParams.get('cat');
           if (pid) parsed = { pid, chest: chest || undefined, cat: cat || undefined };
        } else {
           parsed = JSON.parse(rawValue);
        }
      } catch (e) {
        // Fallback to JSON (Old Format)
        parsed = JSON.parse(rawValue);
      }

      const chest = parsed.chest || parsed.pid;
      const reg = findParticipantQrEntry((registrations ?? []).filter((row: any) => row.status !== 'rejected'), parsed);
      if (reg) {
        handleVerify(reg.id);
      } else {
        Alert.alert('Not Found', `No participant with chest number "${chest}" registered for this event.`);
      }
    } catch {
      Alert.alert('Invalid QR', 'Could not read the chest card QR code.');
    }
  };

  const handleVerify = async (regId: string) => {
    setIsUpdating(true);
    try {
      await stageManagementService.updateRegistration(scheduleId!, regId, 'verify');
      await checkinStateQuery.refetch();
      setVerifyModal({ reg: null, visible: false });
      refetch();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to verify participant');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUnverify = async (regId: string) => {
    executeWithWarning('Unverify Participant', 'Are you sure you want to unverify this participant? This may affect their results.', async () => {
    setIsUpdating(true);
    try {
      await stageManagementService.updateRegistration(scheduleId!, regId, 'unverify');
      await checkinStateQuery.refetch();
      refetch();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to unverify participant');
    } finally {
      setIsUpdating(false);
    }
});
  };

  const handleCancel = async (regId: string) => {
    executeWithWarning('Cancel check-in', 'Cancel this check-in? The participant remains registered and can be verified later.', async () => {
    setIsUpdating(true);
    try {
      const reg = registrations?.find((row: any) => row.id === regId);
      const stageId = substages.length ? substageForChest(substages, reg?.participants?.chest_number)?.id : '';
      if (stageId == null) throw new Error('This chest number is outside every sub-stage.');
      await stageManagementService.scheduleCheckinAction(scheduleId!, stageId, 'cancel_one', regId);
      setVerifyModal({ reg: null, visible: false });
      await checkinStateQuery.refetch();
      refetch();
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert('Error: ' + error.message);
      else Alert.alert('Error', error.message || 'Failed to cancel check-in');
    } finally {
      setIsUpdating(false);
    }
});
  };

  const handleCancelAllUnverified = async () => {
    const unverifiedRegs = activeRegistrations.filter((r: any) => !r.is_verified && !cancelledIds.has(r.id)
      && (!substages.length || substageForChest(substages, r.participants?.chest_number)?.id === selectedSubstageId));
    if (unverifiedRegs.length === 0) return;
    if (substages.length && selectedSubstageId === 'all') return;
    executeWithWarning('Cancel unverified check-ins', `Cancel ${unverifiedRegs.length} unverified check-ins in this stage? Registrations remain active.`, async () => {
      setIsUpdating(true);
      try {
        await stageManagementService.scheduleCheckinAction(scheduleId!, substages.length ? selectedSubstageId : '', 'cancel_remaining');
        await checkinStateQuery.refetch();
        refetch();
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Failed to cancel check-ins');
      } finally {
        setIsUpdating(false);
      }
    });
  };

  const filteredRegs = registrations?.filter(
    (r: any) => {
      if (r.status === 'rejected') return false;
      if (substages.length && selectedSubstageId !== 'all'
        && substageForChest(substages, r.participants?.chest_number)?.id !== selectedSubstageId) return false;
      if (!searchQuery || searchQuery.trim() === '') return true;
      const nameMatch = r.participants?.name ? r.participants.name.toLowerCase().includes(searchQuery.toLowerCase()) : false;
      const chestMatch = r.participants?.chest_number ? String(r.participants.chest_number).toLowerCase().includes(searchQuery.toLowerCase()) : false;
      return nameMatch || chestMatch;
    }
  );

  const activeRegistrations = useMemo(() => {
    return registrations?.filter((r: any) => r.status !== 'rejected') || [];
  }, [registrations]);

  const verifiedCount = activeRegistrations.filter((r: any) => r.is_verified).length || 0;
  const totalCount = activeRegistrations.length || 0;
  const allVerified = totalCount > 0 && verifiedCount === totalCount;
  const requiredStageIds: string[] = substages.length ? substages.map((stage: any) => stage.id) : [''];
  const allSubmitted = requiredStageIds.every((stageId) => submittedStageIds.has(stageId));
  const stageEntries = activeRegistrations.filter((reg: any) => !substages.length || selectedSubstageId === 'all'
    || substageForChest(substages, reg.participants?.chest_number)?.id === selectedSubstageId);
  const unresolvedCount = stageEntries.filter((reg: any) => !reg.is_verified && !cancelledIds.has(reg.id)).length;

  const submitStage = async () => {
    if (substages.length && selectedSubstageId === 'all') return;
    setIsUpdating(true);
    try {
      await stageManagementService.scheduleCheckinAction(scheduleId!, substages.length ? selectedSubstageId : '', 'submit');
      await checkinStateQuery.refetch();
    } catch (error: any) {
      Alert.alert('Unable to submit stage', error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoadingSchedules || isLoadingRegs) {
    return <ActivityIndicator color={coreColor("#1B6B3A", 'primaryText')} style={{ marginTop: 40 }} />;
  }

  const goBackSafely = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(admin)/schedule');
    }
  };

  const isShuffleLocked = schedule?.is_shuffle_locked;

  if (!schedule) {
    return (
      <View className="flex-1 bg-ssf-bg justify-center items-center p-6">
        <Text className="font-poppins text-ssf-text">Schedule not found.</Text>
        <SsfButton label="Go Back" onPress={goBackSafely} className="mt-4" />
      </View>
    );
  }
  if (checkinStateQuery.isLoading) return <ActivityIndicator color={coreColor('#1B6B3A', 'primaryText')} style={{ marginTop: 40 }} />;
  if (checkinStateQuery.isError) return <View className="flex-1 items-center justify-center bg-ssf-bg p-6"><Text className="font-poppins text-sm text-ssf-text">Could not load check-in state.</Text><SsfButton label="Retry" onPress={() => { void checkinStateQuery.refetch(); }} /></View>;

  return (
    <View className="flex-1 bg-ssf-bg">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ width: '100%', maxWidth: 960, alignSelf: 'center', padding: 12, paddingBottom: 28 }}
      >
        {/* Header */}
        <View className="flex-row items-center mb-3">
          <TouchableOpacity onPress={goBackSafely} className="mr-3 h-9 w-9 items-center justify-center rounded-lg border border-ui-border bg-core-surface-white">
            <ArrowLeft size={18} color={ui.colors.text} />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-lg font-poppins-black text-ssf-text">Green Room Check-In</Text>
            <Text className="font-poppins text-[11px] text-ssf-text-muted">{schedule.items?.item_name_en}</Text>
          </View>
          <SsfButton label="Debug" variant="outline" onPress={() => Alert.alert('Debug', `Total raw registrations fetched: ${registrations?.length || 0}`)} size="sm" />
        </View>

        {isShuffleLocked && (
          <View className="bg-core-warning-soft-amber-50 border border-core-warning-soft-amber-200 rounded-lg p-3 mb-3 flex-row items-center gap-x-3">
            <Lock size={20} color={coreColor("#B45309", 'warning')} />
            <Text className="font-poppins-bold text-core-warning-amber-700 flex-1">
              🔒 Event is locked by Stage Portal. Check-in is now read-only.
            </Text>
          </View>
        )}

        {substages.length ? <View className="mb-3"><SsfSelectMenu value={selectedSubstageId}
          onValueChange={setSelectedSubstageId} placeholder="All sub-stages"
          options={[{ label: 'All sub-stages', value: 'all' }, ...substages.map((stage: any) => ({ label: stage.name, value: stage.id }))]} /></View> : null}
        {!isShuffleLocked && (!substages.length || selectedSubstageId !== 'all') ? <View className="mb-3 flex-row flex-wrap gap-2">
          <SsfButton label={`Cancel remaining (${unresolvedCount})`} variant="outline" onPress={handleCancelAllUnverified}
            disabled={isUpdating || unresolvedCount === 0} />
          <SsfButton label={submittedStageIds.has(substages.length ? selectedSubstageId : '') ? 'Submitted' : 'Submit stage'}
            onPress={submitStage} disabled={isUpdating || unresolvedCount > 0 || submittedStageIds.has(substages.length ? selectedSubstageId : '')} />
        </View> : null}
        {allSubmitted ? <TouchableOpacity accessibilityRole="button" onPress={() => setShowUnverified(!showUnverified)} className="mb-2">
          <Text className="font-poppins-bold text-sm text-ui-primary-text">All unverified ({activeRegistrations.filter((reg: any) => !reg.is_verified).length})</Text>
        </TouchableOpacity> : null}
        {showUnverified && allSubmitted ? activeRegistrations.filter((reg: any) => !reg.is_verified).map((reg: any) => (
          <Text key={reg.id} className="mb-1 font-poppins text-xs text-ssf-text-muted">
            {substageForChest(substages, reg.participants?.chest_number)?.name ?? 'Main stage'} · {reg.participants?.name} · {reg.participants?.chest_number}
          </Text>
        )) : null}
        <TouchableOpacity accessibilityRole="button" onPress={() => setShowCancelled(!showCancelled)} className="mb-2">
          <Text className="font-poppins-bold text-sm text-ui-primary-text">All cancelled ({cancelledIds.size})</Text>
        </TouchableOpacity>
        {showCancelled ? activeRegistrations.filter((reg: any) => cancelledIds.has(reg.id)).map((reg: any) => (
          <Text key={reg.id} className="mb-1 font-poppins text-xs text-ssf-text-muted">
            {substageForChest(substages, reg.participants?.chest_number)?.name ?? 'Main stage'} · {reg.participants?.name} · {reg.participants?.chest_number}
          </Text>
        )) : null}

        {/* Progress Bar */}
        <SsfCard className="mb-3 p-3">
          <View className="flex-row justify-between items-center mb-2">
            <View className="flex-row items-center gap-x-2">
              <Users size={18} color={coreColor("#1B6B3A", 'primaryText')} />
              <Text className="font-poppins-bold text-ssf-text">Verified</Text>
            </View>
            <Text className="font-poppins-bold text-ui-primary-text text-lg">{verifiedCount}/{totalCount}</Text>
          </View>
          <View className="w-full h-2 bg-core-surface-muted-gray-100 rounded-full overflow-hidden">
            <View
              className="h-2 bg-ssf-primary rounded-full"
              style={{ width: totalCount > 0 ? `${(verifiedCount / totalCount) * 100}%` : '0%' }}
            />
          </View>
          {(substages.length ? allSubmitted : allVerified || allSubmitted) ? (
            <View className="mt-3 flex-row justify-between items-center">
              <View className="flex-row items-center gap-x-1">
                <ShieldCheck size={16} color={coreColor("#16A34A", 'success')} />
                <Text className="font-poppins-bold text-core-success-green-700 text-sm">All stages submitted</Text>
              </View>
              <SsfButton
                label="Start Draw →"
                size="sm"
                onPress={() => router.push(`/(admin)/schedule/${scheduleId}/code-letter` as any)}
              />
            </View>
          ) : (
            totalCount > 0 && !isShuffleLocked && (
              <View className="mt-3 flex-row justify-between items-center bg-core-warning-soft-amber-50 border border-core-warning-soft-amber-200 p-2.5 rounded-lg">
                <Text className="font-poppins-bold text-core-warning-amber-700 text-xs">
                  {activeRegistrations.filter((reg: any) => !reg.is_verified && !cancelledIds.has(reg.id)).length} participants remain unverified.
                </Text>
              </View>
            )
          )}
        </SsfCard>

        {/* Scan QR Button */}
        {!isShuffleLocked && (
          <TouchableOpacity
            onPress={startWebScanner}
            className="h-11 rounded-lg border border-core-success-soft-emerald-200 bg-core-surface-white mb-3 flex-row justify-center items-center gap-x-2"
          >
            <QrCode size={18} color={coreColor("#0F766E", 'primaryText')} />
            <Text className="font-poppins-bold text-core-success-emerald-700 text-sm">Scan Chest Card QR</Text>
          </TouchableOpacity>
        )}

        {/* Search */}
        <View className="h-10 border border-ssf-border rounded-lg bg-core-surface-white px-3 flex-row items-center mb-3">
          <Search size={16} color={coreColor("#9CA3AF", 'textMuted')} className="mr-2" />
          <input
            style={{ flex: 1, border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 14, color: ui.colors.text, background: 'transparent' }}
            placeholder="Search by name or chest number..."
            value={searchQuery}
            onChange={(e: any) => setSearchQuery(e.target.value)}
          />
        </View>

        {/* List */}
        <SsfCard className="mb-6 p-0 overflow-hidden">
          {!filteredRegs || filteredRegs.length === 0 ? (
            <Text className="font-poppins text-ssf-text-muted py-4 text-center">No participants found.</Text>
          ) : (
            <View>
              {filteredRegs.map((reg: any) => {
                const isRejected = reg.status === 'rejected';

                return (
                  <View
                    key={reg.id}
                    className={`min-h-[64px] flex-row items-center justify-between px-3 py-2 border-b border-core-border-gray-100 last:border-0 ${
                      isRejected ? 'opacity-60' : ''
                    }`}
                  >
                    {/* Participant Info */}
                    <View className="flex-row items-center flex-1">
                      {/* Avatar circle */}
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: isRejected ? ui.colors.destructiveSoft : reg.is_verified ? ui.colors.successSoft : ui.colors.surfaceMuted,
                          borderWidth: 2,
                          borderColor: isRejected ? coreColor('#EF4444', 'border') : reg.is_verified ? coreColor('#16A34A', 'border') : ui.colors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 10,
                        }}
                      >
                        <Text style={{ fontWeight: '900', fontSize: 11, color: isRejected ? coreColor('#EF4444', 'danger') : reg.is_verified ? coreColor('#16A34A', 'success') : coreColor('#6B7280', 'text') }}>
                          {reg.participants?.chest_number || '?'}
                        </Text>
                      </View>
                      <View className="min-w-0 flex-1">
                        <View className="flex-row items-center gap-x-2">
                          <Text numberOfLines={1} className={`font-poppins-bold text-[12px] ${isRejected ? 'text-core-text-muted-slate-400 line-through' : 'text-ssf-text'}`}>
                            {reg.participants?.name}
                          </Text>
                          {cancelledIds.has(reg.id) ? <Text className="font-poppins-bold text-[10px] text-core-warning-amber-700">Cancelled</Text> : null}
                          {isRejected && (
                            <View className="bg-core-danger-soft-red-100 border border-core-danger-soft-red-200 px-1.5 py-0.5 rounded">
                              <Text className="text-[8px] font-poppins-bold text-core-danger-red-600 uppercase">Removed in Programs</Text>
                            </View>
                          )}
                        </View>
                        <Text className="font-poppins text-xs text-ssf-text-muted">
                          {reg.participants?.category_code} · Chest {reg.participants?.chest_number}
                        </Text>
                        <GroupEntryRoster entry={reg} />
                        {reg.participants?.organisations?.name ? (
                          <View className="flex-row items-center mt-0.5">
                            <View className="bg-core-info-soft-blue-50 border border-core-info-soft-blue-100 px-1.5 py-0.5 rounded-full">
                              <Text className="font-poppins-bold text-[10px] text-core-info-blue-700">
                                🏫 {reg.participants.organisations.name}
                              </Text>
                            </View>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    {/* Verify/Restore toggle */}
                    {isRejected ? (
                      <Text className="font-poppins text-xs text-ssf-text-muted">Manage in Programs</Text>
                    ) : (
                      <TouchableOpacity
                        disabled={isUpdating || isShuffleLocked}
                        onPress={() => {
                          if (reg.is_verified) {
                            handleUnverify(reg.id);
                          } else {
                            // Manual verify — show the photo popup
                            setVerifyModal({ reg, visible: true });
                          }
                        }}
                        className={`flex-row items-center gap-x-1 px-3 py-1.5 rounded-full border ${
                          reg.is_verified
                            ? 'bg-core-success-soft-green-50 border-core-success-soft-green-200'
                            : 'bg-core-surface-muted-gray-50 border-core-border-gray-200'
                        } ${isShuffleLocked ? 'opacity-50' : ''}`}
                      >
                        {reg.is_verified ? (
                          <CheckCircle2 size={16} color={coreColor("#16A34A", 'success')} />
                        ) : (
                          <Camera size={16} color={coreColor("#9CA3AF", 'textMuted')} />
                        )}
                        <Text className={`font-poppins-bold text-xs ${reg.is_verified ? 'text-core-success-green-700' : 'text-core-text-muted-gray-500'}`}>
                          {reg.is_verified ? 'Verified' : 'Verify'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </SsfCard>
      </ScrollView>

      {/* ───── QR Scanner Modal ───── */}
      {isScannerOpen && (
        <View
          style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
            backgroundColor: coreAlpha(coreColor('#000000', 'surface'), 0.92), justifyContent: 'center', alignItems: 'center', zIndex: 100,
          }}
        >
          <View style={{ width: '90%', maxWidth: 380, backgroundColor: coreColor('#111', 'surfaceStrong'), borderRadius: 20, overflow: 'hidden' }}>
            {/* Title bar */}
            <View style={{ backgroundColor: coreColor('#1B6B3A', 'primary'), padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: ui.colors.onPrimary, fontWeight: '900', fontSize: 16 }}>📷 Scan Chest Card</Text>
              <TouchableOpacity onPress={stopWebScanner}>
                <XCircle size={24} color={ui.colors.onPrimary} />
              </TouchableOpacity>
            </View>

            {/* Camera preview */}
            <View style={{ position: 'relative', height: 320, backgroundColor: ui.shadow.shadowColor, alignItems: 'center', justifyContent: 'center' }}>
              {scannerError ? (
                <Text style={{ color: coreColor('#F87171', 'danger'), fontSize: 13, textAlign: 'center', padding: 20 }}>
                  {scannerError}
                </Text>
              ) : (
                <CameraView
                  style={{ width: '100%', height: '100%' }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => handleQRResult(data)}
                  onMountError={(event) => setScannerError(event.message || 'Camera could not be started.')}
                />
              )}
              {/* Scan overlay corners */}
              <View style={{ position: 'absolute', top: 60, left: 60, width: 180, height: 180, pointerEvents: 'none' }}>
                {/* TL */}
                <View style={{ position: 'absolute', top: 0, left: 0, width: 30, height: 4, backgroundColor: coreColor('#1B6B3A', 'primary'), borderRadius: 2 }} />
                <View style={{ position: 'absolute', top: 0, left: 0, width: 4, height: 30, backgroundColor: coreColor('#1B6B3A', 'primary'), borderRadius: 2 }} />
                {/* TR */}
                <View style={{ position: 'absolute', top: 0, right: 0, width: 30, height: 4, backgroundColor: coreColor('#1B6B3A', 'primary'), borderRadius: 2 }} />
                <View style={{ position: 'absolute', top: 0, right: 0, width: 4, height: 30, backgroundColor: coreColor('#1B6B3A', 'primary'), borderRadius: 2 }} />
                {/* BL */}
                <View style={{ position: 'absolute', bottom: 0, left: 0, width: 30, height: 4, backgroundColor: coreColor('#1B6B3A', 'primary'), borderRadius: 2 }} />
                <View style={{ position: 'absolute', bottom: 0, left: 0, width: 4, height: 30, backgroundColor: coreColor('#1B6B3A', 'primary'), borderRadius: 2 }} />
                {/* BR */}
                <View style={{ position: 'absolute', bottom: 0, right: 0, width: 30, height: 4, backgroundColor: coreColor('#1B6B3A', 'primary'), borderRadius: 2 }} />
                <View style={{ position: 'absolute', bottom: 0, right: 0, width: 4, height: 30, backgroundColor: coreColor('#1B6B3A', 'primary'), borderRadius: 2 }} />
              </View>
            </View>

            <View style={{ padding: 16, alignItems: 'center' }}>
              {!scannerError && (
                <Text style={{ color: coreColor('#9CA3AF', 'textMuted'), fontSize: 13 }}>Point camera at the chest card QR code</Text>
              )}
            </View>
          </View>
        </View>
      )}

      {/* ───── Verification Popup (Photo shown to coordinator) ───── */}
      {verifyModal.visible && verifyModal.reg && (
        <View
          style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
            backgroundColor: coreAlpha(coreColor('#000000', 'surface'), 0.75), justifyContent: 'center', alignItems: 'center', zIndex: 200, padding: 20,
          }}
        >
          <ScrollView style={{ backgroundColor: ui.colors.surface, borderRadius: 20, width: '100%', maxWidth: 360, overflow: 'hidden', maxHeight: '95%', flexGrow: 0 }}>
            {/* Green header */}
            <View style={{ backgroundColor: coreColor('#1B6B3A', 'primary'), padding: 16, alignItems: 'center' }}>
              <Text style={{ color: ui.colors.onPrimary, fontWeight: '900', fontSize: 18 }}>Identity Verification</Text>
              <Text style={{ color: coreAlpha(coreColor('#ffffff', 'textMuted'), 0.7), fontSize: 12, marginTop: 2 }}>
                {verifyModal.reg.entry_kind === 'general_team' ? 'Confirm this group entry' : 'Confirm this is the right participant'}
              </Text>
            </View>

            <View style={{ padding: 24, alignItems: 'center' }}>
              {/* Large Photo — shown ONLY to coordinator, not printed on card */}
              <View style={{
                width: 120, height: 120, borderRadius: 60, overflow: 'hidden',
                borderWidth: 4, borderColor: coreColor('#1B6B3A', 'border'),
                backgroundColor: ui.colors.surfaceMuted, marginBottom: 16,
                alignItems: 'center', justifyContent: 'center',
              }}>
                {verifyModal.reg.entry_kind === 'general_team' ? <Users size={48} color={coreColor("#1B6B3A", 'primaryText')} /> : verifyModal.reg.participants?.photo_url ? (
                  <Image
                    source={{ uri: verifyModal.reg.participants.photo_url }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={{ fontSize: 48 }}>👤</Text>
                )}
              </View>

              {/* Name & Details */}
              <Text style={{ fontSize: 22, fontWeight: '900', color: coreColor('#111827', 'text'), marginBottom: 4 }}>
                {verifyModal.reg.participants?.name}
              </Text>
              <View style={{
                backgroundColor: coreColor('#F0FDF4', 'successSoft'), borderWidth: 1, borderColor: coreColor('#BBF7D0', 'border'),
                borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 8,
              }}>
                <Text style={{ color: coreColor('#16A34A', 'success'), fontWeight: '700', fontSize: 16 }}>
                  Chest #{verifyModal.reg.participants?.chest_number}
                </Text>
              </View>
              <Text style={{ color: coreColor('#6B7280', 'text'), fontSize: 13 }}>
                {verifyModal.reg.participants?.category_code}
                {verifyModal.reg.participants?.organisations?.name
                  ? ` · 🏫 ${verifyModal.reg.participants.organisations.name}`
                  : ''}
              </Text>
                        <GroupEntryRoster entry={verifyModal.reg} />

              {/* Instruction */}
              <View style={{ backgroundColor: coreColor('#FEF3C7', 'warningSoft'), borderRadius: 10, padding: 12, width: '100%', marginTop: 16, marginBottom: 20 }}>
                <Text style={{ color: coreColor('#92400E', 'warning'), fontSize: 12, textAlign: 'center', fontWeight: '600' }}>
                  {verifyModal.reg.entry_kind === 'general_team' ? 'Confirm the group chest number, program and team. One representative can check in this entry.' : '⚠️ Compare the photo above with the person standing in front of you before approving.'}
                </Text>
              </View>

              {/* Buttons */}
              <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
                <TouchableOpacity
                  disabled={isUpdating}
                  onPress={() => handleCancel(verifyModal.reg.id)}
                  style={{
                    flex: 1, borderWidth: 2, borderColor: coreColor('#EF4444', 'border'),
                    borderRadius: 12, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
                  }}
                >
                  <XCircle size={18} color={coreColor("#EF4444", 'danger')} />
                  <Text style={{ color: coreColor('#EF4444', 'danger'), fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={isUpdating}
                  onPress={() => handleVerify(verifyModal.reg.id)}
                  style={{
                    flex: 1, backgroundColor: coreColor('#1B6B3A', 'primary'),
                    borderRadius: 12, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
                  }}
                >
                  <CheckCircle2 size={18} color={ui.colors.onPrimary} />
                  <Text style={{ color: ui.colors.onPrimary, fontWeight: '700' }}>
                    {isUpdating ? 'Saving...' : 'Verify'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      )}
    
      {/* 🔴 RED WARNING MODAL */}
      {warningModal.visible && (
        <View
          style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
            backgroundColor: coreAlpha(coreColor('#dc2626', 'surface'), 0.95), justifyContent: 'center', alignItems: 'center', zIndex: 999,
          }}
        >
          <View style={{ width: '90%', maxWidth: 400, backgroundColor: coreColor('#FEF2F2', 'dangerSoft'), borderRadius: 20, padding: 24, alignItems: 'center' }}>
            <XCircle size={48} color={coreColor("#DC2626", 'danger')} style={{ marginBottom: 16 }} />
            <Text style={{ fontSize: 22, fontWeight: '900', color: coreColor('#991B1B', 'danger'), textAlign: 'center', marginBottom: 12 }}>
              {warningModal.title}
            </Text>
            <Text style={{ fontSize: 16, color: coreColor('#7F1D1D', 'danger'), textAlign: 'center', marginBottom: 24, lineHeight: 24 }}>
              {warningModal.message}
            </Text>
            
            <View style={{ width: '100%', gap: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  setWarningModal({ visible: false, title: '', message: '', action: null });
                  setWarningCountdown(0);
                }}
                style={{ backgroundColor: coreColor('#EF4444', 'dangerAction'), padding: 16, borderRadius: 12, alignItems: 'center' }}
              >
                <Text style={{ color: coreColor('white', 'onPrimary'), fontWeight: 'bold', fontSize: 16 }}>Cancel (Safe)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={warningCountdown > 5}
                onPress={() => {
                  if (warningModal.action) warningModal.action();
                  setWarningModal({ visible: false, title: '', message: '', action: null });
                  setWarningCountdown(0);
                }}
                style={{ 
                  backgroundColor: warningCountdown > 5 ? coreColor('#FECACA', 'dangerSoft') : coreColor('#991B1B', 'dangerAction'),
                  padding: 16, borderRadius: 12, alignItems: 'center',
                  borderWidth: 2, borderColor: coreColor('#7F1D1D', 'border')
                }}
              >
                <Text style={{ color: warningCountdown > 5 ? coreColor('#F87171', 'danger') : coreColor('white', 'onPrimary'), fontWeight: 'bold', fontSize: 16 }}>
                  {warningCountdown > 5 ? `Wait ${warningCountdown - 5}s...` : 'Skip & Proceed'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
</View>
  );
}
