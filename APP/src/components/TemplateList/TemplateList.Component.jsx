import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    AlertTriangle,
    CalendarClock,
    ChevronLeft,
    ChevronRight,
    Edit3,
    FilePlus2,
    FileText,
    Layers,
    Loader2,
    Plus,
    RefreshCw,
    Search,
    Sparkles,
    Trash2
} from 'lucide-react';
import api, { getApiErrorMessage } from '../../services/api.Service.js';

const TEMPLATE_PAGE_LIMIT = 12;
const MAX_SEARCH_LENGTH = 120;

const dateFormatter = new Intl.DateTimeFormat( 'pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
} );

const normalizeSpaces = ( value ) => String( value ?? '' ).trim().replace( /\s+/g, ' ' );

const extractTemplates = ( responseData ) => {
    if ( Array.isArray( responseData?.templates ) ) return responseData.templates;
    if ( Array.isArray( responseData?.data?.templates ) ) return responseData.data.templates;
    if ( Array.isArray( responseData ) ) return responseData;

    return [];
};

const extractPagination = ( responseData, fallbackPage, fallbackLimit, templatesLength ) => {
    const pagination = responseData?.pagination || responseData?.data?.pagination || {};
    const total = Number( responseData?.total ?? responseData?.data?.total ?? templatesLength );
    const page = Number( pagination.page ?? fallbackPage );
    const limit = Number( pagination.limit ?? fallbackLimit );
    const totalPages = Number( pagination.totalPages ?? Math.max( Math.ceil( total / limit ), 1 ) );

    return {
        page: Number.isFinite( page ) && page > 0 ? page : fallbackPage,
        limit: Number.isFinite( limit ) && limit > 0 ? limit : fallbackLimit,
        total: Number.isFinite( total ) && total >= 0 ? total : templatesLength,
        totalPages: Number.isFinite( totalPages ) && totalPages > 0 ? totalPages : 1,
        hasNextPage: Boolean( pagination.hasNextPage ?? page < totalPages ),
        hasPreviousPage: Boolean( pagination.hasPreviousPage ?? page > 1 )
    };
};

const formatDate = ( value ) => {
    if ( !value ) return 'Data não informada';

    const date = new Date( value );

    if ( Number.isNaN( date.getTime() ) ) return 'Data inválida';

    return dateFormatter.format( date );
};

const getTemplateDescription = ( template ) => normalizeSpaces( template?.description ) || 'Sem descrição cadastrada.';

const cardClasses = 'rounded-[2rem] border border-slate-200/80 bg-white/85 shadow-sm shadow-slate-900/5 backdrop-blur transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900/75 dark:shadow-black/20';
const inputClasses = 'w-full rounded-2xl border border-slate-200 bg-white/80 py-3 pl-11 pr-4 text-sm font-bold text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-800 dark:bg-slate-950/70 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:bg-slate-950';

const LoadingState = () => (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[2rem] border border-slate-200 bg-white/80 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-blue-600 dark:text-blue-400" aria-hidden="true" />
        <p className="animate-pulse font-bold text-slate-500 dark:text-slate-400">
            Carregando modelos de contrato...
        </p>
    </div>
);

const ErrorState = ( { message, onRetry } ) => (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[2rem] border border-red-200 bg-red-50/80 p-8 text-center shadow-sm backdrop-blur dark:border-red-400/20 dark:bg-red-500/10">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-300">
            <AlertTriangle className="h-8 w-8" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-black text-slate-950 dark:text-white">Não foi possível carregar os modelos</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-300">{message}</p>
        <button
            type="button"
            onClick={onRetry}
            className="mt-6 inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20"
        >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Tentar novamente
        </button>
    </div>
);

