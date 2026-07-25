package com.xlb100.worker;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private OnBackPressedCallback webViewBackCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webViewBackCallback = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (bridge == null || bridge.getWebView() == null) {
                    leaveApp();
                    return;
                }
                WebView webView = bridge.getWebView();
                webView.evaluateJavascript("window.history.length > 1", canNavigateBack -> {
                    if ("true".equals(canNavigateBack)) {
                        webView.evaluateJavascript("window.history.back()", null);
                    } else {
                        leaveApp();
                    }
                });
            }
        };
        getOnBackPressedDispatcher().addCallback(this, webViewBackCallback);
    }

    private void leaveApp() {
        webViewBackCallback.setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
        webViewBackCallback.setEnabled(true);
    }
}
