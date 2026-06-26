import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    AlertTriangle,
    CheckCircle2,
    ChevronRight,
    Clock3,
    FileText,
    Loader2,
    Plus,
    RefreshCw,
    Sparkles,
    WalletCards
} from 'lucide-react';
import { useAuth } from '../../contexts/Auth/useAuth.js';
import api, { getApiErrorMessage } from '../../services/api.Service.js';
import ContractStatusBadge from '../Layout/ContractStatusBadge/ContractStatusBadge.Component.jsx';
import { getContractStatusMeta } from '../Layout/ContractStatusBadge/contractStatusMeta.js';

const CONTRACT_LIST_LIMIT = 50;

const currencyFormatter = new Intl.NumberFormat( 'pt-BR', {
    style: 'currency',
    currency: 'BRL'
} );

const dateFormatter = new Intl.DateTimeFormat( 'pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
} );

const normalizeSpaces = ( value ) => String( value ?? '' ).trim().replace( /\s+/g, ' ' );
const normalizeRole = ( value ) => normalizeSpaces( value ).toUpperCase();
const normalizeStatus = ( value ) => normalizeSpaces( value ).toUpperCase();

const buildFullName = ( entity ) => {
    if ( !entity ) return 'Usuário não informado';

    const fullName = normalizeSpaces(
        entity.fullName ||
        [ entity.name, entity.lastName ].filter( Boolean ).join( ' ' ) ||
        entity.name
    );

    return fullName || 'Usuário não informado';
};

const extractContracts = ( responseData ) => {
    if ( Array.isArray( responseData?.contracts ) ) return responseData.contracts;
    if ( Array.isArray( responseData?.data?.contracts ) ) return responseData.data.contracts;
    if ( Array.isArray( responseData ) ) return responseData;

    return [];
};

const formatCurrency = ( value ) => {
    const numberValue = Number( value );

    if ( !Number.isFinite( numberValue ) ) return 'Valor não informado';

    return currencyFormatter.format( numberValue );
};

const formatDate = ( value ) => {
    if ( !value ) return 'Data não informada';

    const date = new Date( value );

    if ( Number.isNaN( date.getTime() ) ) return 'Data inválida';

    return dateFormatter.format( date );
};

const getContractUpdatedTime = ( contract ) => {
    const date = new Date( contract?.updatedAt || contract?.createdAt || contract?.startDate || 0 );
    return Number.isNaN( date.getTime() ) ? 0 : date.getTime();
};

const getOtherParticipantName = ( contract, isFreelancer ) => (
    isFreelancer ? buildFullName( contract.client ) : buildFullName( contract.freelancer )
);

const getDashboardSubtitle = ( isFreelancer ) => (
    isFreelancer
        ? 'Acompanhe assinaturas, prazos, cancelamentos e valores dos contratos criados para seus clientes.'
        : 'Acompanhe os contratos vinculados ao seu perfil, assinaturas pendentes e solicitações de cancelamento.'
);

const getEmptyMessage = ( isFreelancer ) => (
    isFreelancer
        ? 'Você ainda não gerou nenhum contrato para seus clientes. Clique no botão acima para iniciar.'
        : 'Não há contratos vinculados ao seu e-mail no momento. Aguarde o envio do seu prestador.'
);

const StatCard = ( { icon: Icon, label, value, description, tone = 'blue' } ) => {
    const toneClasses = {
        blue: 'bg-blue-50 text-blue-600 ring-blue-500/10 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/20',
        amber: 'bg-amber-50 text-amber-600 ring-amber-500/10 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
        emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-500/10 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
        orange: 'bg-orange-50 text-orange-600 ring-orange-500/10 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/20'
    };

    return (
        <article className="group rounded-3xl border border-slate-200/80 bg-white/85 p-5 shadow-sm shadow-slate-900/5 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-950/10 dark:border-slate-800 dark:bg-slate-900/75 dark:shadow-black/20 dark:hover:border-blue-500/30 dark:hover:shadow-blue-950/30">
            <div className="flex items-start gap-4">
                <div className={`rounded-2xl p-3 ring-1 ${ toneClasses[ tone ] || toneClasses.blue }`}>
                    <Icon className="h-6 w-6" aria-hidden="true" />
                </div>

                <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{label}</p>
                    <h3 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">{value}</h3>
                    {description && (
                        <p className="mt-1 text-xs font-medium text-slate-400 dark:text-slate-500">
                            {description}
                        </p>
                    )}
                </div>
            </div>
        </article>
    );
};

