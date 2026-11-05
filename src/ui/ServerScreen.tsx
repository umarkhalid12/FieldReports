import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {fetchServerReports, ServerReport} from '../api/client';
import {colors} from './theme';

export default function ServerScreen() {
  const [reports, setReports] = useState<ServerReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchServerReports();
      setReports([...data].sort((a, b) => b.createdAt - a.createdAt));
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (reports === null && !error) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.blue} />
        <Text style={styles.loadingTitle}>Connecting to your archive</Text>
        <Text style={styles.soft}>Loading reports from the server...</Text>
      </SafeAreaView>
    );
  }

  if (error && reports === null) {
    return (
      <SafeAreaView style={styles.center}>
        <View style={styles.errorMark}>
          <Text style={styles.errorMarkText}>!</Text>
        </View>
        <Text style={styles.errorTitle}>Archive unavailable</Text>
        <Text style={styles.soft}>{error}</Text>
        <Pressable
          style={styles.btn}
          onPress={() => {
            setReports(null);
            load();
          }}>
          <Text style={styles.btnText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      {error && <Text style={styles.stale}>{error} Showing the last loaded list.</Text>}
      <FlatList
        data={reports ?? []}
        keyExtractor={r => r.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.blue}
          />
        }
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.eyebrow}>YOUR ARCHIVE</Text>
            <Text style={styles.heading}>Synced reports</Text>
            <Text style={styles.subtitle}>
              Reports safely uploaded from your device.
            </Text>
            <View style={styles.archiveCount}>
              <Text style={styles.archiveCountValue}>{reports?.length ?? 0}</Text>
              <Text style={styles.archiveCountLabel}>
                {(reports?.length ?? 0) === 1 ? 'REPORT STORED' : 'REPORTS STORED'}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyMark}>
              <Text style={styles.emptyMarkText}>↗</Text>
            </View>
            <Text style={styles.emptyTitle}>Nothing synced yet</Text>
            <Text style={styles.emptyText}>
              Once a report uploads from this device, it will be available here.
            </Text>
          </View>
        }
        renderItem={({item}) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.description}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
              <View style={styles.metaDivider} />
              <Text style={styles.meta}>
                {item.images.length} photo{item.images.length === 1 ? '' : 's'}
              </Text>
            </View>
            <View style={styles.thumbs}>
              {item.images.map(u => (
                <Image key={u} source={{uri: u}} style={styles.thumb} />
              ))}
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bg},
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 10,
    backgroundColor: colors.bg,
  },
  loadingTitle: {fontSize: 17, fontWeight: '800', color: colors.ink},
  list: {paddingHorizontal: 18, paddingBottom: 20, flexGrow: 1},
  listHeader: {paddingTop: 20, paddingBottom: 18, gap: 6},
  eyebrow: {fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: colors.blue},
  heading: {fontSize: 27, lineHeight: 33, fontWeight: '800', color: colors.ink},
  subtitle: {fontSize: 14, lineHeight: 21, color: colors.soft},
  archiveCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.blueTint,
  },
  archiveCountValue: {fontSize: 20, fontWeight: '800', color: colors.blue},
  archiveCountLabel: {fontSize: 10, fontWeight: '800', letterSpacing: 1, color: colors.blue},
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
  },
  title: {fontSize: 17, lineHeight: 23, fontWeight: '700', color: colors.ink},
  metaRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8},
  meta: {fontSize: 12, color: colors.soft},
  metaDivider: {width: 3, height: 3, borderRadius: 2, backgroundColor: colors.soft},
  thumbs: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14},
  thumb: {width: 82, height: 82, borderRadius: 13, backgroundColor: colors.line},
  soft: {color: colors.soft, textAlign: 'center', fontSize: 14},
  empty: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    padding: 24,
  },
  emptyMark: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blueTint,
    marginBottom: 12,
  },
  emptyMarkText: {fontSize: 23, color: colors.blue, fontWeight: '800'},
  emptyTitle: {fontSize: 17, fontWeight: '800', color: colors.ink},
  emptyText: {fontSize: 14, lineHeight: 21, color: colors.soft, textAlign: 'center', marginTop: 6},
  errorMark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.redTint,
  },
  errorMarkText: {fontSize: 24, fontWeight: '800', color: colors.red},
  errorTitle: {fontSize: 20, fontWeight: '800', color: colors.ink},
  btn: {
    minHeight: 50,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  btnText: {color: '#fff', fontWeight: '800'},
  stale: {
    backgroundColor: colors.orangeTint,
    color: colors.orange,
    padding: 12,
    fontSize: 13,
    lineHeight: 18,
  },
});