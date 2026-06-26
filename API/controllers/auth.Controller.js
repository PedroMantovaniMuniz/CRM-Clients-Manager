import prisma from '../prisma/client.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {
    encryptSensitiveData,
    hashSensitiveData
} from '../utils/sensitiveDataCrypto.Util.js';
import {
    publicUserSelect,
    sensitiveUserSelect,
    toPublicUser,
    toSensitiveUser
} from '../utils/userProfilePresenter.Util.js';

const ALLOWED_ROLES = Object.freeze( [ 'FREELANCER', 'CLIENT' ] );
const OPTIONAL_PROFILE_FIELDS = Object.freeze( [
    'document',
    'phone',
    'addressStreet',
    'addressCity',
    'addressState',
    'addressNumber',
    'addressZipCode'
] );
const UPDATABLE_PROFILE_FIELDS = Object.freeze( [
    'name',
    'lastName',
    ...OPTIONAL_PROFILE_FIELDS
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

const DEFAULT_PASSWORD_HASH_ROUNDS = 12;
const DEFAULT_JWT_EXPIRES_IN = '24h';
const DEFAULT_PASSWORD_MIN_LENGTH = 8;
const BCRYPT_MAX_PASSWORD_BYTES = 72;
const EMAIL_MAX_LENGTH = 254;

let cachedJwtSecret = null;
let dummyPasswordHashPromise = null;

const hasOwn = ( object, property ) => Object.prototype.hasOwnProperty.call( object ?? {}, property );
const normalizeSpaces = ( value ) => String( value ?? '' ).trim().replace( /\s+/g, ' ' );
const normalizeEmail = ( email ) => normalizeSpaces( email ).toLowerCase();
const onlyDigits = ( value ) => String( value ?? '' ).replace( /\D/g, '' );

const sensitiveProfileSelect = Object.freeze( {
    ...sensitiveUserSelect,
    createdAt: true,
    updatedAt: true
} );

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

const getJwtExpiresIn = () => {
    const expiresIn = String( process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN ).trim();

    if ( !/^\d+[smhd]$/.test( expiresIn ) ) {
        throw new Error( 'JWT_EXPIRES_IN inválido. Use formatos como 15m, 2h ou 7d.' );
    }

    return expiresIn;
};

const getJwtSecret = () => {
    if ( cachedJwtSecret ) return cachedJwtSecret;

    const secret = String( process.env.JWT_SECRET ?? '' ).trim();

    if ( secret.length < 32 ) {
        throw new Error( 'JWT_SECRET ausente ou fraca. Use uma chave aleatória com pelo menos 32 caracteres.' );
    }

    cachedJwtSecret = secret;
    return cachedJwtSecret;
};

const getJwtSignOptions = () => {
    const options = {
        expiresIn: getJwtExpiresIn(),
        algorithm: 'HS256'
    };

    if ( process.env.JWT_ISSUER ) options.issuer = process.env.JWT_ISSUER;
    if ( process.env.JWT_AUDIENCE ) options.audience = process.env.JWT_AUDIENCE;

    return options;
};

const sendError = ( res, statusCode, error, message, requestId ) => res.status( statusCode ).json( {
    status: 'error',
    error,
    message,
    ...( requestId && { requestId } )
} );

const isValidEmail = ( value ) => (
    typeof value === 'string' &&
    value.length <= EMAIL_MAX_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test( value )
);

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
        return { error: 'Informe seu nome completo, com nome e sobrenome.' };
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

const validatePassword = ( password ) => {
    const normalized = String( password ?? '' );
    const minimumLength = getPasswordMinLength();

    if ( normalized.length < minimumLength ) {
        return `A senha deve possuir no mínimo ${ minimumLength } caracteres.`;
    }

    if ( Buffer.byteLength( normalized, 'utf8' ) > BCRYPT_MAX_PASSWORD_BYTES ) {
        return 'A senha deve possuir no máximo 72 bytes para ser processada com segurança pelo bcrypt.';
    }

    return null;
};

const validateDocument = ( document ) => {
    const documentDigits = onlyDigits( document );

    if ( !documentDigits ) return { document: '' };

    if ( !( isValidCPF( documentDigits ) || isValidCNPJ( documentDigits ) ) ) {
        return { error: 'Informe um CPF ou CNPJ válido.' };
    }

    return { document: documentDigits };
};

const validateProfilePayload = ( payload, { requireName = false } = {} ) => {
    const clean = {};

    if ( requireName || hasOwn( payload, 'name' ) ) {
        clean.name = normalizeSpaces( payload.name );

        if ( !isValidName( clean.name, 80 ) ) {
            return { error: 'Informe um nome válido, com 2 a 80 caracteres e sem números.' };
        }
    }

    if ( requireName || hasOwn( payload, 'lastName' ) ) {
        clean.lastName = normalizeSpaces( payload.lastName );

        if ( requireName && !clean.lastName ) {
            return { error: 'O sobrenome é obrigatório.' };
        }

        if ( clean.lastName && !isValidName( clean.lastName, 120 ) ) {
            return { error: 'Informe um sobrenome válido, com até 120 caracteres e sem números.' };
        }
    }

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

    if ( hasOwn( payload, 'addressNumber' ) ) {
        clean.addressNumber = normalizeSpaces( payload.addressNumber );

        if ( clean.addressNumber && clean.addressNumber.length > 20 ) {
            return { error: 'O número deve possuir até 20 caracteres.' };
        }

        if ( clean.addressNumber && !/^[0-9A-Za-zÀ-ÿ./ -]+$/u.test( clean.addressNumber ) ) {
            return { error: 'Informe um número de endereço válido.' };
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

const pickFields = ( source, allowedFields ) => allowedFields.reduce( ( payload, field ) => {
    if ( hasOwn( source, field ) ) payload[ field ] = source[ field ];
    return payload;
}, {} );

const buildProfileDatabaseData = ( clean ) => Object.entries( SENSITIVE_DATABASE_FIELDS ).reduce(
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

const buildUserDataFromRegistration = async ( clean, normalizedEmail, normalizedRole, password ) => ( {
    email: normalizedEmail,
    password: await bcrypt.hash( String( password ), getPasswordHashRounds() ),
    name: clean.name,
    lastName: clean.lastName,
    role: normalizedRole,
    ...buildProfileDatabaseData( clean )
} );

const toProfileResponse = ( user ) => ( {
    ...toSensitiveUser( user ),
    ...( user?.createdAt !== undefined && { createdAt: user.createdAt } ),
    ...( user?.updatedAt !== undefined && { updatedAt: user.updatedAt } )
} );

const handleUniqueUserConflict = ( error, res, requestId ) => {
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

    return false;
};

const getDummyPasswordHash = () => {
    if ( !dummyPasswordHashPromise ) {
        dummyPasswordHashPromise = bcrypt.hash( 'invalid-password-placeholder', getPasswordHashRounds() );
    }

    return dummyPasswordHashPromise;
};

const signAuthToken = ( user ) => jwt.sign(
    {
        id: user.id,
        sub: user.id,
        role: user.role
    },
    getJwtSecret(),
    getJwtSignOptions()
);

export const register = async ( req, res, next ) => {
    try {
        const body = req.body ?? {};
        const normalizedEmail = normalizeEmail( body.email );
        const normalizedRole = normalizeSpaces( body.role ).toUpperCase();
        const password = String( body.password ?? '' );
        const splitName = splitFullNameForRegistration( body.name );

        if ( splitName.error ) {
            return sendError( res, 400, 'Bad Request', splitName.error, req.requestId );
        }

        if ( !normalizedEmail || !password || !normalizedRole ) {
            return sendError(
                res,
                400,
                'Bad Request',
                'Todos os campos (email, password, name, role) são obrigatórios.',
                req.requestId
            );
        }

        if ( !isValidEmail( normalizedEmail ) ) {
            return sendError( res, 400, 'Bad Request', 'Informe um e-mail válido.', req.requestId );
        }

        if ( !ALLOWED_ROLES.includes( normalizedRole ) ) {
            return sendError(
                res,
                400,
                'Bad Request',
                'O tipo de usuário deve ser exclusivamente FREELANCER ou CLIENT.',
                req.requestId
            );
        }

        const passwordError = validatePassword( password );
        if ( passwordError ) {
            return sendError( res, 400, 'Bad Request', passwordError, req.requestId );
        }

        const registrationPayload = {
            name: splitName.name,
            lastName: splitName.lastName,
            ...pickFields( body, OPTIONAL_PROFILE_FIELDS )
        };

        const profileValidation = validateProfilePayload( registrationPayload, { requireName: true } );
        if ( profileValidation.error ) {
            return sendError( res, 400, 'Bad Request', profileValidation.error, req.requestId );
        }

        const existingUser = await prisma.user.findUnique( {
            where: { email: normalizedEmail },
            select: { id: true }
        } );

        if ( existingUser ) {
            return sendError(
                res,
                409,
                'Conflict',
                'O e-mail informado já está em uso.',
                req.requestId
            );
        }

        const newUser = await prisma.user.create( {
            data: await buildUserDataFromRegistration(
                profileValidation.clean,
                normalizedEmail,
                normalizedRole,
                password
            ),
            select: publicUserSelect
        } );

        return res.status( 201 ).json( {
            status: 'success',
            message: 'Usuário registrado com sucesso.',
            user: toPublicUser( newUser )
        } );
    } catch ( error ) {
        if ( handleUniqueUserConflict( error, res, req.requestId ) ) return;
        next( error );
    }
};

export const login = async ( req, res, next ) => {
    try {
        const email = normalizeEmail( req.body?.email );
        const password = String( req.body?.password ?? '' );

        if ( !email || !password ) {
            return sendError(
                res,
                400,
                'Bad Request',
                'Os campos de e-mail e senha são obrigatórios.',
                req.requestId
            );
        }

        if ( !isValidEmail( email ) ) {
            return sendError( res, 401, 'Unauthorized', 'E-mail ou senha incorretos.', req.requestId );
        }

        const user = await prisma.user.findUnique( {
            where: { email },
            select: {
                ...publicUserSelect,
                password: true
            }
        } );

        const passwordHash = user?.password || await getDummyPasswordHash();
        const isPasswordValid = await bcrypt.compare( password, passwordHash );

        if ( !user || !isPasswordValid ) {
            return sendError( res, 401, 'Unauthorized', 'E-mail ou senha incorretos.', req.requestId );
        }

        const token = signAuthToken( user );

        return res.status( 200 ).json( {
            status: 'success',
            message: 'Autenticação efetuada com sucesso.',
            token,
            user: toPublicUser( user )
        } );
    } catch ( error ) {
        next( error );
    }
};

export const getMe = async ( req, res, next ) => {
    try {
        const user = await prisma.user.findUnique( {
            where: { id: req.userId },
            select: publicUserSelect
        } );

        if ( !user ) {
            return sendError( res, 404, 'Not Found', 'Usuário não encontrado.', req.requestId );
        }

        return res.status( 200 ).json( {
            status: 'success',
            user: toPublicUser( user )
        } );
    } catch ( error ) {
        next( error );
    }
};

export const getProfile = async ( req, res, next ) => {
    try {
        res.setHeader( 'Cache-Control', 'no-store' );

        const user = await prisma.user.findUnique( {
            where: { id: req.userId },
            select: sensitiveProfileSelect
        } );

        if ( !user ) {
            return sendError( res, 404, 'Not Found', 'Usuário não encontrado.', req.requestId );
        }

        return res.status( 200 ).json( {
            status: 'success',
            profile: toProfileResponse( user )
        } );
    } catch ( error ) {
        next( error );
    }
};

export const updateProfile = async ( req, res, next ) => {
    try {
        res.setHeader( 'Cache-Control', 'no-store' );

        const payload = pickFields( req.body ?? {}, UPDATABLE_PROFILE_FIELDS );

        if ( Object.keys( payload ).length === 0 ) {
            return sendError(
                res,
                400,
                'Bad Request',
                'Envie ao menos um campo permitido para atualizar o perfil.',
                req.requestId
            );
        }

        const profileValidation = validateProfilePayload( payload );
        if ( profileValidation.error ) {
            return sendError( res, 400, 'Bad Request', profileValidation.error, req.requestId );
        }

        const { clean } = profileValidation;
        const data = {
            ...buildProfileDatabaseData( clean )
        };

        if ( hasOwn( clean, 'name' ) ) data.name = clean.name;
        if ( hasOwn( clean, 'lastName' ) ) data.lastName = clean.lastName || null;

        if ( Object.keys( data ).length === 0 ) {
            return sendError(
                res,
                400,
                'Bad Request',
                'Nenhuma alteração válida foi enviada.',
                req.requestId
            );
        }

        const user = await prisma.user.update( {
            where: { id: req.userId },
            data,
            select: sensitiveProfileSelect
        } );

        return res.status( 200 ).json( {
            status: 'success',
            message: 'Perfil atualizado com segurança.',
            profile: toProfileResponse( user )
        } );
    } catch ( error ) {
        if ( handleUniqueUserConflict( error, res, req.requestId ) ) return;
        next( error );
    }
};
