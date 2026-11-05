import React from 'react';
import { Platform, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Megaphone, Trophy } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { DecorativeVisualPanel } from './DecorativeVisualPanel';
import { LiveBadge } from './LiveBadge';

export function HeroSection() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isTablet = width >= 768;

  return (
    <View
      className="flex-1 justify-center pb-12"
      style={{
        width: '100%',
        maxWidth: 1180,
        alignSelf: 'center',
        paddingHorizontal: isDesktop ? 32 : 20,
        paddingTop: isDesktop ? 112 : 128,
        minHeight: isDesktop ? 730 : undefined,
        flexDirection: isDesktop ? 'row' : 'column',
        alignItems: isDesktop ? 'center' : 'stretch',
        columnGap: isDesktop ? 40 : 0,
      }}
    >
      <View style={{ width: isDesktop ? undefined : '100%', flex: isDesktop ? 1.04 : undefined, minWidth: 0 }}>
        <Animated.View entering={FadeInUp.duration(780).delay(90).springify()}>
          <LiveBadge />
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(820).delay(170).springify()}>
          <Text
            className="font-poppins-black uppercase"
            style={{ color: '#FFE76A', fontSize: isTablet ? 17 : 15, letterSpacing: 3.5 }}
          >
            Festos
          </Text>
          <Text
            className="mt-3 font-cooper"
            style={{
              color: '#FFFFFF',
              fontFamily: 'CooperBlack',
              fontSize: isDesktop ? 82 : isTablet ? 76 : 52,
              lineHeight: isDesktop ? 84 : isTablet ? 80 : 56,
              textShadowColor: 'rgba(255,79,184,0.35)',
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 18,
            }}
          >
            Festos
          </Text>
          <Text
            className="mt-3 font-poppins-black uppercase"
            style={{
              color: '#FFFFFF',
              fontSize: isDesktop ? 40 : isTablet ? 38 : 28,
              lineHeight: isDesktop ? 46 : isTablet ? 44 : 34,
              letterSpacing: 1,
            }}
          >
            Live Results Portal
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(850).delay(260).springify()}>
          <Text
            className="mt-6 max-w-[620px] font-poppins"
            style={{ color: 'rgba(255,255,255,0.78)', fontSize: isTablet ? 22 : 18, lineHeight: isTablet ? 32 : 28 }}
          >
            Celebrating Talent. Inspiring Excellence.
          </Text>
          <Text
            className="mt-3 max-w-[620px] font-poppins"
            style={{ color: 'rgba(255,255,255,0.54)', fontSize: isTablet ? 16 : 14, lineHeight: 24 }}
          >
            A vibrant public gateway to live scores, published results, and the pulse of the 2026 festival.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(880).delay(340).springify()} className="mt-9 flex-row flex-wrap gap-4">
          <TouchableOpacity
            onPress={() => router.replace('/(public)/leaderboard' as never)}
            activeOpacity={0.84}
            className="overflow-hidden rounded-full p-[1.5px]"
            style={{
              alignSelf: 'flex-start',
              ...Platform.select({
                web: { boxShadow: '0 20px 60px rgba(255,82,112,0.32)' },
                default: {},
              }),
            }}
          >
            <LinearGradient colors={['#FFE76A', '#FF6A2B', '#FF4FB8', '#23D5FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="rounded-full p-[1.5px]">
              <LinearGradient
                colors={['#FFB62E', '#FF4B74', '#B51DFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                className="flex-row items-center rounded-full px-7 py-4"
                style={{ minWidth: isTablet ? 250 : 220 }}
              >
                <Trophy color="#FFFFFF" size={21} strokeWidth={2.3} />
                <Text
                  className="ml-3 font-poppins-black uppercase"
                  style={{ color: '#FFFFFF', fontSize: isTablet ? 15 : 14, letterSpacing: 1.2 }}
                >
                  View Leaderboard
                </Text>
              </LinearGradient>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.replace('/(public)/leaderboard' as never)}
            activeOpacity={0.82}
            className="flex-row items-center rounded-full border border-white/15 bg-white/10 px-6 py-4"
            style={{
              alignSelf: 'flex-start',
              borderColor: 'rgba(255,255,255,0.15)',
              ...Platform.select({
                web: {
                  backdropFilter: 'blur(16px)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16)',
                },
                default: {},
              }),
            }}
          >
            <Megaphone color="#FFE76A" size={20} strokeWidth={2.2} />
            <Text className="ml-3 font-poppins-bold uppercase" style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14, letterSpacing: 1.2 }}>
              Live Updates
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      <View style={{ width: isDesktop ? undefined : '100%', flex: isDesktop ? 0.96 : undefined, minWidth: 0 }}>
        <DecorativeVisualPanel />
      </View>
    </View>
  );
}
