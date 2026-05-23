import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import Geolocation from '@react-native-community/geolocation';

// Force native Android LocationManager + GPS (so the system shows the GPS icon
// in the status bar while requesting). 'auto' would fall back to Play Services
// fused-location which often uses network/wifi silently and never spins GPS.
Geolocation.setRNConfiguration({
  skipPermissionRequests: true,
  authorizationLevel: 'whenInUse',
  enableBackgroundLocationUpdates: false,
  locationProvider: 'android',
});
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { palette, spacing, font, radius } from '../../theme';
import { AmountInput } from '../../components/AmountInput';
import { CategoryPicker } from '../../components/CategoryPicker';
import { Icon } from '../../components/Icon';
import { useExpensesStore } from '../../stores/expenses';
import { getDb } from '../../services';
import { suggestSubcategory } from '../../../services/categorizer/subcategory';
import { reverseGeocode } from '../../../services/geocode';
import { tapHaptic, successHaptic } from '../../haptic';
import type { Category } from '../../../types/domain';
import type { RootStackParamList } from '../../navigation';

// TODO(device): react-native-image-picker requires runtime permission for camera/photos on Android 13+.
// Ensure POST_NOTIFICATIONS / READ_MEDIA_IMAGES / CAMERA are granted before opening.

type Nav = NativeStackNavigationProp<RootStackParamList, 'ManualEntry'>;
type Route = RouteProp<RootStackParamList, 'ManualEntry'>;

const normalizeMerchant = (s: string | null): string | null => {
  if (!s) return null;
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || null
  );
};

