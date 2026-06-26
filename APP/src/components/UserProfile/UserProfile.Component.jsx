import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
    AlertTriangle,
    BadgeCheck,
    Building2,
    Hash,
    IdCard,
    Loader2,
    Mail,
    Map as MapIcon,
    MapPin,
    Phone,
    RefreshCw,
    Save,
    ShieldCheck,
    Sparkles,
    User,
    UserRoundCog
} from 'lucide-react';
import { useAuth } from '../../contexts/Auth/useAuth.js';
import api, { getApiErrorMessage } from '../../services/api.Service.js';

const INITIAL_PROFILE = Object.freeze( {
    name: '',
    lastName: '',
    email: '',
    role: '',
    document: '',
    phone: '',
    addressStreet: '',
    addressCity: '',
    addressState: '',
    addressNumber: '',
    addressZipCode: '',
    updatedAt: ''
} );

const ROLE_LABELS = Object.freeze( {
    FREELANCER: 'Freelancer',
    CLIENT: 'Cliente'
} );

const dateTimeFormatter = new Intl.DateTimeFormat( 'pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
} );

const onlyDigits = ( value ) => String( value ?? '' ).replace( /\D/g, '' );
const normalizeSpaces = ( value ) => String( value ?? '' ).trim().replace( /\s+/g, ' ' );
const normalizeRole = ( value ) => normalizeSpaces( value ).toUpperCase();

const isValidCPF = ( rawValue ) => {
    const digits = onlyDigits( rawValue );

    if ( !/^\d{11}$/.test( digits ) ) return false;
    if ( /^(\d)\1{10}$/.test( digits ) ) return false;

    const calculateDigit = ( factor ) => {
        let total = 0;

        for ( let index = 0; index < factor - 1; index += 1 ) {
            total += Number( digits[ index ] ) * ( factor - index );
        }

        const rest = ( total * 10 ) % 11;
        return rest === 10 ? 0 : rest;
    };

    return calculateDigit( 10 ) === Number( digits[ 9 ] ) &&
        calculateDigit( 11 ) === Number( digits[ 10 ] );
};

const isValidCNPJ = ( rawValue ) => {
    const digits = onlyDigits( rawValue );

    if ( !/^\d{14}$/.test( digits ) ) return false;
    if ( /^(\d)\1{13}$/.test( digits ) ) return false;

    const calculateDigit = ( baseLength ) => {
        const weights = baseLength === 12
            ? [ 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2 ]
            : [ 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2 ];

        const total = weights.reduce(
            ( sum, weight, index ) => sum + Number( digits[ index ] ) * weight,
            0
        );

        const rest = total % 11;
        return rest < 2 ? 0 : 11 - rest;
    };

    return calculateDigit( 12 ) === Number( digits[ 12 ] ) &&
        calculateDigit( 13 ) === Number( digits[ 13 ] );
};

const isValidDocument = ( value ) => {
    const digits = onlyDigits( value );

    if ( !digits ) return true;
    if ( digits.length === 11 ) return isValidCPF( digits );
    if ( digits.length === 14 ) return isValidCNPJ( digits );

    return false;
};

