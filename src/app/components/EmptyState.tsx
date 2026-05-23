import React from 'react';
import { View, Text, Pressable, StyleSheet, Image, type ImageSourcePropType } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { palette, spacing, font, radius } from '../theme';
import { Icon } from './Icon';

interface Props {
  /** Optional override — when not provided, an on-theme glass-circle SVG is rendered. */
  art?: ImageSourcePropType;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

// Default on-theme empty illustration: layered translucent rings + a centered
// receipt-style glyph in lavender. Matches the AmbientBackground / GlassCard
// vibe; replaces the older cartoon PNG.
const DefaultArt: React.FC = () => (
  <View style={styles.artWrap}>
    <Svg width={180} height={180} viewBox="0 0 180 180">
      {/* Outer faint ring */}
      <Circle cx={90} cy={90} r={86} fill="none" stroke={palette.glass} strokeWidth={1} />
      {/* Mid lavender-soft ring */}
      <Circle cx={90} cy={90} r={66} fill="rgba(184,164,255,0.06)" stroke={palette.accentSoft} strokeWidth={1} />
      {/* Inner brand-tint disc */}
      <Circle cx={90} cy={90} r={42} fill={palette.surfaceStrong} stroke={palette.glassHi} strokeWidth={1} />
      {/* Stylized receipt glyph */}
      <Path
        d="M76 70h28a3 3 0 0 1 3 3v36l-6-4-5 4-5-4-5 4-5-4-5 4V73a3 3 0 0 1 3-3z"
        fill="none"
        stroke={palette.lavender}
        strokeWidth={2.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Path
        d="M82 82h16M82 90h16M82 98h10"
        stroke={palette.lavender}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.7}
      />
    </Svg>
  </View>
);

export const EmptyState: React.FC<Props> = ({
  art,
  title,
  body,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}) => (
  <View style={styles.root}>
    {art ? <Image source={art} style={styles.artImage} resizeMode="contain" /> : <DefaultArt />}
    <Text style={styles.title}>{title}</Text>
    {body ? <Text style={styles.body}>{body}</Text> : null}
    {actionLabel && onAction ? (
      <Pressable onPress={onAction} style={styles.btn}>
        <Icon name="plus" size={20} color="#ffffff" />
        <Text style={styles.btnText}>{actionLabel}</Text>
      </Pressable>
    ) : null}
    {secondaryLabel && onSecondary ? (
      <Pressable onPress={onSecondary} style={styles.secondary}>
        <Text style={styles.secondaryText}>{secondaryLabel}</Text>
      </Pressable>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  artWrap: { width: 180, height: 180, alignItems: 'center', justifyContent: 'center' },
  artImage: { width: 180, height: 180 },
  title: { color: palette.text, fontSize: font.xl, fontWeight: '800', textAlign: 'center' },
  body: {
    color: palette.muted,
    fontSize: font.md,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.lg,
  },
  btn: {
    marginTop: spacing.md,
    backgroundColor: palette.brand,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: palette.glassHi,
    shadowColor: palette.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 8,
  },
  btnText: { color: '#ffffff', fontWeight: '700', fontSize: font.md },
  secondary: { marginTop: spacing.sm, paddingVertical: spacing.sm },
  secondaryText: { color: palette.lavender, fontSize: font.md, fontWeight: '600' },
});
