import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

// ==========================================
// CONTEXTOS GERAIS
// ==========================================
import { AuthProvider } from './contexts/Auth/Auth.Context.jsx';
import { useAuth } from './contexts/Auth/useAuth.js';

// ==========================================
// COMPONENTES & PÁGINAS
// ==========================================
import AuthPage from './components/AuthPage/AuthPage.Component.jsx';
import DashboardHome from './components/DashboardHome/DashboardHome.Component.jsx';
import ContractCreationForm from './components/ContractCreationForm/ContractCreationForm.Component.jsx';
import ContractViewer from './components/ContractViewer/ContractViewer.Component.jsx';
import SignaturePad from './components/SignaturePad/SignaturePad.Component.jsx';
import ClientRegistrationComp from './components/ClientRegistration/ClientRegistration.Component.jsx';
import PrivateRoute from './components/PrivateRoute/PrivateRoute.Component.jsx';
import TemplateListComp from './components/TemplateList/TemplateList.Component.jsx';
import TemplateBuilderComp from './components/TemplateBuilder/TemplateBuilder.Component.jsx';
import UserProfileComp from './components/UserProfile/UserProfile.Component.jsx';

const ROUTES = Object.freeze( {
    home: '/',
    login: '/login',
    profile: '/profile',
    contractDetails: '/contract/:id',
    newContract: '/newContract',
    newClient: '/newClient',
    templates: '/templates',
    newTemplate: '/templates/new',
    editTemplate: '/templates/edit/:id',
    signContract: '/signContract/:id'
} );

const FREELANCER_ROLES = Object.freeze( [ 'FREELANCER' ] );
const CLIENT_ROLES = Object.freeze( [ 'CLIENT' ] );

const AppLoader = () => (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-50 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.16),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.14),transparent_30%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.12),transparent_30%)]" />

        <div className="relative flex w-[min(92vw,26rem)] flex-col items-center rounded-3xl border border-white/70 bg-white/85 p-8 text-center shadow-2xl shadow-slate-900/10 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/75 dark:shadow-black/30">
            <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-blue-600/10 text-blue-600 ring-1 ring-blue-600/20 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-400/20">
                <Loader2 className="h-9 w-9 animate-spin" aria-hidden="true" />
            </div>

            <p className="text-lg font-black">Carregando Contracts CRM...</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Validando sua sessão e preparando o ambiente.
            </p>
        </div>
    </div>
);

const getRedirectDestination = ( location, fallback = ROUTES.home ) => {
    const from = location.state?.from;

    if ( !from?.pathname || from.pathname === ROUTES.login ) return fallback;

    return `${ from.pathname }${ from.search || '' }${ from.hash || '' }`;
};

/**
 * Evita que um usuário autenticado volte para a tela de login/cadastro.
 * Se ele chegou ao login após tentar acessar uma página protegida, volta para a página original.
 */
const PublicOnlyRoute = () => {
    const { signed, loading } = useAuth();
    const location = useLocation();

    if ( loading ) return <AppLoader />;

    if ( signed ) {
        return <Navigate to={getRedirectDestination( location )} replace />;
    }

    return <AuthPage />;
};

// Componente interno exclusivo para a árvore de rotas.
const AppRoutes = () => (
    <Routes>
        {/* ROTAS PÚBLICAS */}
        <Route path={ROUTES.login} element={<PublicOnlyRoute />} />

        {/* ROTAS PRIVADAS: comuns a todos os usuários logados */}
        <Route element={<PrivateRoute />}>
            <Route path={ROUTES.home} element={<DashboardHome />} />
            <Route path="/dashboard" element={<Navigate to={ROUTES.home} replace />} />
            <Route path={ROUTES.profile} element={<UserProfileComp />} />
            <Route path={ROUTES.contractDetails} element={<ContractViewer />} />
            <Route path="/contracts/:id" element={<ContractViewer />} />
        </Route>

        {/* ROTAS PRIVADAS: exclusivas para freelancer */}
        <Route element={<PrivateRoute allowedRoles={FREELANCER_ROLES} />}>
            <Route path={ROUTES.newContract} element={<ContractCreationForm />} />
            <Route path="/contracts/new" element={<ContractCreationForm />} />
            <Route path={ROUTES.newClient} element={<ClientRegistrationComp />} />
            <Route path="/clients/new" element={<ClientRegistrationComp />} />
            <Route path={ROUTES.templates} element={<TemplateListComp />} />
            <Route path={ROUTES.newTemplate} element={<TemplateBuilderComp />} />
            <Route path="/templates/create" element={<Navigate to={ROUTES.newTemplate} replace />} />
            <Route path={ROUTES.editTemplate} element={<TemplateBuilderComp />} />
        </Route>

        {/* ROTAS PRIVADAS: exclusivas para cliente */}
        <Route element={<PrivateRoute allowedRoles={CLIENT_ROLES} />}>
            <Route path={ROUTES.signContract} element={<SignaturePad />} />
            <Route path="/contracts/:id/sign" element={<SignaturePad />} />
        </Route>

        {/* FALLBACK */}
        <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
    </Routes>
);

const AppToaster = () => (
    <Toaster
        position="top-right"
        gutter={12}
        containerStyle={{ top: 18, right: 18 }}
        toastOptions={{
            duration: 3200,
            className: 'crm-toast',
            ariaProps: {
                role: 'status',
                'aria-live': 'polite'
            },
            success: {
                duration: 2600,
                iconTheme: {
                    primary: '#2563eb',
                    secondary: '#ffffff'
                }
            },
            error: {
                duration: 4200,
                iconTheme: {
                    primary: '#dc2626',
                    secondary: '#ffffff'
                }
            }
        }}
    />
);

// Componente raiz: configura os providers globais.
const App = () => (
    <BrowserRouter>
        <AuthProvider>
            <AppToaster />
            <AppRoutes />
        </AuthProvider>
    </BrowserRouter>
);

export default App;
