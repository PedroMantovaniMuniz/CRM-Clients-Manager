import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import SignaturePad from 'signature_pad';
import toast from 'react-hot-toast';
import {
    AlertTriangle,
    ArrowLeft,
    CalendarDays,
    Check,
    Eraser,
    FileSignature,
    Loader2,
    PenTool,
    RefreshCw,
    ShieldCheck,
    Sparkles,
    UserCheck,
    XCircle
} from 'lucide-react';
import { useAuth } from '../../contexts/Auth/useAuth.js';
import api, { getApiErrorMessage } from '../../services/api.Service.js';
import ContractStatusBadge from '../Layout/ContractStatusBadge/ContractStatusBadge.Component.jsx';
import { getContractStatusMeta } from '../Layout/ContractStatusBadge/contractStatusMeta.js';

const SIGNABLE_STATUS = 'PENDING';
const BLOCKING_STATUSES = new Set( [ 'SIGNED', 'COMPLETED', 'CANCELLED' ] );

const dateFormatter = new Intl.DateTimeFormat( 'pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
} );

const normalizeSpaces = ( value ) => String( value ?? '' ).trim().replace( /\s+/g, ' ' );
const normalizeStatus = ( value ) => normalizeSpaces( value ).toUpperCase();

const extractContract = ( responseData ) => (
    responseData?.contract ||
    responseData?.data?.contract ||
    responseData?.updatedContract ||
    responseData?.data?.updatedContract ||
    null
);

const buildFullName = ( entity ) => {
    if ( !entity ) return 'Usuário não informado';

    return normalizeSpaces(
        entity.fullName ||
        [ entity.name, entity.lastName ].filter( Boolean ).join( ' ' ) ||
        entity.name ||
        'Usuário não informado'
    );
};

const formatDate = ( value ) => {
    if ( !value ) return 'Data não informada';

    const date = new Date( value );

    if ( Number.isNaN( date.getTime() ) ) return 'Data inválida';

    return dateFormatter.format( date );
};

const isContractSignable = ( contract ) => {
    const status = normalizeStatus( contract?.status );
    const statusMeta = getContractStatusMeta( contract );
    const hasPendingCancellationRequest = statusMeta.key === 'CANCELLATION_REQUESTED';

    return status === SIGNABLE_STATUS && !hasPendingCancellationRequest && !BLOCKING_STATUSES.has( status );
};

const getBlockedMessage = ( contract ) => {
    const status = normalizeStatus( contract?.status );
    const statusMeta = getContractStatusMeta( contract );

    if ( statusMeta.key === 'CANCELLATION_REQUESTED' ) {
        return 'Este contrato possui uma solicitação de cancelamento pendente e não pode ser assinado no momento.';
    }

    if ( status === 'SIGNED' ) return 'Este contrato já foi assinado.';
    if ( status === 'COMPLETED' ) return 'Este contrato já foi concluído.';
    if ( status === 'CANCELLED' ) return 'Este contrato foi cancelado.';

    return 'Este contrato não está disponível para assinatura no momento.';
};

const InfoCard = ( { icon: Icon, label, value } ) => (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/45">
        <div className="flex items-start gap-3">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" aria-hidden="true" />
            <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                    {label}
                </p>
                <p className="mt-1 break-words text-sm font-bold text-slate-800 dark:text-slate-200">
                    {value}
                </p>
            </div>
        </div>
    </div>
);

const LoadingState = () => (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center rounded-[2rem] border border-slate-200 bg-white/80 p-8 text-center shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-blue-600 dark:text-blue-400" aria-hidden="true" />
        <p className="animate-pulse font-bold text-slate-500 dark:text-slate-400">
            Carregando dados do contrato...
        </p>
    </div>
);

