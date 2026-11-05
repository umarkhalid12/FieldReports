import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MAX_IMAGES, MIN_IMAGES, Report } from '../domain/types';
import { newId } from '../domain/id';
import {
  deleteImageFile,
  deleteReportFiles,
  processImage,
} from '../services/images';
import { engine } from '../services/runtime';
import {
  hasCameraPermission,
  openAppSettings,
  requestCameraPermission,
} from '../services/permissions';
import { colors } from './theme';
import type { RootStackParamList } from './navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Compose'>;

interface Item {
  key: string;
  localPath: string;
  sizeBytes: number;
}

type CameraState = 'unknown' | 'granted' | 'denied' | 'blocked';

export default function ComposeScreen({ navigation }: Props) {
  const reportId = useRef(newId()).current;
  const submitted = useRef(false);

  const [description, setDescription] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState<CameraState>('unknown');

  useEffect(() => {
    return () => {
      if (!submitted.current) {
        deleteReportFiles(reportId);
      }
    };
  }, [reportId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async state => {
      if (state === 'active' && (await hasCameraPermission())) {
        setCamera(prev =>
          prev === 'denied' || prev === 'blocked' ? 'granted' : prev,
        );
      }
    });
    return () => sub.remove();
  }, []);

  const remaining = MAX_IMAGES - items.length;

  const addUris = async (uris: string[]) => {
    setBusy(true);
    setError(null);
    try {
      let count = items.length;
      for (const uri of uris) {
        if (count >= MAX_IMAGES) {
          break;
        }
        const p = await processImage(uri, reportId);
        count += 1;
        setItems(prev => [...prev, { key: p.localPath, ...p }]);
      }
    } catch (e) {
      console.error(
        `[compose:${reportId}] Could not prepare selected photo`,
        e,
      );
      setError('That photo could not be prepared. Please try a different one.');
    } finally {
      setBusy(false);
    }
  };

  const openCamera = async () => {
    let allowed = await hasCameraPermission();
    if (!allowed) {
      const result = await requestCameraPermission();
      setCamera(result);
      allowed = result === 'granted';
    }
    if (!allowed) {
      return;
    }
    setCamera('granted');
    const res = await launchCamera({ mediaType: 'photo', saveToPhotos: false });
    const uri = res.assets?.[0]?.uri;
    if (uri) {
      console.info(`[compose:${reportId}] Camera returned a photo`);
      await addUris([uri]);
    } else if (res.errorCode) {
      console.error(
        `[compose:${reportId}] Camera picker failed (${res.errorCode})`,
        res.errorMessage,
      );
      setError('The camera could not be opened.');
    }
  };

  const openGallery = async () => {
    const res = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: remaining,
    });
    const uris = (res.assets ?? [])
      .map(a => a.uri)
      .filter((u): u is string => !!u);
    console.info(
      `[compose:${reportId}] Gallery returned ${
        res.assets?.length ?? 0
      } asset(s), ` + `${uris.length} with a URI`,
    );
    if (uris.length > 0) {
      await addUris(uris);
    } else if (res.errorCode) {
      console.error(
        `[compose:${reportId}] Gallery picker failed (${res.errorCode})`,
        res.errorMessage,
      );
    }
  };

  const removeItem = (item: Item) => {
    setItems(prev => prev.filter(i => i.key !== item.key));
    deleteImageFile(item.localPath);
  };

  let blockReason: string | null = null;
  if (busy) {
    blockReason = 'Preparing photo...';
  } else if (description.trim().length === 0) {
    blockReason = 'Write a short description to continue';
  } else if (items.length < MIN_IMAGES) {
    blockReason = 'Add at least one photo to continue';
  }
  const canSubmit = blockReason === null && !submitting;

  const submit = async () => {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    const report: Report = {
      id: reportId,
      description: description.trim(),
      createdAt: Date.now(),
      status: 'queued',
      attempts: 0,
      images: items.map((it, index) => ({
        index,
        localPath: it.localPath,
        sizeBytes: it.sizeBytes,
        status: 'pending',
      })),
    };
    try {
      console.info(
        `[compose:${report.id}] Saving report with ${report.images.length} photo(s)`,
      );
      await engine.enqueue(report);
      submitted.current = true;
      navigation.goBack();
    } catch (e) {
      console.error(`[compose:${report.id}] Could not save report locally`, e);
      setError('Could not save the report on this phone. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>NEW FIELD NOTE</Text>
          <Text style={styles.heading}>Capture the details.</Text>
          <Text style={styles.introText}>
            Add a clear description and photos. Your report is saved on this
            device before it syncs.
          </Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>What did you find?</Text>
            <Text style={styles.counter}>{description.length}/500</Text>
          </View>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the location, issue, or work completed..."
            placeholderTextColor={colors.soft}
            multiline
            maxLength={500}
          />
        </View>

        <View style={styles.photoCard}>
          <View style={styles.labelRow}>
            <View>
              <Text style={styles.label}>Add photos</Text>
              <Text style={styles.photoHelp}>Show the scene from a few angles</Text>
            </View>
            <View style={styles.photoCount}>
              <Text style={styles.photoCountText}>
                {items.length} / {MAX_IMAGES}
              </Text>
            </View>
          </View>
          <View style={styles.thumbs}>
            {items.map(it => (
              <View key={it.key} style={styles.thumbWrap}>
                <Image
                  source={{ uri: `file://${it.localPath}` }}
                  style={styles.thumb}
                />
                <Pressable
                  style={styles.remove}
                  onPress={() => removeItem(it)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                >
                  <Text style={styles.removeText}>×</Text>
                </Pressable>
              </View>
            ))}
            {busy && (
              <View style={[styles.thumb, styles.thumbBusy]}>
                <ActivityIndicator color={colors.blue} />
              </View>
            )}
            {items.length === 0 && !busy && (
              <View style={styles.photoEmpty}>
                <Text style={styles.photoEmptyMark}>＋</Text>
                <Text style={styles.photoEmptyText}>Your photos will appear here</Text>
              </View>
            )}
          </View>

          <View style={styles.row}>
            <Pressable
              style={[
                styles.secondary,
                (busy || remaining <= 0) && styles.disabled,
              ]}
              disabled={busy || remaining <= 0}
              onPress={openCamera}
            >
              <Text style={styles.secondaryText}>Take a photo</Text>
            </Pressable>
            <Pressable
              style={[
                styles.secondary,
                (busy || remaining <= 0) && styles.disabled,
              ]}
              disabled={busy || remaining <= 0}
              onPress={openGallery}
            >
              <Text style={styles.secondaryText}>Choose from gallery</Text>
            </Pressable>
          </View>
        </View>

        {remaining <= 0 && (
          <Text style={styles.hint}>
            You have reached the limit of {MAX_IMAGES} photos. Remove one to add
            another.
          </Text>
        )}

        {(camera === 'denied' || camera === 'blocked') && (
          <View style={styles.permBox}>
            <Text style={styles.permTitle}>Camera access is off</Text>
            <Text style={styles.permText}>
              {camera === 'blocked'
                ? 'Turn on Camera for this app in Settings. You can still pick photos from the gallery.'
                : 'Allow camera access to take photos. You can still pick photos from the gallery.'}
            </Text>
            <Pressable
              style={styles.permBtn}
              onPress={camera === 'blocked' ? openAppSettings : openCamera}
            >
              <Text style={styles.permBtnText}>
                {camera === 'blocked' ? 'Open Settings' : 'Allow camera'}
              </Text>
            </Pressable>
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        {blockReason && <Text style={styles.hint}>{blockReason}</Text>}
        <Pressable
          style={[styles.primary, !canSubmit && styles.disabled]}
          disabled={!canSubmit}
          onPress={submit}
        >
          <Text style={styles.primaryText}>
            {submitting ? 'Saving...' : 'Save report'}
          </Text>
        </Pressable>
        <Text style={styles.hint}>
          It is saved on this phone first, then uploaded automatically.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 18, paddingBottom: 24, gap: 14 },
  intro: { gap: 6, marginBottom: 2 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: colors.blue },
  heading: { fontSize: 27, lineHeight: 33, fontWeight: '800', color: colors.ink },
  introText: { fontSize: 14, lineHeight: 21, color: colors.soft },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10,
  },
  photoCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 15, fontWeight: '800', color: colors.ink },
  counter: { fontSize: 12, fontWeight: '600', color: colors.soft },
  photoHelp: { fontSize: 12, color: colors.soft, marginTop: 3 },
  photoCount: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: colors.blueTint,
  },
  photoCountText: { color: colors.blue, fontSize: 12, fontWeight: '800' },
  input: {
    minHeight: 126,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, minHeight: 92 },
  thumbWrap: { width: 92, height: 92, margin: 3 },
  thumb: {
    width: 92,
    height: 92,
    borderRadius: 14,
    backgroundColor: colors.line,
  },
  thumbBusy: { alignItems: 'center', justifyContent: 'center' },
  photoEmpty: {
    minHeight: 92,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    backgroundColor: colors.bg,
    paddingHorizontal: 10,
  },
  photoEmptyMark: { fontSize: 20, color: colors.blue, fontWeight: '600' },
  photoEmptyText: { fontSize: 12, color: colors.soft },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: '#fff', fontSize: 18, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 10, marginTop: 2 },
  secondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: colors.blueTint,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  secondaryText: { color: colors.blue, fontWeight: '800', fontSize: 12, textAlign: 'center' },
  disabled: { opacity: 0.4 },
  hint: { fontSize: 13, lineHeight: 19, color: colors.soft, textAlign: 'center' },
  error: { color: colors.red, fontSize: 14, marginTop: 6, textAlign: 'center' },
  permBox: {
    backgroundColor: colors.orangeTint,
    borderRadius: 16,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
  },
  permTitle: { fontWeight: '700', color: colors.ink },
  permText: { color: colors.soft, fontSize: 14, lineHeight: 20 },
  permBtn: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  permBtnText: { color: '#fff', fontWeight: '700' },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 8,
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
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
