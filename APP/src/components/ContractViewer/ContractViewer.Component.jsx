import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    AlertTriangle,
    ArrowLeft,
    Ban,
    Calendar,
    Clock,
    Download,
    FileText,
    IdCard,
    Layers,
    Loader2,
    MapPin,
    PenTool,
    RefreshCw,
    Sparkles,
    Trash2,
    XCircle
} from 'lucide-react';
import { useAuth } from '../../contexts/Auth/useAuth.js';
import api, { getApiErrorMessage } from '../../services/api.Service.js';
import ContractStatusBadge from '../Layout/ContractStatusBadge/ContractStatusBadge.Component.jsx';
import { getContractStatusMeta } from '../Layout/ContractStatusBadge/contractStatusMeta.js';

const FINAL_STATUSES = new Set( [ 'CANCELLED', 'COMPLETED' ] );
const CANCELLATION_ACTIONS = Object.freeze( {
    REQUEST: 'request-cancel',
    CONFIRM: 'confirm-cancel',
    DELETE: 'delete-contract'
} );

const currencyFormatter = new Intl.NumberFormat( 'pt-BR', {
    style: 'currency',
    currency: 'BRL'
} );

const dateFormatter = new Intl.DateTimeFormat( 'pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
} );

const PdfDownloadButton = lazy( async () => {
    const [ pdfRendererModule, contractPdfModule ] = await Promise.all( [
        import( '@react-pdf/renderer' ),
        import( '../ContractPDF/ContractPDF.Component.jsx' )
    ] );

    const { PDFDownloadLink } = pdfRendererModule;
    const ContractPDFComp = contractPdfModule.default;

    const ContractPdfDownloadButton = ( { contract, fileName } ) => (
        <PDFDownloadLink
            document={<ContractPDFComp contract={contract} />}
            fileName={fileName}
            className="w-full sm:w-auto"
        >
            {( { loading: isGeneratingPDF } ) => (
                <button
                    type="button"
                    disabled={isGeneratingPDF}
                    className="flex w-full items-center justify-center rounded-2xl bg-slate-900 px-6 py-3 font-black text-white shadow-lg shadow-slate-900/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-950 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 sm:w-auto"
                >
                    {isGeneratingPDF ? (
                        <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
                            Gerando PDF...
                        </>
                    ) : (
                        <>
                            <Download className="mr-2 h-5 w-5" aria-hidden="true" />
                            Baixar PDF Original
                        </>
                    )}
                </button>
            )}
        </PDFDownloadLink>
    );

    return { default: ContractPdfDownloadButton };
} );

const normalizeSpaces = ( value ) => String( value ?? '' ).trim().replace( /\s+/g, ' ' );
const normalizeRole = ( value ) => normalizeSpaces( value ).toUpperCase();
const normalizeStatus = ( value ) => normalizeSpaces( value ).toUpperCase();
const onlyDigits = ( value ) => String( value ?? '' ).replace( /\D/g, '' );

const extractContract = ( responseData ) => (
    responseData?.contract ||
    responseData?.data?.contract ||
    responseData?.updatedContract ||
    responseData?.data?.updatedContract ||
    null
);

const buildFullName = ( entity ) => {
    if ( !entity ) return '[nome não informado]';

    return normalizeSpaces(
        entity.fullName ||
        [ entity.name, entity.lastName ].filter( Boolean ).join( ' ' ) ||
        entity.name ||
        '[nome não informado]'
    );
};

const getEntityDocument = ( entity, fallback = '' ) => (
    entity?.document ||
    entity?.cpfCnpj ||
    entity?.cnpjCpf ||
    entity?.documentNumber ||
    fallback ||
    ''
);

const getDocumentLabel = ( value ) => {
    const digits = onlyDigits( value );

    if ( digits.length === 11 ) return 'CPF';
    if ( digits.length === 14 ) return 'CNPJ';
    return 'CPF/CNPJ';
};

