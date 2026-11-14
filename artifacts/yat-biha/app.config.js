module.exports = ({ config }) => {
  const preview = process.env.EXPO_PUBLIC_PREVIEW_MODE === 'true';
  const baseUrl = process.env.EXPO_WEB_BASE_PATH || '';

  return {
    ...config,
    ios: { ...config.ios, ...(process.env.IOS_BUNDLE_IDENTIFIER ? { bundleIdentifier: process.env.IOS_BUNDLE_IDENTIFIER } : {}) },
    android: { ...config.android, ...(process.env.ANDROID_APPLICATION_ID ? { package: process.env.ANDROID_APPLICATION_ID } : {}) },
    web: {
      ...config.web,
      ...(preview ? { output: 'single' } : {}),
    },
    experiments: {
      ...config.experiments,
      ...(baseUrl ? { baseUrl } : {}),
    },
  };
};
