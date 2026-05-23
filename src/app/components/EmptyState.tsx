import React from 'react';
import { View, Text, Pressable, StyleSheet, Image, ImageSourcePropType } from 'react-native';
import { palette, spacing, font, radius } from '../theme';
import { Icon } from './Icon';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const EMPTY_ART: ImageSourcePropType = require('../assets/empty.png');

interface Props {
  art?: ImageSourcePropType;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

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
    <Image source={art ?? EMPTY_ART} style={styles.art} resizeMode="contain" />
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
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  art: { width: 220, height: 220 },
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
    shadowColor: palette.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  btnText: { color: '#ffffff', fontWeight: '700', fontSize: font.md },
  secondary: { marginTop: spacing.sm, paddingVertical: spacing.sm },
  secondaryText: { color: palette.link, fontSize: font.md, fontWeight: '600' },
});
