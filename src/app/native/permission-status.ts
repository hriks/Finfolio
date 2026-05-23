import { NativeModules, Platform, PermissionsAndroid } from 'react-native';

export interface PermissionStatus {
  sms: boolean;
  postNotifications: boolean;
  notificationListener: boolean;
  batteryExempt: boolean;
}

interface NativePermissionStatus {
  getStatus(): Promise<PermissionStatus>;
  openNotificationListenerSettings(): Promise<boolean>;
  openBatteryOptimizationSettings(): Promise<boolean>;
  postTransactionNotification(title: string, body: string, expenseId: string): Promise<boolean>;
  consumeLaunchExpenseId(): Promise<string | null>;
}

const FALLBACK: NativePermissionStatus = {
  getStatus: async () => ({
    sms: false,
    postNotifications: false,
    notificationListener: false,
    batteryExempt: false,
  }),
  openNotificationListenerSettings: async () => false,
  openBatteryOptimizationSettings: async () => false,
  postTransactionNotification: async () => false,
  consumeLaunchExpenseId: async () => null,
};

const native: NativePermissionStatus =
  Platform.OS === 'android' && NativeModules.PermissionStatusModule
    ? (NativeModules.PermissionStatusModule as NativePermissionStatus)
    : FALLBACK;

export const fetchPermissionStatus = async (): Promise<PermissionStatus> => {
  if (Platform.OS !== 'android') return FALLBACK.getStatus();
  try {
    return await native.getStatus();
  } catch {
    // Fall back to PermissionsAndroid (won't cover NL / battery)
    const sms = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
    const notif = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return {
      sms,
      postNotifications: notif,
      notificationListener: false,
      batteryExempt: false,
    };
  }
};

export const openNotificationListenerSettings = (): Promise<boolean> =>
  native.openNotificationListenerSettings();

export const openBatteryOptimizationSettings = (): Promise<boolean> =>
  native.openBatteryOptimizationSettings();

export const postTransactionNotification = (
  title: string,
  body: string,
  expenseId: string,
): Promise<boolean> => {
  if (Platform.OS !== 'android') return Promise.resolve(false);
  return native.postTransactionNotification(title, body, expenseId).catch(() => false);
};

export const consumeLaunchExpenseId = (): Promise<string | null> => {
  if (Platform.OS !== 'android') return Promise.resolve(null);
  return native.consumeLaunchExpenseId().catch(() => null);
};
