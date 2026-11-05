import React from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { Award, Feather, Sparkles } from 'lucide-react-native';

const tileData = [
  { color: '#6D45FF', pattern: 'zigzag' },
  { color: '#0067B9', pattern: 'leaf' },
  { color: '#00B77A', pattern: 'waves' },
  { color: '#FF4A35', pattern: 'star' },
  { color: '#E92365', pattern: 'triangles' },
  { color: '#93D83E', pattern: 'rings' },
  { color: '#8E034E', pattern: 'petal' },
];

export function DecorativeVisualPanel() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  return (
    <Animated.View
      entering={FadeInRight.duration(900).delay(220).springify()}
      className="relative self-center"
      style={{ width: '100%', maxWidth: isDesktop ? 500 : 520, marginTop: isDesktop ? 0 : 48 }}
    >
      <View
        className="relative overflow-hidden rounded-[36px] border bg-white/10 p-6"
        style={[
          styles.cardContainer,
          Platform.OS === 'web' ? ({
            backdropFilter: 'blur(26px)',
            boxShadow: '0 30px 100px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.20)',
          } as any) : null,
        ]}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.03)', 'rgba(255,80,168,0.10)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        <View style={[styles.posterOrb, { right: -80, top: -96, width: 256, height: 256, borderRadius: 128, backgroundColor: 'rgba(255,231,106,0.8)' }]} />
        <View style={[styles.posterOrb, { right: -24, top: 40, width: 192, height: 192, borderRadius: 96, backgroundColor: 'rgba(35,213,255,0.7)' }]} />
        <View style={[styles.posterOrb, { right: 80, top: 8, width: 160, height: 224, borderRadius: 90, backgroundColor: 'rgba(255,79,184,0.75)', transform: [{ rotate: '28deg' }] }]} />

        <FestivalFlower />

        <View style={styles.tileGrid}>
          {tileData.map((tile, index) => (
            <PatternTile key={`${tile.color}-${tile.pattern}`} color={tile.color} pattern={tile.pattern} wide={index === 0 || index === 2} />
          ))}
        </View>

        <View style={styles.posterTitleWrap}>
          <Text
            className="font-cooper"
            style={{
              color: '#FFFFFF',
              fontFamily: 'CooperBlack',
              fontSize: isDesktop ? 52 : 42,
              lineHeight: isDesktop ? 54 : 44,
            }}
          >
            Festos
          </Text>
          <View className="mt-1 h-1.5 w-[78%] rounded-full bg-white" />
        </View>

        <View style={styles.yearBadge}>
          <Text className="font-poppins-black" style={{ color: '#FFFFFF', fontSize: 16 }}>
            2026
          </Text>
        </View>

        <TrophyPen />
        <PaperPlaneCluster />
      </View>
    </Animated.View>
  );
}

function FestivalFlower() {
  const petals = ['#FF4B35', '#FF9B26', '#FFE23C', '#83E13D', '#14C775', '#22C7FF', '#306BFF', '#D94BFF'];

  return (
    <View style={styles.flowerWrap}>
      {petals.map((color, index) => (
        <View
          key={color}
          style={[
            styles.visualPetal,
            {
              backgroundColor: color,
              transform: [{ rotate: `${index * 45}deg` }],
            },
          ]}
        />
      ))}
    </View>
  );
}

function TrophyPen() {
  return (
    <View style={styles.trophyWrap}>
      <LinearGradient colors={['#FFE76A', '#FF7A2E', '#FF4FB8']} style={styles.trophyCup}>
        <Award color="#40105E" size={38} strokeWidth={2.4} />
      </LinearGradient>
      <View className="h-24 w-4 rounded-full bg-white/95" />
      <View className="h-8 w-8 rotate-45 rounded-sm bg-[#FFE76A]" />
      <View className="mt-1 h-10 w-2 rounded-full bg-[#23D5FF]" />
    </View>
  );
}

function PaperPlaneCluster() {
  return (
    <View style={styles.planeCluster}>
      <Feather color="#FFFFFF" size={28} />
      <View className="absolute -right-10 top-10">
        <Sparkles color="#FFE76A" size={28} />
      </View>
    </View>
  );
}

function PatternTile({ color, pattern, wide }: { color: string; pattern: string; wide?: boolean }) {
  return (
      <View
        style={[
          styles.tile,
          {
            width: wide ? '31%' : '19%',
            backgroundColor: color,
          },
        ]}
      >
      {pattern === 'zigzag' && <Text className="mt-3 text-center font-poppins-bold text-[22px] tracking-[2px] text-white">~~~~</Text>}
      {pattern === 'leaf' && <Text className="mt-3 text-center text-[24px] text-white">✦</Text>}
      {pattern === 'waves' && <Text className="mt-3 text-center font-poppins-bold text-[20px] tracking-[1px] text-white">≋≋≋</Text>}
      {pattern === 'star' && <Text className="mt-3 text-center text-[26px] text-white">✦</Text>}
      {pattern === 'triangles' && <Text className="mt-2 text-center font-poppins-black text-[22px] text-white">▾▾▾</Text>}
      {pattern === 'rings' && <Text className="mt-3 text-center font-poppins-bold text-[24px] text-white">◎</Text>}
      {pattern === 'petal' && <Text className="mt-3 text-center text-[24px] text-white">❧</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    width: '100%',
    height: 480,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  posterOrb: {
    position: 'absolute',
  },
  flowerWrap: {
    position: 'absolute',
    left: 24,
    top: 16,
    width: 112,
    height: 112,
  },
  visualPetal: {
    position: 'absolute',
    left: 34,
    top: 4,
    width: 42,
    height: 70,
    borderRadius: 28,
    opacity: 0.72,
    transformOrigin: '50% 75%',
  } as object,
  trophyCup: {
    width: 86,
    height: 70,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 42,
    borderBottomRightRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trophyWrap: {
    position: 'absolute',
    right: 46,
    top: '27%',
    height: 192,
    width: 96,
    alignItems: 'center',
  },
  planeCluster: {
    position: 'absolute',
    right: 64,
    top: 96,
  },
  tileGrid: {
    position: 'absolute',
    left: 32,
    right: 32,
    top: '42%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tile: {
    height: 64,
    overflow: 'hidden',
    borderRadius: 6,
  },
  posterTitleWrap: {
    position: 'absolute',
    left: 32,
    right: 32,
    bottom: 28,
  },
  yearBadge: {
    position: 'absolute',
    right: 48,
    bottom: 80,
    borderRadius: 999,
    backgroundColor: '#00C98B',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
