import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const DEFAULT_DEV_PORT = 5173;
const DEFAULT_PREVIEW_PORT = 4173;
const DEFAULT_API_PROXY_TARGET = 'http://localhost:3000';

const parsePort = ( value, fallback ) => {
  const parsedValue = Number.parseInt( value, 10 );

  if ( Number.isNaN( parsedValue ) || parsedValue < 1 || parsedValue > 65535 ) {
    return fallback;
  }

  return parsedValue;
};

const parseBoolean = ( value, fallback = false ) => {
  if ( value === undefined || value === null || value === '' ) return fallback;

  return [ '1', 'true', 'yes', 'on' ].includes( String( value ).trim().toLowerCase() );
};

const normalizeProxyTarget = ( value ) => String( value || DEFAULT_API_PROXY_TARGET ).trim().replace( /\/+$/, '' );

const getManualChunkName = ( id ) => {
  if ( !id.includes( 'node_modules' ) ) return undefined;

  if (
    id.includes( '/react/' ) ||
    id.includes( '/react-dom/' ) ||
    id.includes( '/react-router-dom/' ) ||
    id.includes( '\\react\\' ) ||
    id.includes( '\\react-dom\\' ) ||
    id.includes( '\\react-router-dom\\' )
  ) {
    return 'react';
  }

  if (
    id.includes( '/lucide-react/' ) ||
    id.includes( '/framer-motion/' ) ||
    id.includes( '\\lucide-react\\' ) ||
    id.includes( '\\framer-motion\\' )
  ) {
    return 'ui';
  }

  if ( id.includes( '@react-pdf' ) ) {
    return 'pdf';
  }

  return 'vendor';
};

// https://vite.dev/config/
export default defineConfig( ( { mode } ) => {
  const env = loadEnv( mode, process.cwd(), '' );
  const devPort = parsePort( env.VITE_DEV_PORT, DEFAULT_DEV_PORT );
  const previewPort = parsePort( env.VITE_PREVIEW_PORT, DEFAULT_PREVIEW_PORT );
  const proxyTarget = normalizeProxyTarget( env.VITE_API_PROXY_TARGET );
  const useApiProxy = parseBoolean( env.VITE_USE_API_PROXY, false );

  return {
    plugins: [
      tailwindcss(),
      react()
    ],

    resolve: {
      alias: {
        '@': fileURLToPath( new URL( './src', import.meta.url ) )
      }
    },

    server: {
      host: env.VITE_DEV_HOST || 'localhost',
      port: devPort,
      strictPort: parseBoolean( env.VITE_STRICT_PORT, false ),
      open: parseBoolean( env.VITE_OPEN_BROWSER, false ),
      proxy: useApiProxy
        ? {
          '/api': {
            target: proxyTarget,
            changeOrigin: true,
            secure: false
          },
          '/health': {
            target: proxyTarget,
            changeOrigin: true,
            secure: false
          }
        }
        : undefined
    },

    preview: {
      host: env.VITE_PREVIEW_HOST || 'localhost',
      port: previewPort,
      strictPort: parseBoolean( env.VITE_STRICT_PORT, false )
    },

    build: {
      target: 'es2022',
      sourcemap: parseBoolean( env.VITE_BUILD_SOURCEMAP, false ),
      emptyOutDir: true,
      chunkSizeWarningLimit: 1100,
      rollupOptions: {
        output: {
          manualChunks: getManualChunkName
        }
      }
    }
  };
} );
