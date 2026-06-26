import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SignaturePad from 'signature_pad';
import toast from 'react-hot-toast';
import {
    AlertTriangle,
    ArrowLeft,
    Calendar,
    Check,
    DollarSign,
    Eraser,
    FileSignature,
    IdCard,
    Layers,
    Loader2,
    MapPin,
    Phone,
    Plus,
    Sparkles,
    Trash2,
    User,
    WalletCards
} from 'lucide-react';
import { useAuth } from '../../contexts/Auth/useAuth.js';
import api, { getApiErrorMessage } from '../../services/api.Service.js';

const CLIENT_LIST_LIMIT = 100;
const TEMPLATE_LIST_LIMIT = 100;
const MAX_STEPS = 30;
const MAX_STEP_DESCRIPTION_LENGTH = 220;

const INITIAL_FORM_DATA = Object.freeze( {
    clientId: '',
    value: '',
    startDate: '',
    endDate: ''
} );

const normalizeSpaces = ( value ) => String( value ?? '' ).trim().replace( /\s+/g, ' ' );
const normalizeEmail = ( value ) => normalizeSpaces( value ).toLowerCase();
const onlyDigits = ( value ) => String( value ?? '' ).replace( /\D/g, '' );

const currencyFormatter = new Intl.NumberFormat( 'pt-BR', {
    style: 'currency',
    currency: 'BRL'
} );

const extractClients = ( responseData ) => {
    if ( Array.isArray( responseData?.clients ) ) return responseData.clients;
    if ( Array.isArray( responseData?.data?.clients ) ) return responseData.data.clients;
    if ( Array.isArray( responseData ) ) return responseData;

    return [];
};

const extractTemplates = ( responseData ) => {
    if ( Array.isArray( responseData?.templates ) ) return responseData.templates;
    if ( Array.isArray( responseData?.data?.templates ) ) return responseData.data.templates;
    if ( Array.isArray( responseData ) ) return responseData;

    return [];
};

const normalizeStructure = ( structure ) => {
    if ( !Array.isArray( structure ) ) return [];

    return structure
        .map( ( block, index ) => ( {
            id: normalizeSpaces( block?.id ) || `contract-block-${ index + 1 }`,
            type: normalizeSpaces( block?.type ).toUpperCase() || 'FREE_TEXT',
            content: String( block?.content ?? '' )
        } ) )
        .filter( ( block ) => normalizeSpaces( block.content ) );
};

const buildFullName = ( entity ) => {
    if ( !entity ) return '';

    return normalizeSpaces(
        entity.fullName ||
        [ entity.name, entity.lastName ].filter( Boolean ).join( ' ' ) ||
        entity.name ||
        ''
    );
};

const getEntityDocument = ( entity ) => (
    entity?.document ||
    entity?.cpfCnpj ||
    entity?.cnpjCpf ||
    entity?.documentNumber ||
    ''
);

const getEntityPhone = ( entity ) => entity?.phone || entity?.telephone || entity?.phoneNumber || '';

