module.exports = ({ config }) => {
  const preview = process.env.EXPO_PUBLIC_PREVIEW_MODE === 'true';
  const baseUrl = process.env.EXPO_WEB_BASE_PATH || '';

  return {
    ...config,
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
