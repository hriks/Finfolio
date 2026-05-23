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

export const PermissionBanner: React.FC<Props> = ({
  title,
  body,
  ctaLabel,
  onCta,
  onDismiss,
  tone = 'warn',
}) => {
  const bg =
    tone === 'danger' ? palette.danger : tone === 'info' ? palette.surfaceAlt : palette.warn;
  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {body ? <Text style={styles.text}>{body}</Text> : null}
      </View>
      {ctaLabel && onCta ? (
        <Pressable onPress={onCta} style={styles.cta} hitSlop={12}>
          <Text style={styles.ctaText}>{ctaLabel}</Text>
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
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  body: { flex: 1 },
  title: { color: '#fff', fontWeight: '600', fontSize: font.sm },
  text: { color: '#fff', fontSize: font.xs, marginTop: 2, opacity: 0.9 },
  cta: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: font.md },
  close: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  closeIcon: { color: '#fff', fontWeight: '700', fontSize: 24, lineHeight: 26 },
});
