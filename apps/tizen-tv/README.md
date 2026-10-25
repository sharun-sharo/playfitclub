# PlayFit Club for Samsung TV

This is a hosted Tizen web app. Its start URL is `https://playfitclub.com/tv`. Play at home on that page opens the live FitRunner session. The package does not contain a game screenshot or a second copy of the game.

If the TV browser cannot create a WebGL 2 context, the site shows its own error. Leave that message on screen.

The phone is not an app. A player scans the QR code in the phone browser. This package does not request the camera.

`icon.png` is the existing PlayFit mark, padded to 512×512. It is not store screenshot art.

Arrow keys and Enter reach the page (`hwkey-event` is enabled). The site already moves focus with the arrows and treats Back, Escape, and Tizen key codes 10009 and 461 as back. This shell does not add keyboard play.

## Build the widget

Tizen Studio's CLI is required. The command is `tizen` from `<tizen-studio>/tools/ide/bin`.

```bash
tizen build-web -- apps/tizen-tv
tizen package -t wgt -s <certificate-profile> -- apps/tizen-tv/.buildResult
```

`<certificate-profile>` is a profile you create in Tizen Studio Certificate Manager. Do not commit the certificate, the profile password, or the `.wgt`.

`PlayFitClb` in `config.xml` is a placeholder. Samsung Seller Office assigns the real 10-character package id. Replace `tizen:application` `id` and `package` with that id before you upload.

Seller Office steps, the privacy policy URL, and the hosted-app review limit are in `docs/STORE_APPS.md`.
