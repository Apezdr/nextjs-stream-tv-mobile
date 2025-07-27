module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        "babel-preset-expo",
        {
          // Disable automatic addition of the old reanimated plugin
          reanimated: false,
        },
      ],
    ],
    plugins: [
      // Manually add the new worklets plugin
      "react-native-worklets/plugin",
    ],
  };
};
