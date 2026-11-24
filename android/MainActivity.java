package com.ackfix.routa;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RoutaMapPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
