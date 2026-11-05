import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Download, X } from 'lucide-react-native';
import { ui } from '@/constants/designSystem';
import { SsfButton } from '@/components/ui/SsfButton';
import { ConsoliumLogo } from '@/components/ui/ConsoliumLogo';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
};

type InstallPortal = 'main' | 'team-management';
type InstallWindow = Window & {
  __mainPortalInstallEvent?: InstallPromptEvent;
  __teamManagementInstallEvent?: InstallPromptEvent;
};

const eventNameByPortal: Record<InstallPortal, string> = {
  main: 'mainportalinstallavailable',
  'team-management': 'teammanagementinstallavailable',
};

const getInstallEvent = (windowRef: InstallWindow, portal: InstallPortal) =>
  portal === 'main' ? windowRef.__mainPortalInstallEvent : windowRef.__teamManagementInstallEvent;

const setInstallEvent = (windowRef: InstallWindow, portal: InstallPortal, event?: InstallPromptEvent) => {
  if (portal === 'main') windowRef.__mainPortalInstallEvent = event;
  else windowRef.__teamManagementInstallEvent = event;
};

export function PortalInstallPrompt({ portal = 'main' }: { portal?: InstallPortal }) {
  const { width } = useWindowDimensions();
  const [installEvent, setInstallEventState] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [device, setDevice] = useState<'ios' | 'android' | 'other'>('other');

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const agent = window.navigator.userAgent;
    setDevice(/iPhone|iPad|iPod/i.test(agent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      ? 'ios' : /Android/i.test(agent) ? 'android' : 'other');
    const installWindow = window as InstallWindow;
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(!!standalone);
    const pendingInstall = getInstallEvent(installWindow, portal);
    if (pendingInstall) setInstallEventState(pendingInstall);

    const onInstallAvailable = () => {
      const currentEvent = getInstallEvent(installWindow, portal);
      if (currentEvent) setInstallEventState(currentEvent);
    };
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      const currentEvent = event as InstallPromptEvent;
      setInstallEvent(installWindow, portal, currentEvent);
      setInstallEventState(currentEvent);
    };
    const onInstalled = () => {
      setIsStandalone(true);
      setInstallEvent(installWindow, portal, undefined);
      setInstallEventState(null);
      setDismissed(true);
    };

    const availableEvent = eventNameByPortal[portal];
    window.addEventListener(availableEvent, onInstallAvailable);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener(availableEvent, onInstallAvailable);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [portal]);

  if (Platform.OS !== 'web' || isStandalone || dismissed || (width >= 900 && !installEvent)) return null;

  const handleInstall = async () => {
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      setInstallEvent(window as InstallWindow, portal, undefined);
      setInstallEventState(null);
      if (choice.outcome === 'accepted') setDismissed(true);
    } catch {
      setInstallEvent(window as InstallWindow, portal, undefined);
      setInstallEventState(null);
    }
  };

  const portalLabel = 'Festos';
  return (
    <View style={{ marginHorizontal: 12, marginTop: 10, marginBottom: 8, padding: 12, borderRadius: 14,
      borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surface, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ConsoliumLogo size={30} borderRadius={9} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: ui.colors.text, fontSize: 13, fontWeight: '700' }}>Install {portalLabel}</Text>
          {installEvent ? <Text style={{ color: ui.colors.textMuted, fontSize: 11, marginTop: 2 }}>
            Install this portal on your device for direct access.
          </Text> : null}
        </View>
        {installEvent ? <SsfButton size="sm" label="Install" icon={<Download size={14} color={ui.colors.onPrimary} />} onPress={handleInstall} /> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss installation instructions" onPress={() => setDismissed(true)} hitSlop={8}
          style={{ width: 34, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <X size={16} color={ui.colors.textMuted} />
        </Pressable>
      </View>
      {!installEvent ? <View style={{ paddingLeft: 2, gap: 4 }}>
        <Text style={{ color: ui.colors.textMuted, fontSize: 11, lineHeight: 16 }}>
          {device === 'ios' ? 'In Safari, tap Share, choose “Add to Home Screen,” then tap Add.' : 'Open the browser menu (⋮), choose “Install app” or “Add to Home screen,” then confirm.'}
        </Text>
        {device === 'other' ? <Text style={{ color: ui.colors.textMuted, fontSize: 11, lineHeight: 16 }}>
          On iPhone/iPad, use Safari Share → Add to Home Screen.
        </Text> : null}
      </View> : null}
    </View>
  );
}
