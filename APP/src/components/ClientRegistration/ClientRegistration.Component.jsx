import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    ArrowLeft,
    Building2,
    CheckCircle2,
    Eye,
    EyeOff,
    Hash,
    IdCard,
    Loader2,
    Lock,
    Mail,
    Map as MapIcon,
    MapPin,
    Phone,
    ShieldCheck,
    Sparkles,
    User,
    UserPlus,
    WandSparkles
} from 'lucide-react';
import api, { getApiErrorMessage } from '../../services/api.Service.js';

const PASSWORD_MAX_BYTES = 72;
const MIN_PASSWORD_LENGTH = 8;

const INITIAL_FORM_DATA = Object.freeze( {
    fullName: '',
    email: '',
    password: '',
    document: '',
    phone: '',
    addressStreet: '',
    addressCity: '',
    addressState: '',
    addressNumber: '',
    addressZipCode: ''
} );

const PASSWORD_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@$!%*?&';

const onlyDigits = ( value ) => String( value ?? '' ).replace( /\D/g, '' );
const normalizeSpaces = ( value ) => String( value ?? '' ).trim().replace( /\s+/g, ' ' );
const normalizeEmail = ( value ) => normalizeSpaces( value ).toLowerCase();

const getUtf8Bytes = ( value ) => {
    if ( typeof TextEncoder !== 'undefined' ) {
        return new TextEncoder().encode( String( value ?? '' ) ).length;
    }

    return String( value ?? '' ).length;
};

const isValidEmail = ( value ) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test( normalizeEmail( value ) );

