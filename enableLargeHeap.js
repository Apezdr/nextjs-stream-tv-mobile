const { withAndroidManifest } = require('@expo/config-plugins');
module.exports = function androidManifestPlugin(config) {
    return withAndroidManifest(config, async config => {
        const androidManifest = config.modResults.manifest;
        androidManifest.application[0].$['android:largeHeap'] = 'true';
        return config;
    });
};
