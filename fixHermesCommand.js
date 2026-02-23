const { withAppBuildGradle } = require("@expo/config-plugins");

/**
 * Config plugin that fixes the hermesCommand in android/app/build.gradle
 * for react-native-tvos builds.
 *
 * react-native-tvos doesn't ship hermesc under sdks/hermesc/ like upstream
 * React Native. Instead, it uses the separate `hermes-compiler` npm package.
 * The React Native Gradle Plugin already has fallback logic to locate hermesc
 * in node_modules/hermes-compiler/hermesc/%OS-BIN%/, but only when
 * hermesCommand is empty/blank.
 *
 * This plugin removes the explicit hermesCommand line so the gradle plugin's
 * built-in fallback kicks in automatically.
 */
module.exports = function fixHermesCommand(config) {
  return withAppBuildGradle(config, (config) => {
    let buildGradle = config.modResults.contents;

    // Remove the hermesCommand line that points to the non-existent
    // react-native/sdks/hermesc/ directory
    buildGradle = buildGradle.replace(
      /^\s*hermesCommand\s*=.*sdks\/hermesc.*$/m,
      "    // hermesCommand removed by fixHermesCommand plugin (react-native-tvos uses hermes-compiler npm package)"
    );

    config.modResults.contents = buildGradle;
    return config;
  });
};
