const { withProjectBuildGradle } = require("@expo/config-plugins");

// Google's read-only mirror of Maven Central. Maven Central itself now
// rate-limits shared CI egress (HTTP 429), and EAS workers trip it: Gradle
// treats a 429 as a repository failure, disables Maven Central for the rest of
// the run, and the whole dependency resolution collapses — twice in a row on
// 2026-09-03, both times on artifacts that are not even on Maven Central (the
// prebuilt Expo modules live on GitHub Packages; the lookups there are
// expected misses that a healthy Maven Central answers with 404). The mirror
// serves the same artifacts and answers misses with a clean 404, which Gradle
// treats as "not here, try the next repository".
const MIRROR = "https://maven-central.storage-download.googleapis.com/maven2/";

module.exports = function withMavenCentralMirror(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      throw new Error(
        "withMavenCentralMirror: expected a Groovy android/build.gradle",
      );
    }
    const replacement = `maven { url '${MIRROR}' } // Maven Central mirror, see plugins/withMavenCentralMirror.js`;
    config.modResults.contents = config.modResults.contents.replace(
      /^(\s*)mavenCentral\(\)\s*$/gm,
      `$1${replacement}`,
    );
    return config;
  });
};
