import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { palette, spacing, font } from '../theme';
import { Icon, type IconName } from './Icon';
import { tapHaptic } from '../haptic';

interface Props {
  label: string;
  subtitle?: string;
  onPress: () => void;
  chevron?: boolean;
  destructive?: boolean;
  trailingIcon?: IconName;
  disabled?: boolean;
}

export const SettingRow: React.FC<Props> = ({
  label,
  subtitle,
  onPress,
  chevron = true,
  destructive = false,
  trailingIcon,
  disabled = false,
}) => (
  <Pressable
    disabled={disabled}
    android_ripple={{ color: palette.surfaceAlt, borderless: false }}
    style={({ pressed }) => [styles.row, pressed && !disabled && styles.pressed, disabled && { opacity: 0.4 }]}
    onPress={() => {
      tapHaptic();
      onPress();
    }}
  >
    <View style={{ flex: 1 }}>
      <Text style={[styles.label, destructive && { color: palette.danger }]}>{label}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
    {trailingIcon ? <Icon name={trailingIcon} size={18} color={palette.muted} /> : null}
    {chevron && !trailingIcon ? <Icon name="forward" size={18} color={palette.muted} /> : null}
  </Pressable>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  pressed: { backgroundColor: palette.surfaceAlt },
  label: { color: palette.link, fontSize: font.md, fontWeight: '600' },
  subtitle: { color: palette.muted, fontSize: font.xs, marginTop: 2 },
});
