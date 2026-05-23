import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Linking,
  PermissionsAndroid,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { palette, spacing, font, radius } from '../../theme';
import { useSettingsStore } from '../../stores/settings';
import { startSmsScan } from '../../sync';
import type { RootStackParamList } from '../../navigation';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO = require('../../assets/logo.png');

type Nav = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

interface SectionProps {
  title: string;
  body: string;
  cta: string;
  onCta?: () => void;
}

const Section: React.FC<SectionProps> = ({ title, body, cta, onCta }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <Text style={styles.sectionBody}>{body}</Text>
    <Pressable
      style={[styles.cta, !onCta && styles.ctaDisabled]}
      onPress={onCta}
      disabled={!onCta}
    >
      <Text style={styles.ctaText}>{cta}</Text>
    </Pressable>
  </View>
);

export const OnboardingScreen: React.FC = () => {
  const nav = useNavigation<Nav>();
  const updateSettings = useSettingsStore((s) => s.update);
  const [scanning, setScanning] = React.useState(false);

  const finish = () => {
    updateSettings({ onboardingComplete: true });
    nav.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Tabs' }] }));
  };

  const openSettings = () => {
    Linking.openSettings().catch(() => Alert.alert('Open settings manually'));
  };

  const requestSmsPerms = async () => {
    if (Platform.OS !== 'android') return;
    try {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_SMS,
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      ]);
    } catch {
      // ignore
    }
  };

  const requestNotifPerm = async () => {
    if (Platform.OS !== 'android') return;
    try {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    } catch {
      // ignore
    }
  };

  const scanInbox = async () => {
    setScanning(true);
    try {
      const ok = await startSmsScan();
      if (ok) Alert.alert('Inbox scan started', 'Importing from the last 6 months in the background.');
      else Alert.alert('Inbox scan unavailable', 'Native module not loaded on this device.');
    } catch (e: unknown) {
      Alert.alert('Inbox scan failed', String(e));
    } finally {
      setScanning(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroRow}>
          <Image source={LOGO} style={styles.logo} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Expense Manager</Text>
            <Text style={styles.tagline}>Local-first spend tracker</Text>
          </View>
        </View>
        <Text style={styles.body}>
          Grant the permissions below to enable automatic tracking of SMS, app notifications and
          receipts — everything stays on your device.
        </Text>

      <Section
        title="1. SMS access"
        body="Needed to auto-track bank/UPI transactions."
        cta="Grant SMS"
        onCta={requestSmsPerms}
      />

      <Section
        title="2. Notifications"
        body="So we can notify you about new expenses to review."
        cta="Allow notifications"
        onCta={requestNotifPerm}
      />

      <Section
        title="3. Notification Listener"
        body="Enable in Settings so we can capture Uber / Rapido / Swiggy notifications."
        cta="Open settings"
        onCta={openSettings}
      />

      <Section
        title="4. Battery optimization"
        body="Exempt the app for reliable background ingestion."
        cta="Open settings"
        onCta={openSettings}
      />

      <Section
        title="5. Import SMS history (optional)"
        body="Scan the last 6 months of SMS now. Runs in the background."
        cta={scanning ? 'Scanning…' : 'Scan inbox'}
        onCta={scanning ? undefined : scanInbox}
      />

      <Pressable style={styles.primary} onPress={finish}>
        <Text style={styles.primaryText}>Continue to app</Text>
      </Pressable>

        <Text style={styles.footer}>You can revisit all of these from Settings later.</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  logo: { width: 72, height: 72, borderRadius: 16 },
  title: { color: palette.text, fontSize: font.xl, fontWeight: '800', letterSpacing: 0.2 },
  tagline: { color: palette.muted, fontSize: font.sm, marginTop: 2 },
  body: { color: palette.muted, fontSize: font.md, lineHeight: 22, marginBottom: spacing.lg },
  section: {
    backgroundColor: palette.surfaceStrong,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: palette.glassHi,
  },
  sectionTitle: { color: palette.text, fontSize: font.md, fontWeight: '600', marginBottom: 4 },
  sectionBody: { color: palette.muted, fontSize: font.sm, marginBottom: spacing.sm },
  cta: {
    backgroundColor: palette.surfaceAlt,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: palette.accent, fontWeight: '600' },
  primary: {
    backgroundColor: palette.brand,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  primaryText: { color: palette.text, fontWeight: '700', fontSize: font.md },
  footer: { color: palette.muted, fontSize: font.xs, textAlign: 'center', marginTop: spacing.md },
});