const isValidName = ( value ) => {
    const normalized = normalizeSpaces( value );

    return (
        normalized.length >= 2 &&
        normalized.length <= 140 &&
        /^[\p{L}][\p{L}\p{M}' -]*$/u.test( normalized )
    );
};

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
    return digits.length > 11 ? formatCNPJ( digits ) : formatCPF( digits );
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

const buildTemporaryPassword = () => {
    const randomValues = new Uint32Array( 16 );

    if ( globalThis.crypto?.getRandomValues ) {
        globalThis.crypto.getRandomValues( randomValues );
    } else {
        const timestampSeed = Date.now().toString( 36 );

        return `Cliente@${ timestampSeed }!`;
    }

    return Array.from( randomValues )
        .map( ( value ) => PASSWORD_CHARSET[ value % PASSWORD_CHARSET.length ] )
        .join( '' );
};

const getPasswordScore = ( password ) => {
    const normalized = String( password ?? '' );

    if ( !normalized ) return 0;

    const checks = [
        normalized.length >= MIN_PASSWORD_LENGTH,
        /[A-Z]/.test( normalized ),
        /[a-z]/.test( normalized ),
        /\d/.test( normalized ),
        /[^A-Za-z0-9]/.test( normalized )
    ];

    return checks.filter( Boolean ).length;
};

const getPasswordStrengthLabel = ( score ) => {
    if ( score >= 5 ) return 'forte';
    if ( score >= 4 ) return 'boa';
    if ( score >= 3 ) return 'média';
    if ( score > 0 ) return 'fraca';

    return 'não informada';
};

const getSubmitPayload = ( formData ) => {
    const payload = {
        name: normalizeSpaces( formData.fullName ),
        email: normalizeEmail( formData.email ),
        password: String( formData.password ?? '' )
    };

    const document = onlyDigits( formData.document );
    const phone = onlyDigits( formData.phone );
    const addressStreet = normalizeSpaces( formData.addressStreet );
    const addressCity = normalizeSpaces( formData.addressCity );
    const addressState = normalizeSpaces( formData.addressState ).toUpperCase();
    const addressNumber = normalizeSpaces( formData.addressNumber );
    const addressZipCode = onlyDigits( formData.addressZipCode );

    if ( document ) payload.document = document;
    if ( phone ) payload.phone = phone;
    if ( addressStreet ) payload.addressStreet = addressStreet;
    if ( addressCity ) payload.addressCity = addressCity;
    if ( addressState ) payload.addressState = addressState;
    if ( addressNumber ) payload.addressNumber = addressNumber;
    if ( addressZipCode ) payload.addressZipCode = addressZipCode;

    return payload;
};

const validateBeforeSubmit = ( formData ) => {
    const fullName = normalizeSpaces( formData.fullName );
    const nameParts = fullName.split( ' ' ).filter( Boolean );
    const email = normalizeEmail( formData.email );
    const password = String( formData.password ?? '' );
    const phoneDigits = onlyDigits( formData.phone );
    const zipCodeDigits = onlyDigits( formData.addressZipCode );
    const state = normalizeSpaces( formData.addressState ).toUpperCase();
    const addressStreet = normalizeSpaces( formData.addressStreet );
    const addressCity = normalizeSpaces( formData.addressCity );
    const addressNumber = normalizeSpaces( formData.addressNumber );

    if ( nameParts.length < 2 ) return 'Informe o nome completo do cliente, com nome e sobrenome.';
    if ( !nameParts.every( isValidName ) ) return 'Nome e sobrenome devem conter apenas letras, espaços, apóstrofo ou hífen.';
    if ( !isValidEmail( email ) || email.length > 254 ) return 'Informe um e-mail válido para o cliente.';
    if ( password.length < MIN_PASSWORD_LENGTH ) return 'A senha temporária deve possuir no mínimo 8 caracteres.';
    if ( getUtf8Bytes( password ) > PASSWORD_MAX_BYTES ) return 'A senha deve possuir no máximo 72 bytes para ser processada com segurança.';
    if ( !isValidDocument( formData.document ) ) return 'Informe um CPF ou CNPJ válido.';
    if ( phoneDigits && !/^\d{10,11}$/.test( phoneDigits ) ) return 'Telefone deve possuir DDD e 10 ou 11 dígitos.';
    if ( addressStreet && ( addressStreet.length < 3 || addressStreet.length > 120 ) ) return 'O nome da rua deve possuir entre 3 e 120 caracteres.';
    if ( addressCity && ( addressCity.length < 2 || addressCity.length > 80 ) ) return 'A cidade deve possuir entre 2 e 80 caracteres.';
    if ( addressCity && !/^[\p{L}\p{M}' .-]+$/u.test( addressCity ) ) return 'Informe uma cidade válida, sem números.';
    if ( state && !/^[A-Z]{2}$/.test( state ) ) return 'Estado deve ser a UF com 2 letras, exemplo: SP.';
    if ( addressNumber && ( addressNumber.length > 20 || !/^[0-9A-Za-zÀ-ÿ./ -]+$/u.test( addressNumber ) ) ) return 'Informe um número de endereço válido, com até 20 caracteres.';
    if ( zipCodeDigits && !/^\d{8}$/.test( zipCodeDigits ) ) return 'CEP deve possuir 8 dígitos.';

    return '';
};

const InputField = ( {
    label,
    icon: Icon,
    helper,
    className = '',
    inputClassName = '',
    rightSlot = null,
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
                className={`w-full rounded-2xl border border-slate-200 bg-white/80 py-3 text-sm font-bold text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-800 dark:bg-slate-950/70 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:bg-slate-950 ${ Icon ? 'pl-11' : 'pl-4' } ${ rightSlot ? 'pr-12' : 'pr-4' } ${ inputClassName }`}
            />

            {rightSlot}
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
        <h3 className="text-lg font-black text-slate-950 dark:text-white">{title}</h3>
        {description && (
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {description}
            </p>
        )}
    </div>
);

const ClientRegistrationComp = () => {
    const navigate = useNavigate();
    const [ isSubmitting, setIsSubmitting ] = useState( false );
    const [ showPassword, setShowPassword ] = useState( false );
    const [ formData, setFormData ] = useState( INITIAL_FORM_DATA );

    const documentDigits = onlyDigits( formData.document );
    const passwordScore = useMemo( () => getPasswordScore( formData.password ), [ formData.password ] );
    const passwordStrength = getPasswordStrengthLabel( passwordScore );
    const documentType = documentDigits.length > 11 ? 'CNPJ' : 'CPF';
    const documentIsValid = isValidDocument( formData.document );

    const updateFormField = ( fieldName, value ) => {
        setFormData( ( currentFormData ) => ( {
            ...currentFormData,
            [ fieldName ]: value
        } ) );
    };

    const handleInputChange = ( event ) => {
        const { name, value } = event.target;

        if ( name === 'document' ) {
            updateFormField( name, formatDocument( value ) );
            return;
        }

        if ( name === 'phone' ) {
            updateFormField( name, formatPhone( value ) );
            return;
        }

        if ( name === 'addressZipCode' ) {
            updateFormField( name, formatZipCode( value ) );
            return;
        }

        if ( name === 'addressState' ) {
            updateFormField( name, value.toUpperCase().replace( /[^A-Z]/g, '' ).slice( 0, 2 ) );
            return;
        }

        updateFormField( name, value );
    };

    const handleGeneratePassword = () => {
        updateFormField( 'password', buildTemporaryPassword() );
        setShowPassword( true );
        toast.success( 'Senha temporária gerada. Guarde e envie ao cliente por um canal seguro.' );
    };

    const handleSubmit = async ( event ) => {
        event.preventDefault();

        const validationError = validateBeforeSubmit( formData );

        if ( validationError ) {
            toast.error( validationError );
            return;
        }

        setIsSubmitting( true );

        try {
            const response = await api.post( '/clients', getSubmitPayload( formData ) );
            const client = response.data?.client || response.data?.data?.client;
            const successMessage = response.data?.message || 'Cliente cadastrado ou vinculado com sucesso!';

            toast.success( successMessage );
            navigate( '/contracts/new', {
                state: {
                    preferredClientId: client?.id || '',
                    preferredClientEmail: normalizeEmail( formData.email )
                }
            } );
        } catch ( requestError ) {
            toast.error( getApiErrorMessage( requestError, 'Ocorreu um erro ao cadastrar ou vincular o cliente.' ) );
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
                                Novo contato
                            </p>

                            <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                                <UserPlus className="h-7 w-7 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                                Cadastrar ou Vincular Cliente
                            </h1>

                            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                                Crie um novo cliente ou vincule um cliente já existente à sua carteira de freelancer, mantendo os dados sensíveis tratados pelo back-end.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleGeneratePassword}
                        disabled={isSubmitting}
                        className="inline-flex items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-black text-blue-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-100 focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200 dark:hover:bg-blue-500/15"
                    >
                        <WandSparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                        Gerar senha temporária
                    </button>
                </div>
            </section>

            <div className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/85 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/75 dark:shadow-black/20">
                <div className="flex items-start gap-3 border-b border-slate-200/80 bg-slate-50/80 px-6 py-4 dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="rounded-2xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                        <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                    </div>

                    <div>
                        <h2 className="font-black text-slate-950 dark:text-white">Cadastro seguro e vínculo com freelancer</h2>
                        <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                            Se o e-mail já pertencer a um cliente, o back-end não duplica o usuário: ele apenas cria o vínculo com sua carteira. Se o cliente já tiver CPF/CNPJ salvo, informe o documento correto para confirmar o vínculo.
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8 p-6 sm:p-8">
                    <section className="space-y-4">
                        <SectionTitle
                            title="Dados de acesso"
                            description="Essas informações permitem que um novo cliente acesse o sistema e assine contratos. Para um cliente já existente, o e-mail é usado para localizar e vincular a conta."
                        />

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <InputField
                                label="Nome completo do cliente"
                                icon={User}
                                type="text"
                                name="fullName"
                                value={formData.fullName}
                                onChange={handleInputChange}
                                required
                                autoComplete="name"
                                placeholder="Ex: Ana Clara Martins Souza"
                                helper="Digite nome e sobrenome. O back-end separará nome e sobrenome com segurança."
                                className="md:col-span-2"
                                disabled={isSubmitting}
                                maxLength={140}
                            />

                            <InputField
                                label="E-mail de acesso"
                                icon={Mail}
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleInputChange}
                                required
                                autoComplete="email"
                                placeholder="cliente@email.com"
                                disabled={isSubmitting}
                                maxLength={254}
                            />

                            <InputField
                                label="Senha temporária"
                                icon={Lock}
                                type={showPassword ? 'text' : 'password'}
                                name="password"
                                value={formData.password}
                                onChange={handleInputChange}
                                required
                                minLength={MIN_PASSWORD_LENGTH}
                                autoComplete="new-password"
                                placeholder="Mínimo de 8 caracteres"
                                helper={`Força da senha: ${ passwordStrength }. Oriente o cliente a trocar a senha após o primeiro acesso.`}
                                disabled={isSubmitting}
                                rightSlot={(
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword( ( currentValue ) => !currentValue )}
                                        disabled={isSubmitting}
                                        className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                                    </button>
                                )}
                            />
                        </div>
                    </section>

                    <section className="space-y-4 border-t border-slate-200/80 pt-6 dark:border-slate-800">
                        <SectionTitle
                            title="Dados sensíveis do cliente"
                            description="CPF/CNPJ e telefone são enviados apenas para a API. Não salve esses dados no localStorage nem em estados globais persistentes."
                        />

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <InputField
                                label="CPF/CNPJ"
                                icon={IdCard}
                                type="text"
                                name="document"
                                value={formData.document}
                                onChange={handleInputChange}
                                inputMode="numeric"
                                autoComplete="off"
                                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                                helper={documentDigits ? `${ documentType } ${ documentIsValid ? 'aparentemente válido' : 'inválido ou incompleto' }.` : 'Opcional para cliente novo, mas pode ser exigido para vincular cliente existente.'}
                                disabled={isSubmitting}
                            />

                            <InputField
                                label="Telefone"
                                icon={Phone}
                                type="tel"
                                name="phone"
                                value={formData.phone}
                                onChange={handleInputChange}
                                inputMode="tel"
                                autoComplete="tel"
                                placeholder="(11) 99999-9999"
                                helper="Opcional. Use DDD + número."
                                disabled={isSubmitting}
                            />
                        </div>
                    </section>

                    <section className="space-y-4 border-t border-slate-200/80 pt-6 dark:border-slate-800">
                        <SectionTitle
                            title="Endereço"
                            description="O endereço fica separado por partes para facilitar a montagem do contrato e do PDF."
                        />

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
                            <InputField
                                label="Nome da rua"
                                icon={MapPin}
                                type="text"
                                name="addressStreet"
                                value={formData.addressStreet}
                                onChange={handleInputChange}
                                autoComplete="address-line1"
                                placeholder="Rua das Flores"
                                className="md:col-span-4"
                                disabled={isSubmitting}
                                maxLength={120}
                            />

                            <InputField
                                label="Número"
                                icon={Hash}
                                type="text"
                                name="addressNumber"
                                value={formData.addressNumber}
                                onChange={handleInputChange}
                                autoComplete="address-line2"
                                placeholder="123"
                                className="md:col-span-2"
                                disabled={isSubmitting}
                                maxLength={20}
                            />

                            <InputField
                                label="Cidade"
                                icon={Building2}
                                type="text"
                                name="addressCity"
                                value={formData.addressCity}
                                onChange={handleInputChange}
                                autoComplete="address-level2"
                                placeholder="São Paulo"
                                className="md:col-span-3"
                                disabled={isSubmitting}
                                maxLength={80}
                            />

                            <InputField
                                label="Estado"
                                icon={MapIcon}
                                type="text"
                                name="addressState"
                                value={formData.addressState}
                                onChange={handleInputChange}
                                autoComplete="address-level1"
                                placeholder="SP"
                                maxLength={2}
                                className="md:col-span-1"
                                disabled={isSubmitting}
                            />

                            <InputField
                                label="CEP"
                                icon={MapPin}
                                type="text"
                                name="addressZipCode"
                                value={formData.addressZipCode}
                                onChange={handleInputChange}
                                inputMode="numeric"
                                autoComplete="postal-code"
                                placeholder="00000-000"
                                className="md:col-span-2"
                                disabled={isSubmitting}
                            />
                        </div>
                    </section>

                    <section className="rounded-3xl border border-blue-100 bg-blue-50/70 p-4 text-blue-900 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-100">
                        <div className="flex items-start gap-3">
                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                            <div>
                                <p className="font-black">Após salvar, você será levado para a criação de contrato.</p>
                                <p className="mt-1 text-sm leading-6 text-blue-800 dark:text-blue-100/80">
                                    Quando possível, o ID/e-mail do cliente cadastrado será enviado na navegação para facilitar a pré-seleção no formulário de contrato.
                                </p>
                            </div>
                        </div>
                    </section>

                    <div className="flex flex-col-reverse gap-3 border-t border-slate-200/80 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-end">
                        <button
                            type="button"
                            onClick={() => navigate( '/' )}
                            className="rounded-2xl px-4 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-slate-500/10 disabled:cursor-not-allowed disabled:opacity-70 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                            disabled={isSubmitting}
                        >
                            Cancelar
                        </button>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/30 focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                                    Salvando...
                                </>
                            ) : (
                                <>
                                    <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                                    Cadastrar/Vincular Cliente
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ClientRegistrationComp;
