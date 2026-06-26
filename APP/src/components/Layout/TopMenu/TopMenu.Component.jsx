import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
    FileSignature,
    Home,
    Layers,
    LogOut,
    Menu,
    Moon,
    Shield,
    Sun,
    User,
    UserPlus,
    X
} from 'lucide-react';
import { useAuth } from '../../../contexts/Auth/useAuth.js';
import { AUTH_STORAGE_KEYS } from '../../../services/api.Service.js';

const VALID_THEMES = new Set( [ 'light', 'dark' ] );

const ROLE_LABELS = Object.freeze( {
    FREELANCER: 'Freelancer',
    CLIENT: 'Cliente'
} );

const BASE_NAV_ITEMS = Object.freeze( [
    {
        to: '/',
        label: 'Dashboard',
        icon: Home,
        end: true
    }
] );

const FREELANCER_NAV_ITEMS = Object.freeze( [
    {
        to: '/contracts/new',
        label: 'Novo Contrato',
        icon: FileSignature
    },
    {
        to: '/clients/new',
        label: 'Novo Cliente',
        icon: UserPlus
    },
    {
        to: '/templates',
        label: 'Modelos',
        mobileLabel: 'Modelos de Contrato',
        icon: Layers
    }
] );

const safeGetStorageItem = ( key ) => {
    if ( typeof window === 'undefined' ) return null;

    try {
        return localStorage.getItem( key );
    } catch {
        return null;
    }
};

const safeSetStorageItem = ( key, value ) => {
    if ( typeof window === 'undefined' ) return;

    try {
        localStorage.setItem( key, value );
    } catch {
        // Se o navegador bloquear storage, o tema ainda é aplicado na sessão atual.
    }
};

const applyTheme = ( theme ) => {
    const safeTheme = VALID_THEMES.has( theme ) ? theme : 'light';
    const root = document.documentElement;

    root.classList.toggle( 'dark', safeTheme === 'dark' );
    root.dataset.theme = safeTheme;
    root.style.colorScheme = safeTheme;
};

const getInitialTheme = () => {
    if ( typeof window === 'undefined' ) return 'light';

    const savedTheme = safeGetStorageItem( AUTH_STORAGE_KEYS.theme );

    if ( VALID_THEMES.has( savedTheme ) ) return savedTheme;

    return window.matchMedia( '(prefers-color-scheme: dark)' ).matches ? 'dark' : 'light';
};

const normalizeRole = ( role ) => String( role ?? '' ).trim().toUpperCase();

const getDisplayName = ( user ) => {
    const fullName = String( user?.fullName || '' ).trim();

    if ( fullName ) return fullName;

    const composedName = [ user?.name, user?.lastName ]
        .map( ( namePart ) => String( namePart || '' ).trim() )
        .filter( Boolean )
        .join( ' ' );

    return composedName || user?.name || 'Usuário';
};

const getInitials = ( displayName ) => {
    const initials = String( displayName || '' )
        .trim()
        .split( /\s+/ )
        .filter( Boolean )
        .slice( 0, 2 )
        .map( ( word ) => word.charAt( 0 ).toUpperCase() )
        .join( '' );

    return initials || 'U';
};

const getRoleLabel = ( role ) => ROLE_LABELS[ normalizeRole( role ) ] || 'Usuário';

const navLinkClasses = ( { isActive } ) => `group relative inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-all duration-200 ${ isActive
    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
    : 'text-slate-600 hover:-translate-y-0.5 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
}`;

const mobileNavLinkClasses = ( { isActive } ) => `flex items-center gap-3 rounded-xl px-4 py-3 text-base font-bold transition-all duration-200 ${ isActive
    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
}`;