const LoadingState = () => (
    <div className="flex h-72 flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-blue-600 dark:text-blue-400" aria-hidden="true" />
        <p className="animate-pulse font-semibold text-slate-500 dark:text-slate-400">
            Carregando os seus contratos...
        </p>
    </div>
);

const ErrorState = ( { message, onRetry } ) => (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-red-200 bg-red-50/80 p-8 text-center shadow-sm backdrop-blur dark:border-red-400/20 dark:bg-red-500/10">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-300">
            <AlertTriangle className="h-8 w-8" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-black text-slate-950 dark:text-white">Não foi possível carregar o painel</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-300">{message}</p>
        <button
            type="button"
            onClick={onRetry}
            className="mt-6 inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20 dark:bg-blue-500 dark:hover:bg-blue-400"
        >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Tentar novamente
        </button>
    </div>
);

const EmptyState = ( { isFreelancer, onCreateContract } ) => (
    <div className="flex flex-col items-center justify-center p-10 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <FileText className="h-8 w-8" aria-hidden="true" />
        </div>
        <h3 className="mb-1 text-lg font-black text-slate-950 dark:text-white">Nenhum contrato encontrado</h3>
        <p className="mb-6 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
            {getEmptyMessage( isFreelancer )}
        </p>
        {isFreelancer && (
            <button
                type="button"
                onClick={onCreateContract}
                className="inline-flex items-center font-bold text-blue-600 transition-colors hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:text-blue-300 dark:hover:text-blue-200"
            >
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                Criar contrato agora
            </button>
        )}
    </div>
);

