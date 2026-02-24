const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withRemovePortraitOrientation(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;

    // 1. Ensure the tools namespace is present in the manifest root
    if (!androidManifest.$["xmlns:tools"]) {
      androidManifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    }

    const application = androidManifest.application[0];

    // 2. Define the activity exactly as the library does, but with a flexible orientation
    const mlKitActivity = {
      $: {
        "android:name":
          "com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity",
        "android:exported": "false",
        "android:screenOrientation": "unspecified", // Change portrait to unspecified
        "tools:replace": "android:screenOrientation", // Tell the compiler to overwrite the library's setting
      },
    };

    // 3. Check if we've already added it to avoid duplicates during multiple build runs
    if (!application.activity) {
      application.activity = [];
    }

    const existingActivityIndex = application.activity.findIndex(
      (activity) =>
        activity.$["android:name"] ===
        "com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity",
    );

    if (existingActivityIndex > -1) {
      // Update if it exists
      application.activity[existingActivityIndex] = mlKitActivity;
    } else {
      // Push if it doesn't
      application.activity.push(mlKitActivity);
    }

    return config;
  });
};