const TopMenu = () => {
    const { user, signOut } = useAuth();

    const [ isMobileMenuOpen, setIsMobileMenuOpen ] = useState( false );
    const [ theme, setTheme ] = useState( getInitialTheme );

    const isDarkTheme = theme === 'dark';
    const userRole = normalizeRole( user?.role );
    const isFreelancer = userRole === 'FREELANCER';
    const displayName = getDisplayName( user );
    const userInitials = getInitials( displayName );
    const roleLabel = getRoleLabel( userRole );

    const navItems = useMemo( () => {
        if ( isFreelancer ) return [ ...BASE_NAV_ITEMS, ...FREELANCER_NAV_ITEMS ];
        return BASE_NAV_ITEMS;
    }, [ isFreelancer ] );

    const ThemeIcon = isDarkTheme ? Sun : Moon;
    const MobileMenuIcon = isMobileMenuOpen ? X : Menu;

    useEffect( () => {
        applyTheme( theme );
        safeSetStorageItem( AUTH_STORAGE_KEYS.theme, theme );
    }, [ theme ] );

    useEffect( () => {
        if ( !isMobileMenuOpen ) return undefined;

        const handleKeyDown = ( event ) => {
            if ( event.key === 'Escape' ) {
                setIsMobileMenuOpen( false );
            }
        };

        document.addEventListener( 'keydown', handleKeyDown );

        return () => {
            document.removeEventListener( 'keydown', handleKeyDown );
        };
    }, [ isMobileMenuOpen ] );

    const toggleTheme = () => {
        setTheme( ( currentTheme ) => currentTheme === 'dark' ? 'light' : 'dark' );
    };

    const handleSignOut = () => {
        setIsMobileMenuOpen( false );
        signOut();
    };

    const renderNavItem = ( item, isMobile = false ) => {
        const Icon = item.icon;
        const label = isMobile ? item.mobileLabel || item.label : item.label;

        return (
            <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={isMobile ? mobileNavLinkClasses : navLinkClasses}
                onClick={isMobile ? () => setIsMobileMenuOpen( false ) : undefined}
            >
                <Icon className={isMobile ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden="true" />
                {label}
            </NavLink>
        );
    };

    return (
        <nav className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/85 shadow-sm shadow-slate-900/5 backdrop-blur-xl transition-colors duration-300 dark:border-slate-800/80 dark:bg-slate-950/80 dark:shadow-black/20">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/60 to-transparent" />

            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-6">
                        <NavLink
                            to="/"
                            className="flex shrink-0 items-center gap-3 text-slate-950 transition hover:opacity-90 dark:text-white"
                            aria-label="Ir para o dashboard"
                        >
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-600/25">
                                <Shield className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div className="hidden leading-tight sm:block">
                                <span className="block text-base font-black tracking-tight">CRM Contratos</span>
                                <span className="block text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                                    Contracts OS
                                </span>
                            </div>
                        </NavLink>

                        <div className="hidden items-center gap-2 md:flex" aria-label="Navegação principal">
                            {navItems.map( ( item ) => renderNavItem( item ) )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-600 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-500/15 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
                            title={isDarkTheme ? 'Ativar tema claro' : 'Ativar tema escuro'}
                            aria-label={isDarkTheme ? 'Ativar tema claro' : 'Ativar tema escuro'}
                        >
                            <ThemeIcon className="h-5 w-5" aria-hidden="true" />
                        </button>

                        <div className="hidden items-center gap-3 md:flex">
                            <NavLink
                                to="/profile"
                                className={( { isActive } ) => `group flex items-center gap-3 rounded-2xl border px-2.5 py-2 transition-all duration-200 ${ isActive
                                    ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200'
                                    : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:border-slate-800 dark:hover:bg-white/10 dark:hover:text-white'
                                }`}
                                title="Abrir perfil do usuário"
                            >
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-sm font-black text-blue-600 transition-colors group-hover:bg-blue-100 dark:bg-slate-800 dark:text-blue-300 dark:group-hover:bg-blue-500/20">
                                    {userInitials}
                                </div>
                                <div className="min-w-0 text-left">
                                    <span className="block max-w-[170px] truncate text-sm font-black text-slate-950 dark:text-white">
                                        {displayName}
                                    </span>
                                    <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        {roleLabel}
                                    </span>
                                </div>
                            </NavLink>

                            <button
                                type="button"
                                onClick={handleSignOut}
                                className="rounded-xl p-2.5 text-slate-400 transition-all duration-200 hover:-translate-y-0.5 hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-4 focus:ring-red-500/10 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                                title="Terminar sessão"
                                aria-label="Sair da conta"
                            >
                                <LogOut className="h-5 w-5" aria-hidden="true" />
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => setIsMobileMenuOpen( ( currentValue ) => !currentValue )}
                            className="inline-flex rounded-xl p-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-blue-500/15 md:hidden dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                            aria-label={isMobileMenuOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
                            aria-expanded={isMobileMenuOpen}
                            aria-controls="crm-mobile-menu"
                        >
                            <MobileMenuIcon className="h-6 w-6" aria-hidden="true" />
                        </button>
                    </div>
                </div>
            </div>

            {isMobileMenuOpen && (
                <div
                    id="crm-mobile-menu"
                    className="animate-in fade-in slide-in-from-top-2 duration-200 border-t border-slate-200 bg-white/95 px-4 py-4 shadow-xl shadow-slate-900/10 backdrop-blur-xl md:hidden dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-black/30"
                >
                    <div className="space-y-1" aria-label="Navegação mobile">
                        {navItems.map( ( item ) => renderNavItem( item, true ) )}

                        <NavLink
                            to="/profile"
                            className={mobileNavLinkClasses}
                            onClick={() => setIsMobileMenuOpen( false )}
                        >
                            <User className="h-5 w-5" aria-hidden="true" />
                            Meu Perfil
                        </NavLink>
                    </div>

                    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                        <NavLink
                            to="/profile"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-sm font-black text-blue-600 shadow-sm dark:bg-slate-800 dark:text-blue-300"
                            aria-label="Abrir perfil do usuário"
                            onClick={() => setIsMobileMenuOpen( false )}
                        >
                            {userInitials}
                        </NavLink>

                        <NavLink
                            to="/profile"
                            className="min-w-0 flex-1"
                            onClick={() => setIsMobileMenuOpen( false )}
                        >
                            <div className="truncate text-base font-black text-slate-950 dark:text-white">
                                {displayName}
                            </div>
                            <div className="truncate text-sm font-semibold text-slate-500 dark:text-slate-400">
                                {roleLabel}
                            </div>
                        </NavLink>

                        <button
                            type="button"
                            onClick={handleSignOut}
                            className="shrink-0 rounded-xl p-2.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-4 focus:ring-red-500/10 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                            aria-label="Sair da conta"
                        >
                            <LogOut className="h-6 w-6" aria-hidden="true" />
                        </button>
                    </div>
                </div>
            )}
        </nav>
    );
};

export default TopMenu;
