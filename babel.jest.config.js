// Minimal babel config used only by Jest (see jest.config.js), for the pure-logic unit tests
// under src/utils/__tests__ and the widget layout test under src/widgets/__tests__. The app itself is bundled by
// Expo/Metro and doesn't use this file.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }], ['@babel/preset-typescript', { isTSX: true, allExtensions: true }]],
  plugins: [['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }]],
};