const DashboardHome = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [ contracts, setContracts ] = useState( [] );
    const [ loading, setLoading ] = useState( true );
    const [ errorMessage, setErrorMessage ] = useState( '' );

    const isFreelancer = normalizeRole( user?.role ) === 'FREELANCER';

    const loadContracts = useCallback( async ( { silent = false } = {} ) => {
        try {
            if ( !silent ) setLoading( true );
            setErrorMessage( '' );

            const response = await api.get( '/contracts', {
                params: {
                    page: 1,
                    limit: CONTRACT_LIST_LIMIT
                }
            } );

            setContracts( extractContracts( response.data ) );
        } catch ( requestError ) {
            const message = getApiErrorMessage(
                requestError,
                'Não foi possível carregar os contratos no momento.'
            );

            setErrorMessage( message );
            toast.error( message, { id: 'dashboard-contracts-error' } );
        } finally {
            setLoading( false );
        }
    }, [] );

    useEffect( () => {
        const timeoutId = window.setTimeout( () => {
            void loadContracts();
        }, 0 );

        return () => {
            window.clearTimeout( timeoutId );
        };
    }, [ loadContracts ] );

    const dashboardData = useMemo( () => {
        const sortedContracts = [ ...contracts ].sort(
            ( firstContract, secondContract ) => getContractUpdatedTime( secondContract ) - getContractUpdatedTime( firstContract )
        );

        const pendingContracts = sortedContracts.filter(
            ( contract ) => normalizeStatus( contract.status ) === 'PENDING'
        );

        const closedContracts = sortedContracts.filter( ( contract ) => (
            normalizeStatus( contract.status ) === 'SIGNED' || normalizeStatus( contract.status ) === 'COMPLETED'
        ) );

        const cancellationRequests = sortedContracts.filter(
            ( contract ) => getContractStatusMeta( contract ).key === 'CANCELLATION_REQUESTED'
        );

        const totalValue = sortedContracts.reduce( ( total, contract ) => {
            const value = Number( contract.value );
            return Number.isFinite( value ) ? total + value : total;
        }, 0 );

        return {
            sortedContracts,
            pendingContracts,
            closedContracts,
            cancellationRequests,
            totalValue
        };
    }, [ contracts ] );

    const handleCreateContract = () => navigate( '/contracts/new' );
    const handleOpenContract = ( contractId ) => navigate( `/contracts/${ contractId }` );
    const handleRefresh = () => loadContracts( { silent: true } );

    if ( loading ) return <LoadingState />;

    if ( errorMessage && contracts.length === 0 ) {
        return <ErrorState message={errorMessage} onRetry={() => loadContracts()} />;
    }

    return (
        <div className="animate-in fade-in slide-in-from-bottom-3 space-y-6 duration-500">
            <section className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/85 p-6 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/75 dark:shadow-black/20 sm:p-8">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.12),transparent_32%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_34%)]" />

                <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                            Visão geral
                        </p>
                        <h1 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                            Painel de contratos
                        </h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                            {getDashboardSubtitle( isFreelancer )}
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                            type="button"
                            onClick={handleRefresh}
                            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white/80 px-5 py-3 text-sm font-black text-slate-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-600 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:border-blue-500/30 dark:hover:text-blue-300"
                        >
                            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                            Atualizar
                        </button>

                        {isFreelancer && (
                            <button
                                type="button"
                                onClick={handleCreateContract}
                                className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/30 focus:outline-none focus:ring-4 focus:ring-blue-500/20"
                            >
                                <Plus className="mr-2 h-5 w-5" aria-hidden="true" />
                                Novo Contrato
                            </button>
                        )}
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Resumo dos contratos">
                <StatCard
                    icon={FileText}
                    label="Total de Contratos"
                    value={dashboardData.sortedContracts.length}
                    description={`Últimos ${ Math.min( dashboardData.sortedContracts.length, CONTRACT_LIST_LIMIT ) } carregados`}
                    tone="blue"
                />
                <StatCard
                    icon={Clock3}
                    label="Pendente de Assinatura"
                    value={dashboardData.pendingContracts.length}
                    description="Aguardando conclusão"
                    tone="amber"
                />
                <StatCard
                    icon={CheckCircle2}
                    label="Assinados/Concluídos"
                    value={dashboardData.closedContracts.length}
                    description="Com aceite registrado"
                    tone="emerald"
                />
                <StatCard
                    icon={AlertTriangle}
                    label="Cancelamento Pendente"
                    value={dashboardData.cancellationRequests.length}
                    description={formatCurrency( dashboardData.totalValue )}
                    tone="orange"
                />
            </section>

            <section className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/85 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/75 dark:shadow-black/20">
                <div className="flex flex-col gap-2 border-b border-slate-200/80 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-950/40 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-lg font-black text-slate-950 dark:text-white">Atividade recente</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Clique em um contrato para ver detalhes, assinaturas e ações disponíveis.
                        </p>
                    </div>

                    <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                        {dashboardData.sortedContracts.length} registros
                    </span>
                </div>

                {dashboardData.sortedContracts.length === 0 ? (
                    <EmptyState isFreelancer={isFreelancer} onCreateContract={handleCreateContract} />
                ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {dashboardData.sortedContracts.map( ( contract ) => {
                            const statusMeta = getContractStatusMeta( contract );
                            const StatusIcon = statusMeta.Icon;
                            const displayName = getOtherParticipantName( contract, isFreelancer );
                            const stepsCount = Array.isArray( contract.steps ) ? contract.steps.length : 0;

                            return (
                                <li key={contract.id}>
                                    <button
                                        type="button"
                                        onClick={() => handleOpenContract( contract.id )}
                                        className="group flex w-full flex-col justify-between gap-4 p-5 text-left transition-all duration-200 hover:bg-slate-50/90 focus:outline-none focus:ring-4 focus:ring-inset focus:ring-blue-500/10 dark:hover:bg-slate-800/45 sm:flex-row sm:items-center"
                                    >
                                        <div className="flex min-w-0 items-start gap-4">
                                            <div className={`mt-1 rounded-2xl p-2.5 transition-all duration-200 group-hover:scale-105 ${ statusMeta.iconBoxClasses }`}>
                                                <StatusIcon className="h-5 w-5" aria-hidden="true" />
                                            </div>

                                            <div className="min-w-0">
                                                <h4 className="truncate text-base font-black text-slate-950 transition-colors group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-300">
                                                    {displayName}
                                                </h4>

                                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                                                    <span>Início: {formatDate( contract.startDate )}</span>
                                                    <span className="hidden sm:inline">•</span>
                                                    <span>Fim: {formatDate( contract.endDate )}</span>
                                                    <span className="hidden sm:inline">•</span>
                                                    <span className="font-bold text-slate-700 dark:text-slate-200">
                                                        {formatCurrency( contract.value )}
                                                    </span>
                                                </div>

                                                {stepsCount > 0 && (
                                                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                        <WalletCards className="h-3.5 w-3.5" aria-hidden="true" />
                                                        {stepsCount} {stepsCount === 1 ? 'etapa' : 'etapas'}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex w-full items-center justify-between gap-4 sm:w-auto sm:justify-end">
                                            <ContractStatusBadge contract={contract} />
                                            <ChevronRight className="h-5 w-5 text-slate-400 transition-all duration-200 group-hover:translate-x-1 group-hover:text-blue-600 dark:group-hover:text-blue-300" aria-hidden="true" />
                                        </div>
                                    </button>
                                </li>
                            );
                        } )}
                    </ul>
                )}
            </section>
        </div>
    );
};

export default DashboardHome;