const formatDocument = ( value ) => {
    const digits = onlyDigits( value );

    if ( digits.length === 11 ) return digits.replace( /(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4' );
    if ( digits.length === 14 ) return digits.replace( /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5' );

    return normalizeSpaces( value ) || '[não informado]';
};

const formatZipCode = ( value ) => {
    const digits = onlyDigits( value );

    if ( digits.length === 8 ) return digits.replace( /(\d{5})(\d{3})/, '$1-$2' );

    return normalizeSpaces( value );
};

const getAddressParts = ( entity ) => ( {
    street: normalizeSpaces( entity?.addressStreet || entity?.street || entity?.address?.street || '' ),
    number: normalizeSpaces( entity?.addressNumber || entity?.number || entity?.address?.number || '' ),
    city: normalizeSpaces( entity?.addressCity || entity?.city || entity?.address?.city || '' ),
    state: normalizeSpaces( entity?.addressState || entity?.state || entity?.address?.state || '' ).toUpperCase(),
    zipCode: normalizeSpaces( entity?.addressZipCode || entity?.zipCode || entity?.address?.zipCode || '' )
} );

const buildAddressText = ( entity ) => {
    const { street, number, city, state, zipCode } = getAddressParts( entity );
    const line1 = [ street, number && `nº ${ number }` ].filter( Boolean ).join( ', ' );
    const line2 = [ city, state ].filter( Boolean ).join( ' - ' );
    const line3 = zipCode ? `CEP ${ formatZipCode( zipCode ) }` : '';

    return [ line1, line2, line3 ].filter( Boolean ).join( ', ' );
};

const getOrdinal = ( value ) => {
    const ordinals = [
        '',
        'PRIMEIRA',
        'SEGUNDA',
        'TERCEIRA',
        'QUARTA',
        'QUINTA',
        'SEXTA',
        'SÉTIMA',
        'OITAVA',
        'NONA',
        'DÉCIMA',
        'DÉCIMA PRIMEIRA',
        'DÉCIMA SEGUNDA',
        'DÉCIMA TERCEIRA',
        'DÉCIMA QUARTA',
        'DÉCIMA QUINTA'
    ];

    return value <= 15 ? ordinals[ value ] : `${ value }ª`;
};

const getRoman = ( value ) => {
    const romanMap = {
        M: 1000,
        CM: 900,
        D: 500,
        CD: 400,
        C: 100,
        XC: 90,
        L: 50,
        XL: 40,
        X: 10,
        IX: 9,
        V: 5,
        IV: 4,
        I: 1
    };
    let remainingValue = value;
    let result = '';

    for ( const [ romanSymbol, numberValue ] of Object.entries( romanMap ) ) {
        const quantity = Math.floor( remainingValue / numberValue );
        remainingValue -= quantity * numberValue;
        result += romanSymbol.repeat( quantity );
    }

    return result;
};

const getAlphabet = ( value ) => String.fromCharCode( 96 + value );

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

const getBlockPrefixAndContent = ( block, counters ) => {
    const content = normalizeSpaces( block.content );

    switch ( block.type ) {
        case 'CLAUSE': {
            counters.clause += 1;
            counters.subclause = 0;
            counters.paragraph = 0;
            counters.inciso = 0;
            counters.item = 0;
            counters.alinea = 0;

            const prefix = `CLÁUSULA ${ getOrdinal( counters.clause ) }: `;
            return { prefix, content: content.toUpperCase() };
        }
        case 'SUBCLAUSE': {
            counters.subclause += 1;
            counters.paragraph = 0;
            counters.inciso = 0;
            counters.item = 0;
            counters.alinea = 0;

            return { prefix: `${ counters.clause }.${ counters.subclause }. `, content };
        }
        case 'PARAGRAPH': {
            counters.paragraph += 1;
            counters.inciso = 0;
            counters.item = 0;
            counters.alinea = 0;

            return {
                prefix: counters.paragraph <= 9 ? `§ ${ counters.paragraph }º ` : `§ ${ counters.paragraph } `,
                content
            };
        }
        case 'INCISO': {
            counters.inciso += 1;
            counters.item = 0;
            counters.alinea = 0;

            return { prefix: `${ getRoman( counters.inciso ) } - `, content };
        }
        case 'ITEM': {
            counters.item += 1;
            counters.alinea = 0;

            return { prefix: `${ counters.item }. `, content };
        }
        case 'ALINEA': {
            counters.alinea += 1;

            return { prefix: `${ getAlphabet( counters.alinea ) }) `, content };
        }
        case 'FREE_TEXT':
        default:
            return { prefix: '', content };
    }
};

const formatContractStructure = ( structure ) => {
    if ( !Array.isArray( structure ) ) return [];

    const counters = {
        clause: 0,
        subclause: 0,
        paragraph: 0,
        inciso: 0,
        item: 0,
        alinea: 0
    };

    return structure.map( ( block ) => {
        const { prefix, content } = getBlockPrefixAndContent( block, counters );

        return {
            ...block,
            prefix,
            formattedContent: `${ prefix }${ content }`
        };
    } );
};

const mergeContractUpdate = ( currentContract, updatedContract ) => {
    if ( !updatedContract ) return currentContract;

    return {
        ...currentContract,
        ...updatedContract,
        client: currentContract?.client || updatedContract.client,
        freelancer: currentContract?.freelancer || updatedContract.freelancer,
        steps: currentContract?.steps || updatedContract.steps,
        structure: currentContract?.structure || updatedContract.structure,
        contractedSignature: currentContract?.contractedSignature || updatedContract.contractedSignature,
        clientSignature: currentContract?.clientSignature || updatedContract.clientSignature
    };
};

const SectionCard = ( { children, className = '' } ) => (
    <section className={`overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/85 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/75 dark:shadow-black/20 ${ className }`}>
        {children}
    </section>
);

const SectionHeader = ( { icon: Icon, title, subtitle } ) => (
    <div className="flex flex-col gap-1 border-b border-slate-200/80 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-950/40 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
            <Icon className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-300" aria-hidden="true" />
            <div>
                <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-800 dark:text-slate-200">
                    {title}
                </h3>
                {subtitle && (
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {subtitle}
                    </p>
                )}
            </div>
        </div>
    </div>
);

const PartyCard = ( { title, name, document, address } ) => (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
        <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
            {title}
        </p>
        <p className="mb-2 font-black text-slate-950 dark:text-white">{name}</p>
        <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <IdCard className="h-4 w-4 text-blue-600 dark:text-blue-300" aria-hidden="true" />
            {getDocumentLabel( document )}: {formatDocument( document )}
        </p>
        <p className="mt-2 flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
            <MapPin className="mt-0.5 h-4 w-4 text-blue-600 dark:text-blue-300" aria-hidden="true" />
            <span>{address || 'Endereço não informado'}</span>
        </p>
    </div>
);

const SignatureBox = ( { imageSrc, alt, name, label, emptyText } ) => (
    <div className="flex flex-col items-center">
        <div className="flex h-32 w-full max-w-[250px] items-end justify-center border-b-2 border-slate-800 pb-2 dark:border-slate-200">
            {imageSrc ? (
                <img src={imageSrc} alt={alt} className="max-h-full object-contain" />
            ) : (
                <span className="mb-2 text-sm italic text-slate-400">{emptyText}</span>
            )}
        </div>
        <p className="mt-3 text-center font-black text-slate-950 dark:text-white">{name}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
    </div>
);

const ActionButton = ( {
    children,
    icon: Icon,
    loading = false,
    loadingLabel = 'Processando...',
    variant = 'neutral',
    className = '',
    ...props
} ) => {
    const variantClasses = {
        neutral: 'bg-slate-900 text-white shadow-slate-900/20 hover:bg-slate-950 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200',
        primary: 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-blue-600/25 hover:shadow-blue-600/30',
        danger: 'border border-red-200 bg-white text-red-600 shadow-slate-900/5 hover:bg-red-50 dark:border-red-400/20 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-500/10',
        dangerSolid: 'bg-red-600 text-white shadow-red-600/20 hover:bg-red-700',
        warning: 'border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200'
    };

    return (
        <button
            type="button"
            disabled={loading || props.disabled}
            className={`flex w-full items-center justify-center rounded-2xl px-6 py-3 font-black shadow-lg transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 sm:w-auto ${ variantClasses[ variant ] || variantClasses.neutral } ${ className }`}
            {...props}
        >
            {loading ? (
                <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
                    {loadingLabel}
                </>
            ) : (
                <>
                    {Icon && <Icon className="mr-2 h-5 w-5" aria-hidden="true" />}
                    {children}
                </>
            )}
        </button>
    );
};

const LoadingState = () => (
    <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-[2rem] border border-slate-200 bg-white/80 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-blue-600 dark:text-blue-400" aria-hidden="true" />
        <p className="animate-pulse font-bold text-slate-500 dark:text-slate-400">Carregando o documento...</p>
    </div>
);

const ErrorState = ( { message, onBack, onRetry } ) => (
    <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-[2rem] border border-red-200 bg-red-50/80 p-8 text-center shadow-sm backdrop-blur dark:border-red-400/20 dark:bg-red-500/10">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-300">
            <AlertTriangle className="h-8 w-8" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-black text-slate-950 dark:text-white">Contrato não carregado</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-300">{message}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Voltar
            </button>
            <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20"
            >
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Tentar novamente
            </button>
        </div>
    </div>
);

const ContractViewer = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [ contract, setContract ] = useState( null );
    const [ loading, setLoading ] = useState( true );
    const [ errorMessage, setErrorMessage ] = useState( '' );
    const [ activeAction, setActiveAction ] = useState( '' );

    const userRole = normalizeRole( user?.role );
    const isClient = userRole === 'CLIENT';
    const isFreelancer = userRole === 'FREELANCER';

    const loadContract = useCallback( async ( { signal } = {} ) => {
        try {
            setLoading( true );
            setErrorMessage( '' );

            const response = await api.get( `/contracts/${ id }`, { signal } );

            if ( signal?.aborted ) return;

            const contractData = extractContract( response.data );

            if ( !contractData ) {
                throw new Error( 'A API não retornou os dados do contrato.' );
            }

            setContract( contractData );
        } catch ( requestError ) {
            if ( signal?.aborted ) return;

            const message = getApiErrorMessage(
                requestError,
                'Não foi possível carregar os detalhes do contrato.'
            );

            setErrorMessage( message );
            toast.error( message, { id: 'contract-viewer-load-error' } );
        } finally {
            if ( !signal?.aborted ) {
                setLoading( false );
            }
        }
    }, [ id ] );

    useEffect( () => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout( () => {
            void loadContract( { signal: controller.signal } );
        }, 0 );

        return () => {
            window.clearTimeout( timeoutId );
            controller.abort();
        };
    }, [ loadContract ] );

    const contractViewData = useMemo( () => {
        if ( !contract ) return null;

        const status = normalizeStatus( contract.status );
        const statusMeta = getContractStatusMeta( contract );
        const isPending = status === 'PENDING';
        const isFinal = FINAL_STATUSES.has( status );
        const hasCancellationRequest = Boolean( contract.cancellationRequestedBy );
        const requesterIsCurrentUser = contract.cancellationRequestedBy === user?.id;
        const freelancerName = buildFullName( contract.freelancer );
        const clientName = buildFullName( contract.client );
        const freelancerDocument = getEntityDocument( contract.freelancer );
        const clientDocument = getEntityDocument( contract.client, contract.cnpjCpf );
        const freelancerAddress = buildAddressText( contract.freelancer );
        const clientAddress = buildAddressText( contract.client );

        return {
            status,
            statusMeta,
            isPending,
            isFinal,
            hasCancellationRequest,
            requesterIsCurrentUser,
            freelancerName,
            clientName,
            freelancerDocument,
            clientDocument,
            freelancerAddress,
            clientAddress,
            formattedStructure: formatContractStructure( contract.structure ),
            canRequestCancellation: !isFinal && !isPending && !hasCancellationRequest,
            canConfirmCancellation: !isFinal && !isPending && hasCancellationRequest && !requesterIsCurrentUser,
            canDeleteContract: isFreelancer && isPending && !hasCancellationRequest,
            canDownloadPdf: status === 'SIGNED' || status === 'COMPLETED',
            needsClientSignature: isClient && isPending && !hasCancellationRequest
        };
    }, [ contract, isClient, isFreelancer, user?.id ] );

    const runContractAction = async ( actionKey, action ) => {
        setActiveAction( actionKey );

        try {
            await action();
        } finally {
            setActiveAction( '' );
        }
    };

    const handleRequestCancellation = () => {
        if ( !window.confirm( 'Tem certeza que deseja solicitar o cancelamento deste contrato? A outra parte precisará confirmar.' ) ) return;

        void runContractAction( CANCELLATION_ACTIONS.REQUEST, async () => {
            const response = await api.patch( `/contracts/${ id }/request-cancel` );
            const updatedContract = extractContract( response.data ) || { cancellationRequestedBy: user?.id };

            setContract( ( currentContract ) => mergeContractUpdate( currentContract, updatedContract ) );
            toast.success( 'Solicitação de cancelamento enviada!' );
        } ).catch( ( requestError ) => {
            toast.error( getApiErrorMessage( requestError, 'Erro ao solicitar cancelamento.' ) );
        } );
    };

    const handleConfirmCancellation = () => {
        if ( !window.confirm( 'Atenção: ao confirmar, este contrato será cancelado definitivamente. Deseja prosseguir?' ) ) return;

        void runContractAction( CANCELLATION_ACTIONS.CONFIRM, async () => {
            const response = await api.patch( `/contracts/${ id }/confirm-cancel` );
            const updatedContract = extractContract( response.data ) || {
                status: 'CANCELLED',
                cancellationRequestedBy: contract?.cancellationRequestedBy
            };

            setContract( ( currentContract ) => mergeContractUpdate( currentContract, updatedContract ) );
            toast.success( 'Contrato cancelado com sucesso!' );
        } ).catch( ( requestError ) => {
            toast.error( getApiErrorMessage( requestError, 'Erro ao confirmar cancelamento.' ) );
        } );
    };

    const handleDeleteContract = () => {
        if ( !window.confirm( 'Atenção: esta ação excluirá permanentemente o contrato. Deseja continuar?' ) ) return;

        void runContractAction( CANCELLATION_ACTIONS.DELETE, async () => {
            await api.delete( `/contracts/${ id }` );
            toast.success( 'Contrato excluído com sucesso!' );
            navigate( '/', { replace: true } );
        } ).catch( ( requestError ) => {
            toast.error( getApiErrorMessage( requestError, 'Erro ao excluir o contrato.' ) );
        } );
    };

    if ( loading ) return <LoadingState />;

    if ( errorMessage || !contract || !contractViewData ) {
        return (
            <ErrorState
                message={errorMessage || 'Contrato não encontrado.'}
                onBack={() => navigate( '/' )}
                onRetry={() => loadContract()}
            />
        );
    }

    const {
        statusMeta,
        isPending,
        hasCancellationRequest,
        requesterIsCurrentUser,
        freelancerName,
        clientName,
        freelancerDocument,
        clientDocument,
        freelancerAddress,
        clientAddress,
        formattedStructure,
        canRequestCancellation,
        canConfirmCancellation,
        canDeleteContract,
        canDownloadPdf,
        needsClientSignature
    } = contractViewData;

    const isRequestingCancellation = activeAction === CANCELLATION_ACTIONS.REQUEST;
    const isConfirmingCancellation = activeAction === CANCELLATION_ACTIONS.CONFIRM;
    const isDeletingContract = activeAction === CANCELLATION_ACTIONS.DELETE;
    const actionIsRunning = Boolean( activeAction );
    const pdfFileName = `Contrato_Servicos_${ contract.id }.pdf`;

    return (
        <div className="mx-auto max-w-4xl animate-in fade-in slide-in-from-bottom-4 space-y-6 duration-500">
            <section className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/85 p-6 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/75 dark:shadow-black/20">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.12),transparent_30%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_32%)]" />
                <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="flex items-start gap-4">
                        <button
                            type="button"
                            onClick={() => navigate( '/' )}
                            className="rounded-2xl p-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                            aria-label="Voltar para o dashboard"
                        >
                            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                        </button>

                        <div>
                            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                                Documento
                            </p>
                            <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                                <FileText className="h-7 w-7 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                                Detalhes do Contrato
                            </h1>
                            <p className="mt-1 break-all text-sm text-slate-500 dark:text-slate-400">ID: {contract.id}</p>
                        </div>
                    </div>

                    <ContractStatusBadge contract={contract} size="lg" className="w-fit" />
                </div>
            </section>

            {statusMeta.key === 'CANCELLATION_REQUESTED' && (
                <div className="flex items-start gap-3 rounded-[1.5rem] border border-orange-200 bg-orange-50 p-4 text-orange-800 shadow-sm dark:border-orange-400/20 dark:bg-orange-500/10 dark:text-orange-200">
                    <Ban className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <div>
                        <p className="font-black">Este contrato possui uma solicitação de cancelamento pendente.</p>
                        <p className="mt-1 text-sm text-orange-700 dark:text-orange-200/80">
                            {requesterIsCurrentUser
                                ? 'Você solicitou o cancelamento. A outra parte precisa confirmar para finalizar.'
                                : 'A outra parte solicitou o cancelamento. Você pode confirmar a solicitação nas ações abaixo.'}
                        </p>
                    </div>
                </div>
            )}

            <SectionCard>
                <SectionHeader
                    icon={Layers}
                    title="Metadados do Projeto"
                    subtitle="Resumo financeiro, prazos e cronograma interno do contrato."
                />

                <div className="grid grid-cols-1 gap-8 border-b border-slate-200/80 bg-white/50 p-5 dark:border-slate-800 dark:bg-slate-900/30 md:grid-cols-2">
                    <div>
                        <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                            Prazos e Valores
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Valor Total:</p>
                        <p className="mb-3 text-2xl font-black text-blue-600 dark:text-blue-300">
                            {formatCurrency( contract.value )}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Início e Fim:</p>
                        <p className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                            <Calendar className="h-4 w-4 text-slate-400" aria-hidden="true" />
                            {formatDate( contract.startDate )} a {formatDate( contract.endDate )}
                        </p>
                    </div>

                    <div>
                        <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                            Cronograma Interno
                        </p>
                        {Array.isArray( contract.steps ) && contract.steps.length > 0 ? (
                            <div className="space-y-2">
                                {contract.steps.map( ( step, index ) => (
                                    <div
                                        key={step.id || `${ step.description }-${ index }`}
                                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50"
                                    >
                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                            {index + 1}. {normalizeSpaces( step.description ) || 'Etapa sem descrição'}
                                        </span>
                                        <span className="text-xs font-black text-slate-500 dark:text-slate-400">
                                            {formatDate( step.deliveryDate )}
                                        </span>
                                    </div>
                                ) )}
                            </div>
                        ) : (
                            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                                Nenhuma etapa cadastrada para este contrato.
                            </p>
                        )}
                    </div>
                </div>
            </SectionCard>

            <SectionCard className="bg-white dark:bg-slate-900">
                <div className="p-8 sm:p-12">
                    <h2 className="mb-8 text-center text-xl font-black uppercase text-slate-950 dark:text-white">
                        Contrato de Prestação de Serviços
                    </h2>

                    <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <PartyCard
                            title="Contratada"
                            name={freelancerName}
                            document={freelancerDocument}
                            address={freelancerAddress}
                        />
                        <PartyCard
                            title="Contratante"
                            name={clientName}
                            document={clientDocument}
                            address={clientAddress}
                        />
                    </div>

                    <div className="mb-8 space-y-4 px-2 text-justify text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                        <p>
                            <span className="font-black">CONTRATADA:</span> {freelancerName}, inscrita no {getDocumentLabel( freelancerDocument )} sob o nº {formatDocument( freelancerDocument )}{freelancerAddress ? `, com endereço em ${ freelancerAddress }` : ''}.
                        </p>
                        <p>
                            <span className="font-black">CONTRATANTE:</span> {clientName}, inscrito(a) no {getDocumentLabel( clientDocument )} sob o nº {formatDocument( clientDocument )}{clientAddress ? `, com endereço em ${ clientAddress }` : ''}.
                        </p>
                        <p className="mt-4">
                            As partes acima identificadas têm, entre si, justo e acertado o presente Contrato, que se regerá pelas cláusulas abaixo:
                        </p>
                    </div>

                    {formattedStructure.length > 0 ? (
                        <div className="space-y-1 px-2 text-justify text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                            {formattedStructure.map( ( block, index ) => {
                                const key = block.id || `${ block.type }-${ index }`;

                                switch ( block.type ) {
                                    case 'CLAUSE':
                                        return <h4 key={key} className="mb-2 mt-6 text-base font-black text-slate-950 dark:text-white">{block.formattedContent}</h4>;
                                    case 'SUBCLAUSE':
                                        return <p key={key} className="mt-3 pl-4 font-bold text-slate-800 dark:text-slate-100">{block.formattedContent}</p>;
                                    case 'PARAGRAPH':
                                        return <p key={key} className="mt-2 pl-4">{block.formattedContent}</p>;
                                    case 'INCISO':
                                        return <p key={key} className="pl-8">{block.formattedContent}</p>;
                                    case 'ITEM':
                                        return <p key={key} className="pl-12">{block.formattedContent}</p>;
                                    case 'ALINEA':
                                        return <p key={key} className="pl-16">{block.formattedContent}</p>;
                                    case 'FREE_TEXT':
                                        return <p key={key} className="mt-2">{block.formattedContent}</p>;
                                    default:
                                        return <p key={key}>{block.formattedContent}</p>;
                                }
                            } )}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                            Este contrato não possui cláusulas personalizadas cadastradas.
                        </div>
                    )}
                </div>

                <div className="border-t border-slate-200/80 bg-slate-50 p-8 dark:border-slate-800 dark:bg-slate-950/40 sm:p-12">
                    <h3 className="mb-8 text-center text-lg font-black text-slate-800 dark:text-white">
                        Assinaturas Digitais
                    </h3>
                    <div className="grid grid-cols-1 gap-12 sm:grid-cols-2">
                        <SignatureBox
                            imageSrc={contract.contractedSignature}
                            alt="Assinatura do freelancer"
                            name={freelancerName}
                            label="Contratada"
                            emptyText="Sem assinatura registrada"
                        />
                        <SignatureBox
                            imageSrc={contract.clientSignature}
                            alt="Assinatura do cliente"
                            name={clientName}
                            label="Contratante"
                            emptyText="Aguardando assinatura..."
                        />
                    </div>
                </div>
            </SectionCard>

            <div className="flex flex-col justify-end gap-4 pt-2 sm:flex-row">
                {!contractViewData.isFinal && contract.status && (
                    <>
                        {canRequestCancellation && (
                            <ActionButton
                                onClick={handleRequestCancellation}
                                disabled={actionIsRunning}
                                loading={isRequestingCancellation}
                                loadingLabel="Solicitando..."
                                icon={Ban}
                                variant="danger"
                            >
                                Solicitar Cancelamento
                            </ActionButton>
                        )}

                        {hasCancellationRequest && requesterIsCurrentUser && !isPending && (
                            <div className="flex w-full cursor-not-allowed items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-6 py-3 text-sm font-bold text-red-800 opacity-80 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-200 sm:w-auto">
                                <Clock className="mr-2 h-5 w-5" aria-hidden="true" />
                                Aguardando Confirmação
                            </div>
                        )}

                        {canConfirmCancellation && (
                            <ActionButton
                                onClick={handleConfirmCancellation}
                                disabled={actionIsRunning}
                                loading={isConfirmingCancellation}
                                loadingLabel="Cancelando..."
                                icon={XCircle}
                                variant="dangerSolid"
                                className="animate-pulse"
                            >
                                Confirmar Cancelamento
                            </ActionButton>
                        )}

                        {canDeleteContract && (
                            <ActionButton
                                onClick={handleDeleteContract}
                                disabled={actionIsRunning}
                                loading={isDeletingContract}
                                loadingLabel="Excluindo..."
                                icon={Trash2}
                                variant="danger"
                            >
                                Excluir Contrato
                            </ActionButton>
                        )}
                    </>
                )}

                {canDownloadPdf && (
                    <Suspense
                        fallback={(
                            <button
                                type="button"
                                disabled
                                className="flex w-full cursor-wait items-center justify-center rounded-2xl bg-slate-900 px-6 py-3 font-black text-white opacity-70 shadow-lg shadow-slate-900/20 dark:bg-white dark:text-slate-950 sm:w-auto"
                            >
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
                                Preparando PDF...
                            </button>
                        )}
                    >
                        <PdfDownloadButton contract={contract} fileName={pdfFileName} />
                    </Suspense>
                )}

                {needsClientSignature && (
                    <ActionButton
                        onClick={() => navigate( `/signContract/${ contract.id }` )}
                        icon={PenTool}
                        variant="primary"
                        className="animate-pulse px-8"
                    >
                        Assinar Contrato Agora
                    </ActionButton>
                )}

                {isFreelancer && isPending && !hasCancellationRequest && (
                    <div className="flex w-full items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-6 py-3 text-sm font-bold text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200 sm:w-auto">
                        <Clock className="mr-2 h-5 w-5" aria-hidden="true" />
                        Aguardando ação do cliente
                    </div>
                )}
            </div>
        </div>
    );
};

export default ContractViewer;
