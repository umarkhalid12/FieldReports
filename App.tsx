import React, {useEffect} from 'react';
import {StatusBar} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {startRuntime} from './src/services/runtime';
import ReportsScreen from './src/ui/ReportsScreen';
import ComposeScreen from './src/ui/ComposeScreen';
import ServerScreen from './src/ui/ServerScreen';
import type {RootStackParamList} from './src/ui/navigation';
import {colors} from './src/ui/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  useEffect(() => {
    startRuntime();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerStyle: {backgroundColor: colors.card},
            headerTintColor: colors.ink,
            headerTitleStyle: {fontSize: 18, fontWeight: '700'},
            headerShadowVisible: false,
            contentStyle: {backgroundColor: colors.bg},
          }}>
          <Stack.Screen
            name="Reports"
            component={ReportsScreen}
            options={{title: 'Field reports'}}
          />
          <Stack.Screen
            name="Compose"
            component={ComposeScreen}
            options={{title: 'New report'}}
          />
          <Stack.Screen
            name="Server"
            component={ServerScreen}
            options={{title: 'Server archive'}}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}