import axios from 'axios';
import toast from 'react-hot-toast';

export const AUTH_STORAGE_KEYS = Object.freeze( {
    token: '@CRMContratos:token',
    user: '@CRMContratos:user',
    theme: '@CRMContratos:theme'
} );

export const AUTH_SESSION_EXPIRED_EVENT = 'crm-auth-session-expired';

const DEFAULT_API_BASE_URL = 'http://localhost:3000/api';
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 60000;

let sessionExpiredToastVisible = false;

const isBrowser = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

const normalizeBaseURL = ( value ) => {
    const rawBaseURL = String( value || DEFAULT_API_BASE_URL ).trim();

    if ( !rawBaseURL ) return DEFAULT_API_BASE_URL;

    return rawBaseURL.replace( /\/+$/, '' );
};

const parseTimeout = () => {
    const rawTimeout = Number.parseInt( import.meta.env.VITE_API_TIMEOUT_MS, 10 );

    if ( Number.isNaN( rawTimeout ) ) return DEFAULT_TIMEOUT_MS;

    return Math.min( Math.max( rawTimeout, 1000 ), MAX_TIMEOUT_MS );
};

const parseBooleanEnv = ( value ) => [ '1', 'true', 'yes' ].includes(
    String( value ?? '' ).trim().toLowerCase()
);

const safeGetStorageItem = ( key ) => {
    if ( !isBrowser() ) return null;

    try {
        return localStorage.getItem( key );
    } catch {
        return null;
    }
};

const safeSetStorageItem = ( key, value ) => {
    if ( !isBrowser() ) return;

    try {
        localStorage.setItem( key, value );
    } catch {
        // Falha de storage não deve quebrar o fluxo da aplicação.
    }
};

const safeRemoveStorageItem = ( key ) => {
    if ( !isBrowser() ) return;

    try {
        localStorage.removeItem( key );
    } catch {
        // Falha de storage não deve quebrar o fluxo da aplicação.
    }
};

const normalizePath = ( url = '' ) => {
    try {
        const parsedUrl = new URL( url, api.defaults.baseURL );
        return parsedUrl.pathname;
    } catch {
        return String( url || '' );
    }
};

const isPublicAuthRequest = ( config = {} ) => {
    const method = String( config.method || 'get' ).toLowerCase();
    const path = normalizePath( config.url );

    return (
        method === 'post' &&
        ( path.endsWith( '/auth/login' ) || path.endsWith( '/auth/register' ) )
    );
};

const isSessionBootstrapRequest = ( config = {} ) => {
    const method = String( config.method || 'get' ).toLowerCase();
    const path = normalizePath( config.url );

    return method === 'get' && path.endsWith( '/auth/me' );
};

const getCurrentPathname = () => {
    if ( !isBrowser() ) return '/';
    return window.location.pathname || '/';
};

const redirectToLogin = () => {
    if ( !isBrowser() ) return;

    const currentPath = getCurrentPathname();

    if ( currentPath !== '/login' ) {
        window.location.assign( '/login' );
    }
};

const notifySessionExpired = () => {
    if ( sessionExpiredToastVisible ) return;

    sessionExpiredToastVisible = true;

    toast.error( 'Sua sessão expirou. Faça login novamente.', {
        id: 'crm-session-expired'
    } );

    window.setTimeout( () => {
        sessionExpiredToastVisible = false;
    }, 2500 );
};

export const getAuthToken = () => safeGetStorageItem( AUTH_STORAGE_KEYS.token );

export const setAuthToken = ( token ) => {
    const normalizedToken = String( token || '' ).trim();

    if ( !normalizedToken ) {
        safeRemoveStorageItem( AUTH_STORAGE_KEYS.token );
        delete api.defaults.headers.common.Authorization;
        return;
    }

    safeSetStorageItem( AUTH_STORAGE_KEYS.token, normalizedToken );
    api.defaults.headers.common.Authorization = `Bearer ${ normalizedToken }`;
};

export const clearAuthStorage = () => {
    safeRemoveStorageItem( AUTH_STORAGE_KEYS.token );
    safeRemoveStorageItem( AUTH_STORAGE_KEYS.user );
    delete api.defaults.headers.common.Authorization;
};

export const getStoredUser = () => {
    const storedUser = safeGetStorageItem( AUTH_STORAGE_KEYS.user );

    if ( !storedUser ) return null;

    try {
        return JSON.parse( storedUser );
    } catch {
        safeRemoveStorageItem( AUTH_STORAGE_KEYS.user );
        return null;
    }
};

export const setStoredUser = ( user ) => {
    if ( !user ) {
        safeRemoveStorageItem( AUTH_STORAGE_KEYS.user );
        return;
    }

    safeSetStorageItem( AUTH_STORAGE_KEYS.user, JSON.stringify( user ) );
};

export const getApiErrorMessage = ( error, fallback = 'Não foi possível concluir a operação.' ) => {
    const data = error?.response?.data;

    if ( typeof data?.message === 'string' && data.message.trim() ) {
        return data.message.trim();
    }

    if ( typeof data?.error === 'string' && data.error.trim() ) {
        return data.error.trim();
    }

    if ( error?.code === 'ECONNABORTED' ) {
        return 'A requisição demorou demais. Verifique sua conexão e tente novamente.';
    }

    if ( error?.message === 'Network Error' ) {
        return 'Erro de conexão. Verifique sua internet ou tente novamente mais tarde.';
    }

    return fallback;
};

const api = axios.create( {
    baseURL: normalizeBaseURL( import.meta.env.VITE_API_BASE_URL ),
    timeout: parseTimeout(),
    withCredentials: parseBooleanEnv( import.meta.env.VITE_API_WITH_CREDENTIALS ),
    headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
    }
} );

const initialToken = getAuthToken();

if ( initialToken ) {
    api.defaults.headers.common.Authorization = `Bearer ${ initialToken }`;
}

api.interceptors.request.use(
    ( config ) => {
        const token = getAuthToken();

        config.headers = config.headers ?? {};

        if ( token && !config.headers.Authorization ) {
            config.headers.Authorization = `Bearer ${ token }`;
        }

        if ( config.data instanceof FormData ) {
            delete config.headers[ 'Content-Type' ];
        }

        return config;
    },
    ( error ) => Promise.reject( error )
);

api.interceptors.response.use(
    ( response ) => response,
    ( error ) => {
        const status = error?.response?.status;

        if ( error?.code === 'ECONNABORTED' ) {
            toast.error( 'A requisição demorou demais. Tente novamente em instantes.', {
                id: 'crm-api-timeout'
            } );
        }

        if ( error?.message === 'Network Error' ) {
            toast.error( 'Erro de conexão. Verifique sua internet ou tente novamente mais tarde.', {
                id: 'crm-network-error'
            } );
        }

        if ( status === 401 ) {
            clearAuthStorage();

            const shouldSilentlyReject = isPublicAuthRequest( error.config ) || isSessionBootstrapRequest( error.config );

            if ( !shouldSilentlyReject && isBrowser() ) {
                notifySessionExpired();

                window.dispatchEvent( new CustomEvent( AUTH_SESSION_EXPIRED_EVENT ) );
                redirectToLogin();
            }
        }

        return Promise.reject( error );
    }
);

export default api;
