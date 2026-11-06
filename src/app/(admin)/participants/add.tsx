import { coreColor, coreAlpha } from '@/constants/coreTheme';
import { ui } from '@/constants/designSystem';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TextInput, Alert, TouchableOpacity, Platform, Switch, Image, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { participantService, type OrganisationOption } from '../../../services/participantService';
import { organisationService } from '../../../services/organisationService';
import { useAuthStore } from '../../../core/store/authStore';
import { getCategory, validateParticipant, calculateAge, getCutoffDate, DEFAULT_FESTIVAL_YEAR, checkClassAgeConsistency, getCategoryDOBRange, type CategoryCode } from '../../../core/utils/participantValidation';
import { Building2, CalendarDays, Eye, Globe2, Trophy, Upload, UserRound, UserRoundPlus } from 'lucide-react-native';
import { SsfDatePicker } from '../../../components/ui/SsfDatePicker';
import { useFestival } from '../../../core/hooks/useFestival';
import { useFestivalCategories } from '../../../core/hooks/useFestivalCategories';

// ─── Constants ────────────────────────────────────────────────────────────────

const CAMPUS_TYPES = ['Degree', 'PG', 'ITI', 'Polytechnic', 'D.Ed', 'B.Ed'];

const CLASS_OPTIONS = [
  '1', '2', '3', '4',       // LP
  '5', '6', '7',            // UP
  '8', '9', '10',           // HS
  '11', '12',               // HSS
];

const JUNIOR_SENIOR_OPTIONS: { label: string; value: 'JUNIOR' | 'SENIOR'; age: string; color: string }[] = [
  { label: 'JUNIOR', value: 'JUNIOR', age: 'Born 01 June 2006 – 31 May 2011', color: coreColor('#1B6B3A', 'primaryText') },
  { label: 'SENIOR', value: 'SENIOR', age: 'Born 01 June 2000 – 31 May 2006', color: coreColor('#1B6B3A', 'primaryText') },
];

const CATEGORY_LABELS: Record<CategoryCode, string> = {
  LP:     'LP – Lower Primary (Class 1–4)',
  UP:     'UP – Upper Primary (Class 5–7)',
  HS:     'HS – High School (Class 8–10)',
  HSS:    'HSS – Higher Secondary (Class 11–12)',
  JUNIOR: 'JUNIOR – Born between 01 June 2006 and 31 May 2011',
  SENIOR: 'SENIOR – Born between 01 June 2000 and 31 May 2006',
  CAMPUS: 'CAMPUS – College Level',
  GENERAL: 'GENERAL – Open Category',
};

