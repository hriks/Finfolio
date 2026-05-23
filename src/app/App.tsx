import React from 'react';
import { StatusBar, DeviceEventEmitter } from 'react-native';
import {
  NavigationContainer,
  DarkTheme,
  createNavigationContainerRef,
  CommonActions,
} from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './navigation';
import { palette } from './theme';
import { consumeLaunchExpenseId } from './native/permission-status';

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: palette.bg,
    card: palette.surface,
    text: palette.text,
    border: palette.border,
    primary: palette.accent,
    notification: palette.danger,
  },
};

export const navRef = createNavigationContainerRef();

const openExpense = (id: string): void => {
  if (!navRef.isReady()) return;
  // Navigate into the Home tab's stack (where ExpenseDetail is registered).
  navRef.dispatch(
    CommonActions.navigate('Tabs', {
      screen: 'HomeTab',
      params: { screen: 'ExpenseDetail', params: { id } },
    }),
  );
};

export default function App() {
  React.useEffect(() => {
    // Cold-launch via notification tap.
    consumeLaunchExpenseId().then((id) => {
      if (id) setTimeout(() => openExpense(id), 200);
    });
    // Notification tapped while the app is running.
    const sub = DeviceEventEmitter.addListener('OpenExpense', (id: string) => {
      if (id) openExpense(id);
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={palette.bg} />
      <NavigationContainer ref={navRef} theme={navTheme}>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
