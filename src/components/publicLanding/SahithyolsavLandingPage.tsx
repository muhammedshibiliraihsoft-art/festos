import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function SahithyolsavLandingPage({ page = 'landing' }: { page?: 'landing' | 'schedule' | 'units' | 'items' }) {
  return (
    <View style={styles.container}>
      <Text>Festos (Web Version Available)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
