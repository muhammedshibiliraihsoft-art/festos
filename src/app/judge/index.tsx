import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, Animated, Platform,
  KeyboardAvoidingView, ScrollView, StyleSheet, useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertCircle, ArrowLeft, ArrowRight, Camera, X } from 'lucide-react-native';
import { judgeTokenService } from '../../services/judgeTokenService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import { supabase } from '../../core/config/supabase';
import { ConsoliumLogo } from '@/components/ui/ConsoliumLogo';
import { applyPortalPwaMetadata } from '@/core/utils/portalPwaMetadata';

export default function JudgePortalLanding() {
  useEffect(() => applyPortalPwaMetadata('admin', 'Festos'), []);
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  
  // New States for Scanner & Approval
  const [isScanning, setIsScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [waitingForApproval, setWaitingForApproval] = useState(false);
  const [currentTokenId, setCurrentTokenId] = useState<string | null>(null);
  const [tokenDataObj, setTokenDataObj] = useState<any>(null);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const inputRefs = useRef<(TextInput | null)[]>(Array(6).fill(null));

  // Auto-fill code from URL if present
  useEffect(() => {
    if (params.code && typeof params.code === 'string') {
      const formatted = params.code.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
      setCode(formatted);
      if (formatted.length === 6) {
        // We cannot auto-submit reliably without user interaction in some environments,
        // but since we are showing a UI, we can just pre-fill it.
      }
    }
  }, [params.code]);

  // Realtime subscription for Approval Wait
  useEffect(() => {
    if (!waitingForApproval || !currentTokenId) return;

    const channel = supabase
      .channel(`judge_token_${currentTokenId}_${Math.random().toString(36).substring(7)}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'judge_tokens',
          filter: `id=eq.${currentTokenId}`,
        },
        async (payload: any) => {
          const newStatus = payload.new.status;
          if (newStatus === 'approved') {
            await AsyncStorage.setItem('judge_session_token', code);
            await AsyncStorage.setItem('judge_session_data', JSON.stringify(tokenDataObj));
            router.replace('/judge/marks' as any);
          } else if (newStatus === 'rejected') {
            setWaitingForApproval(false);
            setCurrentTokenId(null);
            setError('Your login request was rejected by the administrator.');
            shake();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [waitingForApproval, currentTokenId, code, tokenDataObj]);

  // Secure fallback when Realtime is unavailable or the anon role cannot read
  // table changes directly. The RPC returns only the status for this code.
  useEffect(() => {
    if (!waitingForApproval || !code || !tokenDataObj) return;

    let cancelled = false;
    const checkStatus = async () => {
      try {
        const status = await judgeTokenService.getLoginStatus(code);
        if (cancelled) return;

        if (status === 'approved') {
          await AsyncStorage.setItem('judge_session_token', code);
          await AsyncStorage.setItem('judge_session_data', JSON.stringify(tokenDataObj));
          router.replace('/judge/marks' as any);
        } else if (status === 'rejected' || status === 'expired' || status === 'used' || status === 'invalid') {
          setWaitingForApproval(false);
          setCurrentTokenId(null);
          setError(
            status === 'rejected'
              ? 'Your login request was rejected by the administrator.'
              : 'This access code is no longer valid.'
          );
        }
      } catch (statusError) {
        console.warn('Unable to refresh approval status:', statusError);
      }
    };

    checkStatus();
    const intervalId = setInterval(checkStatus, 2000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [waitingForApproval, code, tokenDataObj, router]);

  const handleBoxChange = (text: string, index: number) => {
    setError('');
    
    const oldChar = code[index] !== ' ' && code[index] !== undefined ? code[index] : '';
    const isPaste = text.length > 1 && !(text.length === 2 && text.startsWith(oldChar));

    if (isPaste) {
      const pasted = text.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
      setCode(pasted);
      const nextIndex = Math.min(pasted.length, 5);
      setActiveIndex(nextIndex);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    let newChar = text.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (newChar.length > 1) newChar = newChar.slice(-1);

    const codeArr = code.padEnd(6, ' ').split('');
    codeArr[index] = newChar || ' ';
    const newCode = codeArr.join('').trimEnd();
    setCode(newCode);

    if (newChar && index < 5) {
      setActiveIndex(index + 1);
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace') {
      const codeArr = code.padEnd(6, ' ').split('');
      if (codeArr[index] === ' ' && index > 0) {
        codeArr[index - 1] = ' ';
        setCode(codeArr.join('').trimEnd());
        setActiveIndex(index - 1);
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleSubmit = async (codeToSubmit?: string | any) => {
    // If called from onPress, codeToSubmit might be an event object
    const finalCode = typeof codeToSubmit === 'string' ? codeToSubmit : code;
    if (finalCode.length < 6) {
      setError('Please enter a complete 6-character code.');
      shake();
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      let deviceId = await AsyncStorage.getItem('judge_device_id');
      if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        await AsyncStorage.setItem('judge_device_id', deviceId);
      }
      const osName = Device.osName || Platform.OS;
      const modelName = Device.modelName || 'Browser';
      const deviceInfo = `${modelName} (${osName})`;

      const tokenData = await judgeTokenService.validateToken(finalCode);
      // Instead of replacing router, we request login and wait for approval
      const request = await judgeTokenService.requestLogin(finalCode, deviceId, deviceInfo);
      if (request?.status === 'approved') {
        await AsyncStorage.setItem('judge_session_token', finalCode);
        await AsyncStorage.setItem('judge_session_data', JSON.stringify(tokenData));
        router.replace('/judge/marks' as any);
        return;
      }
      setTokenDataObj(tokenData);
      setCurrentTokenId(request?.id ?? tokenData.id);
      setWaitingForApproval(true);
    } catch (e: any) {
      setError(e.message ?? 'Invalid code. Please try again.');
      shake();
    } finally {
      setIsLoading(false);
    }
  };

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    if (!isScanning) return;
    setIsScanning(false);
    // Data might be a URL: http://domain.com/judge?code=ABCDEF or just ABCDEF
    let extractedCode = data;
    try {
      if (data.includes('code=')) {
        const url = new URL(data);
        extractedCode = url.searchParams.get('code') || data;
      }
    } catch {
      // Not a URL, use raw data
    }
    const cleanCode = extractedCode.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
    if (cleanCode.length === 6) {
      setCode(cleanCode);
      handleSubmit(cleanCode);
    } else {
      setError('Invalid QR Code format.');
      shake();
    }
  };

  const startScanning = async () => {
    setError('');

    if (Platform.OS === 'web') {
      if (!window.isSecureContext) {
        setError('Camera requires HTTPS or localhost. Open the Judge Portal using localhost or a secure HTTPS link.');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera access is not supported by this browser. Enter the 6-character code manually.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        stream.getTracks().forEach((track) => track.stop());
        setIsScanning(true);
      } catch (cameraError: any) {
        const blocked = cameraError?.name === 'NotAllowedError' || cameraError?.name === 'PermissionDeniedError';
        setError(
          blocked
            ? 'Camera is blocked. Click the camera/lock icon in the address bar, set Camera to Allow, then press Scan QR Code again.'
            : 'Unable to open the camera. Check whether another app is using it, or enter the code manually.'
        );
      }
      return;
    }

    if (!permission?.granted) {
      const result = await requestPermission();
      if (result.status !== 'granted') {
        setError(
          result.canAskAgain
            ? 'Camera permission is required. Tap Scan QR Code and choose Allow.'
            : 'Camera is blocked in device settings. Enable camera access for this app, then try again.'
        );
        return;
      }
    }
    setIsScanning(true);
  };

  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/login' as any);
  };

  const renderBackButton = () => (
    <TouchableOpacity
      onPress={handleBack}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      style={{ alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#EFF6FF' }}
    >
      <ArrowLeft size={18} color="#2563EB" />
      <Text className="font-poppins-medium text-sm text-[#2563EB]">Back</Text>
    </TouchableOpacity>
  );

  const renderFormContent = () => (
    <>
      {waitingForApproval ? (
        <View className="items-center py-10">
          <ActivityIndicator size="large" color="#2563EB" />
          <Text className="text-2xl font-poppins-bold text-[#0F172A] text-center mt-6 mb-2">
            Waiting for Approval
          </Text>
          <Text className="text-[#64748B] font-poppins text-center text-sm leading-5 mb-8">
            Your request has been sent to the administrator.{'\n'}Please wait while they confirm your login.
          </Text>
          {error ? (
            <Text className="font-poppins text-red-500 text-sm text-center mb-6">{error}</Text>
          ) : null}
          <TouchableOpacity
            onPress={() => {
              setWaitingForApproval(false);
              setCurrentTokenId(null);
              setError('');
            }}
            className="border border-[#E2E8F0] rounded-xl px-8 py-3.5 bg-white"
          >
            <Text className="font-poppins-medium text-[#475569] text-sm">Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : isScanning ? (
        <View className="w-full h-[400px] rounded-2xl overflow-hidden bg-[#0F172A] relative shadow-lg">
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            onBarcodeScanned={handleBarCodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          />
          <View className="absolute top-0 left-0 right-0 bottom-0 border-2 border-white/20 m-8 rounded-xl" />
          <TouchableOpacity
            onPress={() => setIsScanning(false)}
            className="absolute top-4 right-4 bg-black/60 p-2.5 rounded-full"
          >
            <X color="#FFF" size={24} />
          </TouchableOpacity>
          <Text className="absolute bottom-6 left-0 right-0 text-center font-poppins-medium text-white text-sm bg-black/60 py-3">
            Point camera at QR Code
          </Text>
        </View>
      ) : (
        <View className="w-full">
          <View className="mb-8">
            <Text className="text-base font-poppins-bold text-[#0F172A] mb-1">Access Code</Text>
            <Text className="text-xs font-poppins text-[#64748B]">
              You should have received this code from the event coordinator
            </Text>
          </View>

          <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
            <View className="flex-row justify-between w-full mb-8 gap-x-2">
              {Array.from({ length: 6 }).map((_, i) => {
                const isActive = activeIndex === i;
                const isFilled = code[i] !== undefined && code[i] !== ' ';
                const val = code[i] !== ' ' ? code[i] : '';

                return (
                  <View
                    key={i}
                    style={{
                      flex: 1,
                      aspectRatio: 1,
                      maxWidth: isMobile ? 50 : 56,
                      backgroundColor: '#FFFFFF',
                      borderWidth: isActive ? 2 : 1,
                      borderColor: isActive ? '#2563EB' : '#E2E8F0',
                      borderRadius: 12,
                      shadowColor: isActive ? '#2563EB' : 'transparent',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: isActive ? 0.1 : 0,
                      shadowRadius: 8,
                      elevation: isActive ? 2 : 0,
                    }}
                    className="items-center justify-center relative overflow-hidden"
                  >
                    <TextInput
                      ref={(ref) => { inputRefs.current[i] = ref; }}
                      value={val || ''}
                      onChangeText={(text) => handleBoxChange(text, i)}
                      onKeyPress={(e) => handleKeyPress(e, i)}
                      onFocus={() => setActiveIndex(i)}
                      onSubmitEditing={() => {
                        if (i === 5) handleSubmit();
                        else inputRefs.current[i + 1]?.focus();
                      }}
                      maxLength={6}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      className="absolute w-full h-full text-center font-poppins-medium"
                      style={[{ zIndex: 10, fontSize: isMobile ? 22 : 24, color: isActive ? '#2563EB' : '#0F172A' }, { outlineStyle: 'none' } as any]}
                      cursorColor="#2563EB"
                    />
                  </View>
                );
              })}
            </View>
          </Animated.View>

          {error ? (
            <View className="flex-row items-center gap-x-2 mb-6 px-4 py-3 w-full bg-red-50 rounded-xl border border-red-100">
              <AlertCircle size={16} color="#EF4444" />
              <Text className="font-poppins text-red-600 text-xs flex-1 leading-4">{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isLoading || code.length < 6}
            style={{ width: '100%' }}
          >
            <View
              className="rounded-xl py-4 flex-row items-center justify-center gap-x-2"
              style={{ backgroundColor: code.length === 6 && !isLoading ? '#2563EB' : '#3B82F6', opacity: code.length < 6 && !isLoading ? 0.8 : 1, shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 5 }}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text className="font-poppins-medium text-[15px] text-white">Enter Portal</Text>
                  <ArrowRight size={18} color="#FFFFFF" />
                </>
              )}
            </View>
          </TouchableOpacity>
          
          <View className="flex-row items-center my-6">
            <View className="flex-1 h-[1px] bg-[#E2E8F0]" />
            <Text className="px-4 text-[10px] font-poppins-bold text-[#94A3B8]">OR</Text>
            <View className="flex-1 h-[1px] bg-[#E2E8F0]" />
          </View>

          <TouchableOpacity
            onPress={startScanning}
            style={{ width: '100%' }}
          >
            <View className="rounded-xl py-3.5 flex-row items-center justify-center gap-x-2 border border-[#E2E8F0] bg-white shadow-sm" style={{ shadowColor: '#94A3B8', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
              <Camera size={18} color="#0F172A" />
              <Text className="font-poppins-medium text-[14px] text-[#0F172A]">Scan QR Code</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#F8FAFC]"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: isMobile ? 0 : 40 }} keyboardShouldPersistTaps="handled">
        
        {!isMobile ? (
          /* Desktop Layout */
          <View style={{ width: '100%', maxWidth: 1000, backgroundColor: '#FFFFFF', borderRadius: 24, shadowColor: '#94A3B8', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.15, shadowRadius: 40, elevation: 10, overflow: 'hidden', flexDirection: 'row', minHeight: 600 }}>
            
            {/* Left Column (Brand & Info) */}
            <View style={{ flex: 1, padding: 56, position: 'relative', borderRightWidth: 1, borderRightColor: '#F1F5F9' }}>
              {renderBackButton()}
              
              <View style={{ marginTop: 20 }}>
                <View style={{ width: 64, height: 64, backgroundColor: '#FFFFFF', borderRadius: 16, shadowColor: '#94A3B8', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 5, justifyContent: 'center', alignItems: 'center', marginBottom: 32 }}>
                  <ConsoliumLogo size={64} borderRadius={16} />
                </View>
                <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 44, color: '#0F172A', lineHeight: 48 }}>Judging</Text>
                <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 44, color: '#2563EB', lineHeight: 48 }}>System</Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 15, color: '#64748B', marginTop: 16, maxWidth: 300, lineHeight: 22 }}>
                  Enter your one-time access code to continue
                </Text>
              </View>

              {/* Abstract Decorative Pixels */}
              <View style={{ position: 'absolute', bottom: -40, left: -40, opacity: 0.5, pointerEvents: 'none' }}>
                <View style={{ width: 140, height: 140, backgroundColor: '#EFF6FF', transform: [{ rotate: '45deg' }], position: 'absolute', bottom: 60, left: 60, borderRadius: 24 }} />
                <View style={{ width: 100, height: 100, backgroundColor: '#DBEAFE', transform: [{ rotate: '45deg' }], position: 'absolute', bottom: 120, left: 20, borderRadius: 16 }} />
                <View style={{ width: 80, height: 80, backgroundColor: '#BFDBFE', transform: [{ rotate: '45deg' }], position: 'absolute', bottom: 30, left: 160, borderRadius: 12 }} />
                <View style={{ width: 40, height: 40, backgroundColor: '#93C5FD', transform: [{ rotate: '45deg' }], position: 'absolute', bottom: 180, left: 120, borderRadius: 8 }} />
              </View>
            </View>

            {/* Right Column (Form) */}
            <View style={{ flex: 1, padding: 64, justifyContent: 'center', backgroundColor: '#FAFAFA' }}>
              <View style={{ width: '100%', maxWidth: 400, alignSelf: 'center' }}>
                {renderFormContent()}
              </View>
              
              <View className="mt-16 items-center">
                <Text className="text-[#94A3B8] font-poppins-medium text-[10px] tracking-widest uppercase">Festos</Text>
              </View>
            </View>

          </View>
        ) : (
          /* Mobile Layout */
          <View style={{ flex: 1, width: '100%', backgroundColor: '#FFFFFF' }}>
            
            {/* Top Header Section */}
            <View style={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40, position: 'relative', overflow: 'hidden', alignItems: 'center' }}>
              {/* Abstract Decorative Pixels Mobile */}
              <View style={{ position: 'absolute', top: -20, left: -20, opacity: 0.4, pointerEvents: 'none' }}>
                <View style={{ width: 100, height: 100, backgroundColor: '#EFF6FF', transform: [{ rotate: '45deg' }], position: 'absolute', top: 20, left: 20, borderRadius: 16 }} />
                <View style={{ width: 60, height: 60, backgroundColor: '#DBEAFE', transform: [{ rotate: '45deg' }], position: 'absolute', top: 80, left: 10, borderRadius: 12 }} />
                <View style={{ width: 40, height: 40, backgroundColor: '#BFDBFE', transform: [{ rotate: '45deg' }], position: 'absolute', top: 40, left: 100, borderRadius: 8 }} />
              </View>
              <View style={{ alignSelf: 'stretch', marginBottom: 28 }}>
                {renderBackButton()}
              </View>
              
              <View style={{ width: 60, height: 60, backgroundColor: '#FFFFFF', borderRadius: 16, shadowColor: '#94A3B8', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 5, justifyContent: 'center', alignItems: 'center', marginBottom: 24 }}>
                <ConsoliumLogo size={56} borderRadius={16} />
              </View>
              <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 32, color: '#0F172A', lineHeight: 36, textAlign: 'center' }}>Judging</Text>
              <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 32, color: '#2563EB', lineHeight: 36, textAlign: 'center' }}>System</Text>
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: '#64748B', marginTop: 12, textAlign: 'center', paddingHorizontal: 20, lineHeight: 22 }}>
                Enter your one-time access code{'\n'}to continue
              </Text>
            </View>

            {/* Bottom Card Section */}
            <View style={{ flex: 1, backgroundColor: '#FAFAFA', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingTop: 40, shadowColor: '#94A3B8', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 5, alignItems: 'center' }}>
              <View style={{ width: '100%', maxWidth: 400 }}>
                {renderFormContent()}
              </View>

              <View className="mt-12 mb-6 items-center">
                <Text className="text-[#94A3B8] font-poppins-medium text-[10px] tracking-widest uppercase">Festos</Text>
              </View>
            </View>

          </View>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

