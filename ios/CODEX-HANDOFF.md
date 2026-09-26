# Codex handoff: enable real iPhone LiDAR capture

Run the following prompt in Codex on a **Mac with Xcode**, with the updated InteLiDar workspace open and a LiDAR-equipped iPhone connected. Use terminal commands and whatever native computer-use tools that session actually provides. This Windows session cannot perform the Xcode build or install.

The current changes are uncommitted. Copy this updated workspace to the Mac, including `ios/` and the web import changes, or transfer them through your normal version-control workflow. Merely cloning the existing remote may not include them.

## Copy-paste prompt

```text
Finish enabling InteLiDar's real LiDAR capture on my connected iPhone.

This task authorizes building, fixing build errors, configuring local development signing, and installing/running the app on my connected device. Use terminal commands and available computer-use tools. Keep the current furniture and Safari import changes. Read AGENTS.md if present and ios/README.md before working.

1. Verify this is macOS, Xcode and its iOS SDK are available, and the checkout contains ios/InteLiDarCapture.xcodeproj and src/components/CaptureImport.tsx. Check git status and preserve existing changes. If these new files are missing, explain that the updated Windows workspace must be transferred; do not substitute the old remote version.

2. Inspect Xcode's active developer directory, project schemes, signing configuration, and connected devices. Build InteLiDarCapture for iOS without signing first. Fix compilation or project errors and repeat until the build succeeds. Run ScanExportTests using an available simulator or the connected device. Simulator success does not verify LiDAR.

3. Open the project in Xcode. Select InteLiDarCapture and my connected LiDAR-equipped iPhone. Configure automatic development signing using my team and an available bundle identifier. Build, install, and launch. Ask me to complete Apple sign-in, device unlock/trust, Developer Mode/restart, or a signing-team choice if required. Never request that I paste passwords or verification codes into chat.

4. Verify the app reports supported hardware through RoomCaptureSession.isSupported and can request camera permission. Guide me to allow the camera, tap Start scan, physically scan a room, tap Finish, and export using Save to Files. Do not claim a real scan happened without evidence from the phone or its export.

5. Start the API and Vite viewer from this updated checkout. Give me the computer's actual LAN URL for Safari on the iPhone; localhost on the phone is not the computer. Confirm the viewer has Import scan. Import the saved .intelidar.json file and verify its source is iPhone LiDAR / RoomPlan, the measured room and objects appear, and editing and spatial questions work. Use the actual phone/browser when accessible; otherwise guide me through those device-only steps and state which checks I performed.

6. Fix failures within this development workflow. Finish by reporting the build/test results, installation status, actual-device capture evidence, Safari import result, and any exact remaining blocker. Do not mark sensor capture verified from mock exports or a simulator. App Store/TestFlight publication is outside this task.
```

## Useful starting commands on the Mac

```sh
git status --short
xcode-select -p
xcodebuild -version
xcodebuild -project ios/InteLiDarCapture.xcodeproj -list
xcrun xctrace list devices

xcodebuild -project ios/InteLiDarCapture.xcodeproj \
  -scheme InteLiDarCapture -destination 'generic/platform=iOS' \
  CODE_SIGNING_ALLOWED=NO build

open ios/InteLiDarCapture.xcodeproj
```

Choose a real installed simulator/device identifier before running the test command in [README.md](./README.md). The unsigned build checks compilation; installation needs a signed development build.

For the web stack, follow [the project setup](../docs/getting-started.md). Vite already binds to the LAN and proxies API requests to `127.0.0.1:8000`. Avoid exposing the API separately merely to connect Safari.

**Current verification:** Windows build and web/backend tests passed, including WebKit with an iPhone profile. Native Swift syntax and Xcode project structure were checked. Native compilation, signing, installation, and real LiDAR capture remain to be performed on the Mac/iPhone.
