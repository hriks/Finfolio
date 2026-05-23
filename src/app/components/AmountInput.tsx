import React from 'react';
import { TextInput, StyleSheet, View, Text } from 'react-native';
import { palette, spacing, font, radius } from '../theme';

interface Props {
  amountMinor: number;
  onChange: (minor: number) => void;
  currency?: string;
  placeholder?: string;
}

// Stores amountMinor (integer). Displays as ₹1,234.50 while editing.
export const AmountInput: React.FC<Props> = ({
  amountMinor,
  onChange,
  currency = 'INR',
  placeholder,
}) => {
  const symbol = currency === 'INR' ? '₹' : currency + ' ';
  const [raw, setRaw] = React.useState<string>(() =>
    amountMinor ? (amountMinor / 100).toString() : '',
  );

  // Keep raw in sync if amountMinor changes externally.
  React.useEffect(() => {
    const major = amountMinor ? (amountMinor / 100).toString() : '';
    setRaw((current) => {
      const cm = Math.round(parseFloat(current || '0') * 100);
      return cm === amountMinor ? current : major;
    });
  }, [amountMinor]);

  const handleChange = (text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, '');
    // limit decimal places to 2
    const parts = cleaned.split('.');
    const norm = parts.length > 1 ? `${parts[0]}.${parts[1].slice(0, 2)}` : cleaned;
    setRaw(norm);
    const f = parseFloat(norm || '0');
    onChange(Math.round((Number.isFinite(f) ? f : 0) * 100));
  };

  return (
    <View style={styles.box}>
      <Text style={styles.symbol}>{symbol}</Text>
      <TextInput
        value={raw}
        onChangeText={handleChange}
        keyboardType="decimal-pad"
        style={styles.input}
        placeholder={placeholder ?? '0.00'}
        placeholderTextColor={palette.muted}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  symbol: { color: palette.text, fontSize: font.xl, marginRight: spacing.sm },
  input: { flex: 1, color: palette.text, fontSize: font.xl, padding: 0 },
});
