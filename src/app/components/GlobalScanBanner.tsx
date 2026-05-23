import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScanStore } from '../stores/scan';
import { palette, spacing, font, radius } from '../theme';

export const GlobalScanBanner: React.FC = () => {
  const scanning = useScanStore((s) => s.scanning);
  const insets = useSafeAreaInsets();
  if (!scanning) return null;
  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { top: insets.top + 4 }]}
    >
      <View style={styles.banner}>
        <ActivityIndicator size="small" color={palette.text} />
        <Text style={styles.text}>Scanning inbox…</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.brand,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  text: { color: '#ffffff', fontSize: font.sm, fontWeight: '700' },
});
