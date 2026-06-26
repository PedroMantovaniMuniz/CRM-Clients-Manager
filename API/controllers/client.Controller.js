import prisma from '../prisma/client.js';
import bcrypt from 'bcrypt';
import {
    encryptSensitiveData,
    hashSensitiveData
} from '../utils/sensitiveDataCrypto.Util.js';
import {
    sensitiveUserSelect,
    toSensitiveUser
} from '../utils/userProfilePresenter.Util.js';

const DEFAULT_PASSWORD_HASH_ROUNDS = 12;
const DEFAULT_PASSWORD_MIN_LENGTH = 8;
const BCRYPT_MAX_PASSWORD_BYTES = 72;
const EMAIL_MAX_LENGTH = 254;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_SEARCH_LENGTH = 120;

const PROFILE_FIELDS = Object.freeze( [
    'document',
    'phone',
    'addressStreet',
    'addressCity',
    'addressState',
    'addressNumber',
    'addressZipCode'
] );

const SENSITIVE_DATABASE_FIELDS = Object.freeze( {
    document: {
        encryptedField: 'documentEncrypted',
        hashField: 'documentHash'
    },
    phone: {
        encryptedField: 'phoneEncrypted'
    },
    addressStreet: {
        encryptedField: 'addressStreetEncrypted'
    },
    addressCity: {
        encryptedField: 'addressCityEncrypted'
    },
    addressState: {
        encryptedField: 'addressStateEncrypted'
    },
    addressNumber: {
        encryptedField: 'addressNumberEncrypted'
    },
    addressZipCode: {
        encryptedField: 'addressZipCodeEncrypted'
    }
} );

const existingClientSelect = Object.freeze( {
    ...sensitiveUserSelect,
    documentHash: true
} );

const hasOwn = ( object, property ) => Object.prototype.hasOwnProperty.call( object ?? {}, property );
const normalizeSpaces = ( value ) => String( value ?? '' ).trim().replace( /\s+/g, ' ' );
const normalizeEmail = ( email ) => normalizeSpaces( email ).toLowerCase();
const onlyDigits = ( value ) => String( value ?? '' ).replace( /\D/g, '' );

/**
 * Resposta de erro padronizada para este controller.
 * requestId é adicionado pelo server.js revisado e facilita rastrear problemas nos logs.
 */
const sendError = ( res, statusCode, error, message, requestId ) => res.status( statusCode ).json( {
    status: 'error',
    error,
    message,
    ...( requestId && { requestId } )
} );

/**
 * Lê variáveis inteiras do .env com limites seguros.
 * Usado para custo do bcrypt e parâmetros de paginação.
 */
const parseIntegerEnv = ( name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {} ) => {
    const rawValue = process.env[ name ];

    if ( rawValue === undefined || rawValue === '' ) return fallback;

    const parsedValue = Number.parseInt( rawValue, 10 );

    if ( Number.isNaN( parsedValue ) || parsedValue < min || parsedValue > max ) {
        throw new Error( `Variável ${ name } inválida. Use um número inteiro entre ${ min } e ${ max }.` );
    }

    return parsedValue;
};

const getPasswordHashRounds = () => parseIntegerEnv( 'PASSWORD_HASH_ROUNDS', DEFAULT_PASSWORD_HASH_ROUNDS, {
    min: 10,
    max: 14
} );

const getPasswordMinLength = () => parseIntegerEnv( 'PASSWORD_MIN_LENGTH', DEFAULT_PASSWORD_MIN_LENGTH, {
    min: 8,
    max: 32
} );

const isValidEmail = ( value ) => (
    typeof value === 'string' &&
    value.length <= EMAIL_MAX_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test( value )
);

const validateEmail = ( rawEmail ) => {
    const email = normalizeEmail( rawEmail );

    if ( !email || !isValidEmail( email ) ) {
        return { error: 'Informe um e-mail válido para o cliente.' };
    }

    return { email };
};

