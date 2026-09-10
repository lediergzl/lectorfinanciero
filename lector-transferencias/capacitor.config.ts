import type { CapacitorConfig } from '@capacitor/cli';

// Configuración base del proyecto Capacitor.
// webDir apunta a la carpeta que genera Vite tras el build (dist/).
const config: CapacitorConfig = {
  appId: 'cu.lectortransferencias.app',
  appName: 'Lector de Transferencias',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    // Permite tráfico local sin HTTPS (no hace falta backend, pero
    // algunos plugins nativos usan WebView local).
    allowMixedContent: true
  },
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: false
    }
  }
};

export default config;
