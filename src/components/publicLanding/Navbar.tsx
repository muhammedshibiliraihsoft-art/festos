import React from 'react';
import { Platform, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { ConsoliumLogo } from '@/components/ui/ConsoliumLogo';

const navItems = [
  { label: 'Home', href: '/(public)' },
  { label: 'Leaderboard', href: '/(public)/leaderboard' },
  { label: 'Results', href: '/(public)/leaderboard' },
  { label: 'Schedule', href: '/(public)/leaderboard' },
];

export function Navbar() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const showMenu = width >= 768;

  return (
    <Animated.View
      entering={FadeInDown.duration(700).springify()}
      className="absolute left-0 right-0 top-4 z-20 items-center px-5 md:top-7"
    >
      <View
        className="h-16 flex-row items-center justify-between rounded-full border border-white/15 bg-white/10 px-5"
        style={{
          width: '100%',
          maxWidth: 1180,
          borderColor: 'rgba(255,255,255,0.15)',
          ...Platform.select({
            web: {
              backdropFilter: 'blur(22px)',
              boxShadow: '0 20px 70px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.18)',
            },
            default: {},
          }),
        }}
      >
        <TouchableOpacity onPress={() => router.push('/(public)' as never)} activeOpacity={0.82} className="flex-row items-center">
          <ConsoliumLogo size={36} style={{ marginRight: 12 }} />
          <View>
            <Text className="font-poppins-bold uppercase" style={{ color: '#FFFFFF', fontSize: 12, letterSpacing: 2 }}>
              Festos
            </Text>
            <Text className="font-poppins uppercase" style={{ color: 'rgba(255,255,255,0.58)', fontSize: 10, letterSpacing: 1.5 }}>
              Festival Management
            </Text>
          </View>
        </TouchableOpacity>

        {showMenu ? (
          <View className="flex-row items-center gap-x-2">
            {navItems.map((item) => (
              <TouchableOpacity
                key={item.label}
                onPress={() => router.push(item.href as never)}
                activeOpacity={0.72}
                className="rounded-full px-4 py-2"
              >
                <Text className="font-poppins-bold" style={{ color: 'rgba(255,255,255,0.76)', fontSize: 12 }}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View className="flex-row items-center rounded-full border border-[#FFDD55]/25 bg-[#FF4FB8]/15 px-3 py-2">
          <View className="mr-2 h-2 w-2 rounded-full bg-[#FFE76A]" />
          <Text className="font-poppins-bold uppercase" style={{ color: '#FFE76A', fontSize: 11, letterSpacing: 1.6 }}>
            Live
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}
