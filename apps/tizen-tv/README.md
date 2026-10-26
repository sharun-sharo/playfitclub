# PlayFit Club for Samsung TV

This is a hosted Tizen web app. Its start URL is `https://playfitclub.com`. The package does not contain a game. The game runs on the phone. A television shows that phone when the phone OS mirrors the screen. `/tv` on the site permanently redirects to the homepage. This package does not open `/tv`.

The phone is not an app. This package does not request the camera. This app is not in Samsung Seller Office.

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
