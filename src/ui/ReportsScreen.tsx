import React from 'react';
import {Alert, FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNetInfo} from '@react-native-community/netinfo';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {Report} from '../domain/types';
import {engine} from '../services/runtime';
import {useReports} from './useReports';
import {colors} from './theme';
import type {RootStackParamList} from './navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Reports'>;

function Banner({reports, offline}: {reports: Report[]; offline: boolean}) {
  const waiting = reports.filter(
    r => r.status === 'queued' || r.status === 'uploading',
  ).length;
  const failed = reports.filter(r => r.status === 'failed_permanent').length;

  let text = 'All reports uploaded';
  let tint = colors.greenTint;
  let ink = colors.green;

  if (offline && waiting > 0) {
    text = `Offline. ${waiting} report${waiting > 1 ? 's' : ''} saved on this phone. They will upload automatically when you are back online.`;
    tint = colors.orangeTint;
    ink = colors.orange;
  } else if (offline) {
    text = 'You are offline. New reports will be saved and sent later.';
    tint = colors.orangeTint;
    ink = colors.orange;
  } else if (failed > 0) {
    text = `${failed} report${failed > 1 ? 's need' : ' needs'} your attention`;
    tint = colors.redTint;
    ink = colors.red;
  } else if (waiting > 0) {
    text = `Uploading. ${waiting} report${waiting > 1 ? 's' : ''} left.`;
    tint = colors.blueTint;
    ink = colors.blue;
  } else if (reports.length === 0) {
    text = 'No reports yet';
    tint = colors.card;
    ink = colors.soft;
  }

  return (
    <View style={[styles.banner, {backgroundColor: tint}]}>
      <View style={[styles.bannerDot, {backgroundColor: ink}]} />
      <View style={styles.bannerCopy}>
        <Text style={[styles.bannerEyebrow, {color: ink}]}>SYNC STATUS</Text>
        <Text style={[styles.bannerText, {color: ink}]}>{text}</Text>
      </View>
    </View>
  );
}