const isValidName = ( value, maxLength ) => {
    const normalized = normalizeSpaces( value );

    return normalized.length >= 2 &&
        normalized.length <= maxLength &&
        /^[\p{L}][\p{L}\p{M}' -]*$/u.test( normalized );
};

const formatCPF = ( value ) => {
    const digits = onlyDigits( value ).slice( 0, 11 );

    return digits
        .replace( /(\d{3})(\d)/, '$1.$2' )
        .replace( /(\d{3})(\d)/, '$1.$2' )
        .replace( /(\d{3})(\d{1,2})$/, '$1-$2' );
};

const formatCNPJ = ( value ) => {
    const digits = onlyDigits( value ).slice( 0, 14 );

    return digits
        .replace( /^(\d{2})(\d)/, '$1.$2' )
        .replace( /^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3' )
        .replace( /\.(\d{3})(\d)/, '.$1/$2' )
        .replace( /(\d{4})(\d)/, '$1-$2' );
};

const formatDocument = ( value ) => {
    const digits = onlyDigits( value );

    if ( digits.length > 11 ) return formatCNPJ( digits );
    return formatCPF( digits );
};

const formatPhone = ( value ) => {
    const digits = onlyDigits( value ).slice( 0, 11 );

    if ( digits.length <= 10 ) {
        return digits
            .replace( /^(\d{2})(\d)/, '($1) $2' )
            .replace( /(\d{4})(\d)/, '$1-$2' );
    }

    return digits
        .replace( /^(\d{2})(\d)/, '($1) $2' )
        .replace( /(\d{5})(\d)/, '$1-$2' );
};

const formatZipCode = ( value ) => {
    const digits = onlyDigits( value ).slice( 0, 8 );
    return digits.replace( /^(\d{5})(\d)/, '$1-$2' );
};

const formatUpdatedAt = ( value ) => {
    if ( !value ) return 'Salve para registrar a primeira atualização do perfil.';

    const date = new Date( value );

    if ( Number.isNaN( date.getTime() ) ) return 'Última atualização indisponível.';

    return `Última atualização: ${ dateTimeFormatter.format( date ) }`;
};

const extractProfile = ( responseData ) => (
    responseData?.profile ||
    responseData?.data?.profile ||
    responseData?.user ||
    responseData?.data?.user ||
    null
);

const getProfileState = ( profileData ) => ( {
    name: profileData?.name || '',
    lastName: profileData?.lastName || '',
    email: profileData?.email || '',
    role: profileData?.role || '',
    document: formatDocument( profileData?.document || '' ),
    phone: formatPhone( profileData?.phone || '' ),
    addressStreet: profileData?.addressStreet || '',
    addressCity: profileData?.addressCity || '',
    addressState: profileData?.addressState || '',
    addressNumber: profileData?.addressNumber || '',
    addressZipCode: formatZipCode( profileData?.addressZipCode || '' ),
    updatedAt: profileData?.updatedAt || ''
} );

const getPublicUserPatch = ( updatedProfile, currentProfile ) => {
    const name = updatedProfile?.name ?? currentProfile.name;
    const lastName = updatedProfile?.lastName ?? currentProfile.lastName;

    return {
        name,
        lastName,
        fullName: normalizeSpaces( [ name, lastName ].filter( Boolean ).join( ' ' ) ),
        email: updatedProfile?.email ?? currentProfile.email,
        role: updatedProfile?.role ?? currentProfile.role,
        updatedAt: updatedProfile?.updatedAt ?? currentProfile.updatedAt
    };
};

const getPayload = ( profile ) => ( {
    name: normalizeSpaces( profile.name ),
    lastName: normalizeSpaces( profile.lastName ),
    document: onlyDigits( profile.document ),
    phone: onlyDigits( profile.phone ),
    addressStreet: normalizeSpaces( profile.addressStreet ),
    addressCity: normalizeSpaces( profile.addressCity ),
    addressState: normalizeSpaces( profile.addressState ).toUpperCase(),
    addressNumber: normalizeSpaces( profile.addressNumber ),
    addressZipCode: onlyDigits( profile.addressZipCode )
} );

const validateBeforeSubmit = ( profile ) => {
    const name = normalizeSpaces( profile.name );
    const lastName = normalizeSpaces( profile.lastName );
    const documentDigits = onlyDigits( profile.document );
    const phoneDigits = onlyDigits( profile.phone );
    const zipCodeDigits = onlyDigits( profile.addressZipCode );
    const state = normalizeSpaces( profile.addressState ).toUpperCase();
    const addressStreet = normalizeSpaces( profile.addressStreet );
    const addressCity = normalizeSpaces( profile.addressCity );
    const addressNumber = normalizeSpaces( profile.addressNumber );

    if ( !isValidName( name, 80 ) ) return 'Informe um nome válido, com 2 a 80 caracteres e sem números.';
    if ( lastName && !isValidName( lastName, 120 ) ) return 'Informe um sobrenome válido, com até 120 caracteres e sem números.';
    if ( documentDigits && !isValidDocument( documentDigits ) ) return 'Informe um CPF ou CNPJ válido.';
    if ( phoneDigits && !/^\d{10,11}$/.test( phoneDigits ) ) return 'Telefone deve possuir DDD e 10 ou 11 dígitos.';
    if ( state && !/^[A-Z]{2}$/.test( state ) ) return 'Estado deve ser a UF com 2 letras, exemplo: SP.';
    if ( zipCodeDigits && !/^\d{8}$/.test( zipCodeDigits ) ) return 'CEP deve possuir 8 dígitos.';
    if ( addressStreet && ( addressStreet.length < 3 || addressStreet.length > 120 ) ) return 'O nome da rua deve possuir entre 3 e 120 caracteres.';
    if ( addressCity && ( addressCity.length < 2 || addressCity.length > 80 ) ) return 'A cidade deve possuir entre 2 e 80 caracteres.';
    if ( addressCity && !/^[\p{L}\p{M}' .-]+$/u.test( addressCity ) ) return 'Informe uma cidade válida, sem números.';
    if ( addressNumber && ( addressNumber.length > 20 || !/^[0-9A-Za-zÀ-ÿ./ -]+$/u.test( addressNumber ) ) ) return 'Informe um número de endereço válido, com até 20 caracteres.';

    return '';
};

const InputField = ( {
    label,
    icon: Icon,
    helper,
    className = '',
    inputClassName = '',
    ...props
} ) => (
    <label className={`block ${ className }`}>
        <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            {label}
        </span>

        <div className="relative">
            {Icon && (
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                    <Icon className="h-5 w-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                </div>
            )}

            <input
                {...props}
                className={`w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-3 text-sm font-medium text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-800 dark:bg-slate-950/70 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:bg-slate-950 dark:disabled:bg-slate-900 dark:disabled:text-slate-500 ${ Icon ? 'pl-11' : 'pl-4' } pr-4 ${ inputClassName }`}
            />
        </div>

        {helper && (
            <span className="mt-1.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">
                {helper}
            </span>
        )}
    </label>
);

const SectionTitle = ( { title, description } ) => (
    <div>
        <h2 className="text-lg font-black text-slate-950 dark:text-white">{title}</h2>
        {description && (
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {description}
            </p>
        )}
    </div>
);

const LoadingState = () => (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[2rem] border border-slate-200 bg-white/80 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-blue-600 dark:text-blue-400" aria-hidden="true" />
        <p className="font-bold text-slate-700 dark:text-slate-300">Carregando perfil seguro...</p>
    </div>
);

const ErrorState = ( { message, onRetry } ) => (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[2rem] border border-red-200 bg-red-50/80 p-8 text-center shadow-sm backdrop-blur dark:border-red-400/20 dark:bg-red-500/10">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-300">
            <AlertTriangle className="h-8 w-8" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-black text-slate-950 dark:text-white">Não foi possível carregar seu perfil</h2>
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

const UserProfileComp = () => {
    const { updateUser } = useAuth();

    const [ profile, setProfile ] = useState( INITIAL_PROFILE );
    const [ loading, setLoading ] = useState( true );
    const [ isSaving, setIsSaving ] = useState( false );
    const [ errorMessage, setErrorMessage ] = useState( '' );

    const displayName = useMemo( () => (
        normalizeSpaces( [ profile.name, profile.lastName ].filter( Boolean ).join( ' ' ) ) || 'Meu perfil'
    ), [ profile.name, profile.lastName ] );

    const roleLabel = ROLE_LABELS[ normalizeRole( profile.role ) ] || 'Usuário';
    const documentDigits = onlyDigits( profile.document );
    const documentStatusLabel = useMemo( () => {
        if ( !documentDigits ) return 'Opcional, mas recomendado para contratos e assinatura.';
        return isValidDocument( documentDigits ) ? 'Documento aparentemente válido.' : 'Documento inválido ou incompleto.';
    }, [ documentDigits ] );

    const loadProfile = useCallback( async ( { signal } = {} ) => {
        try {
            setLoading( true );
            setErrorMessage( '' );

            const response = await api.get( '/auth/profile', { signal } );

            if ( signal?.aborted ) return;

            const profileData = extractProfile( response.data );

            if ( !profileData ) {
                throw new Error( 'A API não retornou os dados do perfil.' );
            }

            setProfile( getProfileState( profileData ) );
        } catch ( requestError ) {
            if ( signal?.aborted ) return;

            const message = getApiErrorMessage(
                requestError,
                'Não foi possível carregar os dados do perfil.'
            );

            setErrorMessage( message );
            toast.error( message, { id: 'profile-load-error' } );
        } finally {
            if ( !signal?.aborted ) setLoading( false );
        }
    }, [] );

    useEffect( () => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout( () => {
            void loadProfile( { signal: controller.signal } );
        }, 0 );

        return () => {
            window.clearTimeout( timeoutId );
            controller.abort();
        };
    }, [ loadProfile ] );

    const updateProfileField = ( fieldName, value ) => {
        setProfile( ( currentProfile ) => ( {
            ...currentProfile,
            [ fieldName ]: value
        } ) );
    };

    const handleChange = ( event ) => {
        const { name, value } = event.target;

        if ( name === 'document' ) {
            updateProfileField( name, formatDocument( value ) );
            return;
        }

        if ( name === 'phone' ) {
            updateProfileField( name, formatPhone( value ) );
            return;
        }

        if ( name === 'addressZipCode' ) {
            updateProfileField( name, formatZipCode( value ) );
            return;
        }

        if ( name === 'addressState' ) {
            updateProfileField( name, value.toUpperCase().replace( /[^A-Z]/g, '' ).slice( 0, 2 ) );
            return;
        }

        updateProfileField( name, value );
    };

    const handleSubmit = async ( event ) => {
        event.preventDefault();

        const validationError = validateBeforeSubmit( profile );

        if ( validationError ) {
            toast.error( validationError );
            return;
        }

        setIsSaving( true );

        try {
            const response = await api.patch( '/auth/profile', getPayload( profile ) );
            const updatedProfile = extractProfile( response.data );

            if ( !updatedProfile ) {
                throw new Error( 'A API não retornou o perfil atualizado.' );
            }

            setProfile( getProfileState( updatedProfile ) );
            updateUser( getPublicUserPatch( updatedProfile, profile ) );
            toast.success( response.data?.message || 'Perfil atualizado com segurança.' );
        } catch ( requestError ) {
            toast.error( getApiErrorMessage( requestError, 'Falha ao atualizar perfil.' ) );
        } finally {
            setIsSaving( false );
        }
    };

    if ( loading ) return <LoadingState />;

    if ( errorMessage ) {
        return <ErrorState message={errorMessage} onRetry={() => loadProfile()} />;
    }

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6 duration-500">
            <div className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/85 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/75 dark:shadow-black/20">
                <div className="relative overflow-hidden bg-slate-950 p-6 text-white sm:p-8">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.36),transparent_32%),linear-gradient(135deg,rgba(15,23,42,1),rgba(15,23,42,0.94))]" />

                    <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-4">
                            <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-blue-400/30 bg-blue-600/20 text-blue-200 shadow-lg shadow-blue-950/30">
                                <UserRoundCog className="h-8 w-8" aria-hidden="true" />
                            </div>

                            <div>
                                <p className="mb-1 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-blue-200">
                                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                                    Área do usuário
                                </p>
                                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{displayName}</h1>
                                <p className="mt-1 text-sm text-slate-300">{roleLabel}</p>
                            </div>
                        </div>

                        <div className="inline-flex max-w-md items-start gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                            <span>
                                CPF/CNPJ, telefone e endereço são carregados apenas nesta tela protegida e não são salvos no localStorage.
                            </span>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8 p-6 sm:p-8">
                    <section className="space-y-4">
                        <SectionTitle
                            title="Dados de identificação"
                            description="Nome e sobrenome são mantidos em colunas separadas para facilitar contratos, documentos e assinatura."
                        />

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <InputField
                                label="Nome"
                                icon={User}
                                type="text"
                                name="name"
                                value={profile.name}
                                onChange={handleChange}
                                required
                                minLength={2}
                                maxLength={80}
                                autoComplete="given-name"
                                placeholder="Ex: Pedro"
                                disabled={isSaving}
                            />

                            <InputField
                                label="Sobrenome"
                                icon={BadgeCheck}
                                type="text"
                                name="lastName"
                                value={profile.lastName}
                                onChange={handleChange}
                                maxLength={120}
                                autoComplete="family-name"
                                placeholder="Ex: Mantovani Muniz Guimarães"
                                helper="Opcional para clientes já cadastrados, mas recomendado para contratos completos."
                                disabled={isSaving}
                            />

                            <InputField
                                label="E-mail"
                                icon={Mail}
                                type="email"
                                value={profile.email}
                                disabled
                                helper="O e-mail fica bloqueado por segurança. Recomendo criar um fluxo próprio de alteração com confirmação por senha."
                            />

                            <InputField
                                label="CPF/CNPJ"
                                icon={IdCard}
                                type="text"
                                name="document"
                                value={profile.document}
                                onChange={handleChange}
                                inputMode="numeric"
                                autoComplete="off"
                                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                                helper={documentStatusLabel}
                                disabled={isSaving}
                            />
                        </div>
                    </section>

                    <section className="space-y-4 border-t border-slate-200/80 pt-6 dark:border-slate-800">
                        <SectionTitle
                            title="Contato"
                            description="Essas informações podem preencher contratos automaticamente e apoiar o relacionamento com o cliente."
                        />

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <InputField
                                label="Número de telefone"
                                icon={Phone}
                                type="tel"
                                name="phone"
                                value={profile.phone}
                                onChange={handleChange}
                                inputMode="tel"
                                autoComplete="tel"
                                placeholder="(11) 99999-9999"
                                helper="Opcional. Use DDD + número."
                                disabled={isSaving}
                            />
                        </div>
                    </section>

                    <section className="space-y-4 border-t border-slate-200/80 pt-6 dark:border-slate-800">
                        <SectionTitle
                            title="Endereço"
                            description="O endereço é salvo em partes separadas para ser reutilizado na montagem de contratos e PDFs."
                        />

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
                            <InputField
                                label="Nome da rua"
                                icon={MapPin}
                                type="text"
                                name="addressStreet"
                                value={profile.addressStreet}
                                onChange={handleChange}
                                maxLength={120}
                                autoComplete="address-line1"
                                placeholder="Ex: Avenida Paulista"
                                className="md:col-span-4"
                                disabled={isSaving}
                            />

                            <InputField
                                label="Número"
                                icon={Hash}
                                type="text"
                                name="addressNumber"
                                value={profile.addressNumber}
                                onChange={handleChange}
                                maxLength={20}
                                autoComplete="address-line2"
                                placeholder="Ex: 1000"
                                className="md:col-span-2"
                                disabled={isSaving}
                            />

                            <InputField
                                label="Cidade"
                                icon={Building2}
                                type="text"
                                name="addressCity"
                                value={profile.addressCity}
                                onChange={handleChange}
                                maxLength={80}
                                autoComplete="address-level2"
                                placeholder="Ex: São Paulo"
                                className="md:col-span-2"
                                disabled={isSaving}
                            />

                            <InputField
                                label="Estado"
                                icon={MapIcon}
                                type="text"
                                name="addressState"
                                value={profile.addressState}
                                onChange={handleChange}
                                maxLength={2}
                                autoComplete="address-level1"
                                placeholder="SP"
                                helper="Use a UF com 2 letras."
                                className="md:col-span-2"
                                disabled={isSaving}
                            />

                            <InputField
                                label="CEP"
                                icon={MapPin}
                                type="text"
                                name="addressZipCode"
                                value={profile.addressZipCode}
                                onChange={handleChange}
                                inputMode="numeric"
                                maxLength={9}
                                autoComplete="postal-code"
                                placeholder="00000-000"
                                className="md:col-span-2"
                                disabled={isSaving}
                            />
                        </div>
                    </section>

                    <div className="flex flex-col gap-4 border-t border-slate-200/80 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            {formatUpdatedAt( profile.updatedAt )}
                        </p>

                        <button
                            type="submit"
                            disabled={isSaving}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/30 focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
                        >
                            {isSaving ? (
                                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                            ) : (
                                <Save className="h-5 w-5" aria-hidden="true" />
                            )}
                            {isSaving ? 'Salvando...' : 'Salvar alterações'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UserProfileComp;