function getCategoryLabel(code: CategoryCode): string {
  return CATEGORY_LABELS[code] || code;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Auto-formats typed digits into YYYY-MM-DD as user types on mobile.
 * Example: '20081' → '2008-1', '200812' → '2008-12', '20081215' → '2008-12-15'
 */
function formatDOBInput(text: string): string {
  // Strip everything except digits
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddParticipant() {
  const router = useRouter();
  const { tenant_id } = useAuthStore();
  const { useActiveFestival } = useFestival();
  const { data: activeFestival, isLoading: isFestivalLoading } = useActiveFestival();
  const validTenantId = tenant_id;
  const festivalId = activeFestival?.id;
  const festivalGenderMode = activeFestival?.gender_mode ?? 'both';
  const isGenderFixedByFestival = festivalGenderMode !== 'both';
  const [selectedGender, setSelectedGender] = useState<'boys' | 'girls'>('boys');
  const gender: 'boys' | 'girls' = festivalGenderMode === 'boys_only'
    ? 'boys'
    : festivalGenderMode === 'girls_only'
      ? 'girls'
      : selectedGender;
  const festivalYear = activeFestival?.festival_year ?? DEFAULT_FESTIVAL_YEAR;
  const isCollegeFest = activeFestival?.festival_template === 'college_fest';
  const { data: collegeCategories = [], isLoading: categoriesLoading, error: categoriesError } =
    useFestivalCategories(isCollegeFest ? festivalId : undefined, true);
  const participantCollegeCategories = collegeCategories.filter(category => category.code.toUpperCase() !== 'GN');


  // Form state
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');           // YYYY-MM-DD
  const [classStd, setClassStd] = useState(''); // '1'–'12'
  const [educationType, setEducationType] = useState(''); // campus type
  const [manualCategory, setManualCategory] = useState<'JUNIOR' | 'SENIOR' | ''>(''); // explicit J/S pick
  const [collegeCategory, setCollegeCategory] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [organisations, setOrganisations] = useState<OrganisationOption[]>([]);
  const [tenantOrganisationId, setTenantOrganisationId] = useState<string | null>(null);
  const [isOrganisationsLoading, setIsOrganisationsLoading] = useState(false);
  const [organisationsLoadError, setOrganisationsLoadError] = useState('');
  const [loading, setLoading] = useState(false);

  // Unified Candidate Profile settings state
  const [publicProfileEnabled, setPublicProfileEnabled] = useState(true);
  const [showOrganisationPublic, setShowOrganisationPublic] = useState(true);
  const [photoFile, setPhotoFile] = useState<any>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  // Derived / display state
  const [resolvedCategory, setResolvedCategory] = useState<CategoryCode | null>(null);
  const [categoryError, setCategoryError] = useState('');
  const [ageClassWarning, setAgeClassWarning] = useState('');
  const dobInputRef = useRef<any>(null);
  const categoryFestivalRef = useRef<string | undefined>(festivalId);

  const festivalLevel = String(activeFestival?.level || '').trim().toLowerCase();
  const availableOrganisations = (activeFestival?.chest_number_template === 'team' || festivalLevel === 'sector' || festivalLevel === 'division')
    ? organisations.filter((organisation) => organisation.parent_id === tenantOrganisationId)
    : organisations;

  useEffect(() => {
    if (selectedOrgId && !availableOrganisations.some((organisation) => organisation.id === selectedOrgId)) {
      setSelectedOrgId('');
    }
  }, [selectedOrgId, availableOrganisations]);

  useEffect(() => {
    if (categoryFestivalRef.current !== festivalId) {
      setCollegeCategory('');
      categoryFestivalRef.current = festivalId;
    }
  }, [festivalId]);

  // Local photo handlers
  const handlePhotoSelect = () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Upload unavailable', 'Photo selection is currently supported on web.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      setPhotoFile(file);
      const url = URL.createObjectURL(file);
      setPhotoPreviewUrl(url);
    };
    input.click();
  };

  const handlePhotoRemove = () => {
    setPhotoFile(null);
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
      setPhotoPreviewUrl(null);
    }
  };

  // Fetch org type for org label and available hierarchies
  useEffect(() => {
    if (!validTenantId) {
      setOrganisations([]);
      setTenantOrganisationId(null);
      setIsOrganisationsLoading(false);
      setOrganisationsLoadError('');
      return;
    }

    let cancelled = false;
    setOrganisations([]);
    setTenantOrganisationId(null);
    setIsOrganisationsLoading(true);
    setOrganisationsLoadError('');
    Promise.all([
      participantService.listOrganisations(validTenantId),
      organisationService.getMyOrganisation(validTenantId),
    ])
      .then(([data, tenantOrganisation]) => {
        if (!cancelled) {
          setOrganisations(data);
          setTenantOrganisationId(tenantOrganisation?.id ?? null);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setOrganisations([]);
        setTenantOrganisationId(null);
        setOrganisationsLoadError(error instanceof Error ? error.message : 'Could not load organisations.');
      })
      .finally(() => {
        if (!cancelled) setIsOrganisationsLoading(false);
      });

    return () => { cancelled = true; };
  }, [validTenantId]);

  // Auto-resolve category whenever inputs change
  useEffect(() => {
    setCategoryError('');
    setResolvedCategory(null);
    setAgeClassWarning('');

    if (isCollegeFest) {
      setResolvedCategory(null);
      return;
    }

    // If user manually picked JUNIOR/SENIOR, use that directly
    if (manualCategory && !classStd && !educationType) {
      setResolvedCategory(manualCategory);
      // Warn if DOB doesn't match the manual choice
      if (dob) {
        try {
          const dobDate = new Date(dob);
          if (!isNaN(dobDate.getTime())) {
            const { minDOB, maxDOB, label } = getCategoryDOBRange(manualCategory, festivalYear);
            if (dobDate <= minDOB || dobDate > maxDOB) {
              setAgeClassWarning(`⚠️ DOB doesn't match ${manualCategory} category. Eligibility: ${label}.`);
            }
          }
        } catch { /* invalid dob */ }
      }
      return;
    }

    try {
      const cat = getCategory({
        dob: dob || null,
        class_std: classStd ? parseInt(classStd, 10) : null,
        education_type: educationType || null,
      }, festivalYear);
      setResolvedCategory(cat);

      // Sync manual category if auto-resolved to JUNIOR/SENIOR
      if (cat === 'JUNIOR' || cat === 'SENIOR') {
        setManualCategory(cat);
      }

      // Real-time age-class consistency check
      if (dob && classStd && ['LP','UP','HS','HSS'].includes(cat)) {
        const age = calculateAge(dob, festivalYear);
        const warn = checkClassAgeConsistency(cat, age);
        if (warn) setAgeClassWarning(warn);
      }

      // Real-time CAMPUS minimum age check
      if (cat === 'CAMPUS' && dob) {
        try {
          const age = calculateAge(dob, festivalYear);
          if (age < 15) {
            setAgeClassWarning(`⚠️ Age ${age} is too young for college/CAMPUS. Minimum age is 15.`);
          }
        } catch {
          // invalid dob — ignore
        }
      }
    } catch {
      // Not enough info yet — that's fine
    }
  }, [dob, classStd, educationType, manualCategory, festivalYear, isCollegeFest, collegeCategory]);

  // ─── Save Handler ───────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (isFestivalLoading) {
      Alert.alert('Please wait', 'Festival information is still loading.');
      return;
    }
    if (!festivalId) {
      Alert.alert('Festival Required', 'Create or activate a festival before adding participants.');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Error', 'Full Name is required.');
      return;
    }

    if (!selectedOrgId) {
      Alert.alert('Error', 'Please select an organisation.');
      return;
    }

    // Validate and get category
    let category: string;
    try {
      if (isCollegeFest) {
        const selected = collegeCategory;
        if (!selected || !participantCollegeCategories.some(item => item.code === selected)) {
          Alert.alert('Validation Error', 'Please select an active College Fest category.');
          return;
        }
        category = selected;
      } else if (manualCategory && !classStd && !educationType) {
        // Manual JUNIOR/SENIOR selection — DOB is required for chest number logic
        if (!dob) {
          Alert.alert('Validation Error', `Date of Birth is required for ${manualCategory} category.`);
          return;
        }
        category = validateParticipant({
          dob: dob || null,
          class_std: null,
          education_type: null,
        }, festivalYear);
      } else {
        category = validateParticipant({
          dob: dob || null,
          class_std: classStd ? parseInt(classStd, 10) : null,
          education_type: educationType || null,
        }, festivalYear);
      }
    } catch (err: any) {
      Alert.alert('Validation Error', err.message);
      return;
    }

    setLoading(true);

    let chest_number = '';

    // Calculate age for storage
    const ageNum = dob ? calculateAge(dob, festivalYear) : null;

    const targetOrg = organisations.find(o => o.id === selectedOrgId);
    const targetTenantId = targetOrg?.tenant_id || validTenantId;

    let saveError: Error | null = null;
    let photoUploadError: Error | null = null;
    try {
      if (!targetTenantId) {
        throw new Error('Unable to determine the participant tenant. Please reselect the organisation.');
      }
      const newParticipant = await participantService.createParticipantWithChestNumber<any>({
        tenant_id: targetTenantId,
        festival_id: festivalId,
        organisation_id: selectedOrgId,
        name: name.trim(),
        category_code: category,
        status: 'approved',
        age: ageNum,
        class_std: isCollegeFest ? null : classStd || null,
        dob: dob || null,
        gender,
        public_profile_enabled: publicProfileEnabled,
        show_organisation_public: showOrganisationPublic,
      });
      chest_number = String(newParticipant.chest_number || '');

      if (photoFile && newParticipant?.id) {
        try {
          await participantService.uploadProfilePhoto(
            newParticipant.id,
            photoFile,
            { tenantId: targetTenantId, festivalId: festivalId }
          );
        } catch (error: any) {
          photoUploadError = error;
        }
      }
    } catch (error: any) {
      saveError = error;
    }

    setLoading(false);

    if (saveError) {
      const msg = saveError.message || 'Save failed. Check console.';
      console.error('Insert Error:', saveError);
      if (Platform.OS === 'web') window.alert('Error: ' + msg);
      else Alert.alert('Error', msg);
    } else {
      const savedCategoryLabel = isCollegeFest
        ? participantCollegeCategories.find(item => item.code === category)?.name ?? category
        : getCategoryLabel(category as CategoryCode);
      const successMsg = `${name} saved under ${savedCategoryLabel}.\nChest No: ${chest_number}`;
      const photoMsg = photoUploadError
        ? `\n\nPhoto upload failed, but the participant record was saved.\n${photoUploadError.message || 'Please retry from the participant profile.'}`
        : '';
      if (Platform.OS === 'web') {
        window.alert('✅ Participant Saved!\n' + successMsg + photoMsg);
        router.replace('/(admin)/participants');
      } else {
        Alert.alert('✅ Saved!', successMsg + photoMsg, [
          { text: 'OK', onPress: () => router.replace('/(admin)/participants') },
        ]);
      }
    }
  };

  // ─── UI ─────────────────────────────────────────────────────────────────────

  return (
    <ScrollView className="flex-1 bg-ssf-bg px-4 py-5 md:px-8 md:py-7" contentContainerStyle={{ paddingBottom: 32 }}>
      <View className="mx-auto w-full max-w-7xl">
        <View className="mb-4 flex-row items-center gap-3 px-1 md:mb-5">
          <View className="h-12 w-12 items-center justify-center rounded-xl bg-core-success-soft-emerald-50">
            <UserRoundPlus size={24} color={coreColor("#0F766E", 'primaryText')} />
          </View>
          <View>
            <Text className="font-poppins-black text-2xl text-ssf-text">Add Participant</Text>
            <Text className="font-poppins text-xs text-ssf-text-muted">Enter participant details and configure profile settings.</Text>
          </View>
        </View>

      <SsfCard className="gap-y-3 rounded-2xl border-core-border-slate-200 p-3 md:gap-y-4 md:p-5">
        <View className="flex-col gap-3 md:flex-row">
          {/* Name */}
          <View className="rounded-xl border border-core-border-slate-100 bg-core-surface-muted-slate-50/80 p-3 md:flex-[1.5] md:p-4">
            <View className="mb-2 flex-row items-center gap-2">
              <UserRound size={16} color={coreColor("#334155", 'text')} />
              <Text className="font-poppins-bold text-sm text-ssf-text">Full Name <Text className="text-core-danger-red-600">*</Text></Text>
            </View>
            <TextInput
              className="h-11 rounded-lg border border-core-border-slate-300 bg-core-surface-white px-3 font-poppins text-sm text-ssf-text"
              placeholder="E.g. Mohammed Ali"
              value={name}
              onChangeText={setName}
              placeholderTextColor={ui.colors.textSubtle}
            />
          </View>

          {/* Date of Birth */}
          <View className="rounded-xl border border-core-border-slate-100 bg-core-surface-muted-slate-50/80 p-3 md:flex-1 md:p-4">
            <View className="mb-2 flex-row items-center gap-2">
              <CalendarDays size={16} color={coreColor("#334155", 'text')} />
              <Text className="font-poppins-bold text-sm text-ssf-text">Date of Birth <Text className="font-poppins text-ssf-text-muted">{isCollegeFest ? '(Optional)' : '*'}</Text></Text>
            </View>
            {Platform.OS === 'web' ? (
              <SsfDatePicker
                value={dob || ''}
                onValueChange={(val: string) => setDob(val)}
                style={{ width: '100%', height: 44 }}
              />
            ) : (
              <TextInput
                className="h-11 rounded-lg border border-core-border-slate-300 bg-core-surface-white px-3 font-poppins text-sm text-ssf-text"
                placeholder="YYYY-MM-DD"
                value={dob}
                onChangeText={(text) => setDob(formatDOBInput(text))}
                keyboardType="number-pad"
                placeholderTextColor={ui.colors.textSubtle}
                maxLength={10}
              />
            )}
            {dob && dob.length > 0 && (
              <Text className="mt-1 font-poppins text-xs text-ssf-text-muted">
                Age as of 31 May {festivalYear}: <Text className="font-poppins-bold text-ui-primary-text">
                  {(() => { try { return calculateAge(dob, festivalYear); } catch { return '?'; } })()}
                </Text>
              </Text>
            )}
          </View>
        </View>

        <View className="flex-col gap-3 md:flex-row md:items-start">
          <SsfCard className="gap-y-3 rounded-xl border-core-border-slate-100 bg-core-surface-muted-slate-50/80 p-3 md:flex-1 md:p-4" variant="section">
            <View className="flex-row items-center gap-2">
              <Trophy size={17} color={coreColor("#334155", 'text')} />
              <Text className="font-poppins-bold text-sm text-ssf-text">Category <Text className="text-core-danger-red-600">*</Text></Text>
            </View>

            {!isGenderFixedByFestival && (
              <View>
                <Text className="mb-2 font-poppins-bold text-xs text-ssf-text-muted">Gender <Text className="text-core-danger-red-600">*</Text></Text>
                <View className="flex-row gap-2">
                  {(['boys', 'girls'] as const).map((option) => (
                    <TouchableOpacity
                      key={option}
                      className={`min-h-10 flex-1 items-center justify-center rounded-lg border px-3 py-2 ${gender === option ? 'border-ssf-primary bg-ssf-primary' : 'border-core-border-slate-300 bg-core-surface-white'}`}
                      onPress={() => setSelectedGender(option)}
                    >
                      <Text className={`font-poppins-bold text-sm capitalize ${gender === option ? 'text-core-on-primary-white' : 'text-ssf-text'}`}>
                        {option}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

        {isCollegeFest && (
          <View>
            {categoriesLoading ? <ActivityIndicator color={coreColor("#1B6B3A", 'primaryText')} /> : categoriesError ? (
              <Text className="font-poppins text-sm text-core-danger-red-600">Unable to load College Fest categories.</Text>
            ) : participantCollegeCategories.length === 0 ? (
              <View className="rounded-xl border border-core-warning-soft-amber-300 bg-core-warning-soft-amber-50 p-4">
                <Text className="font-poppins text-sm text-core-warning-amber-800">No College Fest categories have been created yet.</Text>
                <TouchableOpacity onPress={() => router.push('/(admin)/settings/categories' as any)} className="mt-3">
                  <Text className="font-poppins-bold text-core-success-emerald-700">Create Categories</Text>
                </TouchableOpacity>
              </View>
            ) : <View className="flex-row flex-wrap gap-2">
              {participantCollegeCategories.map(category => (
                <TouchableOpacity
                  key={category.id}
                  className={`min-w-[120px] px-3 py-3 rounded-xl border items-center ${collegeCategory === category.code ? 'bg-ssf-primary border-ssf-primary' : 'bg-ssf-surface border-ssf-border'}`}
                  onPress={() => setCollegeCategory(category.code)}
                >
                  <Text className={`font-poppins-bold text-xs ${collegeCategory === category.code ? 'text-core-on-primary-white' : 'text-ssf-text'}`}>
                    {category.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>}
          </View>
        )}

        {/* Class (for school students) */}
        {!isCollegeFest && (
        <View>
          <Text className="font-poppins text-ssf-text-muted mb-2">Class (School Students)</Text>
          <View className="flex-row flex-wrap gap-2">
            {CLASS_OPTIONS.map(cls => (
              <TouchableOpacity
                key={cls}
                className={`px-3 py-2 rounded-xl border ${classStd === cls ? 'bg-ssf-primary border-ssf-primary' : 'bg-ssf-surface border-ssf-border'}`}
                onPress={() => { setClassStd(cls === classStd ? '' : cls); setEducationType(''); setManualCategory(''); }}
              >
                <Text className={`font-poppins-bold text-sm ${classStd === cls ? 'text-core-on-primary-white' : 'text-ssf-text'}`}>
                  {cls}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        )}

        {/* Education Type (College/Campus) */}
        {!isCollegeFest && <View>
          <Text className="font-poppins text-ssf-text-muted mb-2">Education Type (Campus Students)</Text>
          <View className="flex-row flex-wrap gap-2">
            {CAMPUS_TYPES.map(type => (
              <TouchableOpacity
                key={type}
                className={`px-3 py-2 rounded-xl border ${educationType === type ? 'bg-ssf-primary border-ssf-primary' : 'bg-ssf-surface border-ssf-border'}`}
                onPress={() => { setEducationType(type === educationType ? '' : type); setClassStd(''); setManualCategory(''); }}
              >
                <Text className={`font-poppins-bold text-sm ${educationType === type ? 'text-core-on-primary-white' : 'text-ssf-text'}`}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>}

        {/* Junior / Senior (Youth / General) */}
        {!isCollegeFest && <View>
          <Text className="font-poppins text-ssf-text-muted mb-1">Junior / Senior (Youth Category)</Text>
          <Text className="font-poppins text-xs text-ssf-text-muted mb-2 italic">
            Select if participant is NOT a school student and NOT a college student.
            DOB is required to confirm age eligibility.
          </Text>
          <View className="flex-row gap-3">
            {JUNIOR_SENIOR_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  paddingHorizontal: 12,
                  borderRadius: 16,
                  borderWidth: 2,
                  borderColor: manualCategory === opt.value ? coreColor('#1B6B3A', 'border') : ui.colors.border,
                  backgroundColor: manualCategory === opt.value ? coreColor('#1B6B3A', 'primary') : coreColor('#FAFAFA', 'surface'),
                  alignItems: 'center',
                }}
                onPress={() => {
                  const next = manualCategory === opt.value ? '' : opt.value;
                  setManualCategory(next);
                  setClassStd('');
                  setEducationType('');
                }}
              >
                <Text style={{
                  fontWeight: '800',
                  fontSize: 16,
                  color: manualCategory === opt.value ? ui.colors.onPrimary : coreColor('#1B6B3A', 'primaryText'),
                  letterSpacing: 1,
                }}>
                  {opt.label}
                </Text>
                <Text style={{
                  fontSize: 11,
                  color: manualCategory === opt.value ? coreAlpha(coreColor('#ffffff', 'textMuted'), 0.85) : coreColor('#6B7280', 'text'),
                  marginTop: 2,
                }}>
                  {opt.age}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>}

        {/* Sahithyolsav auto-resolved category */}
        {!isCollegeFest && <View className={`rounded-xl p-4 border ${
          ageClassWarning
            ? 'bg-core-danger-soft-red-50 border-core-danger-red-400'
            : resolvedCategory ? 'bg-core-success-soft-green-50 border-core-success-green-400' : 'bg-ssf-surface border-ssf-border'
        }`}>
          <Text className="font-poppins text-ssf-text-muted mb-1">Auto-Assigned Category</Text>
          {resolvedCategory && !ageClassWarning ? (
            <Text className="font-poppins-bold text-core-success-green-700 text-base">
              ✅ {getCategoryLabel(resolvedCategory)}
            </Text>
          ) : ageClassWarning ? (
            <>
              <Text className="font-poppins-bold text-core-danger-red-600 text-base">
                ❌ {getCategoryLabel(resolvedCategory!)}
              </Text>
              <Text className="font-poppins text-xs text-core-danger-red-600 mt-2">{ageClassWarning}</Text>
            </>
          ) : (
            <Text className="font-poppins text-xs text-ssf-text-muted italic">
              Enter DOB + Class or Education Type to auto-assign category
            </Text>
          )}
          {categoryError ? (
            <Text className="font-poppins text-xs text-core-danger-red-500 mt-1">{categoryError}</Text>
          ) : null}
        </View>}

          </SsfCard>

        {/* Organisation Selector */}
          <SsfCard className="gap-y-3 rounded-xl border-core-border-slate-100 bg-core-surface-muted-slate-50/80 p-3 md:flex-1 md:p-4" variant="section">
          <View className="flex-row items-center gap-2">
            <Building2 size={17} color={coreColor("#334155", 'text')} />
            <Text className="font-poppins-bold text-sm text-ssf-text">Organisation (Unit/Sector/Division) <Text className="text-core-danger-red-600">*</Text></Text>
          </View>
          {isFestivalLoading || isOrganisationsLoading ? (
            <View className="flex-row items-center gap-2 py-2">
              <ActivityIndicator size="small" color={ui.colors.primaryText} />
              <Text className="font-poppins text-xs text-ssf-text-muted">Loading festival and eligible organisations…</Text>
            </View>
          ) : organisationsLoadError ? (
            <Text className="font-poppins text-xs text-core-danger-red-500">Could not load organisations: {organisationsLoadError}</Text>
          ) : !activeFestival ? (
            <Text className="font-poppins text-xs text-ssf-text-muted">Activate a festival before selecting an organisation.</Text>
          ) : availableOrganisations.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {availableOrganisations.map((org) => (
                <TouchableOpacity
                  key={org.id}
                  className={`px-3 py-2 rounded-xl border ${selectedOrgId === org.id ? 'bg-ssf-primary border-ssf-primary' : 'bg-ssf-surface border-ssf-border'}`}
                  onPress={() => setSelectedOrgId(org.id)}
                >
                  <Text className={`font-poppins-bold text-sm ${selectedOrgId === org.id ? 'text-core-on-primary-white' : 'text-ssf-text'}`}>
                    {org.name} <Text className="font-poppins font-normal text-xs opacity-80">({org.org_type})</Text>
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text className="font-poppins text-xs italic text-core-danger-red-500">
              {organisations.length > 0 && (festivalLevel === 'sector' || festivalLevel === 'division')
                ? `No subordinate organisations found for this ${festivalLevel}.`
                : 'No organisations found. Please set up the hierarchy first.'}
            </Text>
          )}
          </SsfCard>
        </View>

        {/* Candidate Profile Section */}
        <View className="gap-y-3 rounded-xl border border-core-info-soft-blue-100 bg-core-info-soft-blue-50/70 p-3 md:gap-y-4 md:p-4">
          <View className="flex-row items-start gap-x-2">
            <Eye size={18} color={ui.colors.info} />
            <View className="flex-1">
              <Text className="font-poppins-bold text-base text-ssf-text">Public Candidate Profile</Text>
              <Text className="font-poppins text-xs text-ssf-text-muted">Manage how this participant is shown in public profile.</Text>
            </View>
          </View>
          
          {/* Photo upload */}
          <View>
            <Text className="text-sm font-poppins text-ssf-text-muted mb-2">Profile Photo</Text>
            {photoPreviewUrl ? (
              <View className="flex-row items-center gap-x-4 mb-3">
                <Image
                  source={{ uri: photoPreviewUrl }}
                  style={{ width: 80, height: 80, borderRadius: 40, borderColor: coreColor('#E2E8F0', 'border'), borderWidth: 1 }}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  onPress={handlePhotoRemove}
                  className="px-3 py-2 rounded-xl border border-core-danger-soft-red-100 bg-core-danger-soft-red-50"
                >
                  <Text className="font-poppins-bold text-xs text-core-danger-red-700">Remove Photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View className="flex-row items-center gap-x-4 mb-3">
                <View className="w-20 h-20 rounded-full bg-core-surface-muted-slate-50 border border-ssf-border items-center justify-center">
                  <Text className="font-poppins text-2xl text-ssf-text-muted">?</Text>
                </View>
                <TouchableOpacity
                  onPress={handlePhotoSelect}
                  className="min-h-10 flex-row items-center gap-2 rounded-xl border border-core-info-soft-blue-100 bg-core-info-soft-blue-50 px-4 py-2"
                >
                  <Upload size={15} color={coreColor("#2563EB", 'info')} />
                  <Text className="font-poppins-bold text-xs text-core-info-blue-700">Select Photo</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Visibility Toggle */}
          <View className="flex-row justify-between items-center bg-core-info-soft-blue-50 border border-core-info-soft-blue-100 rounded-xl p-3">
            <View className="flex-1 flex-row items-center gap-3 pr-3">
              <Globe2 size={18} color={coreColor("#2563EB", 'info')} />
              <View className="flex-1">
                <Text className="font-poppins-bold text-sm text-ssf-text">Public profile enabled</Text>
                <Text className="font-poppins text-xs text-ssf-text-muted">Allow this candidate profile to be opened publicly.</Text>
              </View>
            </View>
            <Switch
              value={publicProfileEnabled}
              onValueChange={setPublicProfileEnabled}
              trackColor={{ false: coreColor('#CBD5E1', 'primarySoft'), true: coreColor('#B9EBD1', 'primarySoft') }}
              thumbColor={publicProfileEnabled ? ui.colors.success : coreColor('#F8FAFC', 'primary')}
            />
          </View>

          {/* Organisation Visibility Toggle */}
          <View className="flex-row justify-between items-center bg-core-success-soft-green-50 border border-core-success-soft-green-100 rounded-xl p-3">
            <View className="flex-1 flex-row items-center gap-3 pr-3">
              <Building2 size={18} color={coreColor("#059669", 'success')} />
              <View className="flex-1">
                <Text className="font-poppins-bold text-sm text-ssf-text">Show organisation publicly</Text>
                <Text className="font-poppins text-xs text-ssf-text-muted">Display organisation name on the public profile.</Text>
              </View>
            </View>
            <Switch
              value={showOrganisationPublic}
              onValueChange={setShowOrganisationPublic}
              trackColor={{ false: coreColor('#CBD5E1', 'primarySoft'), true: coreColor('#B9EBD1', 'primarySoft') }}
              thumbColor={showOrganisationPublic ? ui.colors.success : coreColor('#F8FAFC', 'primary')}
            />
          </View>
        </View>

        <SsfButton
          label={loading ? 'Saving...' : 'Save Participant'}
          onPress={handleSave}
          disabled={loading || !!ageClassWarning || (isCollegeFest && (categoriesLoading || !!categoriesError || collegeCategories.length === 0))}
          className="mt-1 w-full"
        />
      </SsfCard>
      </View>
    </ScrollView>
  );
}
