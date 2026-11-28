// Stand-in for 'react-native' in Jest (see jest.config.js). The real package's entry file is Flow source that Jest's Babel setup cannot parse, and these
// pure-logic tests need none of it. The Android widget library only calls Image.resolveAssetSource when it turns a bundled picture into a widget node.
module.exports = {
  Image: { resolveAssetSource: (id) => ({ uri: `asset:${id}`, width: 1, height: 1 }) },
  Platform: { OS: 'android', select: (o) => (o && (o.android !== undefined ? o.android : o.default)) },
};
