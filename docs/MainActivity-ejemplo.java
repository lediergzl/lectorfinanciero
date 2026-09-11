// Ubicación real tras `npx cap add android`:
// android/app/src/main/java/cu/lectortransferencias/app/MainActivity.java
//
// Como SmsReaderPlugin es un plugin LOCAL (no publicado en npm),
// hay que registrarlo manualmente antes de que se cargue el WebView.

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
