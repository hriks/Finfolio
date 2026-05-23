import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { palette } from '../theme';

// Matte near-black background with two soft "radial" hotspots faked via overlapping
// linear gradients (a true radial-gradient would need a heavier dep). Top-left
// leans lavender, bottom-right leans pink — both at very low opacity. Drop this
// behind any screen that should feel like the premium financial OS palette.
interface Props {
  children?: React.ReactNode;
  style?: ViewStyle;
}

export const AmbientBackground: React.FC<Props> = ({ children, style }) => (
  <View style={[styles.root, style]}>
    <LinearGradient
      colors={[palette.bgDeep, palette.bg, palette.bgTint]}
      locations={[0, 0.55, 1]}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
    {/* Top-left lavender hotspot */}
    <LinearGradient
      colors={[palette.ambientLavender, 'transparent']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.9, y: 0.7 }}
      style={[StyleSheet.absoluteFill, styles.hotspot]}
      pointerEvents="none"
    />
    {/* Bottom-right pink hotspot */}
    <LinearGradient
      colors={['transparent', palette.ambientPink]}
      start={{ x: 0.2, y: 0.3 }}
      end={{ x: 1, y: 1 }}
      style={[StyleSheet.absoluteFill, styles.hotspot]}
      pointerEvents="none"
    />
    {children}
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  hotspot: { opacity: 1 },
});