export const ManualEntryScreen: React.FC = () => {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const prefill = route.params?.prefill;
  const add = useExpensesStore((s) => s.add);

  const [amountMinor, setAmountMinor] = React.useState<number>(prefill?.amountMinor ?? 0);
  const [merchant, setMerchant] = React.useState<string>(prefill?.merchantRaw ?? '');
  const [occurredAt, setOccurredAt] = React.useState<number>(prefill?.occurredAt ?? Date.now());
  const [category, setCategory] = React.useState<Category | null>(null);
  const [subcategory, setSubcategory] = React.useState('');
  const [note, setNote] = React.useState('');
  const [photoUri, setPhotoUri] = React.useState<string | null>(prefill?.photoUri ?? null);
  const [showCatPicker, setShowCatPicker] = React.useState(false);
  const [location, setLocation] = React.useState<{ lat: number; lon: number; name: string } | null>(
    null,
  );
  const [locating, setLocating] = React.useState(false);

  const useCurrentLocation = async () => {
    tapHaptic();
    setLocating(true);
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert(
            'Location permission needed',
            'Grant location access to attach your current location.',
          );
          setLocating(false);
          return;
        }
      }
      const onOk = (pos: { coords: { latitude: number; longitude: number } }) => {
        const { latitude, longitude } = pos.coords;
        const coordLabel = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        setLocation({ lat: latitude, lon: longitude, name: coordLabel });
        successHaptic();
        setLocating(false);
        // Reverse-geocode in the background; replace the coord label with a
        // human-readable name when it arrives. Best-effort — coords stay if it fails.
        reverseGeocode(latitude, longitude)
          .then((name) => {
            if (name) setLocation({ lat: latitude, lon: longitude, name });
          })
          .catch(() => undefined);
      };
      // Step 1: try a fast network/cached fix (no GPS spin-up). Most likely succeeds
      // indoors. Accept a cached fix up to 5 minutes old.
      Geolocation.getCurrentPosition(
        onOk,
        () => {
          // Step 2: fall back to GPS (slower, but works outdoors).
          Geolocation.getCurrentPosition(
            onOk,
            (err) => {
              Alert.alert(
                'Could not get location',
                `${err.message}. Make sure Location is enabled in your phone's Settings and you have a clear sky if indoors.`,
              );
              setLocating(false);
            },
            { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
          );
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
      );
    } catch (e) {
      Alert.alert('Location failed', String(e));
      setLocating(false);
    }
  };

  const pickPhoto = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
      const uri = result.assets?.[0]?.uri ?? null;
      if (uri) setPhotoUri(uri);
    } catch (e) {
      Alert.alert('Photo error', String(e));
    }
  };

  const onSave = () => {
    if (amountMinor <= 0) {
      Alert.alert('Amount required', 'Enter an amount greater than zero.');
      return;
    }
    try {
      add({
        amountMinor,
        currency: 'INR',
        occurredAt,
        merchantRaw: merchant || null,
        merchantNorm: normalizeMerchant(merchant),
        categoryId: category?.id ?? null,
        source: 'manual',
        confidence: 1.0,
        status: 'active',
        note: note || null,
        photoPath: photoUri,
        verifiedBy: 1,
        locationLat: location?.lat ?? null,
        locationLon: location?.lon ?? null,
        locationName: location?.name ?? null,
        subcategory: subcategory.trim() || null,
      });
      nav.goBack();
    } catch (e) {
      Alert.alert('Save failed', String(e));
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.label}>Amount</Text>
      <AmountInput amountMinor={amountMinor} onChange={setAmountMinor} />

      <Text style={styles.label}>Merchant</Text>
      <TextInput
        style={styles.input}
        value={merchant}
        onChangeText={setMerchant}
        onBlur={() => {
          const norm = normalizeMerchant(merchant);
          if (!norm || subcategory.trim()) return;
          const suggestion = suggestSubcategory(getDb(), norm);
          if (suggestion) setSubcategory(suggestion);
        }}
        placeholder="Where did you spend it?"
        placeholderTextColor={palette.muted}
      />

      <Text style={styles.label}>Date</Text>
      <View style={styles.dateBox}>
        <Text style={styles.dateText}>{new Date(occurredAt).toLocaleString()}</Text>
        <Pressable onPress={() => setOccurredAt(Date.now())} style={styles.dateBtn}>
          <Text style={styles.dateBtnText}>Now</Text>
        </Pressable>
        {/* TODO(device): Wire up a native date picker (e.g. @react-native-community/datetimepicker) for non-now dates */}
      </View>

      <Text style={styles.label}>Category</Text>
      <Pressable style={styles.input} onPress={() => setShowCatPicker(true)}>
        <Text style={category ? styles.value : styles.placeholder}>
          {category ? category.name : 'Choose category'}
        </Text>
      </Pressable>

      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        value={subcategory}
        onChangeText={setSubcategory}
        placeholder="Optional (e.g. Lunch, Petrol, Rent)"
        placeholderTextColor={palette.muted}
      />

      <Text style={styles.label}>Note</Text>
      <TextInput
        style={[styles.input, { minHeight: 70 }]}
        value={note}
        onChangeText={setNote}
        multiline
        placeholder="Optional"
        placeholderTextColor={palette.muted}
      />

      <Text style={styles.label}>Location</Text>
      <Pressable
        onPress={useCurrentLocation}
        style={[styles.input, styles.locationRow]}
        disabled={locating}
      >
        <Icon name="pin" size={20} color={location ? palette.brand : palette.muted} />
        <Text style={location ? styles.value : styles.placeholder}>
          {locating ? 'Locating…' : location ? location.name : 'Tap to use current location'}
        </Text>
        {location ? (
          <Pressable
            onPress={() => {
              tapHaptic();
              setLocation(null);
            }}
            hitSlop={8}
          >
            <Text style={{ color: palette.muted, fontSize: font.lg }}>×</Text>
          </Pressable>
        ) : null}
      </Pressable>

      <Text style={styles.label}>Photo</Text>
      <Pressable onPress={pickPhoto} style={styles.input}>
        <Text style={photoUri ? styles.value : styles.placeholder}>
          {photoUri ?? 'Attach photo'}
        </Text>
      </Pressable>

      <Pressable style={styles.saveBtn} onPress={onSave}>
        <Text style={styles.saveBtnText}>Save</Text>
      </Pressable>

      <CategoryPicker
        visible={showCatPicker}
        onClose={() => setShowCatPicker(false)}
        onSelect={setCategory}
        selectedId={category?.id ?? null}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  label: {
    color: palette.muted,
    fontSize: font.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: palette.surface,
    color: palette.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    fontSize: font.md,
  },
  value: { color: palette.text, fontSize: font.md },
  placeholder: { color: palette.muted, fontSize: font.md },
  dateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    justifyContent: 'space-between',
  },
  dateText: { color: palette.text, fontSize: font.md },
  dateBtn: {
    backgroundColor: palette.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  dateBtnText: { color: palette.text, fontSize: font.sm },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  saveBtn: {
    marginTop: spacing.xl,
    backgroundColor: palette.accent,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
});
