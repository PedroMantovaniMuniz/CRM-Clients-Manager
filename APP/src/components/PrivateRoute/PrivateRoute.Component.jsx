import React, { useEffect, useMemo } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/Auth/useAuth.js';
import TopMenu from '../Layout/TopMenu/TopMenu.Component.jsx';

const normalizeRole = ( role ) => String( role ?? '' ).trim().toUpperCase();

const normalizeAllowedRoles = ( allowedRoles ) => {
    if ( !allowedRoles ) return [];

    const roles = Array.isArray( allowedRoles ) ? allowedRoles : [ allowedRoles ];

    return roles
        .map( normalizeRole )
        .filter( Boolean );
};

const SessionLoader = () => (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-50 text-slate-800 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.16),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.14),transparent_30%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.12),transparent_30%)]" />

        <div className="relative flex w-[min(92vw,28rem)] flex-col items-center rounded-3xl border border-white/70 bg-white/80 p-8 text-center shadow-2xl shadow-slate-900/10 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-black/30">
            <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-blue-600/10 text-blue-600 ring-1 ring-blue-600/20 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-400/20">
                <Loader2 className="h-9 w-9 animate-spin" aria-hidden="true" />
            </div>

            <p className="text-lg font-bold">Autenticando sessão...</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Preparando seu workspace de contratos.
            </p>
        </div>
    </div>
);

const PrivateLayout = () => (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.10),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.09),transparent_30%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.10),transparent_30%)]" />

        <div className="relative flex min-h-screen flex-col">
            <TopMenu />

            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
                <Outlet />
            </main>
        </div>
    </div>
);

const PrivateRoute = ( {
    allowedRoles,
    redirectTo = '/login',
    unauthorizedRedirectTo = '/',
    showMenu = true
} ) => {
    const {
        signed,
        loading,
        user,
        hasAnyRole
    } = useAuth();

    const location = useLocation();

    const normalizedAllowedRoles = useMemo(
        () => normalizeAllowedRoles( allowedRoles ),
        [ allowedRoles ]
    );

    const canAccessByRole = useMemo( () => {
        if ( normalizedAllowedRoles.length === 0 ) return true;

        if ( typeof hasAnyRole === 'function' ) {
            return hasAnyRole( normalizedAllowedRoles );
        }

        return normalizedAllowedRoles.includes( normalizeRole( user?.role ) );
    }, [ hasAnyRole, normalizedAllowedRoles, user?.role ] );

    const shouldRedirectToLogin = !loading && !signed;
    const shouldRedirectByRole = !loading && signed && !canAccessByRole;

    useEffect( () => {
        if ( shouldRedirectToLogin ) {
            toast.error( 'Acesso restrito. Faça login para continuar.', { id: 'auth-error' } );
            return;
        }

        if ( shouldRedirectByRole ) {
            toast.error( 'Você não tem permissão para acessar esta página.', { id: 'role-error' } );
        }
    }, [ shouldRedirectByRole, shouldRedirectToLogin ] );

    if ( loading ) return <SessionLoader />;

    if ( shouldRedirectToLogin ) {
        return <Navigate to={redirectTo} state={{ from: location }} replace />;
    }

    if ( shouldRedirectByRole ) {
        return <Navigate to={unauthorizedRedirectTo} replace />;
    }

    if ( !showMenu ) return <Outlet />;

    return <PrivateLayout />;
};

export default PrivateRoute;
