import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.penielapp.mobile',
  appName: 'Peniel',
  webDir: 'www',
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 900,
      backgroundColor: '#14284A',
      showSpinner: false,
    },
  },
};

export default config;
