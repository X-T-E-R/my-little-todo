import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mylittletodo.app',
  appName: 'My Little Todo',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