const isValidName = ( value, maxLength = 120 ) => {
    const normalized = normalizeSpaces( value );

    return (
        normalized.length >= 2 &&
        normalized.length <= maxLength &&
        /^[\p{L}][\p{L}\p{M}' -]*$/u.test( normalized )
    );
};

const splitFullNameForRegistration = ( rawFullName ) => {
    const fullName = normalizeSpaces( rawFullName );
    const parts = fullName.split( ' ' ).filter( Boolean );

    if ( parts.length < 2 ) {
        return { error: 'Informe o nome completo do cliente, com nome e sobrenome.' };
    }

    return {
        name: parts.shift(),
        lastName: parts.join( ' ' )
    };
};

const isValidCPF = ( documentDigits ) => {
    if ( !/^\d{11}$/.test( documentDigits ) ) return false;
    if ( /^(\d)\1{10}$/.test( documentDigits ) ) return false;

    const calculateDigit = ( factor ) => {
        let total = 0;

        for ( let index = 0; index < factor - 1; index += 1 ) {
            total += Number( documentDigits[ index ] ) * ( factor - index );
        }

        const rest = ( total * 10 ) % 11;
        return rest === 10 ? 0 : rest;
    };

    return calculateDigit( 10 ) === Number( documentDigits[ 9 ] ) &&
        calculateDigit( 11 ) === Number( documentDigits[ 10 ] );
};

const isValidCNPJ = ( documentDigits ) => {
    if ( !/^\d{14}$/.test( documentDigits ) ) return false;
    if ( /^(\d)\1{13}$/.test( documentDigits ) ) return false;

    const calculateDigit = ( baseLength ) => {
        const weights = baseLength === 12
            ? [ 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2 ]
            : [ 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2 ];

        const total = weights.reduce(
            ( sum, weight, index ) => sum + Number( documentDigits[ index ] ) * weight,
            0
        );

        const rest = total % 11;
        return rest < 2 ? 0 : 11 - rest;
    };

    return calculateDigit( 12 ) === Number( documentDigits[ 12 ] ) &&
        calculateDigit( 13 ) === Number( documentDigits[ 13 ] );
};

const validateDocument = ( document ) => {
    const documentDigits = onlyDigits( document );

    if ( !documentDigits ) return { document: '' };

    if ( !( isValidCPF( documentDigits ) || isValidCNPJ( documentDigits ) ) ) {
        return { error: 'Informe um CPF ou CNPJ válido.' };
    }

    return { document: documentDigits };
};

const validatePassword = ( password ) => {
    const normalized = String( password ?? '' );
    const minimumLength = getPasswordMinLength();

    if ( normalized.length < minimumLength ) {
        return `A senha temporária deve possuir no mínimo ${ minimumLength } caracteres.`;
    }

    if ( Buffer.byteLength( normalized, 'utf8' ) > BCRYPT_MAX_PASSWORD_BYTES ) {
        return 'A senha deve possuir no máximo 72 bytes para ser processada com segurança pelo bcrypt.';
    }

    return null;
};

/**
 * Valida os campos pessoais do cliente.
 * Todos os dados retornam limpos e prontos para criptografia/hash.
 */
const validateProfileFields = ( payload ) => {
    const clean = {};

    if ( hasOwn( payload, 'document' ) ) {
        const documentValidation = validateDocument( payload.document );
        if ( documentValidation.error ) return { error: documentValidation.error };
        clean.document = documentValidation.document;
    }

    if ( hasOwn( payload, 'phone' ) ) {
        clean.phone = onlyDigits( payload.phone );

        if ( clean.phone && !/^\d{10,11}$/.test( clean.phone ) ) {
            return { error: 'Informe um telefone brasileiro válido com DDD.' };
        }
    }

    if ( hasOwn( payload, 'addressStreet' ) ) {
        clean.addressStreet = normalizeSpaces( payload.addressStreet );

        if ( clean.addressStreet && ( clean.addressStreet.length < 3 || clean.addressStreet.length > 120 ) ) {
            return { error: 'O nome da rua deve possuir entre 3 e 120 caracteres.' };
        }
    }

    if ( hasOwn( payload, 'addressNumber' ) ) {
        clean.addressNumber = normalizeSpaces( payload.addressNumber );

        if ( clean.addressNumber && clean.addressNumber.length > 20 ) {
            return { error: 'O número deve possuir até 20 caracteres.' };
        }

        if ( clean.addressNumber && !/^[0-9A-Za-zÀ-ÿ./ -]+$/u.test( clean.addressNumber ) ) {
            return { error: 'Informe um número de endereço válido.' };
        }
    }

    if ( hasOwn( payload, 'addressCity' ) ) {
        clean.addressCity = normalizeSpaces( payload.addressCity );

        if ( clean.addressCity && ( clean.addressCity.length < 2 || clean.addressCity.length > 80 ) ) {
            return { error: 'A cidade deve possuir entre 2 e 80 caracteres.' };
        }

        if ( clean.addressCity && !/^[\p{L}\p{M}' .-]+$/u.test( clean.addressCity ) ) {
            return { error: 'Informe uma cidade válida, sem números.' };
        }
    }
    if ( hasOwn( payload, 'addressState' ) ) {
        clean.addressState = normalizeSpaces( payload.addressState ).toUpperCase();

        if ( clean.addressState && !/^[A-Z]{2}$/.test( clean.addressState ) ) {
            return { error: 'Informe o estado usando a UF com 2 letras, exemplo: SP.' };
        }
    }

    if ( hasOwn( payload, 'addressZipCode' ) ) {
        clean.addressZipCode = onlyDigits( payload.addressZipCode );

        if ( clean.addressZipCode && !/^\d{8}$/.test( clean.addressZipCode ) ) {
            return { error: 'Informe um CEP válido com 8 dígitos.' };
        }
    }

    return { clean };
};

const pickProfileFields = ( payload ) => PROFILE_FIELDS.reduce( ( result, field ) => {
    if ( hasOwn( payload, field ) ) result[ field ] = payload[ field ];
    return result;
}, {} );

const validateNewClientPayload = ( payload ) => {
    const emailValidation = validateEmail( payload?.email );
    if ( emailValidation.error ) return { error: emailValidation.error };

    const splitName = splitFullNameForRegistration( payload?.name || payload?.fullName );
    if ( splitName.error ) return { error: splitName.error };

    if ( !isValidName( splitName.name, 80 ) ) {
        return { error: 'Informe um nome válido, com 2 a 80 caracteres e sem números.' };
    }

    if ( !isValidName( splitName.lastName, 120 ) ) {
        return { error: 'Informe um sobrenome válido, com até 120 caracteres e sem números.' };
    }

    const passwordError = validatePassword( payload?.password );
    if ( passwordError ) return { error: passwordError };

    const profileValidation = validateProfileFields( payload ?? {} );
    if ( profileValidation.error ) return { error: profileValidation.error };

    return {
        clean: {
            email: emailValidation.email,
            name: splitName.name,
            lastName: splitName.lastName,
            password: String( payload.password ),
            ...profileValidation.clean
        }
    };
};

/**
 * Monta os campos criptografados/hash para persistência.
 * Campos undefined não são enviados ao Prisma, evitando sobrescrever dados por acidente.
 */
const buildSensitiveData = ( clean ) => Object.entries( SENSITIVE_DATABASE_FIELDS ).reduce(
    ( data, [ publicField, config ] ) => {
        if ( !hasOwn( clean, publicField ) ) return data;

        data[ config.encryptedField ] = encryptSensitiveData( clean[ publicField ] );

        if ( config.hashField ) {
            data[ config.hashField ] = hashSensitiveData( clean[ publicField ] );
        }

        return data;
    },
    {}
);

const buildNewClientData = async ( clean, freelancerId ) => ( {
    email: clean.email,
    password: await bcrypt.hash( clean.password, getPasswordHashRounds() ),
    name: clean.name,
    lastName: clean.lastName,
    role: 'CLIENT',
    registeredByFreelancerId: freelancerId,
    ...buildSensitiveData( clean )
} );

/**
 * Atualiza somente dados sensíveis que ainda estão ausentes no cliente existente.
 * Isso evita que um freelancer sobrescreva dados privados já cadastrados pelo próprio cliente.
 */
const buildMissingSensitiveUpdates = ( clean, existingClient ) => Object.entries( SENSITIVE_DATABASE_FIELDS ).reduce(
    ( data, [ publicField, config ] ) => {
        if ( !hasOwn( clean, publicField ) || !clean[ publicField ] ) return data;
        if ( existingClient[ config.encryptedField ] ) return data;

        data[ config.encryptedField ] = encryptSensitiveData( clean[ publicField ] );

        if ( config.hashField ) {
            data[ config.hashField ] = hashSensitiveData( clean[ publicField ] );
        }

        return data;
    },
    {}
);

const linkClientToFreelancer = ( tx, freelancerId, clientId ) => tx.freelancerClient.upsert( {
    where: {
        freelancerId_clientId: {
            freelancerId,
            clientId
        }
    },
    update: {},
    create: {
        freelancerId,
        clientId
    }
} );

const verifyExistingClientCanBeLinked = ( existingClient, payload ) => {
    const profileValidation = validateProfileFields( payload ?? {} );
    if ( profileValidation.error ) return { error: profileValidation.error };

    const providedDocument = profileValidation.clean.document || '';

    if ( existingClient.documentHash ) {
        if ( !providedDocument ) {
            return {
                error: 'Este cliente já existe na plataforma. Informe o CPF/CNPJ correto para confirmar o vínculo com segurança.'
            };
        }

        if ( hashSensitiveData( providedDocument ) !== existingClient.documentHash ) {
            return {
                error: 'O CPF/CNPJ informado não confere com o cliente já cadastrado para este e-mail.'
            };
        }
    }

    return { cleanProfile: profileValidation.clean };
};

const getFreelancer = async ( freelancerId ) => prisma.user.findFirst( {
    where: {
        id: freelancerId,
        role: 'FREELANCER'
    },
    select: { id: true }
} );

const parsePagination = ( query ) => {
    const page = Math.max( Number.parseInt( query.page, 10 ) || DEFAULT_PAGE, 1 );
    const requestedLimit = Number.parseInt( query.limit, 10 ) || DEFAULT_LIMIT;
    const limit = Math.min( Math.max( requestedLimit, 1 ), MAX_LIMIT );
    const skip = ( page - 1 ) * limit;

    return { page, limit, skip };
};

const parseSearch = ( rawSearch ) => {
    const search = normalizeSpaces( rawSearch );

    if ( search.length > MAX_SEARCH_LENGTH ) {
        return { error: `A busca deve possuir no máximo ${ MAX_SEARCH_LENGTH } caracteres.` };
    }

    return { search };
};

const buildClientWhereClause = ( freelancerId, search ) => ( {
    role: 'CLIENT',
    freelancerLinksAsClient: {
        some: { freelancerId }
    },
    ...( search && {
        OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } }
        ]
    } )
} );

