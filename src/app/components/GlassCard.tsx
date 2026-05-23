import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { palette, radius } from '../theme';

// Translucent surface with a delicate highlight border and a soft inner sheen.
// Use sparingly — designed for hero / FAB / nav / active chips, NOT every row.
// Tone:
//   "soft"   – very subtle glass, for chips and small accents
//   "strong" – the hero card; visible sheen + thicker border
interface Props {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'soft' | 'strong';
  glowColor?: string;
}

export const GlassCard: React.FC<Props> = ({ children, style, tone = 'strong', glowColor }) => {
  const isStrong = tone === 'strong';
  return (
    <View
      style={[
        styles.root,
        isStrong ? styles.rootStrong : styles.rootSoft,
        glowColor ? { shadowColor: glowColor, shadowOpacity: 0.45 } : null,
        style,
      ]}
    >
      <LinearGradient
        colors={
          isStrong
            ? ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.02)']
            : ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.01)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Brand-tinted inner glow (very low opacity) for the strong variant. */}
      {isStrong ? (
        <LinearGradient
          colors={[palette.glassInner, 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.7 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
  },
  rootStrong: {
    borderColor: palette.glassHi,
    shadowColor: palette.brandGlow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 10,
  },
  rootSoft: {
    borderColor: palette.borderSoft,
  },
});
