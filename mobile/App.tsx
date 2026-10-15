import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import Header from './src/components/Header';
import TabBar, { TabId } from './src/components/TabBar';
import StatCard from './src/components/StatCard';
import StockTable from './src/components/StockTable';
import StopList from './src/components/StopList';
import OrdersPage from './src/components/OrdersPage';
import HotOffersPage from './src/components/HotOffersPage';
import HotOfferCard from './src/components/HotOfferCard';
import SectionTitle from './src/components/SectionTitle';

import { api, errorMessage } from './src/api';
import type { Batch, Cart, Dish, HotOffer, OrderHistoryEntry, Product, StopDish } from './src/types';
import { colors } from './src/theme';
import { hoursUntil } from './src/utils';

const POLL_MS = 10_000;

const titles: Record<TabId, { title: string; subtitle: string }> = {
  dashboard: { title: 'Дашборд', subtitle: 'Обзор склада и стоп-листа' },
  stock: { title: 'Остатки', subtitle: 'Нажмите на продукт, чтобы раскрыть партии' },
  stoplist: { title: 'Стоп-лист', subtitle: 'Блюда, недоступные к заказу' },
  hot: { title: 'Горячие предложения', subtitle: 'Что выгодно продать первым, чтобы продукты не пропали' },
  orders: { title: 'Заказы', subtitle: 'Оформление заказов со списанием по FEFO' },
};

export default function App() {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [products, setProducts] = useState<Product[]>([]);
  const [stoplist, setStoplist] = useState<StopDish[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [history, setHistory] = useState<OrderHistoryEntry[]>([]);
  const [hotOffers, setHotOffers] = useState<HotOffer[]>([]);
  const [cart, setCart] = useState<Cart>({});
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [p, s, b, d, h, hot] = await Promise.all([
        api.get<Product[]>('/products'),
        api.get<StopDish[]>('/stoplist'),
        api.get<Batch[]>('/batches'),
        api.get<Dish[]>('/dishes'),
        api.get<OrderHistoryEntry[]>('/orders'),
        api.get<HotOffer[]>('/hot-offers'),
      ]);
      setProducts(p.data ?? []);
      setStoplist(s.data ?? []);
      setBatches(b.data ?? []);
      setDishes(d.data ?? []);
      setHistory(h.data ?? []);
      setHotOffers(hot.data ?? []);
      setError(null);
      setLoaded(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const onPullRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const addToCart = (o: HotOffer) =>
    setCart((prev) => ({
      ...prev,
      [o.dish_id]: Math.min((prev[o.dish_id] ?? 0) + 1, o.portions),
    }));

  const emptyProducts = products.filter((p) => p.quantity === 0).length;

  const { expiringSoon, expired } = useMemo(() => {
    let soon = 0;
    let gone = 0;
    for (const b of batches) {
      const h = hoursUntil(b.expires_at);
      if (h <= 0) gone++;
      else if (h < 24) soon++;
    }
    return { expiringSoon: soon, expired: gone };
  }, [batches]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <Header title={titles[tab].title} subtitle={titles[tab].subtitle} />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.emerald} />
          }
        >
          {!loaded && !error && <Text style={{ color: colors.muted }}>Загрузка…</Text>}

          {error && (
            <View style={styles.error}>
              <Text style={{ color: '#fca5a5' }}>
                Ошибка: {error}. Проверь, что Go-сервер запущен и адрес в .env верный.
              </Text>
            </View>
          )}

          {loaded && tab === 'dashboard' && (
            <View>
              <View style={styles.grid}>
                <StatCard label="Продуктов" value={products.length} accent="gray" />
                <StatCard
                  label="Нет в наличии"
                  value={emptyProducts}
                  accent={emptyProducts > 0 ? 'red' : 'emerald'}
                  hint="партий нет или закончились"
                />
                <StatCard
                  label="Партий <24ч"
                  value={expiringSoon}
                  accent={expiringSoon > 0 ? 'yellow' : 'emerald'}
                  hint={expired > 0 ? `и ещё ${expired} просрочено — нужно списать` : 'нужно срочно использовать'}
                />
                <StatCard
                  label="В стоп-листе"
                  value={stoplist.length}
                  accent={stoplist.length > 0 ? 'red' : 'emerald'}
                />
              </View>

              {hotOffers.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <View style={styles.rowBetween}>
                    <SectionTitle>Горячие предложения</SectionTitle>
                    <Text style={styles.link} onPress={() => setTab('hot')}>
                      Все →
                    </Text>
                  </View>
                  {hotOffers.slice(0, 3).map((o, i) => (
                    <HotOfferCard
                      key={o.dish_id}
                      offer={o}
                      rank={i + 1}
                      topScore={hotOffers[0].score}
                      inCart={cart[o.dish_id] ?? 0}
                      onAdd={() => addToCart(o)}
                      compact
                    />
                  ))}
                </View>
              )}

              <View style={{ marginTop: 8 }}>
                <SectionTitle>Стоп-лист</SectionTitle>
                <StopList dishes={stoplist} />
              </View>

              <View style={{ marginTop: 20 }}>
                <SectionTitle>Остатки</SectionTitle>
                <StockTable products={products} batches={batches} />
              </View>
            </View>
          )}

          {loaded && tab === 'stock' && <StockTable products={products} batches={batches} />}
          {loaded && tab === 'stoplist' && <StopList dishes={stoplist} />}
          {loaded && tab === 'orders' && (
            <OrdersPage
              dishes={dishes}
              history={history}
              cart={cart}
              setCart={setCart}
              onChanged={refresh}
            />
          )}
          {loaded && tab === 'hot' && (
            <HotOffersPage
              offers={hotOffers}
              cart={cart}
              onAdd={addToCart}
              onOpenOrders={() => setTab('orders')}
            />
          )}
        </ScrollView>

        <TabBar active={tab} onChange={setTab} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  link: { color: colors.emerald, fontSize: 13 },
  error: {
    marginBottom: 16, borderRadius: 10, borderWidth: 1, borderColor: '#991b1b',
    backgroundColor: 'rgba(69,10,10,0.4)', padding: 14,
  },
});