const handleUniqueClientConflict = ( error, res, requestId ) => {
    if ( error.code !== 'P2002' ) return false;

    const uniqueTarget = Array.isArray( error.meta?.target )
        ? error.meta.target.join( ',' )
        : String( error.meta?.target || '' );

    if ( uniqueTarget.includes( 'documentHash' ) ) {
        sendError(
            res,
            409,
            'Conflict',
            'Este CPF/CNPJ já está vinculado a outro usuário.',
            requestId
        );
        return true;
    }

    if ( uniqueTarget.includes( 'email' ) ) {
        sendError(
            res,
            409,
            'Conflict',
            'O e-mail informado já está em uso.',
            requestId
        );
        return true;
    }

    if ( uniqueTarget.includes( 'freelancerId_clientId' ) ) {
        sendError(
            res,
            409,
            'Conflict',
            'Este cliente já está vinculado à sua carteira.',
            requestId
        );
        return true;
    }

    return false;
};
/**
 * Cadastra ou vincula um cliente dentro da carteira do freelancer autenticado.
 *
 * Regras:
 * - Cliente novo: cria usuário CLIENT e cria vínculo N:N com o freelancer.
 * - Cliente existente: não duplica usuário; cria apenas o vínculo N:N.
 * - Se o cliente existente já possui CPF/CNPJ, o CPF/CNPJ informado precisa conferir com o hash salvo.
 */
