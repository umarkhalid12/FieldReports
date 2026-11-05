import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('@react-navigation/native', () => {
  const ReactModule = require('react');
  return {
    NavigationContainer: ({children}: {children: React.ReactNode}) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  };
});

jest.mock('@react-navigation/native-stack', () => {
  const ReactModule = require('react');
  const Screen = () => null;
  const Navigator = ({children}: {children: React.ReactNode}) =>
    ReactModule.createElement(ReactModule.Fragment, null, children);
  return {
    createNativeStackNavigator: () => ({Navigator, Screen}),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react');
  const {View} = require('react-native');
  return {
    SafeAreaProvider: ({children}: {children: React.ReactNode}) =>
      ReactModule.createElement(View, null, children),
  };
});

jest.mock('../src/services/runtime', () => ({
  startRuntime: jest.fn(),
}));

jest.mock('../src/ui/ReportsScreen', () => () => null);
jest.mock('../src/ui/ComposeScreen', () => () => null);
jest.mock('../src/ui/ServerScreen', () => () => null);

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
