import {
    useCallback,
    useEffect,
    useMemo,
    useState
} from 'react';
import toast from 'react-hot-toast';
import { AuthContext } from './authContextObject.js';
import api, {
    AUTH_SESSION_EXPIRED_EVENT,
    clearAuthStorage,
    getApiErrorMessage,
    getAuthToken,
    getStoredUser,
    setAuthToken,
    setStoredUser
} from '../../services/api.Service.js';


const ALLOWED_ROLES = Object.freeze( [ 'FREELANCER', 'CLIENT' ] );

const normalizeSpaces = ( value ) => String( value ?? '' ).trim().replace( /\s+/g, ' ' );

/**
 * O front nunca deve persistir dados sensíveis no localStorage.
 * Aqui mantemos somente os dados públicos necessários para UI, navegação e permissões.
 */
const toSafeStoredUser = ( userData = {} ) => {
    const name = normalizeSpaces( userData.name );
    const lastName = normalizeSpaces( userData.lastName );
    const role = normalizeSpaces( userData.role ).toUpperCase();
    const fullName = normalizeSpaces(
        userData.fullName || [ name, lastName ].filter( Boolean ).join( ' ' )
    );

    return {
        id: String( userData.id || '' ),
        name,
        lastName,
        fullName,
        email: normalizeSpaces( userData.email ).toLowerCase(),
        role: ALLOWED_ROLES.includes( role ) ? role : '',
        signature: Boolean( userData.signature )
    };
};

const isUsableStoredUser = ( userData ) => Boolean(
    userData?.id &&
    userData?.email &&
    ALLOWED_ROLES.includes( userData?.role )
);

export const AuthProvider = ( { children } ) => {
    const [ user, setUser ] = useState( null );
    const [ loading, setLoading ] = useState( true );
    const [ isAuthenticating, setIsAuthenticating ] = useState( false );

    const persistUser = useCallback( ( userData ) => {
        const safeUser = toSafeStoredUser( userData );

        if ( !isUsableStoredUser( safeUser ) ) {
            clearAuthStorage();
            setUser( null );
            return null;
        }

        setStoredUser( safeUser );
        setUser( safeUser );
        return safeUser;
    }, [] );

    const clearSession = useCallback( () => {
        clearAuthStorage();
        setUser( null );
    }, [] );

    /**
     * Revalida a sessão atual com a API.
     * Isso mantém o comportamento seguro do projeto: o usuário salvo localmente ajuda a UI,
     * mas a sessão só é considerada válida após confirmação em /auth/me.
     */
    const refreshUser = useCallback( async () => {
        const response = await api.get( '/auth/me' );
        return persistUser( response.data?.user );
    }, [ persistUser ] );

    useEffect( () => {
        let isMounted = true;

        const validateStoredSession = async () => {
            try {
                const token = getAuthToken();

                if ( !token ) {
                    clearSession();
                    return;
                }

                const storedUser = getStoredUser();

                if ( storedUser && isUsableStoredUser( storedUser ) && isMounted ) {
                    setUser( storedUser );
                }

                setAuthToken( token );

                const validatedUser = await refreshUser();

                if ( !isMounted ) return;

                if ( !validatedUser ) {
                    clearSession();
                }
            } catch {
                if ( isMounted ) clearSession();
            } finally {
                if ( isMounted ) setLoading( false );
            }
        };

        validateStoredSession();

        return () => {
            isMounted = false;
        };
    }, [ clearSession, refreshUser ] );

    useEffect( () => {
        const handleSessionExpired = () => {
            clearSession();
            setLoading( false );
            setIsAuthenticating( false );
        };

        window.addEventListener( AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired );

        return () => {
            window.removeEventListener( AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired );
        };
    }, [ clearSession ] );

    const signIn = useCallback( async ( email, password ) => {
        try {
            setIsAuthenticating( true );

            const response = await api.post( '/auth/login', {
                email: normalizeSpaces( email ).toLowerCase(),
                password: String( password ?? '' )
            } );

            const token = response.data?.token;
            const userData = response.data?.user;

            if ( !token || !userData ) {
                throw new Error( 'Resposta de autenticação incompleta.' );
            }

            setAuthToken( token );
            const safeUser = persistUser( userData );

            if ( !safeUser ) {
                throw new Error( 'Dados de usuário inválidos.' );
            }

            toast.success( `Bem-vindo de volta, ${ safeUser.name || 'usuário' }!` );
            return true;
        } catch ( error ) {
            clearSession();
            toast.error( getApiErrorMessage( error, 'Falha na autenticação. Verifique suas credenciais.' ) );
            return false;
        } finally {
            setIsAuthenticating( false );
            setLoading( false );
        }
    }, [ clearSession, persistUser ] );

    const signUp = useCallback( async ( payload ) => {
        try {
            setIsAuthenticating( true );

            await api.post( '/auth/register', {
                ...payload,
                name: normalizeSpaces( payload?.name ),
                email: normalizeSpaces( payload?.email ).toLowerCase(),
                password: String( payload?.password ?? '' ),
                role: normalizeSpaces( payload?.role ).toUpperCase()
            } );

            toast.success( 'Conta criada com sucesso! Faça login para continuar.' );
            return true;
        } catch ( error ) {
            toast.error( getApiErrorMessage( error, 'Não foi possível criar sua conta.' ) );
            return false;
        } finally {
            setIsAuthenticating( false );
        }
    }, [] );

    const updateUser = useCallback( ( partialUser ) => {
        let nextUser = null;

        setUser( ( currentUser ) => {
            if ( !currentUser ) return currentUser;

            nextUser = toSafeStoredUser( {
                ...currentUser,
                ...partialUser
            } );

            if ( !isUsableStoredUser( nextUser ) ) return currentUser;

            setStoredUser( nextUser );
            return nextUser;
        } );

        return nextUser;
    }, [] );

    const signOut = useCallback( ( { silent = false } = {} ) => {
        clearSession();

        if ( !silent ) {
            toast.success( 'Sessão encerrada.' );
        }
    }, [ clearSession ] );

    const hasRole = useCallback( ( role ) => user?.role === normalizeSpaces( role ).toUpperCase(), [ user?.role ] );

    const hasAnyRole = useCallback( ( roles = [] ) => {
        if ( !Array.isArray( roles ) || roles.length === 0 ) return true;
        return roles.some( ( role ) => hasRole( role ) );
    }, [ hasRole ] );

    const value = useMemo( () => ( {
        signed: Boolean( user ),
        user,
        userRole: user?.role || null,
        loading,
        isAuthenticating,
        signIn,
        signUp,
        signOut,
        clearSession,
        refreshUser,
        updateUser,
        hasRole,
        hasAnyRole
    } ), [
        user,
        loading,
        isAuthenticating,
        signIn,
        signUp,
        signOut,
        clearSession,
        refreshUser,
        updateUser,
        hasRole,
        hasAnyRole
    ] );

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthProvider;