const EmptyState = ( { hasSearch, onCreate, onClearSearch } ) => (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[2rem] border border-dashed border-slate-200 bg-white/70 p-8 text-center dark:border-slate-800 dark:bg-slate-900/50">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <FileText className="h-8 w-8" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-black text-slate-950 dark:text-white">
            {hasSearch ? 'Nenhum modelo encontrado' : 'Nenhum modelo criado ainda'}
        </h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
            {hasSearch
                ? 'Tente buscar por outro nome ou limpe o filtro para ver todos os modelos disponíveis.'
                : 'Crie seu primeiro modelo para acelerar a geração de contratos com cláusulas reutilizáveis.'}
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {hasSearch && (
                <button
                    type="button"
                    onClick={onClearSearch}
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                    Limpar busca
                </button>
            )}

            <button
                type="button"
                onClick={onCreate}
                className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/30 focus:outline-none focus:ring-4 focus:ring-blue-500/20"
            >
                <Plus className="mr-2 h-5 w-5" aria-hidden="true" />
                Criar modelo
            </button>
        </div>
    </div>
);

const TemplateCard = ( { template, deletingTemplateId, onEdit, onDelete } ) => {
    const isDeleting = deletingTemplateId === template.id;

    return (
        <article className="group flex h-full flex-col rounded-[2rem] border border-slate-200/80 bg-white/85 p-5 shadow-sm shadow-slate-900/5 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-950/10 dark:border-slate-800 dark:bg-slate-900/75 dark:shadow-black/20 dark:hover:border-blue-500/30 dark:hover:shadow-blue-950/30">
            <div className="mb-4 flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-500/10 transition-transform duration-300 group-hover:scale-105 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/20">
                    <Layers className="h-6 w-6" aria-hidden="true" />
                </div>

                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-slate-400 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-500">
                    Template
                </span>
            </div>

            <div className="min-h-0 flex-1">
                <h3 className="line-clamp-2 text-lg font-black leading-tight text-slate-950 transition-colors group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-300">
                    {normalizeSpaces( template.title ) || 'Modelo sem título'}
                </h3>

                <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {getTemplateDescription( template )}
                </p>
            </div>

            <div className="mt-5 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-400">
                <div className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                    Atualizado em {formatDate( template.updatedAt || template.createdAt )}
                </div>
                <div className="flex items-center gap-2">
                    <FilePlus2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    Criado em {formatDate( template.createdAt )}
                </div>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <button
                    type="button"
                    onClick={() => onEdit( template.id )}
                    className="inline-flex flex-1 items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow-lg shadow-slate-900/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-950 focus:outline-none focus:ring-4 focus:ring-slate-500/10 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                >
                    <Edit3 className="mr-2 h-4 w-4" aria-hidden="true" />
                    Editar
                </button>

                <button
                    type="button"
                    onClick={() => onDelete( template )}
                    disabled={isDeleting}
                    className="inline-flex flex-1 items-center justify-center rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-black text-red-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-red-50 focus:outline-none focus:ring-4 focus:ring-red-500/10 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 dark:border-red-400/20 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-500/10"
                >
                    {isDeleting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                        <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    {isDeleting ? 'Excluindo...' : 'Excluir'}
                </button>
            </div>
        </article>
    );
};

const TemplateListComp = () => {
    const navigate = useNavigate();

    const [ templates, setTemplates ] = useState( [] );
    const [ pagination, setPagination ] = useState( {
        page: 1,
        limit: TEMPLATE_PAGE_LIMIT,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false
    } );
    const [ searchInput, setSearchInput ] = useState( '' );
    const [ searchQuery, setSearchQuery ] = useState( '' );
    const [ page, setPage ] = useState( 1 );
    const [ loading, setLoading ] = useState( true );
    const [ isRefreshing, setIsRefreshing ] = useState( false );
    const [ errorMessage, setErrorMessage ] = useState( '' );
    const [ deletingTemplateId, setDeletingTemplateId ] = useState( '' );

    const hasSearch = Boolean( searchQuery );
    const showingStart = useMemo( () => {
        if ( pagination.total === 0 ) return 0;
        return ( pagination.page - 1 ) * pagination.limit + 1;
    }, [ pagination.limit, pagination.page, pagination.total ] );
    const showingEnd = useMemo( () => Math.min( pagination.page * pagination.limit, pagination.total ), [ pagination.limit, pagination.page, pagination.total ] );

    const fetchTemplates = useCallback( async ( { signal, silent = false } = {} ) => {
        try {
            if ( silent ) {
                setIsRefreshing( true );
            } else {
                setLoading( true );
            }

            setErrorMessage( '' );

            const response = await api.get( '/templates', {
                signal,
                params: {
                    page,
                    limit: TEMPLATE_PAGE_LIMIT,
                    ...( searchQuery && { search: searchQuery } )
                }
            } );

            if ( signal?.aborted ) return;

            const nextTemplates = extractTemplates( response.data );

            setTemplates( nextTemplates );
            setPagination( extractPagination( response.data, page, TEMPLATE_PAGE_LIMIT, nextTemplates.length ) );
        } catch ( requestError ) {
            if ( signal?.aborted ) return;

            const message = getApiErrorMessage(
                requestError,
                'Não foi possível carregar seus modelos de contrato.'
            );

            setErrorMessage( message );
            toast.error( message, { id: 'template-list-load-error' } );
        } finally {
            if ( !signal?.aborted ) {
                setLoading( false );
                setIsRefreshing( false );
            }
        }
    }, [ page, searchQuery ] );

    useEffect( () => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout( () => {
            void fetchTemplates( { signal: controller.signal } );
        }, 0 );

        return () => {
            window.clearTimeout( timeoutId );
            controller.abort();
        };
    }, [ fetchTemplates ] );

    const handleSearchSubmit = ( event ) => {
        event.preventDefault();

        const normalizedSearch = normalizeSpaces( searchInput );

        if ( normalizedSearch.length > MAX_SEARCH_LENGTH ) {
            toast.error( `A busca deve possuir no máximo ${ MAX_SEARCH_LENGTH } caracteres.` );
            return;
        }

        setPage( 1 );
        setSearchQuery( normalizedSearch );
    };

    const handleClearSearch = () => {
        setSearchInput( '' );
        setSearchQuery( '' );
        setPage( 1 );
    };

    const handleRefresh = () => {
        void fetchTemplates( { silent: true } );
    };

    const handleDelete = ( template ) => {
        const title = normalizeSpaces( template?.title ) || 'este modelo';

        if ( !window.confirm( `Tem certeza que deseja excluir "${ title }"? Essa ação não pode ser desfeita.` ) ) return;

        setDeletingTemplateId( template.id );

        void api.delete( `/templates/${ template.id }` )
            .then( () => {
                toast.success( 'Modelo excluído com sucesso!' );

                setTemplates( ( currentTemplates ) => currentTemplates.filter( ( currentTemplate ) => currentTemplate.id !== template.id ) );
                setPagination( ( currentPagination ) => ( {
                    ...currentPagination,
                    total: Math.max( currentPagination.total - 1, 0 )
                } ) );
            } )
            .catch( ( requestError ) => {
                toast.error( getApiErrorMessage( requestError, 'Não foi possível excluir o modelo.' ) );
            } )
            .finally( () => {
                setDeletingTemplateId( '' );
            } );
    };

    const handlePreviousPage = () => {
        setPage( ( currentPage ) => Math.max( currentPage - 1, 1 ) );
    };

    const handleNextPage = () => {
        setPage( ( currentPage ) => currentPage + 1 );
    };

    const handleCreateTemplate = () => navigate( '/templates/new' );
    const handleEditTemplate = ( templateId ) => navigate( `/templates/edit/${ templateId }` );

    if ( loading ) return <LoadingState />;

    if ( errorMessage && templates.length === 0 ) {
        return <ErrorState message={errorMessage} onRetry={() => fetchTemplates()} />;
    }

    return (
        <div className="animate-in fade-in slide-in-from-bottom-3 space-y-6 duration-500">
            <section className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/85 p-5 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/75 dark:shadow-black/20 sm:p-6">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.12),transparent_30%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_32%)]" />

                <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                            Biblioteca de modelos
                        </p>
                        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                            <Layers className="h-7 w-7 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                            Templates de Contrato
                        </h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                            Gerencie modelos reutilizáveis para acelerar a criação de contratos e manter suas cláusulas padronizadas.
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white/80 px-5 py-3 text-sm font-black text-slate-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-600 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:border-blue-500/30 dark:hover:text-blue-300"
                        >
                            <RefreshCw className={`mr-2 h-4 w-4 ${ isRefreshing ? 'animate-spin' : '' }`} aria-hidden="true" />
                            Atualizar
                        </button>

                        <button
                            type="button"
                            onClick={handleCreateTemplate}
                            className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/30 focus:outline-none focus:ring-4 focus:ring-blue-500/20"
                        >
                            <Plus className="mr-2 h-5 w-5" aria-hidden="true" />
                            Novo Modelo
                        </button>
                    </div>
                </div>
            </section>

            <section className={`${ cardClasses } p-5 sm:p-6`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <form onSubmit={handleSearchSubmit} className="min-w-0 flex-1">
                        <label htmlFor="template-search" className="mb-1.5 block text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                            Buscar modelo
                        </label>
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <div className="relative min-w-0 flex-1">
                                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                <input
                                    id="template-search"
                                    type="search"
                                    value={searchInput}
                                    onChange={( event ) => setSearchInput( event.target.value )}
                                    className={inputClasses}
                                    maxLength={MAX_SEARCH_LENGTH}
                                    placeholder="Busque por título ou descrição"
                                />
                            </div>

                            <button
                                type="submit"
                                className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-900/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-950 focus:outline-none focus:ring-4 focus:ring-slate-500/10 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                            >
                                <Search className="mr-2 h-4 w-4" aria-hidden="true" />
                                Buscar
                            </button>
                        </div>
                    </form>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                        {pagination.total > 0 ? (
                            <span>{showingStart}-{showingEnd} de {pagination.total} modelos</span>
                        ) : (
                            <span>0 modelos</span>
                        )}
                    </div>
                </div>

                {hasSearch && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                        <span>Filtro ativo:</span>
                        <span className="rounded-full bg-blue-50 px-3 py-1 font-black text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                            {searchQuery}
                        </span>
                        <button
                            type="button"
                            onClick={handleClearSearch}
                            className="font-black text-blue-600 transition-colors hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:text-blue-300 dark:hover:text-blue-200"
                        >
                            limpar
                        </button>
                    </div>
                )}
            </section>

            {templates.length === 0 ? (
                <EmptyState
                    hasSearch={hasSearch}
                    onCreate={handleCreateTemplate}
                    onClearSearch={handleClearSearch}
                />
            ) : (
                <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Lista de modelos de contrato">
                    {templates.map( ( template ) => (
                        <TemplateCard
                            key={template.id}
                            template={template}
                            deletingTemplateId={deletingTemplateId}
                            onEdit={handleEditTemplate}
                            onDelete={handleDelete}
                        />
                    ) )}
                </section>
            )}

            {pagination.totalPages > 1 && (
                <nav className={`${ cardClasses } flex flex-col items-center justify-between gap-4 p-4 sm:flex-row`} aria-label="Paginação de modelos">
                    <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
                        Página {pagination.page} de {pagination.totalPages}
                    </p>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handlePreviousPage}
                            disabled={!pagination.hasPreviousPage}
                            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-500/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                            Anterior
                        </button>

                        <button
                            type="button"
                            onClick={handleNextPage}
                            disabled={!pagination.hasNextPage}
                            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-500/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            Próxima
                            <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                </nav>
            )}
        </div>
    );
};

export default TemplateListComp;
