# Schoolwell mobile (Android + iPhone store apps)

A thin native shell (Capacitor) that opens the deployed Schoolwell web app, so the store apps show the same Supabase data as the website
and desktop app. Change the address in `capacitor.config.json` (`server.url` and `allowNavigation`) to your school's deployment first.

```bash
cd mobile
npm install
npx cap add android      # generates mobile/android (needs Android Studio / the Android SDK to build)
npx cap add ios          # generates mobile/ios     (macOS + Xcode only)
npx cap sync
cp native/MainActivity.java android/app/src/main/java/com/schoolwell/app/MainActivity.java   # keeps you signed in when the app is closed
npx cap open android     # then Build > Generate Signed Bundle / APK
```

**Android APK without installing anything:** run the *Android app* workflow in GitHub Actions (Actions tab) and download the APK artifact.

## Publishing (needs your accounts; not something this repository can do for you)
- **Google Play:** a Play Console account (one-time fee), a release-signed bundle (`.aab`), a privacy policy URL and the Data Safety form.
- **Apple App Store:** an Apple Developer Program membership (yearly fee), a Mac with Xcode, signing certificates and provisioning,
  and an App Review. Apple can reject apps that are only a website in a wrapper (guideline 4.2), so expect to explain the school-specific
  functionality (login, attendance, fees, push notifications) or add native features such as push notifications and the camera.
- Both stores want an app icon, screenshots and a privacy policy that covers children's data.

Installing the web app from the browser ("Add to Home Screen") needs none of this and already works.
