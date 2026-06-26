import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    ArrowRight,
    Briefcase,
    CheckCircle2,
    Eye,
    EyeOff,
    Loader2,
    Lock,
    LogIn,
    Mail,
    Moon,
    Shield,
    Sparkles,
    Sun,
    User,
    UserPlus
} from 'lucide-react';
import { useAuth } from '../../contexts/Auth/useAuth.js';
import { AUTH_STORAGE_KEYS } from '../../services/api.Service.js';

const VALID_THEMES = new Set( [ 'light', 'dark' ] );
const VALID_ROLES = new Set( [ 'FREELANCER', 'CLIENT' ] );

const ROLE_OPTIONS = Object.freeze( [
    {
        value: 'FREELANCER',
        label: 'Freelancer',
        description: 'Gerencie clientes, templates e contratos.',
        icon: Briefcase
    },
    {
        value: 'CLIENT',
        label: 'Cliente',
        description: 'Acesse e assine contratos recebidos.',
        icon: User
    }
] );

const FEATURE_ITEMS = Object.freeze( [
    'Contratos centralizados',
    'Assinatura digital',
    'Fluxo intuitivo para clientes'
] );

const normalizeSpaces = ( value ) => String( value ?? '' ).trim().replace( /\s+/g, ' ' );
const normalizeEmail = ( value ) => normalizeSpaces( value ).toLowerCase();
const hasFullName = ( value ) => normalizeSpaces( value ).split( ' ' ).filter( Boolean ).length >= 2;

const isValidEmail = ( value ) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test( normalizeEmail( value ) );

const applyTheme = ( theme ) => {
    const safeTheme = VALID_THEMES.has( theme ) ? theme : 'light';
    const root = document.documentElement;

    root.classList.toggle( 'dark', safeTheme === 'dark' );
    root.dataset.theme = safeTheme;
    root.style.colorScheme = safeTheme;
};

const getInitialTheme = () => {
    if ( typeof window === 'undefined' ) return 'light';

    try {
        const savedTheme = localStorage.getItem( AUTH_STORAGE_KEYS.theme );

        if ( VALID_THEMES.has( savedTheme ) ) return savedTheme;

        return window.matchMedia( '(prefers-color-scheme: dark)' ).matches ? 'dark' : 'light';
    } catch {
        return 'light';
    }
};

const persistTheme = ( theme ) => {
    if ( typeof window === 'undefined' ) return;

    try {
        localStorage.setItem( AUTH_STORAGE_KEYS.theme, theme );
    } catch {
        // Não bloqueia o login caso o navegador bloqueie storage.
    }
};

const getRedirectDestination = ( location ) => {
    const from = location.state?.from;

    if ( !from?.pathname || from.pathname === '/login' ) return '/';

    return `${ from.pathname }${ from.search || '' }${ from.hash || '' }`;
};

const getSubmitLabel = ( isLogin ) => isLogin ? 'Entrar no sistema' : 'Criar conta';

const inputClasses = 'w-full rounded-2xl border border-slate-200 bg-white/80 py-3 pl-11 pr-11 text-sm font-medium text-slate-900 shadow-sm outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-800 dark:bg-slate-950/70 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:bg-slate-950';

