# Store apps

Two television shells open the live site. Neither one is a copy of the game.

There is no phone app. The game runs in the phone browser. A television shows that phone when the phone OS mirrors the screen. The TV apps do not request the camera or the microphone.

Nothing in this repository has been uploaded to Google Play or Samsung Seller Office.

## Android TV

Project: `apps/android-tv`

Package id: `club.playfit.tv`

The Leanback launcher opens `https://playfitclub.com` in a landscape WebView. D-pad and Enter are delivered to the page. Back from the first page exits the app. `/tv` and `/tv/play` on the site permanently redirect to the homepage. This app is not uploaded to Google Play.

The banner in the project is a placeholder. It is not a television screenshot and it is not store art. Capture a 320×180 banner and screenshots on a real Android TV or Google TV before you upload anything.

### Build

Needs JDK 17 and Android SDK platform 35 (Android Studio, or the command-line tools plus `sdkmanager`).

```bash
cd apps/android-tv
./gradlew :app:assembleRelease
./gradlew :app:bundleRelease
```

`assembleRelease` writes an APK. `bundleRelease` writes the AAB that Play Console asks for. A debug APK is `./gradlew :app:assembleDebug`.

Release signing reads these environment variables. The keystore path should be absolute. Do not commit the keystore.

- `PLAYFIT_TV_STORE_FILE`
- `PLAYFIT_TV_STORE_PASSWORD`
- `PLAYFIT_TV_KEY_ALIAS`
- `PLAYFIT_TV_KEY_PASSWORD`

If those variables are unset, the release file is unsigned. Play Console will not accept it. `*.jks` and `*.keystore` are gitignored.

`TV_START_URL` defaults to `https://playfitclub.com`. An override must be `https` and must not be localhost.

The module targets API 35. Google Play's rule dated 31 August 2026 allows an Android TV app that targets API 34 or higher.

### Google Play Console

You need a Google Play Console account. Create the app there, upload the signed app bundle, and finish the forms Play shows you: store listing, TV banner, content rating, and data safety.

Privacy policy URL: `https://playfitclub.com/privacy`. That page exists. It says PlayFit Club has not published a complete privacy notice yet.

Do not declare camera access for this TV app. The manifest does not request `CAMERA`. Pose tracking runs in the phone browser.

This machine cannot submit the listing.

## Samsung TV

Project: `apps/tizen-tv`

`config.xml` sets the start URL with `tizen:content` to `https://playfitclub.com`. The privilege is internet only. The icon is the existing PlayFit mark padded to 512×512, not a picture of the game.

The live homepage has to load. The game is not played inside this TV browser.

Arrow keys and Enter are left to the page. The site moves focus with the arrows, and it treats Back, Escape, and Tizen key codes 10009 and 461 as back. Keyboard play is not added here.

`access origin="*"` is set so the hosted page can reach its scripts and the realtime host configured on the deployed site. Seller Office may ask you to name those hosts instead of `*`.

### Build the .wgt

Needs the Tizen Studio CLI. The binary is `tizen`, usually at `<tizen-studio>/tools/ide/bin/tizen`.

```bash
tizen build-web -- apps/tizen-tv
tizen package -t wgt -s <certificate-profile> -- apps/tizen-tv/.buildResult
```

Create `<certificate-profile>` in Tizen Studio Certificate Manager. Keep the certificate and the password on the machine that signs. Do not commit `.p12` files or the `.wgt`.

`PlayFitClb.PlayFitTV` and package `PlayFitClb` are placeholders. Replace both with the 10-character package id Samsung Seller Office assigns when you register the app.

### Samsung Seller Office

You need a Samsung Apps TV Seller Office account.

Samsung's hosted-application policy says a hosted app is not a normal submission. Contact the Seller Office content manager before upload and tell them the app loads `https://playfitclub.com`. The live site is the product. A packaged copy of the game is not in this repository. This app is not in Samsung Seller Office.

When they accept a submission, upload the signed `.wgt`, use `https://playfitclub.com/privacy` as the privacy policy URL, and describe the same limit that page already states: a complete privacy notice is not published yet. The TV app does not use the camera. The phone browser does.

This machine cannot submit the listing.