function ReportCard({report}: {report: Report}) {
  const n = report.images.length;
  const done = report.images.filter(i => i.status === 'uploaded').length;
  const frac = Math.min(1, (done + engine.getProgress(report.id)) / n);

  let label = '';
  let detail = '';
  let color = colors.soft;
  let tint = colors.line;
  switch (report.status) {
    case 'queued':
      label = 'Waiting to sync';
      detail = report.attempts > 0 ? 'Will retry automatically' : 'Saved on this phone';
      color = colors.orange;
      tint = colors.orangeTint;
      break;
    case 'uploading':
      label = 'Uploading';
      detail = `Photo ${Math.min(done + 1, n)} of ${n}`;
      color = colors.blue;
      tint = colors.blueTint;
      break;
    case 'uploaded':
      label = 'Synced';
      detail = 'Available on the server';
      color = colors.green;
      tint = colors.greenTint;
      break;
    case 'failed_permanent':
      label = 'Needs attention';
      detail = 'The server could not accept this report';
      color = colors.red;
      tint = colors.redTint;
      break;
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.statusPill, {backgroundColor: tint}]}>
          <View style={[styles.statusDot, {backgroundColor: color}]} />
          <Text style={[styles.status, {color}]}>{label}</Text>
        </View>
        <Text style={styles.cardDate}>
          {new Date(report.createdAt).toLocaleDateString()}
        </Text>
      </View>
      <Text style={styles.cardTitle} numberOfLines={3}>
        {report.description}
      </Text>
      <View style={styles.cardMetaRow}>
        <Text style={styles.cardMeta}>
          {n} photo{n === 1 ? '' : 's'}
        </Text>
        <View style={styles.metaDivider} />
        <Text style={styles.cardMeta}>{detail}</Text>
      </View>

      {report.status === 'uploading' && (
        <View style={styles.track}>
          <View style={[styles.fill, {width: `${Math.round(frac * 100)}%`}]} />
        </View>
      )}

      {report.lastError && report.status !== 'uploaded' ? (
        <Text style={styles.errorText}>{report.lastError}</Text>
      ) : null}

      {report.status === 'failed_permanent' && (
        <View style={styles.row}>
          <Pressable
            style={styles.smallBtn}
            onPress={() => engine.retryNow(report.id)}>
            <Text style={styles.smallBtnText}>Try again</Text>
          </Pressable>
          <Pressable
            style={[styles.smallBtn, styles.smallBtnDanger]}
            onPress={() =>
              Alert.alert('Discard report?', 'It will be deleted from this phone.', [
                {text: 'Cancel', style: 'cancel'},
                {
                  text: 'Discard',
                  style: 'destructive',
                  onPress: () => engine.discard(report.id),
                },
              ])
            }>
            <Text style={[styles.smallBtnText, {color: colors.red}]}>Discard</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function ReportsScreen({navigation}: Props) {
  const reports = useReports();
  const net = useNetInfo();
  const offline = net.isConnected === false || net.isInternetReachable === false;
  const waiting = reports.filter(
    report => report.status === 'queued' || report.status === 'uploading',
  ).length;
  const uploaded = reports.filter(report => report.status === 'uploaded').length;

  const confirmReset = () => {
    const unsent = reports.filter(r => r.status !== 'uploaded').length;
    const warning =
      unsent > 0
        ? `${unsent} report${unsent > 1 ? 's have' : ' has'} NOT been uploaded and will be permanently lost. `
        : '';
    Alert.alert(
      'Start over?',
      `${warning}This deletes all reports and photos stored on this phone. Reports already on the server are not affected.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Delete everything', style: 'destructive', onPress: () => engine.reset()},
      ],
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      <FlatList
        data={reports}
        keyExtractor={r => r.id}
        renderItem={({item}) => <ReportCard report={item} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={styles.intro}>
              <Text style={styles.eyebrow}>YOUR WORKSPACE</Text>
              <Text style={styles.heading}>Every detail, captured.</Text>
              <Text style={styles.subtitle}>
                Keep your field notes and photos together, wherever work takes
                you.
              </Text>
            </View>
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{reports.length}</Text>
                <Text style={styles.statLabel}>TOTAL</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{waiting}</Text>
                <Text style={styles.statLabel}>TO SYNC</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{uploaded}</Text>
                <Text style={styles.statLabel}>SYNCED</Text>
              </View>
            </View>
            <Banner reports={reports} offline={offline} />
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Recent reports</Text>
              <Text style={styles.sectionCount}>{reports.length}</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyMark}>
              <Text style={styles.emptyPlus}>+</Text>
            </View>
            <Text style={styles.emptyTitle}>A fresh page</Text>
            <Text style={styles.emptyText}>
              Create your first field report to keep notes and photos in one
              place.
            </Text>
          </View>
        }
      />

      <View style={styles.footer}>
        <Pressable
          style={styles.primary}
          onPress={() => navigation.navigate('Compose')}>
          <Text style={styles.primaryText}>＋  Create a report</Text>
        </Pressable>
        <View style={styles.row}>
          <Pressable
            style={styles.secondary}
            onPress={() => navigation.navigate('Server')}>
            <Text style={styles.secondaryText}>Server archive</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={confirmReset}>
            <Text style={[styles.secondaryText, {color: colors.red}]}>
              Clear device
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bg},
  list: {paddingHorizontal: 18, paddingBottom: 18, flexGrow: 1},
  listHeader: {gap: 16, paddingTop: 18, paddingBottom: 18},
  intro: {gap: 6, paddingBottom: 2},
  eyebrow: {fontSize: 11, fontWeight: '800', letterSpacing: 1.5, color: colors.blue},
  heading: {fontSize: 28, lineHeight: 34, fontWeight: '800', color: colors.ink},
  subtitle: {fontSize: 15, lineHeight: 22, color: colors.soft},
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
  },
  stat: {flex: 1, alignItems: 'center', gap: 4},
  statValue: {fontSize: 22, fontWeight: '800', color: colors.ink},
  statLabel: {fontSize: 10, fontWeight: '700', letterSpacing: 1, color: colors.soft},
  statDivider: {width: 1, height: 30, backgroundColor: colors.line},
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 14,
  },
  bannerDot: {width: 10, height: 10, borderRadius: 5},
  bannerCopy: {flex: 1, gap: 3},
  bannerEyebrow: {fontSize: 10, fontWeight: '800', letterSpacing: 1.1},
  bannerText: {fontSize: 13, lineHeight: 19, fontWeight: '600'},
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  sectionTitle: {fontSize: 18, fontWeight: '800', color: colors.ink},
  sectionCount: {
    overflow: 'hidden',
    color: colors.soft,
    backgroundColor: colors.line,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 28,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
  },
  emptyMark: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.blueTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyPlus: {fontSize: 32, lineHeight: 36, color: colors.blue, fontWeight: '400'},
  emptyTitle: {fontSize: 17, fontWeight: '800', color: colors.ink},
  emptyText: {fontSize: 14, lineHeight: 21, color: colors.soft, textAlign: 'center', marginTop: 6},
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
  },
  cardTop: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  statusPill: {flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6},
  statusDot: {width: 7, height: 7, borderRadius: 4},
  status: {fontSize: 11, fontWeight: '800'},
  cardDate: {fontSize: 12, fontWeight: '600', color: colors.soft},
  cardTitle: {fontSize: 17, lineHeight: 23, fontWeight: '700', color: colors.ink, marginTop: 12},
  cardMetaRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8},
  cardMeta: {fontSize: 12, color: colors.soft},
  metaDivider: {width: 3, height: 3, borderRadius: 2, backgroundColor: colors.soft},
  errorText: {fontSize: 12, lineHeight: 18, color: colors.red, marginTop: 8},
  track: {height: 6, borderRadius: 3, backgroundColor: colors.line, marginTop: 12, overflow: 'hidden'},
  fill: {height: 6, borderRadius: 3, backgroundColor: colors.blue},
  row: {flexDirection: 'row', gap: 10, marginTop: 10},
  smallBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnDanger: {borderColor: colors.red},
  smallBtnText: {fontWeight: '600', color: colors.blue},
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.card,
  },
  primary: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {color: '#fff', fontSize: 16, fontWeight: '800'},
  secondary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {fontWeight: '600', color: colors.ink},
});