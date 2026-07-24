#!/usr/bin/env node
/**
 * postinstall: make `hermesc` resolvable for local `eas update` (OTA) exports.
 *
 * `@expo/metro-config`'s Hermes serializer only looks for hermesc at
 * `react-native/sdks/hermesc/<os>-bin/hermesc` (or env REACT_NATIVE_OVERRIDE_HERMES_DIR).
 * The react-native-tvos fork doesn't populate `sdks/hermesc` (even after pod install),
 * so `yarn ota` fails with "Cannot find the hermesc executable." The prebuilt binary
 * ships in the `hermes-compiler` package, so we symlink it into the expected path.
 *
 * Idempotent and NON-FATAL: it must never throw, or it would break `yarn install`.
 */
const fs = require("fs");
const path = require("path");

function main() {
  const root = path.resolve(__dirname, "..");
  const rnSdks = path.join(root, "node_modules", "react-native", "sdks");
  const link = path.join(rnSdks, "hermesc");
  const sourceDir = path.join(
    root,
    "node_modules",
    "hermes-compiler",
    "hermesc",
  );

  const platSubpath =
    process.platform === "win32"
      ? path.join("win64-bin", "hermesc.exe")
      : process.platform === "darwin"
        ? path.join("osx-bin", "hermesc")
        : path.join("linux64-bin", "hermesc");

  // Already resolvable (our symlink from a previous run, or a future RN that
  // populates sdks/hermesc itself)? Nothing to do.
  if (fs.existsSync(path.join(link, platSubpath))) return;

  if (!fs.existsSync(rnSdks)) {
    console.warn(
      "[fix-hermesc] react-native/sdks missing — skipping (run after install).",
    );
    return;
  }
  if (!fs.existsSync(path.join(sourceDir, platSubpath))) {
    console.warn(
      "[fix-hermesc] hermes-compiler binary not found — skipping hermesc symlink.",
    );
    return;
  }

  // Clear a stale/broken symlink, but never clobber a real directory.
  try {
    const st = fs.lstatSync(link);
    if (st.isSymbolicLink()) fs.unlinkSync(link);
    else if (st.isDirectory()) return; // a real dir exists; leave it alone
  } catch {
    // link doesn't exist yet — fine
  }

  if (process.platform === "win32") {
    fs.symlinkSync(sourceDir, link, "junction"); // absolute, no admin needed
  } else {
    // Relative symlink so it survives the repo being moved/copied.
    fs.symlinkSync(path.relative(rnSdks, sourceDir), link);
  }

  console.log(
    "[fix-hermesc] linked react-native/sdks/hermesc -> hermes-compiler/hermesc",
  );
}

try {
  main();
} catch (err) {
  // Non-fatal: a failed postinstall must not block installs.
  console.warn("[fix-hermesc] skipped:", err && err.message ? err.message : err);
}