export const createClient = async ( req, res, next ) => {
    try {
        res.setHeader( 'Cache-Control', 'no-store' );

        const freelancer = await getFreelancer( req.userId );
        if ( !freelancer ) {
            return sendError(
                res,
                403,
                'Forbidden',
                'Apenas freelancers autenticados podem cadastrar ou vincular clientes.',
                req.requestId
            );
        }

        const emailValidation = validateEmail( req.body?.email );
        if ( emailValidation.error ) {
            return sendError( res, 400, 'Bad Request', emailValidation.error, req.requestId );
        }

        const existingUser = await prisma.user.findUnique( {
            where: { email: emailValidation.email },
            select: existingClientSelect
        } );

        if ( existingUser ) {
            if ( existingUser.role !== 'CLIENT' ) {
                return sendError(
                    res,
                    409,
                    'Conflict',
                    'O e-mail informado pertence a uma conta de freelancer e não pode ser usado como cliente.',
                    req.requestId
                );
            }

            const linkValidation = verifyExistingClientCanBeLinked( existingUser, pickProfileFields( req.body ?? {} ) );
            if ( linkValidation.error ) {
                return sendError( res, 403, 'Forbidden', linkValidation.error, req.requestId );
            }

            const missingSensitiveUpdates = buildMissingSensitiveUpdates( linkValidation.cleanProfile, existingUser );

            const { client, alreadyLinked } = await prisma.$transaction( async ( tx ) => {
                const previousLink = await tx.freelancerClient.findUnique( {
                    where: {
                        freelancerId_clientId: {
                            freelancerId: req.userId,
                            clientId: existingUser.id
                        }
                    },
                    select: { id: true }
                } );

                if ( Object.keys( missingSensitiveUpdates ).length > 0 ) {
                    await tx.user.update( {
                        where: { id: existingUser.id },
                        data: missingSensitiveUpdates
                    } );
                }

                await linkClientToFreelancer( tx, req.userId, existingUser.id );

                const linkedClient = await tx.user.findUnique( {
                    where: { id: existingUser.id },
                    select: sensitiveUserSelect
                } );

                return {
                    client: linkedClient,
                    alreadyLinked: Boolean( previousLink )
                };
            } );

            return res.status( alreadyLinked ? 200 : 201 ).json( {
                status: 'success',
                message: alreadyLinked
                    ? 'Cliente já estava vinculado à sua carteira.'
                    : 'Cliente existente vinculado à sua carteira com sucesso.',
                client: toSensitiveUser( client )
            } );
        }

        const { clean, error } = validateNewClientPayload( req.body ?? {} );
        if ( error ) {
            return sendError( res, 400, 'Bad Request', error, req.requestId );
        }

        const client = await prisma.$transaction( async ( tx ) => {
            const createdClient = await tx.user.create( {
                data: await buildNewClientData( clean, req.userId ),
                select: sensitiveUserSelect
            } );

            await linkClientToFreelancer( tx, req.userId, createdClient.id );

            return createdClient;
        } );

        return res.status( 201 ).json( {
            status: 'success',
            message: 'Cliente cadastrado e vinculado à sua carteira com segurança.',
            client: toSensitiveUser( client )
        } );
    } catch ( error ) {
        if ( handleUniqueClientConflict( error, res, req.requestId ) ) return;
        next( error );
    }
};