const formatDocument = ( value ) => {
    const digits = onlyDigits( value );

    if ( digits.length === 11 ) {
        return digits.replace( /(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4' );
    }

    if ( digits.length === 14 ) {
        return digits.replace( /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5' );
    }

    return normalizeSpaces( value ) || 'Não informado';
};

const formatPhone = ( value ) => {
    const digits = onlyDigits( value );

    if ( digits.length === 10 ) {
        return digits.replace( /(\d{2})(\d{4})(\d{4})/, '($1) $2-$3' );
    }

    if ( digits.length === 11 ) {
        return digits.replace( /(\d{2})(\d{5})(\d{4})/, '($1) $2-$3' );
    }

    return normalizeSpaces( value ) || 'Não informado';
};

const formatZipCode = ( value ) => {
    const digits = onlyDigits( value );

    if ( digits.length === 8 ) {
        return digits.replace( /(\d{5})(\d{3})/, '$1-$2' );
    }

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

    return [ line1, line2, line3 ].filter( Boolean ).join( ' • ' );
};

const parseInputDate = ( value ) => {
    if ( !value ) return null;

    const date = new Date( `${ value }T00:00:00` );
    return Number.isNaN( date.getTime() ) ? null : date;
};

const parseCurrencyInput = ( value ) => {
    const normalizedValue = String( value ?? '' )
        .replace( /\./g, '' )
        .replace( ',', '.' )
        .replace( /[^\d.]/g, '' );

    const numberValue = Number( normalizedValue );

    return Number.isFinite( numberValue ) ? numberValue : Number.NaN;
};

const getTodayInputValue = () => {
    const today = new Date();
    today.setMinutes( today.getMinutes() - today.getTimezoneOffset() );
    return today.toISOString().slice( 0, 10 );
};

const findPreferredClientId = ( clients, preferredClientId, preferredClientEmail ) => {
    if ( preferredClientId && clients.some( ( client ) => client.id === preferredClientId ) ) {
        return preferredClientId;
    }

    const normalizedEmail = normalizeEmail( preferredClientEmail );

    if ( normalizedEmail ) {
        const matchedClient = clients.find( ( client ) => normalizeEmail( client.email ) === normalizedEmail );
        return matchedClient?.id || '';
    }

    return '';
};

const validateForm = ( {
    formData,
    selectedClient,
    selectedClientDocument,
    steps,
    hasSavedSignature,
    signaturePad
} ) => {
    if ( !selectedClient ) return 'Selecione um cliente cadastrado para gerar o contrato.';
    if ( !selectedClientDocument ) return 'O cliente selecionado ainda não possui CPF/CNPJ disponível. Atualize o cadastro do cliente antes de criar o contrato.';

    const projectValue = parseCurrencyInput( formData.value );

    if ( Number.isNaN( projectValue ) || projectValue <= 0 ) return 'Informe um valor válido para o projeto.';

    const startDate = parseInputDate( formData.startDate );
    const endDate = parseInputDate( formData.endDate );
    const today = parseInputDate( getTodayInputValue() );

    if ( !startDate || !endDate ) return 'Informe a data de início e a data de fim do projeto.';
    if ( endDate <= startDate ) return 'A data de fim do projeto deve ser posterior à data de início.';
    if ( startDate < today ) return 'A data de início do projeto não pode ser anterior à data de hoje.';
    if ( !Array.isArray( steps ) || steps.length === 0 ) return 'O contrato precisa ter pelo menos uma etapa.';
    if ( steps.length > MAX_STEPS ) return `O contrato pode possuir no máximo ${ MAX_STEPS } etapas.`;

    for ( const [ index, step ] of steps.entries() ) {
        const description = normalizeSpaces( step.description );
        const deliveryDate = parseInputDate( step.deliveryDate );

        if ( !description || !deliveryDate ) return `Preencha a descrição e a data da etapa ${ index + 1 }.`;
        if ( description.length > MAX_STEP_DESCRIPTION_LENGTH ) return `A descrição da etapa ${ index + 1 } ultrapassou ${ MAX_STEP_DESCRIPTION_LENGTH } caracteres.`;
        if ( deliveryDate < startDate || deliveryDate > endDate ) return `O prazo da etapa "${ description }" deve estar entre a data de início e a data de fim do projeto.`;
    }

    if ( !hasSavedSignature && ( !signaturePad || signaturePad.isEmpty() ) ) {
        return 'A assinatura do freelancer é obrigatória.';
    }

    return '';
};

const InfoPill = ( { icon: Icon, label, value, warning = false } ) => (
    <div className={`flex items-start gap-3 rounded-2xl border bg-white p-4 dark:bg-slate-900 ${ warning
        ? 'border-amber-200 text-amber-800 dark:border-amber-400/20 dark:text-amber-200'
        : 'border-slate-200 text-slate-800 dark:border-slate-800 dark:text-slate-200'
        }`}
    >
        <Icon className={`mt-0.5 h-4 w-4 ${ warning ? 'text-amber-600 dark:text-amber-300' : 'text-blue-600 dark:text-blue-300' }`} aria-hidden="true" />
        <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{label}</p>
            <p className="font-bold">{value}</p>
        </div>
    </div>
);

const LoadingNotice = ( { label } ) => (
    <div className="flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {label}
    </div>
);

const cardClasses = 'rounded-[2rem] border border-slate-200/80 bg-white/85 p-6 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/75 dark:shadow-black/20 sm:p-8';
const inputClasses = 'w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-800 dark:bg-slate-950/70 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:bg-slate-950 dark:disabled:bg-slate-900 dark:disabled:text-slate-500';
const labelClasses = 'mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-300';
const sectionTitleClasses = 'flex items-center border-b border-slate-200/80 pb-3 text-lg font-black text-slate-950 dark:border-slate-800 dark:text-white';

const ContractCreationFormComp = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const canvasRef = useRef( null );
    const signaturePadRef = useRef( null );
    const { user, updateUser } = useAuth();

    const preferredClientId = String( location.state?.preferredClientId || '' );
    const preferredClientEmail = String( location.state?.preferredClientEmail || '' );

    const [ isSubmitting, setIsSubmitting ] = useState( false );
    const [ isLoadingClients, setIsLoadingClients ] = useState( true );
    const [ isLoadingTemplates, setIsLoadingTemplates ] = useState( true );
    const [ clients, setClients ] = useState( [] );
    const [ templates, setTemplates ] = useState( [] );
    const [ selectedTemplateId, setSelectedTemplateId ] = useState( '' );
    const [ contractStructure, setContractStructure ] = useState( [] );
    const [ formData, setFormData ] = useState( INITIAL_FORM_DATA );
    const [ steps, setSteps ] = useState( [ { description: '', deliveryDate: '' } ] );

    const hasSavedSignature = Boolean( user?.signature );

    const selectedClient = useMemo(
        () => clients.find( ( client ) => client.id === formData.clientId ) || null,
        [ clients, formData.clientId ]
    );

    const selectedClientDocument = getEntityDocument( selectedClient );
    const selectedClientAddress = buildAddressText( selectedClient );
    const selectedClientName = buildFullName( selectedClient ) || selectedClient?.email || 'Cliente sem nome';
    const selectedTemplate = useMemo(
        () => templates.find( ( template ) => template.id === selectedTemplateId ) || null,
        [ selectedTemplateId, templates ]
    );

    const projectValue = parseCurrencyInput( formData.value );
    const canAddMoreSteps = steps.length < MAX_STEPS;

    const loadClients = useCallback( async ( { signal } = {} ) => {
        try {
            setIsLoadingClients( true );

            const response = await api.get( '/clients', {
                signal,
                params: {
                    page: 1,
                    limit: CLIENT_LIST_LIMIT
                }
            } );

            if ( signal?.aborted ) return;

            const clientList = extractClients( response.data );
            const nextClientId = findPreferredClientId( clientList, preferredClientId, preferredClientEmail );

            setClients( clientList );

            if ( nextClientId ) {
                setFormData( ( currentFormData ) => ( {
                    ...currentFormData,
                    clientId: currentFormData.clientId || nextClientId
                } ) );
            }
        } catch ( requestError ) {
            if ( signal?.aborted ) return;
            toast.error( getApiErrorMessage( requestError, 'Erro ao carregar a lista de clientes.' ) );
        } finally {
            if ( !signal?.aborted ) setIsLoadingClients( false );
        }
    }, [ preferredClientEmail, preferredClientId ] );

    const loadTemplates = useCallback( async ( { signal } = {} ) => {
        try {
            setIsLoadingTemplates( true );

            const response = await api.get( '/templates', {
                signal,
                params: {
                    page: 1,
                    limit: TEMPLATE_LIST_LIMIT
                }
            } );

            if ( signal?.aborted ) return;

            setTemplates( extractTemplates( response.data ) );
        } catch ( requestError ) {
            if ( signal?.aborted ) return;
            toast.error( getApiErrorMessage( requestError, 'Não foi possível carregar os seus modelos de contrato.' ) );
        } finally {
            if ( !signal?.aborted ) setIsLoadingTemplates( false );
        }
    }, [] );

    useEffect( () => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout( () => {
            void loadClients( { signal: controller.signal } );
            void loadTemplates( { signal: controller.signal } );
        }, 0 );

        return () => {
            window.clearTimeout( timeoutId );
            controller.abort();
        };
    }, [ loadClients, loadTemplates ] );

    useEffect( () => {
        if ( hasSavedSignature || !canvasRef.current ) return undefined;

        const canvas = canvasRef.current;
        const pad = new SignaturePad( canvas, {
            penColor: 'rgb(15, 23, 42)',
            backgroundColor: 'rgb(248, 250, 252)'
        } );

        signaturePadRef.current = pad;

        const resizeCanvas = () => {
            const ratio = Math.max( window.devicePixelRatio || 1, 1 );
            const context = canvas.getContext( '2d' );

            canvas.width = canvas.offsetWidth * ratio;
            canvas.height = canvas.offsetHeight * ratio;

            context.setTransform( 1, 0, 0, 1, 0, 0 );
            context.scale( ratio, ratio );
            pad.clear();
        };

        resizeCanvas();
        window.addEventListener( 'resize', resizeCanvas );

        return () => {
            window.removeEventListener( 'resize', resizeCanvas );
            pad.off();
            signaturePadRef.current = null;
        };
    }, [ hasSavedSignature ] );

    const handleInputChange = ( event ) => {
        const { name, value } = event.target;
        setFormData( ( currentFormData ) => ( { ...currentFormData, [ name ]: value } ) );
    };

    const handleTemplateChange = ( event ) => {
        const templateId = event.target.value;
        const template = templates.find( ( currentTemplate ) => currentTemplate.id === templateId );

        setSelectedTemplateId( templateId );
        setContractStructure( normalizeStructure( template?.structure ) );
    };

    const handleStepChange = ( index, field, value ) => {
        setSteps( ( currentSteps ) => currentSteps.map( ( step, currentIndex ) => (
            currentIndex === index ? { ...step, [ field ]: value } : step
        ) ) );
    };

    const addStep = () => {
        if ( !canAddMoreSteps ) {
            toast.error( `O contrato pode possuir no máximo ${ MAX_STEPS } etapas.` );
            return;
        }

        setSteps( ( currentSteps ) => [ ...currentSteps, { description: '', deliveryDate: '' } ] );
    };

    const removeStep = ( index ) => {
        if ( steps.length === 1 ) {
            toast.error( 'O contrato precisa ter pelo menos uma etapa.' );
            return;
        }

        setSteps( ( currentSteps ) => currentSteps.filter( ( _step, currentIndex ) => currentIndex !== index ) );
    };

    const clearSignature = () => {
        signaturePadRef.current?.clear();
    };

    const handleSubmit = async ( event ) => {
        event.preventDefault();

        const validationError = validateForm( {
            formData,
            selectedClient,
            selectedClientDocument,
            steps,
            hasSavedSignature,
            signaturePad: signaturePadRef.current
        } );

        if ( validationError ) {
            toast.error( validationError );
            return;
        }

        const signature = hasSavedSignature ? null : signaturePadRef.current?.toDataURL( 'image/png' );
        const value = parseCurrencyInput( formData.value );

        setIsSubmitting( true );

        try {
            const payload = {
                clientId: formData.clientId,
                value,
                startDate: formData.startDate,
                endDate: formData.endDate,
                steps: steps.map( ( step ) => ( {
                    description: normalizeSpaces( step.description ),
                    deliveryDate: step.deliveryDate
                } ) ),
                structure: contractStructure,
                ...( signature && { contractedSignature: signature } )
            };

            const response = await api.post( '/contracts', payload );
            const createdContract = response.data?.contract || response.data?.data?.contract;

            if ( signature ) {
                updateUser( { signature: true } );
            }

            toast.success( 'Contrato gerado com sucesso!' );

            if ( createdContract?.id ) {
                navigate( `/contracts/${ createdContract.id }`, { replace: true } );
                return;
            }

            navigate( '/', { replace: true } );
        } catch ( requestError ) {
            toast.error( getApiErrorMessage( requestError, 'Erro ao gerar o contrato.' ) );
        } finally {
            setIsSubmitting( false );
        }
    };

    return (
        <div className="mx-auto max-w-5xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <section className="relative mb-6 overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/85 p-6 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/75 dark:shadow-black/20">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.12),transparent_30%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_32%)]" />
                <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
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
                                Novo contrato
                            </p>
                            <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                                <FileSignature className="h-7 w-7 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                                Configurar Novo Contrato
                            </h1>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                                Selecione o cliente vinculado, aplique um modelo e defina valores, prazos, entregas e assinatura do prestador.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => navigate( '/clients/new' )}
                        className="inline-flex items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-black text-blue-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-100 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200 dark:hover:bg-blue-500/15"
                    >
                        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                        Cadastrar cliente
                    </button>
                </div>
            </section>

            <form onSubmit={handleSubmit} className="space-y-6">
                <section className={cardClasses}>
                    <h2 className={sectionTitleClasses}>
                        <User className="mr-2 h-5 w-5 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                        Informações do Contratante
                    </h2>

                    <div className="mt-6 space-y-2">
                        <label htmlFor="clientId" className={labelClasses}>Cliente cadastrado</label>
                        <select
                            id="clientId"
                            name="clientId"
                            value={formData.clientId}
                            onChange={handleInputChange}
                            required
                            disabled={isLoadingClients || isSubmitting}
                            className={inputClasses}
                        >
                            <option value="">
                                {isLoadingClients ? 'Carregando clientes...' : 'Selecione um cliente...'}
                            </option>
                            {clients.map( ( client ) => (
                                <option key={client.id} value={client.id}>
                                    {buildFullName( client ) || client.email} {client.email ? `• ${ client.email }` : ''}
                                </option>
                            ) )}
                        </select>
                        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                            CPF/CNPJ, telefone e endereço vêm do cadastro seguro do cliente. Clientes cadastrados em outro vínculo agora também podem ser vinculados ao seu perfil.
                        </p>
                    </div>

                    {isLoadingClients && <div className="mt-4"><LoadingNotice label="Buscando clientes vinculados..." /></div>}

                    {preferredClientEmail && !formData.clientId && !isLoadingClients && (
                        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                            <p>
                                O cliente vindo do cadastro anterior não foi encontrado na lista atual. Atualize a página ou tente selecionar manualmente pelo e-mail <strong>{preferredClientEmail}</strong>.
                            </p>
                        </div>
                    )}

                    {selectedClient && (
                        <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Cliente selecionado</p>
                                    <p className="text-lg font-black text-slate-950 dark:text-white">{selectedClientName}</p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">{selectedClient.email || 'E-mail não informado'}</p>
                                </div>

                                {!selectedClientDocument && (
                                    <span className="w-fit rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-black text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-300">
                                        CPF/CNPJ não disponível
                                    </span>
                                )}
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
                                <InfoPill
                                    icon={IdCard}
                                    label="CPF/CNPJ"
                                    value={selectedClientDocument ? formatDocument( selectedClientDocument ) : 'Atualize o perfil do cliente'}
                                    warning={!selectedClientDocument}
                                />
                                <InfoPill
                                    icon={Phone}
                                    label="Telefone"
                                    value={formatPhone( getEntityPhone( selectedClient ) )}
                                />
                                <div className="md:col-span-2">
                                    <InfoPill
                                        icon={MapPin}
                                        label="Endereço"
                                        value={selectedClientAddress || 'Não informado'}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </section>

                <section className={cardClasses}>
                    <h2 className={sectionTitleClasses}>
                        <Layers className="mr-2 h-5 w-5 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                        Estrutura do Documento
                    </h2>

                    <div className="mt-6 space-y-4">
                        <label htmlFor="templateId" className="block">
                            <span className={labelClasses}>Padrão de Contrato</span>
                            <select
                                id="templateId"
                                value={selectedTemplateId}
                                onChange={handleTemplateChange}
                                disabled={isLoadingTemplates || isSubmitting}
                                className={inputClasses}
                            >
                                <option value="">
                                    {isLoadingTemplates ? 'Carregando modelos...' : '-- Iniciar contrato com a base padrão --'}
                                </option>
                                {templates.map( ( template ) => (
                                    <option key={template.id} value={template.id}>{template.title}</option>
                                ) )}
                            </select>
                        </label>

                        {isLoadingTemplates && <LoadingNotice label="Carregando templates disponíveis..." />}

                        {selectedTemplate && contractStructure.length > 0 && (
                            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 animate-in fade-in dark:border-blue-400/20 dark:bg-blue-500/10">
                                <p className="text-sm font-bold text-blue-700 dark:text-blue-200">
                                    <strong>{selectedTemplate.title}</strong> aplicado com {contractStructure.length} blocos estruturais.
                                </p>
                            </div>
                        )}
                    </div>
                </section>

                <section className={cardClasses}>
                    <h2 className={sectionTitleClasses}>
                        <DollarSign className="mr-2 h-5 w-5 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                        Detalhes do Projeto
                    </h2>

                    <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
                        <label>
                            <span className={labelClasses}>Valor Total do Projeto</span>
                            <div className="relative">
                                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 font-bold text-slate-400">R$</span>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    name="value"
                                    value={formData.value}
                                    onChange={handleInputChange}
                                    required
                                    disabled={isSubmitting}
                                    className={`${ inputClasses } pl-12`}
                                    placeholder="8.500,00"
                                />
                            </div>
                            {Number.isFinite( projectValue ) && projectValue > 0 && (
                                <p className="mt-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                                    Valor interpretado: {currencyFormatter.format( projectValue )}
                                </p>
                            )}
                        </label>

                        <label>
                            <span className={labelClasses}>Data de Início</span>
                            <div className="relative">
                                <Calendar className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                <input
                                    type="date"
                                    name="startDate"
                                    value={formData.startDate}
                                    min={getTodayInputValue()}
                                    onChange={handleInputChange}
                                    required
                                    disabled={isSubmitting}
                                    className={`${ inputClasses } pl-11`}
                                />
                            </div>
                        </label>

                        <label>
                            <span className={labelClasses}>Data de Fim</span>
                            <div className="relative">
                                <Calendar className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                <input
                                    type="date"
                                    name="endDate"
                                    value={formData.endDate}
                                    min={formData.startDate || getTodayInputValue()}
                                    onChange={handleInputChange}
                                    required
                                    disabled={isSubmitting}
                                    className={`${ inputClasses } pl-11`}
                                />
                            </div>
                        </label>
                    </div>
                </section>

                <section className={cardClasses}>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3 dark:border-slate-800">
                        <h2 className="flex items-center text-lg font-black text-slate-950 dark:text-white">
                            <WalletCards className="mr-2 h-5 w-5 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                            Cronograma e Entregas
                        </h2>
                        <button
                            type="button"
                            onClick={addStep}
                            disabled={!canAddMoreSteps || isSubmitting}
                            className="inline-flex items-center gap-1 rounded-xl bg-blue-50 px-3 py-2 text-sm font-black text-blue-700 transition-colors hover:bg-blue-100 focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
                        >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Nova Etapa
                        </button>
                    </div>

                    <div className="mt-6 space-y-4">
                        {steps.map( ( step, index ) => (
                            <div
                                key={`step-${ index }`}
                                className="flex flex-col items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition-all duration-200 hover:border-blue-200 hover:bg-white dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-blue-500/30 dark:hover:bg-slate-900 sm:flex-row"
                            >
                                <label className="w-full flex-1">
                                    <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Descrição da Entrega</span>
                                    <input
                                        type="text"
                                        value={step.description}
                                        onChange={( event ) => handleStepChange( index, 'description', event.target.value )}
                                        required
                                        disabled={isSubmitting}
                                        maxLength={MAX_STEP_DESCRIPTION_LENGTH}
                                        className={inputClasses}
                                        placeholder="Ex: Entrega do layout Figma"
                                    />
                                </label>

                                <label className="w-full sm:w-44">
                                    <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Prazo Final</span>
                                    <input
                                        type="date"
                                        value={step.deliveryDate}
                                        min={formData.startDate || getTodayInputValue()}
                                        max={formData.endDate || undefined}
                                        onChange={( event ) => handleStepChange( index, 'deliveryDate', event.target.value )}
                                        required
                                        disabled={isSubmitting}
                                        className={inputClasses}
                                    />
                                </label>

                                <div className="flex w-full justify-end sm:w-auto sm:pt-7">
                                    <button
                                        type="button"
                                        onClick={() => removeStep( index )}
                                        disabled={isSubmitting}
                                        className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-4 focus:ring-red-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                                        title="Remover etapa"
                                        aria-label={`Remover etapa ${ index + 1 }`}
                                    >
                                        <Trash2 className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                        ) )}
                    </div>
                </section>

                <section className={cardClasses}>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3 dark:border-slate-800">
                        <h2 className="flex items-center text-lg font-black text-slate-950 dark:text-white">
                            <FileSignature className="mr-2 h-5 w-5 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                            Assinatura do Prestador
                        </h2>

                        {!hasSavedSignature && (
                            <button
                                type="button"
                                onClick={clearSignature}
                                disabled={isSubmitting}
                                className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-slate-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                            >
                                <Eraser className="h-4 w-4" aria-hidden="true" />
                                Limpar painel
                            </button>
                        )}
                    </div>

                    {hasSavedSignature ? (
                        <div className="mt-6 flex items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                            <p className="flex items-center gap-2 font-bold">
                                <Check className="h-5 w-5" aria-hidden="true" />
                                A sua assinatura já está salva e será anexada automaticamente.
                            </p>
                        </div>
                    ) : (
                        <div className="relative mt-6 overflow-hidden rounded-[1.5rem] border-2 border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
                            <canvas
                                ref={canvasRef}
                                className="h-48 w-full cursor-crosshair touch-none"
                                style={{ width: '100%', height: '192px' }}
                                aria-label="Painel para assinatura do freelancer"
                            />
                            <div className="pointer-events-none absolute bottom-3 left-0 right-0 text-center">
                                <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-black uppercase tracking-widest text-slate-400 dark:bg-slate-950 dark:text-slate-500">
                                    Assine no espaço acima
                                </span>
                            </div>
                        </div>
                    )}
                </section>

                <div className="flex flex-col-reverse justify-end gap-3 pt-2 sm:flex-row">
                    <button
                        type="button"
                        onClick={() => navigate( '/' )}
                        disabled={isSubmitting}
                        className="rounded-2xl px-5 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-slate-500/10 disabled:cursor-not-allowed disabled:opacity-70 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                        Cancelar
                    </button>

                    <button
                        type="submit"
                        disabled={isSubmitting || isLoadingClients}
                        className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-8 py-4 text-lg font-black text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/30 focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 sm:w-auto"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
                                Processando contrato...
                            </>
                        ) : (
                            'Gerar e Enviar Contrato'
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ContractCreationFormComp;
