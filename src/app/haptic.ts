import { Vibration, Platform } from 'react-native';

// Simple haptic feedback util using the built-in Vibration API.
// On Android, short vibration durations approximate a tap-style click feedback.
// (Real iOS-style haptic engine would need react-native-haptic-feedback; this
//  avoids the extra native dependency.)

export const tapHaptic = (): void => {
  if (Platform.OS === 'android') Vibration.vibrate(10);
};

export const successHaptic = (): void => {
  if (Platform.OS === 'android') Vibration.vibrate([0, 10, 40, 30]);
};

export const warnHaptic = (): void => {
  if (Platform.OS === 'android') Vibration.vibrate(40);
};
