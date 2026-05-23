import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { readSettings, writeSettings } from './services';

// Baked-in OAuth Web Client ID — created in Google Cloud Console for this app.
// This is not a secret; it ships in every Android app that uses Google Sign-In.
const GOOGLE_WEB_CLIENT_ID =
  '1097551897816-kp7dq29o4g18g3g1vmmhfbl8rttfajau.apps.googleusercontent.com';

let configured = false;

const configure = (): void => {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    scopes: ['https://www.googleapis.com/auth/drive.appdata'],
    offlineAccess: false,
  });
  configured = true;
};

export const isDriveConfigured = (): boolean => true;

// kept for compatibility with the (now-removed) Settings paste UI
export const setGoogleWebClientId = (_clientId: string | null): void => {
  /* no-op — Client ID is baked in at build time */
};

export interface DriveSignInResult {
  email: string;
  displayName: string | null;
}

export const driveSignIn = async (): Promise<DriveSignInResult> => {
  if (!isDriveConfigured()) {
    throw new Error('Google OAuth not configured. Set googleWebClientId in Settings → Backup first.');
  }
  configure();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const userInfo = (await GoogleSignin.signIn()) as unknown as {
    data?: { user?: { email?: string; name?: string | null } };
    user?: { email?: string; name?: string | null };
  };
  const user = userInfo.data?.user ?? userInfo.user;
  if (!user?.email) throw new Error('Sign-in returned no user info.');
  writeSettings({ googleEmail: user.email });
  return { email: user.email, displayName: user.name ?? null };
};

export const driveSignOut = async (): Promise<void> => {
  configure();
  try {
    await GoogleSignin.signOut();
  } catch {
    /* ignore */
  }
  writeSettings({ googleEmail: undefined });
};

export const driveCurrentUser = async (): Promise<string | null> => {
  try {
    configure();
    const cur = await GoogleSignin.getCurrentUser();
    return cur?.user?.email ?? readSettings().googleEmail ?? null;
  } catch {
    return readSettings().googleEmail ?? null;
  }
};

export const driveStatusCodes = statusCodes;
