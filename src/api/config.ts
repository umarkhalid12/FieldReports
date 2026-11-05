import { Platform } from 'react-native';

const SERVER_HOST = Platform.OS === 'android' ? '192.168.100.27' : 'localhost';

export const BASE_URL = `http://${SERVER_HOST}:3000`;
