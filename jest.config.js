module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/src/utils/__tests__/**/*.test.ts', '**/src/widgets/__tests__/**/*.test.tsx', '**/src/data/__tests__/**/*.test.ts'],
  moduleNameMapper: { '\\.(webp|png|jpe?g)$': '<rootDir>/src/utils/__tests__/fileStub.js', '^react-native$': '<rootDir>/src/utils/__tests__/reactNativeStub.js' },
  // react-native-android-widget ships untranspiled (ESM / Flow) files that the widget tree test loads: let babel-jest handle that one package.
  transformIgnorePatterns: ['/node_modules/(?!(react-native-android-widget)/)'],
  transform: { '^.+\\.[jt]sx?$': ['babel-jest', { configFile: './babel.jest.config.js' }] },
};
