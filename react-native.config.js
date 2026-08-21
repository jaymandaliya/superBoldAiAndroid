module.exports = {
  project: {
    ios: {},
    android: {},
  },
  assets: ['./assets/fonts/'],
  dependencies: {
    'react-native-vector-icons': {
      platforms: {
        ios: null, // handled via Podfile or manual linking
      },
    },
  },
};
