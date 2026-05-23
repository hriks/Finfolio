import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Icon, type IconName } from './components/Icon';
import { HomeScreen } from './screens/home/HomeScreen';
import { ExpensesScreen } from './screens/expenses/ExpensesScreen';
import { ExpenseDetailScreen } from './screens/detail/ExpenseDetailScreen';
import { ManualEntryScreen } from './screens/add/ManualEntryScreen';
import { AddExpenseSheet } from './screens/add/AddExpenseSheet';
import { InsightsScreen } from './screens/insights/InsightsScreen';
import { SettingsScreen } from './screens/settings/SettingsScreen';
import { OnboardingScreen } from './screens/onboarding/OnboardingScreen';
import { ImportedSmsScreen } from './screens/imported-sms/ImportedSmsScreen';
import { ReviewScreen } from './screens/review/ReviewScreen';
import { CategoriesScreen } from './screens/categories/CategoriesScreen';
import { GlobalScanBanner } from './components/GlobalScanBanner';
import { readSettings } from './services';
import { tapHaptic } from './haptic';
import { palette, spacing, font } from './theme';

// Each tab has its own nested stack so the bottom tab bar stays visible on Detail / Review / etc.
export type HomeStackParamList = {
  Home: undefined;
  ExpenseDetail: { id: string };
  Review: undefined;
  ImportedSms: undefined;
};
export type ExpensesStackParamList = {
  Expenses: undefined;
  ExpenseDetail: { id: string };
};
export type SettingsStackParamList = {
  Settings: undefined;
  Review: undefined;
  ImportedSms: undefined;
  ExpenseDetail: { id: string };
  Categories: undefined;
};
export type InsightsStackParamList = {
  Insights: undefined;
  ExpenseDetail: { id: string };
};
export type RootStackParamList = {
  Onboarding: undefined;
  Tabs: undefined;
  ManualEntry:
    | {
        prefill?: {
          amountMinor?: number;
          merchantRaw?: string | null;
          occurredAt?: number | null;
          photoUri?: string | null;
        };
      }
    | undefined;
  AddSheet: undefined;
  // Convenience shortcuts — used by deep links / banners; navigate inside the active tab.
  ExpenseDetail: { id: string };
  ImportedSms: undefined;
  Review: undefined;
};
export type TabsParamList = {
  HomeTab: undefined;
  ExpensesTab: undefined;
  Add: undefined;
  InsightsTab: undefined;
  SettingsTab: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabsParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const ExpensesStack = createNativeStackNavigator<ExpensesStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();
const InsightsStack = createNativeStackNavigator<InsightsStackParamList>();

const stackScreenOpts = {
  headerStyle: { backgroundColor: palette.bg },
  headerTitleStyle: { color: palette.text, fontWeight: '700' as const },
  headerTintColor: palette.text,
  contentStyle: { backgroundColor: palette.bg },
  // react-native-screens 4 over-pads the header on Android (double safe-area).
  // Zero this out so the header sits flush against the status bar.
  headerStatusBarHeight: 0,
};

const HomeStackNav: React.FC = () => (
  <HomeStack.Navigator screenOptions={stackScreenOpts}>
    <HomeStack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
    <HomeStack.Screen name="ExpenseDetail" component={ExpenseDetailScreen} options={{ headerShown: false }} />
    <HomeStack.Screen name="Review" component={ReviewScreen} options={{ title: 'Review' }} />
    <HomeStack.Screen name="ImportedSms" component={ImportedSmsScreen} options={{ title: 'Imported SMS' }} />
  </HomeStack.Navigator>
);

const ExpensesStackNav: React.FC = () => (
  <ExpensesStack.Navigator screenOptions={stackScreenOpts}>
    <ExpensesStack.Screen name="Expenses" component={ExpensesScreen} options={{ headerShown: false }} />
    <ExpensesStack.Screen name="ExpenseDetail" component={ExpenseDetailScreen} options={{ headerShown: false }} />
  </ExpensesStack.Navigator>
);

const SettingsStackNav: React.FC = () => (
  <SettingsStack.Navigator screenOptions={stackScreenOpts}>
    <SettingsStack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
    <SettingsStack.Screen name="Review" component={ReviewScreen} options={{ title: 'Review' }} />
    <SettingsStack.Screen name="ImportedSms" component={ImportedSmsScreen} options={{ title: 'Imported SMS' }} />
    <SettingsStack.Screen name="ExpenseDetail" component={ExpenseDetailScreen} options={{ headerShown: false }} />
    <SettingsStack.Screen name="Categories" component={CategoriesScreen} options={{ title: 'Categories' }} />
  </SettingsStack.Navigator>
);

const InsightsStackNav: React.FC = () => (
  <InsightsStack.Navigator screenOptions={stackScreenOpts}>
    <InsightsStack.Screen name="Insights" component={InsightsScreen} options={{ headerShown: false }} />
    <InsightsStack.Screen name="ExpenseDetail" component={ExpenseDetailScreen} options={{ headerShown: false }} />
  </InsightsStack.Navigator>
);

const AddPlaceholder: React.FC = () => <View style={{ flex: 1, backgroundColor: palette.bg }} />;

const TabsNavigator: React.FC = () => (
  <Tabs.Navigator
    screenOptions={{
      headerShown: false,
      tabBarStyle: {
        position: 'absolute',
        left: spacing.lg,
        right: spacing.lg,
        bottom: spacing.lg,
        height: 76,
        paddingTop: 10,
        paddingBottom: 12,
        backgroundColor: 'rgba(20, 12, 28, 0.78)',
        borderRadius: 26,
        borderTopWidth: 0,
        borderWidth: 1,
        borderColor: palette.glassHi,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.45,
        shadowRadius: 20,
        elevation: 14,
      },
      tabBarActiveTintColor: palette.lavender,
      tabBarInactiveTintColor: palette.muted,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
      tabBarIconStyle: { marginBottom: 2 },
    }}
    screenListeners={{
      tabPress: () => tapHaptic(),
    }}
  >
    <Tabs.Screen name="HomeTab" component={HomeStackNav} options={{ ...tabOptions('home'), title: 'Home' }} />
    <Tabs.Screen name="ExpensesTab" component={ExpensesStackNav} options={{ ...tabOptions('list'), title: 'Ledger' }} />
    <Tabs.Screen
      name="Add"
      component={AddPlaceholder}
      options={{
        tabBarLabel: '',
        tabBarIcon: () => (
          <View style={styles.addFab}>
            <Icon name="plus" size={32} color="#ffffff" />
          </View>
        ),
      }}
      listeners={({ navigation }) => ({
        tabPress: (e) => {
          e.preventDefault();
          tapHaptic();
          navigation.getParent()?.navigate('AddSheet');
        },
      })}
    />
    <Tabs.Screen name="InsightsTab" component={InsightsStackNav} options={{ ...tabOptions('chart'), title: 'Insights' }} />
    <Tabs.Screen name="SettingsTab" component={SettingsStackNav} options={{ ...tabOptions('settings'), title: 'Settings' }} />
  </Tabs.Navigator>
);

const tabOptions = (icon: IconName) => ({
  tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
    <Icon name={icon} size={28} color={color} filled={focused} />
  ),
});

export const RootNavigator: React.FC = () => {
  const [initialRoute] = React.useState<keyof RootStackParamList>(() => {
    try {
      return readSettings().onboardingComplete ? 'Tabs' : 'Onboarding';
    } catch {
      return 'Onboarding';
    }
  });
  return (
    <View style={{ flex: 1 }}>
      <RootStack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          ...stackScreenOpts,
          headerShown: false,
        }}
      >
        <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
        <RootStack.Screen name="Tabs" component={TabsNavigator} />
        <RootStack.Screen
          name="ManualEntry"
          component={ManualEntryScreen}
          options={{ title: 'Add Expense', presentation: 'modal', headerShown: true }}
        />
        <RootStack.Screen
          name="AddSheet"
          component={AddExpenseSheet}
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
            animationDuration: 150,
          }}
        />
      </RootStack.Navigator>
      <GlobalScanBanner />
    </View>
  );
};

const styles = StyleSheet.create({
  addFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.brand,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -18,
    borderWidth: 1,
    borderColor: palette.glassHi,
    shadowColor: palette.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 14,
  },
});
