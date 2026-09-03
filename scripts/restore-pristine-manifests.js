#!/usr/bin/env node
// Restores node_modules files that a local Gradle run rewrites in place, so the
// local fingerprint (runtime version) matches the one EAS computes from a
// pristine install. Run before `eas update` and before comparing fingerprints:
//   node scripts/restore-pristine-manifests.js
// (Not wired into package.json scripts on purpose: that block is itself a
// fingerprint source, so editing it would change the runtime version.)
//
// @react-native-masked-view/masked-view/android/build.gradle strips the
// `package="..."` attribute from its own AndroidManifest.xml at Gradle
// configuration time (AGP >= 7). EAS hashes node_modules before Gradle runs,
// so after any local `expo run:android` / `gradlew` the directory hash differs
// and `eas update` reports "Runtime version mismatch".
const fs = require("fs");
const path = require("path");

const PRISTINE = [
  {
    file: "node_modules/@react-native-masked-view/masked-view/android/src/main/AndroidManifest.xml",
    content:
      '<manifest package="org.reactnative.maskedview" xmlns:android="http://schemas.android.com/apk/res/android">\n</manifest>\n',
  },
];

let restored = 0;
for (const { file, content } of PRISTINE) {
  const abs = path.join(__dirname, "..", file);
  if (!fs.existsSync(abs)) continue;
  if (fs.readFileSync(abs, "utf8") !== content) {
    fs.writeFileSync(abs, content);
    console.log(`restored pristine ${file}`);
    restored += 1;
  }
}
console.log(
  restored ? `${restored} file(s) restored` : "manifests already pristine",
);
