# Local capture activation — 13 September 2026

- Xcode 26.6 (17F113), iOS SDK 26.5, Apple Silicon Mac.
- **Unsigned iPhone app build succeeded.** The capture app compiles and links against Apple's iOS SDK. No source changes were needed.
- The project is open in Xcode. Automatic signing is already enabled, but no development team is configured and no valid signing identity was found.
- No physical iPhone was detected by `devicectl` or `xctrace`. Installation, camera permission, hardware support, and real LiDAR capture are not yet verified.
- The simulator app and `ScanExportTests` target also compiled successfully. Tests have not been executed.
- No simulator runtime was installed. The iOS 26.5 ARM64 runtime download has been started; unit-test execution is pending runtime installation.
- The local viewer is available at `http://192.168.0.40:5176` while the development server runs. Its API proxy returns a healthy response, and the viewer includes **Import scan → Choose scan from Files**. The IP may change when the Mac changes networks.

## Successful device build

```sh
xcodebuild -project ios/InteLiDarCapture.xcodeproj \
  -scheme InteLiDarCapture -sdk iphoneos -arch arm64 \
  -derivedDataPath test-results/ios/DerivedData \
  CODE_SIGNING_ALLOWED=NO build
```

Using the SDK directly allowed compilation before the simulator runtime was installed. The generic iOS destination was reported ineligible on this initial Xcode setup.

Build output: `test-results/ios/DerivedData/Build/Products/Debug-iphoneos/InteLiDarCapture.app`.
Logs: `test-results/ios/device-build.log`, `test-results/ios/test-compile.log`, and `test-results/ios/platform-download.log`. These local artifacts are ignored by Git.

## Required device steps

Connect and unlock a LiDAR-equipped iPhone, trust this Mac when prompted, and sign in under **Xcode → Settings → Accounts**. Select the development team under the app target's **Signing & Capabilities**. Enable Developer Mode on the phone if required. A signed build can then be installed and launched.

On the phone, allow the camera, tap **Start scan**, physically scan a room, tap **Finish**, and choose **Export scan → Save to Files**. Open the viewer in Safari on the same Wi-Fi and import that `.intelidar.json` file. A real export is required to verify sensor capture and the end-to-end workflow; neither compilation nor simulator tests establish that.
