import React, { useEffect, useState } from 'react';
import { Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { Download, X } from 'lucide-react-native';
import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import { TeamText } from './TeamText';
import { ConsoliumLogo } from '@/components/ui/ConsoliumLogo';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
};

export function TeamInstallPrompt() {
  const ui = useTeamUi();
  const { context } = useTeamLeaderContext();
  const { width } = useWindowDimensions();
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [device, setDevice] = useState<'ios' | 'android' | 'other'>('other');

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const agent = window.navigator.userAgent;
    setDevice(/iPhone|iPad|iPod/i.test(agent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      ? 'ios' : /Android/i.test(agent) ? 'android' : 'other');

    const installWindow = window as Window & { __teamPortalInstallEvent?: InstallPromptEvent };
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(!!standalone);
    if (installWindow.__teamPortalInstallEvent) setInstallEvent(installWindow.__teamPortalInstallEvent);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as InstallPromptEvent;
      installWindow.__teamPortalInstallEvent = promptEvent;
      setInstallEvent(promptEvent);
    };
    const onInstallAvailable = () => {
      if (installWindow.__teamPortalInstallEvent) setInstallEvent(installWindow.__teamPortalInstallEvent);
    };
    const onInstalled = () => {
      setIsStandalone(true);
      installWindow.__teamPortalInstallEvent = undefined;
      setInstallEvent(null);
      setDismissed(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('teamportalinstallavailable', onInstallAvailable);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('teamportalinstallavailable', onInstallAvailable);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (Platform.OS !== 'web' || width >= 1280 || isStandalone || dismissed) return null;

  const handleInstall = async () => {
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
      (window as Window & { __teamPortalInstallEvent?: InstallPromptEvent }).__teamPortalInstallEvent = undefined;
      setInstallEvent(null);
      setDismissed(true);
    } catch {
      (window as Window & { __teamPortalInstallEvent?: InstallPromptEvent }).__teamPortalInstallEvent = undefined;
      setInstallEvent(null);
    }
  };

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 8, left: 12, right: 12, zIndex: 1000, elevation: 20 }}>
      <View style={{ ...(Platform.OS === 'web' ? { backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)' } as any : {}), width: '100%', maxWidth: 520, minHeight: 94, alignSelf: 'center', padding: 12, gap: 8, borderWidth: 1, borderColor: ui.colors.border, borderRadius: 16, backgroundColor: ui.colors.surfaceGlass, shadowColor: ui.shadow.shadowColor, shadowOpacity: 0.09, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: ui.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <ConsoliumLogo size={30} borderRadius={9} />
          </View>
          <TeamText numberOfLines={1} style={{ flex: 1, minWidth: 0, color: ui.colors.text, fontSize: 12, fontWeight: '700' }}>Install Festos</TeamText>
          {installEvent ? (
            <Pressable onPress={handleInstall} accessibilityRole="button" accessibilityLabel="Install Festos"
              style={{ minHeight: 38, minWidth: 76, paddingHorizontal: 11, borderRadius: 11, backgroundColor: ui.colors.navActive, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}>
              <Download size={14} color={ui.colors.navActiveText} />
              <TeamText style={{ color: ui.colors.navActiveText, fontSize: 11, fontWeight: '700' }}>Install</TeamText>
            </Pressable>
          ) : null}
          <Pressable onPress={() => setDismissed(true)} accessibilityRole="button" accessibilityLabel="Dismiss installation instructions" hitSlop={8}
            style={{ width: 32, height: 36, alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color={ui.colors.textMuted} />
          </Pressable>
        </View>
        <View style={{ paddingLeft: 39, gap: 3 }}>
          <TeamText style={{ color: ui.colors.textMuted, fontSize: 10.5, lineHeight: 15 }}>
            {device === 'ios' ? 'In Safari, tap Share, choose “Add to Home Screen,” then tap Add.' : 'Open the browser menu (⋮), select “Install app” or “Add to Home screen,” then confirm.'}
          </TeamText>
          {device === 'other' ? <TeamText style={{ color: ui.colors.textMuted, fontSize: 10.5, lineHeight: 15 }}>
            On iPhone/iPad, use Safari Share → Add to Home Screen.
          </TeamText> : null}
        </View>
      </View>
    </View>
  );
}
