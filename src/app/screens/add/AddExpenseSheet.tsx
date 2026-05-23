import React from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../../components/Icon';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { palette, spacing, font, radius } from '../../theme';
import { createMlKitOcr } from '../../../services/ocr/mlkit';
import { tapHaptic } from '../../haptic';
import type { RootStackParamList } from '../../navigation';

// TODO(device): launchCamera needs CAMERA permission; ensure granted at runtime before invoking.
// TODO(device): react-native-image-picker requires linking on Android — should be picked up via autolinking.

type Nav = NativeStackNavigationProp<RootStackParamList, 'AddSheet'>;

export const AddExpenseSheet: React.FC = () => {
  const nav = useNavigation<Nav>();

  const goManual = () => {
    nav.replace('ManualEntry', undefined);
  };

  const goScan = async () => {
    try {
      const result = await launchCamera({ mediaType: 'photo', saveToPhotos: false });
      const uri = result.assets?.[0]?.uri;
      if (!uri) {
        nav.goBack();
        return;
      }
      const ocr = createMlKitOcr();
      const draft = await ocr.scan({ uri });
      if (!draft) {
        Alert.alert(
          'Could not read receipt',
          'No amount was detected. Try again or enter manually.',
        );
        return; // stay on add sheet
      }
      nav.replace('ManualEntry', {
        prefill: {
          amountMinor: draft.amountMinor,
          merchantRaw: draft.merchantRaw,
          occurredAt: draft.occurredAt ?? Date.now(),
          photoUri: uri,
        },
      });
    } catch (e) {
      Alert.alert('Scan failed', String(e));
    }
  };

  const goQuickPhoto = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo' });
      const uri = result.assets?.[0]?.uri;
      if (!uri) {
        nav.goBack();
        return;
      }
      nav.replace('ManualEntry', {
        prefill: { photoUri: uri, occurredAt: Date.now() },
      });
    } catch (e) {
      Alert.alert('Photo failed', String(e));
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12} style={styles.backBtn}>
          <Icon name="back" size={24} color={palette.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Add Expense</Text>
      </View>
      <Pressable
        style={styles.btn}
        onPress={() => {
          tapHaptic();
          goManual();
        }}
      >
        <View style={styles.iconWrap}>
          <Icon name="edit" size={22} color={palette.lavender} />
        </View>
        <Text style={styles.btnText}>Manual entry</Text>
      </Pressable>
      <Pressable
        style={styles.btn}
        onPress={() => {
          tapHaptic();
          goScan();
        }}
      >
        <View style={styles.iconWrap}>
          <Icon name="camera" size={22} color={palette.lavender} />
        </View>
        <Text style={styles.btnText}>Scan receipt</Text>
      </Pressable>
      <Pressable
        style={styles.btn}
        onPress={() => {
          tapHaptic();
          goQuickPhoto();
        }}
      >
        <View style={styles.iconWrap}>
          <Icon name="image" size={22} color={palette.lavender} />
        </View>
        <Text style={styles.btnText}>Quick photo</Text>
      </Pressable>
      <Pressable
        style={styles.cancel}
        onPress={() => {
          tapHaptic();
          nav.goBack();
        }}
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg, paddingHorizontal: spacing.lg, gap: spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  backBtn: { padding: spacing.xs },
  headerTitle: { color: palette.text, fontSize: font.xl, fontWeight: '700' },
  title: {
    color: palette.text,
    fontSize: font.xl,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: palette.surface,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.borderSoft,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: palette.text, fontSize: font.md, fontWeight: '600' },
  cancel: { padding: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  cancelText: { color: palette.muted, fontSize: font.md },
});
