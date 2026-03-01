import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.resqmesh.app',
    appName: 'ResQMesh',
    webDir: 'dist',
    server: {
        // Allow local dev server for hot-reload during development
        // Comment this out for production builds
        // url: 'http://192.168.x.x:5173',
        // cleartext: true,
    },
    android: {
        buildOptions: {
            keystorePath: undefined,
            keystorePassword: undefined,
            keystoreAlias: undefined,
            keystoreAliasPassword: undefined,
        },
        // Enable back button handling
        captureInput: true,
        webContentsDebuggingEnabled: true, // disable in production
    },
    plugins: {
        // Geolocation plugin config (used for map positioning)
        Geolocation: {
            permissions: ['coarseLocation', 'location'],
        },
    },
};

export default config;
