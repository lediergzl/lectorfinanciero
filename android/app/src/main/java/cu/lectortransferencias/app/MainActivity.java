package cu.lectortransferencias.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.lectortransferencias.sms.SmsReaderPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmsReaderPlugin.class); // debe ir ANTES de super.onCreate()
        super.onCreate(savedInstanceState);
    }
}
