import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';

import { isPlaceholderUrl } from './src/api';
import { KEYS, storage } from './src/storage';
import Drawer from './src/components/Drawer';
import Header from './src/components/Header';
import SettingsSheet from './src/components/SettingsSheet';
import { TITLES } from './src/components/nav';
import { useData } from './src/hooks/useData';
import { NotificationsProvider, useNotifications } from './src/notifications/NotificationsProvider';
import type { TabId } from './src/notifications/events';
import DashboardScreen from './src/screens/DashboardScreen';
import DeliveryScreen from './src/screens/DeliveryScreen';
import HotOffersScreen from './src/screens/HotOffersScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import StockScreen from './src/screens/StockScreen';
import StopListScreen from './src/screens/StopListScreen';
import WriteoffsScreen from './src/screens/WriteoffsScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import type { Cart, HotOffer } from './src/types';
import Background from './src/ui/Background';
import ErrorBanner from './src/ui/ErrorBanner';
import Screen, { RefreshProvider } from './src/ui/Screen';
import Txt from './src/ui/Txt';

void SplashScreen.preventAutoHideAsync();

export default function App() {
  const [loaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  useEffect(() => { if (loaded) void SplashScreen.hideAsync(); }, [loaded]);
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const [tab, setTab] = useState<TabId>('dashboard');
  const open = useCallback((t: TabId) => setTab(t), []);
  return (
    <NotificationsProvider onOpenTab={open}>
      <Shell tab={tab} setTab={setTab} />
    </NotificationsProvider>
  );
}

function Shell({ tab, setTab }: { tab: TabId; setTab: (t: TabId) => void }) {
  const { c } = useTheme();
  const notif = useNotifications();
  const { data, error, setError, refresh, pull, refreshing } = useData();
  const [cart, setCart] = useState<Cart>({});
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => { void storage.get(KEYS.onboarded, false).then(setOnboarded); }, []);
  const finishOnboarding = () => { setOnboarded(true); void storage.set(KEYS.onboarded, true); };

  const addToCart = (o: HotOffer) =>
    setCart((prev) => ({ ...prev, [o.dish_id]: Math.min((prev[o.dish_id] ?? 0) + 1, o.portions) }));

  const badges = useMemo(() => ({
    delivery: data?.restock.length ?? 0,
    writeoffs: data?.batches.filter((b) => b.expired).length ?? 0,
  }), [data]);
  const select = (t: TabId) => { setTab(t); setMenu(false); };
  const placeholder = isPlaceholderUrl();

  const errorBanner = error ? (
    <ErrorBanner
      message={placeholder ? 'адрес сервера не настроен' : error}
      onRetry={() => void refresh()}
      onClose={() => setError(null)}
      onSettings={() => setSettings(true)}
    />
  ) : null;

  let body;
  if (!data) {
    body = error ? (
      <Screen>{errorBanner}</Screen>
    ) : (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator color={c.accentText} />
        <Txt c="muted">Загрузка…</Txt>
      </View>
    );
  } else {
    body = (
      <>
        {error && <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>{errorBanner}</View>}
        {tab === 'dashboard' && <DashboardScreen data={data} onNavigate={select} />}
        {tab === 'stock' && <StockScreen products={data.products} batches={data.batches} />}
        {tab === 'stoplist' && <StopListScreen dishes={data.stoplist} />}
        {tab === 'hot' && <HotOffersScreen offers={data.hotOffers} cart={cart} onAdd={addToCart} onOpenOrders={() => setTab('orders')} />}
        {tab === 'orders' && <OrdersScreen dishes={data.dishes} history={data.history} cart={cart} setCart={setCart} onChanged={refresh} />}
        {tab === 'delivery' && <DeliveryScreen products={data.products} restock={data.restock} onChanged={refresh} />}
        {tab === 'writeoffs' && <WriteoffsScreen batches={data.batches} report={data.report} onChanged={refresh} />}
      </>
    );
  }

  if (onboarded === null) return <View style={{ flex: 1, backgroundColor: c.page.base }} />;
  if (!onboarded) {
    return (
      <>
        <StatusBar style={c.mode === 'dark' ? 'light' : 'dark'} />
        <OnboardingScreen onDone={finishOnboarding} />
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.page.base }}>
      <StatusBar style={c.mode === 'dark' ? 'light' : 'dark'} />
      <Background />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <Header
          title={TITLES[tab].title}
          subtitle={TITLES[tab].subtitle}
          onMenu={() => setMenu(true)}
          onSettings={() => setSettings(true)}
          alert={notif.permission === 'undetermined'}
          menuAlert={badges.delivery + badges.writeoffs > 0}
        />
        <RefreshProvider value={{ refreshing, onRefresh: () => void pull() }}>
          <View style={{ flex: 1 }}>{body}</View>
        </RefreshProvider>
      </SafeAreaView>
      <Drawer open={menu} active={tab} onSelect={select} onClose={() => setMenu(false)} badges={badges} />
      <SettingsSheet visible={settings} onClose={() => setSettings(false)} onServerChanged={() => void refresh()} />
    </View>
  );
}
