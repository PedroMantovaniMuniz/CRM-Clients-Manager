import crypto from 'crypto';

const ENCRYPTION_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const REQUIRED_KEY_LENGTH = 32;

let cachedEncryptionKey = null;
let cachedHashSecret = null;

const isProduction = process.env.NODE_ENV === 'production';

const normalizeSensitiveValue = ( value ) => {
    if ( value === null || value === undefined || value === '' ) return null;
    return String( value );
};

const isStrictBase64 = ( value ) => {
    if ( typeof value !== 'string' || !value.trim() ) return false;

    const normalized = value.trim();

    if ( normalized.length % 4 !== 0 ) return false;
    if ( !/^[A-Za-z0-9+/]+={0,2}$/.test( normalized ) ) return false;

    try {
        return Buffer.from( normalized, 'base64' ).toString( 'base64' ) === normalized;
    } catch {
        return false;
    }
};

const isStrictHex = ( value ) => (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length % 2 === 0 &&
    /^[a-f0-9]+$/i.test( value.trim() )
);

const decodeBase64Field = ( value, fieldName ) => {
    if ( !isStrictBase64( value ) ) {
        throw new Error( `Campo criptográfico inválido: ${ fieldName } deve estar em base64 válido.` );
    }

    return Buffer.from( value.trim(), 'base64' );
};

const buildKeyCandidates = ( rawKey ) => {
    const key = String( rawKey ?? '' ).trim();

    if ( key.startsWith( 'base64:' ) ) {
        const value = key.slice( 'base64:'.length );
        return isStrictBase64( value ) ? [ Buffer.from( value, 'base64' ) ] : [];
    }

    if ( key.startsWith( 'hex:' ) ) {
        const value = key.slice( 'hex:'.length );
        return isStrictHex( value ) ? [ Buffer.from( value, 'hex' ) ] : [];
    }

    if ( key.startsWith( 'utf8:' ) ) {
        return [ Buffer.from( key.slice( 'utf8:'.length ), 'utf8' ) ];
    }

    const candidates = [];

    if ( isStrictBase64( key ) ) {
        candidates.push( Buffer.from( key, 'base64' ) );
    }

    if ( isStrictHex( key ) ) {
        candidates.push( Buffer.from( key, 'hex' ) );
    }

    candidates.push( Buffer.from( key, 'utf8' ) );

    return candidates;
};

const getEncryptionKey = () => {
    if ( cachedEncryptionKey ) return cachedEncryptionKey;

    const rawKey = process.env.PROFILE_ENCRYPTION_KEY;

    if ( !rawKey ) {
        throw new Error( 'PROFILE_ENCRYPTION_KEY não foi definida no .env.' );
    }

    const validKey = buildKeyCandidates( rawKey ).find(
        candidate => candidate.length === REQUIRED_KEY_LENGTH
    );

    if ( !validKey ) {
        throw new Error(
            'PROFILE_ENCRYPTION_KEY deve ter exatamente 32 bytes. Use base64:, hex: ou utf8: para evitar ambiguidades.'
        );
    }

    cachedEncryptionKey = validKey;
    return cachedEncryptionKey;
};

const getHashSecret = () => {
    if ( cachedHashSecret ) return cachedHashSecret;

    const secret = process.env.PROFILE_HASH_SECRET || process.env.PROFILE_ENCRYPTION_KEY;

    if ( !secret ) {
        throw new Error( 'PROFILE_HASH_SECRET ou PROFILE_ENCRYPTION_KEY deve estar definida no .env.' );
    }

    cachedHashSecret = String( secret );
    return cachedHashSecret;
};

export const isEncryptedSensitiveData = ( value ) => {
    if ( typeof value !== 'string' ) return false;

    const parts = value.split( ':' );

    return (
        parts.length === 4 &&
        parts[ 0 ] === ENCRYPTION_VERSION &&
        isStrictBase64( parts[ 1 ] ) &&
        isStrictBase64( parts[ 2 ] ) &&
        isStrictBase64( parts[ 3 ] )
    );
};

export const encryptSensitiveData = ( value ) => {
    const normalizedValue = normalizeSensitiveValue( value );
    if ( normalizedValue === null ) return null;

    const iv = crypto.randomBytes( IV_LENGTH );
    const cipher = crypto.createCipheriv( ALGORITHM, getEncryptionKey(), iv );

    const encrypted = Buffer.concat( [
        cipher.update( normalizedValue, 'utf8' ),
        cipher.final()
    ] );

    const authTag = cipher.getAuthTag();

    return [
        ENCRYPTION_VERSION,
        iv.toString( 'base64' ),
        authTag.toString( 'base64' ),
        encrypted.toString( 'base64' )
    ].join( ':' );
};

export const decryptSensitiveData = ( encryptedValue ) => {
    if ( !encryptedValue ) return '';

    if ( typeof encryptedValue !== 'string' ) {
        throw new Error( 'Dado sensível criptografado deve ser uma string.' );
    }

    const [ version, ivBase64, tagBase64, encryptedBase64, ...extraParts ] = encryptedValue.split( ':' );

    if ( extraParts.length > 0 || version !== ENCRYPTION_VERSION ) {
        throw new Error( 'Formato ou versão inválida de dado sensível criptografado.' );
    }

    const iv = decodeBase64Field( ivBase64, 'iv' );
    const authTag = decodeBase64Field( tagBase64, 'authTag' );
    const encrypted = decodeBase64Field( encryptedBase64, 'cipherText' );

    if ( iv.length !== IV_LENGTH ) {
        throw new Error( 'IV inválido no dado sensível criptografado.' );
    }

    if ( authTag.length !== AUTH_TAG_LENGTH ) {
        throw new Error( 'Auth tag inválida no dado sensível criptografado.' );
    }

    const decipher = crypto.createDecipheriv( ALGORITHM, getEncryptionKey(), iv );
    decipher.setAuthTag( authTag );

    return Buffer.concat( [
        decipher.update( encrypted ),
        decipher.final()
    ] ).toString( 'utf8' );
};

export const hashSensitiveData = ( value ) => {
    const normalizedValue = normalizeSensitiveValue( value );
    if ( normalizedValue === null ) return null;

    return crypto
        .createHmac( 'sha256', getHashSecret() )
        .update( normalizedValue, 'utf8' )
        .digest( 'hex' );
};

export const clearSensitiveCryptoCacheForTests = () => {
    if ( isProduction ) {
        throw new Error( 'clearSensitiveCryptoCacheForTests não pode ser usada em produção.' );
    }

    cachedEncryptionKey = null;
    cachedHashSecret = null;
};