const ErrorState = ( { message, onBack, onRetry } ) => (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center rounded-[2rem] border border-red-200 bg-red-50/80 p-8 text-center shadow-sm backdrop-blur dark:border-red-400/20 dark:bg-red-500/10">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-300">
            <AlertTriangle className="h-8 w-8" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-black text-slate-950 dark:text-white">Não foi possível abrir a assinatura</h2>
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

const BlockedState = ( { message, onBack } ) => (
    <div className="rounded-[2rem] border border-amber-200 bg-amber-50/80 p-6 text-amber-900 shadow-sm dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100">
        <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                <XCircle className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
                <h2 className="text-lg font-black">Assinatura indisponível</h2>
                <p className="mt-1 text-sm leading-6 text-amber-800 dark:text-amber-100/80">{message}</p>
                <button
                    type="button"
                    onClick={onBack}
                    className="mt-4 inline-flex items-center justify-center rounded-2xl bg-amber-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-amber-600/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-amber-700 focus:outline-none focus:ring-4 focus:ring-amber-500/20"
                >
                    <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                    Ver contrato
                </button>
            </div>
        </div>
    </div>
);

const SignaturePadComp = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const canvasRef = useRef( null );
    const signaturePadRef = useRef( null );
    const { user, updateUser } = useAuth();

    const [ contract, setContract ] = useState( null );
    const [ isLoading, setIsLoading ] = useState( true );
    const [ errorMessage, setErrorMessage ] = useState( '' );
    const [ isSubmitting, setIsSubmitting ] = useState( false );

    const hasSavedSignature = Boolean( user?.signature );

    const loadContract = useCallback( async ( { signal } = {} ) => {
        try {
            setIsLoading( true );
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
                'Não foi possível carregar o contrato para assinatura.'
            );

            setErrorMessage( message );
            toast.error( message, { id: 'signature-load-error' } );
        } finally {
            if ( !signal?.aborted ) setIsLoading( false );
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

    const contractData = useMemo( () => {
        if ( !contract ) return null;

        const freelancerName = buildFullName( contract.freelancer );
        const clientName = buildFullName( contract.client );
        const signable = isContractSignable( contract );

        return {
            freelancerName,
            clientName,
            signable,
            blockedMessage: signable ? '' : getBlockedMessage( contract )
        };
    }, [ contract ] );

    const shouldInitializeSignaturePad = !hasSavedSignature && Boolean( contractData?.signable );

    useEffect( () => {
        if ( !shouldInitializeSignaturePad || !canvasRef.current ) return undefined;

        const canvas = canvasRef.current;
        const signaturePad = new SignaturePad( canvas, {
            penColor: 'rgb(15, 23, 42)',
            backgroundColor: 'rgb(248, 250, 252)',
            minWidth: 0.9,
            maxWidth: 2.4,
            throttle: 8
        } );

        signaturePadRef.current = signaturePad;

        const resizeCanvas = () => {
            const ratio = Math.max( window.devicePixelRatio || 1, 1 );
            const previousSignature = signaturePad.isEmpty() ? null : signaturePad.toData();
            const context = canvas.getContext( '2d' );
            const rect = canvas.getBoundingClientRect();
            const cssWidth = Math.max( rect.width || canvas.offsetWidth, 1 );
            const cssHeight = Math.max( rect.height || canvas.offsetHeight, 192 );

            canvas.width = cssWidth * ratio;
            canvas.height = cssHeight * ratio;

            context.setTransform( 1, 0, 0, 1, 0, 0 );
            context.scale( ratio, ratio );

            signaturePad.clear();

            if ( previousSignature ) {
                signaturePad.fromData( previousSignature );
            }
        };

        const animationFrameId = window.requestAnimationFrame( resizeCanvas );
        const resizeObserver = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver( resizeCanvas )
            : null;

        resizeObserver?.observe( canvas );
        window.addEventListener( 'resize', resizeCanvas );

        return () => {
            window.cancelAnimationFrame( animationFrameId );
            resizeObserver?.disconnect();
            window.removeEventListener( 'resize', resizeCanvas );
            signaturePad.off();
            signaturePadRef.current = null;
        };
    }, [ contract?.id, shouldInitializeSignaturePad ] );

    const handleClear = () => {
        signaturePadRef.current?.clear();
    };

    const handleBack = () => {
        navigate( `/contracts/${ id }` );
    };

    const handleSave = async () => {
        if ( !contractData?.signable ) {
            toast.error( contractData?.blockedMessage || 'Este contrato não pode ser assinado no momento.' );
            return;
        }

        let signature = null;

        if ( !hasSavedSignature ) {
            const signaturePad = signaturePadRef.current;

            if ( !signaturePad || signaturePad.isEmpty() ) {
                toast.error( 'Faça a sua assinatura no quadro antes de confirmar.' );
                return;
            }

            signature = signaturePad.toDataURL( 'image/png' );
        }

        setIsSubmitting( true );

        try {
            await api.patch( `/contracts/${ id }/sign`, {
                ...( signature && { clientSignature: signature } )
            } );

            if ( signature ) {
                updateUser( { signature: true } );
            }

            toast.success( 'Contrato assinado com sucesso!' );
            navigate( `/contracts/${ id }`, { replace: true } );
        } catch ( requestError ) {
            toast.error( getApiErrorMessage( requestError, 'Ocorreu um erro ao enviar a assinatura.' ) );
        } finally {
            setIsSubmitting( false );
        }
    };

    if ( isLoading ) return <LoadingState />;

    if ( errorMessage || !contract || !contractData ) {
        return (
            <ErrorState
                message={errorMessage || 'Contrato não encontrado.'}
                onBack={() => navigate( '/' )}
                onRetry={() => loadContract()}
            />
        );
    }

    return (
        <div className="mx-auto max-w-3xl animate-in fade-in slide-in-from-bottom-4 space-y-6 duration-500">
            <section className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/85 p-6 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/75 dark:shadow-black/20">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.12),transparent_30%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_32%)]" />

                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-4">
                        <button
                            type="button"
                            onClick={handleBack}
                            className="rounded-2xl p-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                            aria-label="Voltar ao documento"
                        >
                            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                        </button>

                        <div>
                            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                                Assinatura eletrônica
                            </p>
                            <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                                <PenTool className="h-7 w-7 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                                Assinar Contrato
                            </h1>
                            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                                {hasSavedSignature
                                    ? 'Confirme para aplicar sua assinatura salva ao documento.'
                                    : 'Desenhe sua assinatura no quadro e confirme para concluir o aceite do contrato.'}
                            </p>
                        </div>
                    </div>

                    <ContractStatusBadge contract={contract} size="md" className="w-fit" />
                </div>
            </section>

            <section className="rounded-[2rem] border border-slate-200/80 bg-white/85 p-5 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/75 dark:shadow-black/20">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <InfoCard icon={UserCheck} label="Contratada" value={contractData.freelancerName} />
                    <InfoCard icon={FileSignature} label="Contratante" value={contractData.clientName} />
                    <InfoCard icon={CalendarDays} label="Vigência" value={`${ formatDate( contract.startDate ) } a ${ formatDate( contract.endDate ) }`} />
                </div>
            </section>

            {!contractData.signable ? (
                <BlockedState message={contractData.blockedMessage} onBack={handleBack} />
            ) : (
                <div className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/85 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/75 dark:shadow-black/20">
                    {hasSavedSignature ? (
                        <div className="border-b border-slate-200/80 bg-blue-50/70 p-10 text-center dark:border-slate-800 dark:bg-blue-500/10">
                            <div className="mb-4 inline-flex rounded-3xl bg-blue-100 p-4 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                                <Check className="h-7 w-7" aria-hidden="true" />
                            </div>
                            <h3 className="mb-2 text-xl font-black text-blue-950 dark:text-blue-100">Assinatura já cadastrada</h3>
                            <p className="mx-auto max-w-md text-sm leading-6 text-blue-700 dark:text-blue-200/80">
                                Detectamos uma assinatura salva no seu perfil. Ao confirmar, ela será aplicada a este contrato.
                            </p>
                        </div>
                    ) : (
                        <div className="p-6">
                            <div className="relative overflow-hidden rounded-[1.5rem] border-2 border-dashed border-slate-300 bg-slate-50 shadow-inner dark:border-slate-700 dark:bg-slate-950">
                                <canvas
                                    ref={canvasRef}
                                    className="h-64 w-full cursor-crosshair touch-none sm:h-80"
                                    style={{ width: '100%', touchAction: 'none' }}
                                    aria-label="Painel para assinatura do cliente"
                                />
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-70">
                                    <span className="select-none rotate-[-10deg] text-2xl font-black uppercase tracking-widest text-slate-200 dark:text-slate-800">
                                        Assine Aqui
                                    </span>
                                </div>
                                <div className="pointer-events-none absolute bottom-10 left-8 right-8 border-b-2 border-slate-300 opacity-60 dark:border-slate-700" />
                            </div>

                            <div className="mt-4 flex justify-end">
                                <button
                                    type="button"
                                    onClick={handleClear}
                                    disabled={isSubmitting}
                                    className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-slate-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                                >
                                    <Eraser className="h-4 w-4" aria-hidden="true" />
                                    Limpar e tentar novamente
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="border-t border-slate-200/80 bg-slate-50/80 p-6 dark:border-slate-800 dark:bg-slate-950/40">
                        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                                Ao clicar em “Confirmar assinatura”, você declara ter lido e concordado integralmente com os termos, valores, prazos e condições estabelecidos no contrato referenciado.
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={isSubmitting}
                            className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-4 text-lg font-black text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/30 focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-6 w-6 animate-spin" aria-hidden="true" />
                                    Enviando assinatura...
                                </>
                            ) : (
                                <>
                                    <Check className="mr-2 h-6 w-6" aria-hidden="true" />
                                    Confirmar assinatura
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SignaturePadComp;