/**
 * Lista clientes vinculados ao freelancer autenticado.
 * Mantém retorno "clients" para compatibilidade e adiciona paginação para performance.
 */
export const getClients = async ( req, res, next ) => {
    try {
        res.setHeader( 'Cache-Control', 'no-store' );

        const searchValidation = parseSearch( req.query.search );
        if ( searchValidation.error ) {
            return sendError( res, 400, 'Bad Request', searchValidation.error, req.requestId );
        }

        const { page, limit, skip } = parsePagination( req.query );
        const whereClause = buildClientWhereClause( req.userId, searchValidation.search );

        const [ total, clients ] = await prisma.$transaction( [
            prisma.user.count( { where: whereClause } ),
            prisma.user.findMany( {
                where: whereClause,
                select: sensitiveUserSelect,
                orderBy: [ { name: 'asc' }, { lastName: 'asc' }, { email: 'asc' } ],
                skip,
                take: limit
            } )
        ] );

        return res.status( 200 ).json( {
            status: 'success',
            results: clients.length,
            total,
            pagination: {
                page,
                limit,
                totalPages: Math.max( Math.ceil( total / limit ), 1 ),
                hasNextPage: page * limit < total,
                hasPreviousPage: page > 1
            },
            clients: clients.map( toSensitiveUser )
        } );
    } catch ( error ) {
        next( error );
    }
};

/**
 * Obtém um cliente específico, desde que exista vínculo com o freelancer autenticado.
 */
export const getClientById = async ( req, res, next ) => {
    try {
        res.setHeader( 'Cache-Control', 'no-store' );

        const client = await prisma.user.findFirst( {
            where: {
                id: req.params.id,
                ...buildClientWhereClause( req.userId )
            },
            select: sensitiveUserSelect
        } );

        if ( !client ) {
            return sendError(
                res,
                404,
                'Not Found',
                'Cliente não encontrado ou ainda não vinculado à sua carteira.',
                req.requestId
            );
        }

        return res.status( 200 ).json( {
            status: 'success',
            client: toSensitiveUser( client )
        } );
    } catch ( error ) {
        next( error );
    }
};
