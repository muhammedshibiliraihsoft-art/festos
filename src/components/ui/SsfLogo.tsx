import React from 'react';
import { Text, View } from 'react-native';
import { ConsoliumLogo } from './ConsoliumLogo';

interface SsfLogoProps {
 size?: 'sm' | 'md' | 'lg' | 'xl';
 showText?: boolean;
}

export const SsfLogo: React.FC<SsfLogoProps> = ({ size = 'md', showText = true }) => {
 const sizes = { sm: 28, md: 40, lg: 56, xl: 72 };

 return (
 <View className="flex-row items-center justify-center">
 <ConsoliumLogo size={sizes[size]} />
 {showText && (
 <View className="ml-3 justify-center">
 <Text className="text-ssf-primary font-poppins text-xs uppercase tracking-widest leading-tight">
 Festos
 </Text>
 <Text className="text-ssf-gold font-poppins-black text-[10px] uppercase tracking-widest leading-none">
 Management
 </Text>
 </View>
 )}
 </View>
 );
};
