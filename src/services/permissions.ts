import {Linking, PermissionsAndroid, Platform} from 'react-native';

export type CameraResult = 'granted' | 'denied' | 'blocked';

export async function hasCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
}

export async function requestCameraPermission(): Promise<CameraResult> {
  if (Platform.OS !== 'android') {
    return 'granted';
  }
  const res = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
  );
  if (res === PermissionsAndroid.RESULTS.GRANTED) {
    return 'granted';
  }
  return res === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
    ? 'blocked'
    : 'denied';
}

export function openAppSettings(): Promise<void> {
  return Linking.openSettings();
}