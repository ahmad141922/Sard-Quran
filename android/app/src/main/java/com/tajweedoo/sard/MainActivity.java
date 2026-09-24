package com.tajweedoo.sard;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.tajweedoo.sard.asr.SardAsrPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registered before the bridge starts, so the WebView can ask for it
        // on its first frame. The plugin itself reports unavailable on a
        // device without the model, so registering it costs nothing there.
        registerPlugin(SardAsrPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
