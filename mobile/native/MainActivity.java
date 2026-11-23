package com.schoolwell.app;

import android.os.Bundle;
import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        CookieManager.getInstance().setAcceptCookie(true);
    }

    // The sign-in session is a cookie set by the website. Android's WebView writes cookies to disk lazily, so swiping the app away soon after
    // signing in (or after the hourly session refresh) lost the session and asked for a login again. Write them out whenever the app
    // leaves the screen.
    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    public void onStop() {
        super.onStop();
        CookieManager.getInstance().flush();
    }

    @Override
    public void onDestroy() {
        CookieManager.getInstance().flush();
        super.onDestroy();
    }
}
