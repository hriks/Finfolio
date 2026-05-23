import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { palette, spacing, font, radius } from '../theme';

interface Props {
  title: string;
  body?: string;
  ctaLabel?: string;
  onCta?: () => void;
  onDismiss?: () => void;
  tone?: 'info' | 'warn' | 'danger';
}

const TONE_ACCENT: Record<NonNullable<Props['tone']>, string> = {
  info: palette.blueMuted,
  warn: palette.lavender,
  danger: palette.pink,
};

export const PermissionBanner: React.FC<Props> = ({
  title,
  body,
  ctaLabel,
  onCta,
  onDismiss,
  tone = 'warn',
}) => {
  const accent = TONE_ACCENT[tone];
  return (
    <View style={styles.root}>
      <View style={[styles.accentStripe, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {body ? <Text style={styles.text}>{body}</Text> : null}
      </View>
      {ctaLabel && onCta ? (
        <Pressable onPress={onCta} style={styles.cta} hitSlop={12}>
          <Text style={[styles.ctaText, { color: accent }]}>{ctaLabel}</Text>
        </Pressable>
      ) : null}
      {onDismiss ? (
        <Pressable onPress={onDismiss} style={styles.close} hitSlop={14}>
          <Text style={styles.closeIcon}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingRight: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassHi,
    gap: spacing.sm,
    overflow: 'hidden',
  },
  accentStripe: {
    width: 3,
    alignSelf: 'stretch',
    marginRight: spacing.sm,
    borderRadius: 2,
  },
  body: { flex: 1, paddingLeft: spacing.xs },
  title: { color: palette.text, fontWeight: '700', fontSize: font.sm },
  text: { color: palette.muted, fontSize: font.xs, marginTop: 2 },
  cta: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontWeight: '700', fontSize: font.sm, letterSpacing: 0.3 },
  close: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  closeIcon: { color: palette.muted, fontWeight: '700', fontSize: 22, lineHeight: 22 },
});
