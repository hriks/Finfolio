import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Linking,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { palette, spacing, font, radius } from '../../theme';
import { useSettingsStore } from '../../stores/settings';
import type { SettingsStackParamList } from '../../navigation';
import { getDb } from '../../services';
import { loadCategoriesList } from '../../categories';
import { startSmsScan } from '../../sync';
import { useScanStore } from '../../stores/scan';
import { tapHaptic, successHaptic } from '../../haptic';
import { SettingRow } from '../../components/SettingRow';
import {
  driveSignIn,
  driveSignOut,
  driveCurrentUser,
  isDriveConfigured,
  setGoogleWebClientId,
} from '../../drive';
import type { Category } from '../../../types/domain';

const TextEntryModal: React.FC<{
  visible: boolean;
  title: string;
  placeholder: string;
  initialValue?: string;
  onClose: () => void;
  onSave: (value: string) => void;
}> = ({ visible, title, placeholder, initialValue = '', onClose, onSave }) => {
  const [v, setV] = React.useState(initialValue);
  React.useEffect(() => {
    if (visible) setV(initialValue);
  }, [visible, initialValue]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TextInput
            style={styles.input}
            value={v}
            onChangeText={setV}
            placeholder={placeholder}
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={styles.saveBtn} onPress={() => onSave(v.trim())}>
            <Text style={styles.saveBtnText}>Save</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export const SettingsScreen: React.FC = () => {
  const nav = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const refreshSettings = useSettingsStore((s) => s.refresh);

  const [cats, setCats] = React.useState<Category[]>([]);
  const [appVersion] = React.useState<string>('0.0.1');
  const [schemaVersion, setSchemaVersion] = React.useState<number>(0);
  const [rulesCount, setRulesCount] = React.useState<number>(0);
  const [driveEmail, setDriveEmail] = React.useState<string | null>(null);
  const scanning = useScanStore((s) => s.scanning);
  const [busy, setBusy] = React.useState<string | null>(null);

  // modal state for text-entry actions
  const [showPassphraseInput, setShowPassphraseInput] = React.useState(false);

  const loadAll = React.useCallback(() => {
    refreshSettings();
    setCats(loadCategoriesList());
    try {
      const sv = getDb().get<{ user_version: number }>('PRAGMA user_version');
      setSchemaVersion(sv?.user_version ?? 0);
    } catch {
      setSchemaVersion(0);
    }
    try {
      const row = getDb().get<{ c: number }>(
        "SELECT COUNT(*) AS c FROM merchant_rules WHERE origin = 'user'",
      );
      setRulesCount(row?.c ?? 0);
    } catch {
      setRulesCount(0);
    }
    driveCurrentUser().then(setDriveEmail).catch(() => setDriveEmail(null));
  }, [refreshSettings]);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSignIn = async () => {
    setBusy('signing in');
    try {
      const r = await driveSignIn();
      setDriveEmail(r.email);
      Alert.alert('Signed in', `Connected as ${r.email}`);
    } catch (e: unknown) {
      Alert.alert('Sign-in failed', String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  };

  const handleSignOut = async () => {
    setBusy('signing out');
    try {
      await driveSignOut();
      setDriveEmail(null);
    } finally {
      setBusy(null);
    }
  };

  const handleBackupNow = async () => {
    if (!driveEmail) {
      Alert.alert('Sign in first', 'Connect your Google account in the Backup section to back up.');
      return;
    }
    setBusy('backing up');
    try {
      // BackupTask is registered as a Headless JS task; it constructs BackupService with the
      // signed-in Drive client and uploads. Trigger it via the same Headless dispatch that
      // WorkManager uses, but inline.
      const { runBackupNow } = await import('../../backup-runner');
      const r = await runBackupNow('manual');
      Alert.alert('Backup complete', `Uploaded ${r.sizeBytes ?? 0} bytes to Drive.`);
    } catch (e: unknown) {
      Alert.alert('Backup failed', String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    if (!driveEmail) {
      Alert.alert('Sign in first', 'Connect your Google account in the Backup section to restore.');
      return;
    }
    setBusy('finding backups');
    try {
      const { listRestoreCandidates, runRestore } = await import('../../backup-runner');
      const candidates = await listRestoreCandidates();
      if (candidates.length === 0) {
        Alert.alert('No backups found', 'There are no backups in Drive for this app yet.');
        return;
      }
      const latest = candidates[0];
      const when = new Date(latest.modifiedAt).toLocaleString();
      const kb = Math.round(latest.sizeBytes / 1024);
      Alert.alert(
        'Restore latest backup?',
        `${latest.name}\n${when} · ${kb} KB\n\nThis OVERWRITES your current data. The app will close so the new database loads on next launch.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            style: 'destructive',
            onPress: async () => {
              setBusy('restoring');
              try {
                await runRestore(latest.driveId);
                Alert.alert(
                  'Restored',
                  'Backup restored successfully. The app will close — reopen it to use the restored data.',
                  [{ text: 'OK', onPress: () => BackHandler.exitApp() }],
                );
              } catch (e: unknown) {
                Alert.alert('Restore failed', String((e as Error)?.message ?? e));
              } finally {
                setBusy(null);
              }
            },
          },
        ],
      );
    } catch (e: unknown) {
      Alert.alert('Restore failed', String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  };

  const handleRescanInbox = async () => {
    const ok = await startSmsScan();
    Alert.alert(
      ok ? 'Re-scan started' : 'Unavailable',
      ok ? 'Scanning last 6 months of SMS in the background.' : 'Native module not loaded.',
    );
  };

  const deleteUserRules = () => {
    try {
      getDb().run("DELETE FROM merchant_rules WHERE origin = 'user'");
      loadAll();
      Alert.alert('Done', 'Deleted user rules');
    } catch (e) {
      Alert.alert('Failed', String(e));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={['top']}>
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: 120 }}>
      <Section title="Google Drive">
        {driveEmail ? (
          <>
            <View style={styles.row}>
              <Text style={[styles.value, { flex: 1 }]}>{driveEmail}</Text>
              <Text style={{ color: palette.ok, marginRight: spacing.sm }}>connected</Text>
            </View>
            <Pressable style={styles.linkBtn} onPress={handleSignOut}>
              <Text style={styles.linkText}>Sign out</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.muted}>Not signed in</Text>
            <SettingRow
              label="Sign in with Google"
              onPress={handleSignIn}
              chevron={false}
            />
          </>
        )}
      </Section>

      <Section title="Backup">
        <Row label="Auto backup (daily)">
          <Switch
            value={!!settings.autoBackup}
            onValueChange={(v) => updateSettings({ autoBackup: v })}
          />
        </Row>
        <Row label="Encryption">
          <Switch
            value={!!settings.encryptionOn}
            onValueChange={(v) => updateSettings({ encryptionOn: v })}
          />
        </Row>
        <Pressable style={styles.linkBtn} onPress={handleBackupNow}>
          <Text style={styles.linkText}>Backup now</Text>
        </Pressable>
        <Pressable style={styles.linkBtn} onPress={handleRestore}>
          <Text style={styles.linkText}>Restore from Drive</Text>
        </Pressable>
        <Pressable style={styles.linkBtn} onPress={() => setShowPassphraseInput(true)}>
          <Text style={styles.linkText}>Set passphrase</Text>
        </Pressable>
      </Section>

      <Section title="Categories">
        <SettingRow
          label="Manage categories"
          subtitle={`${cats.length} total`}
          onPress={() => nav.navigate('Categories')}
        />
      </Section>

      {rulesCount > 0 ? (
        <Section title="Learned merchant rules">
          <Text style={styles.muted}>
            {rulesCount} merchant{rulesCount === 1 ? '' : 's'} you have re-categorized
          </Text>
          <Pressable style={styles.linkBtn} onPress={deleteUserRules}>
            <Text style={styles.linkText}>Reset learned rules</Text>
          </Pressable>
        </Section>
      ) : null}

      <Section title="SMS">
        <SettingRow
          label={scanning ? 'Scanning…' : 'Sync SMS inbox'}
          onPress={handleRescanInbox}
          chevron={false}
          disabled={scanning}
        />
        <SettingRow
          label="Review pending transactions"
          onPress={() => nav.navigate('Review')}
        />
        <SettingRow
          label="View imported SMS log"
          onPress={() => nav.navigate('ImportedSms')}
        />
      </Section>

      <Section title="About">
        <Text style={styles.muted}>App version: {appVersion}</Text>
        <Text style={styles.muted}>Schema version: {schemaVersion}</Text>
      </Section>

      <TextEntryModal
        visible={showPassphraseInput}
        title="Backup passphrase"
        placeholder="At least 8 characters"
        initialValue={settings.encryptionPassphrase ?? ''}
        onClose={() => setShowPassphraseInput(false)}
        onSave={(v) => {
          updateSettings({ encryptionPassphrase: v || null });
          setShowPassphraseInput(false);
        }}
      />

      {busy ? (
        <View style={styles.busyOverlay} pointerEvents="auto">
          <ActivityIndicator size="large" color={palette.accent} />
          <Text style={styles.busyText}>{busy}…</Text>
        </View>
      ) : null}
    </ScrollView>
    </SafeAreaView>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.card}>{children}</View>
  </View>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <View style={styles.row}>
    <Text style={[styles.value, { flex: 1 }]}>{label}</Text>
    {children}
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  section: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  sectionTitle: {
    color: palette.muted,
    fontSize: font.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: palette.glass,
    borderRadius: radius.xl,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: palette.glassHi,
    shadowColor: palette.brandGlow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  value: { color: palette.text, fontSize: font.md },
  muted: {
    color: palette.muted,
    fontSize: font.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  linkBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  linkText: { color: palette.link, fontSize: font.md, fontWeight: '600' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: palette.bgTint,
    padding: spacing.lg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.glassHi,
  },
  modalTitle: {
    color: palette.text,
    fontSize: font.lg,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  label: {
    color: palette.muted,
    fontSize: font.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: palette.surfaceAlt,
    color: palette.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    fontSize: font.md,
    borderWidth: 1,
    borderColor: palette.glassHi,
  },
  saveBtn: {
    marginTop: spacing.lg,
    backgroundColor: palette.brand,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  saveBtnText: { color: palette.text, fontWeight: '700', fontSize: font.md },
  busyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  busyText: { color: palette.text, marginTop: spacing.sm, fontSize: font.md },
});
