import { coreColor } from '@/constants/coreTheme';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ArrowRight, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react-native';
import { useAuthStore } from '../../core/store/authStore';
import { DevConfig } from '@/core/config/dev_config';
import { authService } from '@/services/authService';
import { ConsoliumLogo } from '@/components/ui/ConsoliumLogo';
import { applyPortalPwaMetadata } from '@/core/utils/portalPwaMetadata';
import { Link } from 'expo-router';

const palette = {
  ink: coreColor('#17212E', 'text'),
  surface: coreColor('#FAFCFB', 'surface'),
  background: coreColor('#F3F8F7', 'background'),
  line: coreColor('#DCE5E2', 'border'),
  muted: coreColor('#667085', 'textMuted'),
  primary: coreColor('#0F766E', 'primary'),
  primaryText: coreColor('#0F766E', 'primaryText'),
  onPrimary: coreColor('#FFFFFF', 'onPrimary'),
};

export default function LoginScreen() {
  React.useEffect(() => applyPortalPwaMetadata('admin'), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const setUser = useAuthStore((state) => state.setUser);

  const handleLogin = async () => {
    setErrorMsg('');
    if (!email || !password) {
      setErrorMsg('Please enter both User ID and password.');
      return;
    }

    setLoading(true);

    if (DevConfig.isDevMode) {
      setTimeout(() => {
        setUser({ id: 'dev-user', email }, DevConfig.tenant_id, DevConfig.role);
        setLoading(false);
      }, 800);
      return;
    }

    try {
      const result = await authService.login(email, password);
      setUser(result.user, result.tenant_id, result.role, result.is_superadmin);
    } catch (error: any) {
      setErrorMsg(authService.friendlyError(error.message));
    } finally {
      setLoading(false);
    }
  };


  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.shell}>
        <View style={{ alignItems: 'center', marginBottom: 12 }}><ConsoliumLogo size={56} borderRadius={16} /></View>
        <Text accessibilityRole="header" style={styles.brandTitle}>Festos</Text>
        <View style={styles.loginCard}>
          <View style={styles.loginHeader}>
            <Text accessibilityRole="header" style={styles.loginTitle}>Sign in</Text>
            <Text style={styles.loginSub}>Enter your credentials to continue.</Text>
          </View>
          <Field label="User ID / Email" value={email}
            onChangeText={(value) => { setEmail(value); setErrorMsg(''); }}
            placeholder="Enter User ID or email" icon={UserRound} autoCapitalize="none" />
          <Field label="Password" value={password}
            onChangeText={(value) => { setPassword(value); setErrorMsg(''); }}
            placeholder="Enter password" icon={LockKeyhole} secureTextEntry={!showPassword}
            rightSlot={
              <TouchableOpacity accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                onPress={() => setShowPassword((current) => !current)} style={styles.eyeButton}>
                {showPassword ? <EyeOff size={18} color={palette.muted} /> : <Eye size={18} color={palette.muted} />}
              </TouchableOpacity>
            } />
          {errorMsg ? <View style={styles.errorBox}><Text accessibilityRole="alert" style={styles.errorText}>{errorMsg}</Text></View> : null}
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: loading, busy: loading }}
            activeOpacity={0.86} onPress={handleLogin} disabled={loading}
            style={[styles.loginButton, loading && styles.loadingButton]}>
            {loading ? <ActivityIndicator color={palette.onPrimary} /> : <>
              <Text style={styles.loginButtonText}>Sign in</Text>
              <ArrowRight size={18} color={palette.onPrimary} />
            </>}
          </TouchableOpacity>
          <Link href="/team/login" style={styles.teamPortalLink}>
            Team Leader? Open Team Leader login
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  icon: Icon,
  rightSlot,
  secureTextEntry,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  icon: React.ComponentType<any>;
  rightSlot?: React.ReactNode;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputShell}>
        <Icon size={18} color={palette.muted} />
        <TextInput
          accessibilityLabel={label}
          autoCorrect={false}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={coreColor("#98A2B3", 'textSubtle')}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          style={styles.input}
        />
        {rightSlot}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 32 },
  shell: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  brandTitle: { color: palette.primaryText, fontSize: 28, fontWeight: '700', letterSpacing: -0.8, textAlign: 'center', marginBottom: 24 },
  loginCard: { backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1, borderRadius: 18, padding: 24 },
  loginHeader: { marginBottom: 24 },
  loginTitle: { color: palette.ink, fontSize: 23, fontWeight: '700', letterSpacing: -0.5 },
  loginSub: { color: palette.muted, fontSize: 14, lineHeight: 21, marginTop: 6 },
  fieldWrap: { marginBottom: 18 },
  fieldLabel: { color: palette.ink, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  inputShell: { minHeight: 40, borderWidth: 1, borderColor: palette.line, borderRadius: 10, backgroundColor: palette.background, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 4, gap: 10 },
  input: { flex: 1, minWidth: 0, height: 40, color: palette.ink, fontSize: 14, outlineStyle: 'none' as any },
  eyeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  errorBox: { borderRadius: 8, backgroundColor: coreColor('#FEF2F2', 'dangerSoft'), padding: 10, marginBottom: 16 },
  errorText: { color: coreColor('#B42318', 'danger'), fontSize: 13, lineHeight: 19 },
  loginButton: { minHeight: 44, borderRadius: 10, backgroundColor: palette.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingButton: { opacity: 0.7 },
  loginButtonText: { color: palette.onPrimary, fontSize: 14, fontWeight: '600' },
  teamPortalLink: { color: palette.primaryText, fontSize: 13, textAlign: 'center', marginTop: 18 },
});