const AuthPage = () => {
    const {
        signIn,
        signUp,
        isAuthenticating
    } = useAuth();

    const navigate = useNavigate();
    const location = useLocation();

    const [ isLogin, setIsLogin ] = useState( true );
    const [ isSubmitting, setIsSubmitting ] = useState( false );
    const [ showPassword, setShowPassword ] = useState( false );
    const [ theme, setTheme ] = useState( getInitialTheme );
    const [ formData, setFormData ] = useState( {
        name: '',
        email: '',
        password: '',
        confirmPassword: ''
    } );
    const [ role, setRole ] = useState( 'FREELANCER' );

    const isLoading = isSubmitting || isAuthenticating;

    const destination = useMemo( () => getRedirectDestination( location ), [ location ] );
    const ThemeIcon = theme === 'dark' ? Sun : Moon;
    const PasswordIcon = showPassword ? EyeOff : Eye;

    useEffect( () => {
        applyTheme( theme );
        persistTheme( theme );
    }, [ theme ] );

    const updateFormField = ( fieldName, value ) => {
        setFormData( ( currentData ) => ( {
            ...currentData,
            [ fieldName ]: value
        } ) );
    };

    const handleInputChange = ( event ) => {
        const { name, value } = event.target;
        updateFormField( name, value );
    };

    const resetFormForMode = ( nextIsLogin ) => {
        setIsLogin( nextIsLogin );
        setShowPassword( false );
        setRole( 'FREELANCER' );
        setFormData( {
            name: '',
            email: '',
            password: '',
            confirmPassword: ''
        } );
    };

    const validateForm = () => {
        const email = normalizeEmail( formData.email );
        const password = String( formData.password ?? '' );

        if ( !isValidEmail( email ) ) {
            toast.error( 'Informe um e-mail válido.' );
            return null;
        }

        if ( password.length < 8 ) {
            toast.error( 'A senha deve ter pelo menos 8 caracteres.' );
            return null;
        }

        if ( isLogin ) {
            return {
                email,
                password
            };
        }

        const name = normalizeSpaces( formData.name );
        const selectedRole = normalizeSpaces( role ).toUpperCase();

        if ( !hasFullName( name ) ) {
            toast.error( 'Informe seu nome completo, com nome e sobrenome.' );
            return null;
        }

        if ( !VALID_ROLES.has( selectedRole ) ) {
            toast.error( 'Selecione um tipo de conta válido.' );
            return null;
        }

        if ( password !== formData.confirmPassword ) {
            toast.error( 'As senhas não coincidem.' );
            return null;
        }

        return {
            name,
            email,
            password,
            role: selectedRole
        };
    };

    const handleSubmit = async ( event ) => {
        event.preventDefault();

        const payload = validateForm();

        if ( !payload ) return;

        setIsSubmitting( true );

        try {
            if ( isLogin ) {
                const success = await signIn( payload.email, payload.password );

                if ( success ) {
                    navigate( destination, { replace: true } );
                }

                return;
            }

            const success = await signUp( payload );

            if ( success ) {
                setIsLogin( true );
                setShowPassword( false );
                setRole( 'FREELANCER' );
                setFormData( {
                    name: '',
                    email: payload.email,
                    password: '',
                    confirmPassword: ''
                } );
            }
        } finally {
            setIsSubmitting( false );
        }
    };

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 p-4 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(37,99,235,0.18),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(14,165,233,0.14),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(15,23,42,0.08),transparent_34%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.20),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(14,165,233,0.14),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(30,41,59,0.42),transparent_34%)]" />

            <button
                type="button"
                onClick={() => setTheme( ( currentTheme ) => currentTheme === 'dark' ? 'light' : 'dark' )}
                className="absolute right-5 top-5 z-10 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70 bg-white/80 text-slate-600 shadow-lg shadow-slate-900/10 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:text-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:text-blue-300"
                aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
                title={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
            >
                <ThemeIcon className="h-5 w-5" aria-hidden="true" />
            </button>

            <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/70 bg-white/80 shadow-2xl shadow-slate-900/10 backdrop-blur-2xl transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-black/30 lg:grid-cols-[1.1fr_0.9fr]">
                <section className="relative hidden min-h-[640px] overflow-hidden bg-slate-950 p-10 text-white lg:block" aria-label="Apresentação do CRM Contratos">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.45),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(14,165,233,0.25),transparent_30%),linear-gradient(135deg,rgba(15,23,42,1),rgba(15,23,42,0.94))]" />
                    <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border border-blue-400/20" />
                    <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full border border-cyan-400/20" />

                    <div className="relative flex h-full flex-col justify-between">
                        <div>
                            <div className="mb-10 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 shadow-xl shadow-black/20 backdrop-blur">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-white">
                                    <Shield className="h-5 w-5" aria-hidden="true" />
                                </div>
                                <div>
                                    <p className="text-sm font-black">CRM Contratos</p>
                                    <p className="text-xs text-blue-100">Workspace de contratos</p>
                                </div>
                            </div>

                            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-blue-200">
                                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Modern CRM
                            </p>
                            <h1 className="max-w-md text-4xl font-black leading-tight tracking-tight">
                                Controle clientes, contratos e assinaturas em uma interface mais clara.
                            </h1>
                            <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">
                                Uma entrada visual mais profissional para transmitir segurança ao freelancer e ao cliente desde o primeiro acesso.
                            </p>
                        </div>

                        <div className="grid gap-3">
                            {FEATURE_ITEMS.map( ( item ) => (
                                <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-slate-100 shadow-lg shadow-black/10 backdrop-blur">
                                    <CheckCircle2 className="h-4 w-4 text-blue-200" aria-hidden="true" />
                                    {item}
                                </div>
                            ) )}
                        </div>
                    </div>
                </section>

                <section className="p-6 sm:p-8 lg:p-10">
                    <div className="mb-8 text-center lg:text-left">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25 lg:mx-0">
                            {isLogin ? <LogIn className="h-6 w-6" aria-hidden="true" /> : <UserPlus className="h-6 w-6" aria-hidden="true" />}
                        </div>
                        <h2 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                            {isLogin ? 'Entrar na conta' : 'Criar nova conta'}
                        </h2>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                            {isLogin ? 'Bem-vindo de volta! Acesse seu painel.' : 'Comece a gerenciar seus contratos com mais organização.'}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {!isLogin && (
                            <div className="space-y-5 animate-in fade-in slide-in-from-top-3 duration-300">
                                <div className="relative">
                                    <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleInputChange}
                                        disabled={isLoading}
                                        required={!isLogin}
                                        className={inputClasses}
                                        placeholder="Seu nome completo"
                                        autoComplete="name"
                                        minLength={5}
                                        maxLength={140}
                                    />
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    {ROLE_OPTIONS.map( ( option ) => {
                                        const RoleIcon = option.icon;
                                        const isSelected = role === option.value;

                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => setRole( option.value )}
                                                disabled={isLoading}
                                                aria-pressed={isSelected}
                                                className={`rounded-2xl border p-4 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70 ${ isSelected
                                                    ? 'border-blue-300 bg-blue-50 text-blue-800 shadow-sm shadow-blue-600/10 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200'
                                                    : 'border-slate-200 bg-white/70 text-slate-600 hover:border-blue-200 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400 dark:hover:border-blue-500/40 dark:hover:text-white'
                                                    }`}
                                            >
                                                <span className="flex items-center gap-2 text-sm font-black">
                                                    <RoleIcon className="h-4 w-4" aria-hidden="true" />
                                                    {option.label}
                                                </span>
                                                <span className="mt-1 block text-xs leading-5 opacity-75">
                                                    {option.description}
                                                </span>
                                            </button>
                                        );
                                    } )}
                                </div>
                            </div>
                        )}

                        <div className="relative">
                            <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleInputChange}
                                disabled={isLoading}
                                required
                                className={inputClasses}
                                placeholder="seu@email.com"
                                autoComplete="email"
                            />
                        </div>

                        <div className="relative">
                            <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                name="password"
                                value={formData.password}
                                onChange={handleInputChange}
                                disabled={isLoading}
                                required
                                minLength={8}
                                className={inputClasses}
                                placeholder="Sua senha secreta"
                                autoComplete={isLogin ? 'current-password' : 'new-password'}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword( ( currentValue ) => !currentValue )}
                                disabled={isLoading}
                                className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                            >
                                <PasswordIcon className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>

                        {!isLogin && (
                            <div className="relative animate-in fade-in slide-in-from-top-2 duration-300">
                                <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    name="confirmPassword"
                                    value={formData.confirmPassword}
                                    onChange={handleInputChange}
                                    disabled={isLoading}
                                    required={!isLogin}
                                    minLength={8}
                                    className={inputClasses}
                                    placeholder="Confirme sua senha"
                                    autoComplete="new-password"
                                />
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="group flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-3.5 font-black text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/30 focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
                                    Processando...
                                </>
                            ) : (
                                <>
                                    {isLogin ? <LogIn className="mr-2 h-5 w-5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /> : <UserPlus className="mr-2 h-5 w-5 transition-transform group-hover:scale-110" aria-hidden="true" />}
                                    {getSubmitLabel( isLogin )}
                                    <ArrowRight className="ml-2 h-4 w-4 opacity-70 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <button
                            type="button"
                            onClick={() => resetFormForMode( !isLogin )}
                            disabled={isLoading}
                            className="text-sm font-bold text-slate-500 transition-colors hover:text-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-70 dark:text-slate-400 dark:hover:text-blue-300"
                        >
                            {isLogin
                                ? 'Ainda não tem uma conta? Cadastre-se aqui.'
                                : 'Já possui uma conta? Faça login.'}
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default AuthPage;
