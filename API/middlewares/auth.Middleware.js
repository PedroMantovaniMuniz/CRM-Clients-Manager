import jwt from 'jsonwebtoken';

const TOKEN_TYPE = 'Bearer';
const DEFAULT_CLOCK_TOLERANCE_SECONDS = 5;
const MAX_TOKEN_LENGTH = 4096;
const ALLOWED_ROLES = new Set( [ 'FREELANCER', 'CLIENT' ] );

let cachedJwtSecret = null;
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Cria respostas de erro padronizadas para autenticação.
 * O requestId ajuda no debug sem expor detalhes internos ao usuário final.
 */
const sendAuthError = ( res, statusCode, error, message, requestId ) => res.status( statusCode ).json( {
    status: 'error',
    error,
    message,
    ...( requestId && { requestId } )
} );

/**
 * Lê e valida o segredo JWT uma única vez por processo.
 * JWT_SECRET fraco deixa todos os tokens da aplicação vulneráveis.
 */
const getJwtSecret = () => {
    if ( cachedJwtSecret ) return cachedJwtSecret;

    const secret = String( process.env.JWT_SECRET ?? '' ).trim();

    if ( secret.length < 32 ) {
        throw new Error( 'JWT_SECRET ausente ou fraca. Use uma chave aleatória com pelo menos 32 caracteres.' );
    }

    cachedJwtSecret = secret;
    return cachedJwtSecret;
};

/**
 * Permite configurar tolerância de relógio para pequenos desvios entre servidor e cliente.
 * Mantemos valor baixo para não prolongar tokens expirados além do necessário.
 */
const getClockTolerance = () => {
    const rawValue = process.env.JWT_CLOCK_TOLERANCE_SECONDS;
    if ( rawValue === undefined || rawValue === '' ) return DEFAULT_CLOCK_TOLERANCE_SECONDS;

    const parsedValue = Number.parseInt( rawValue, 10 );

    if ( Number.isNaN( parsedValue ) || parsedValue < 0 || parsedValue > 60 ) {
        throw new Error( 'JWT_CLOCK_TOLERANCE_SECONDS deve ser um número entre 0 e 60.' );
    }

    return parsedValue;
};

/**
 * Monta as opções usadas na validação do JWT.
 * issuer e audience são opcionais para manter compatibilidade com tokens atuais.
 */
const getJwtVerifyOptions = () => {
    const options = {
        algorithms: [ 'HS256' ],
        clockTolerance: getClockTolerance()
    };

    if ( process.env.JWT_ISSUER ) options.issuer = process.env.JWT_ISSUER;
    if ( process.env.JWT_AUDIENCE ) options.audience = process.env.JWT_AUDIENCE;

    return options;
};

/**
 * Extrai o token do cabeçalho Authorization.
 * Aceita apenas o formato: Authorization: Bearer <token>
 */
const extractBearerToken = ( authorizationHeader ) => {
    if ( typeof authorizationHeader !== 'string' ) return null;

    const match = authorizationHeader.match( /^Bearer\s+([^\s]+)$/i );
    if ( !match ) return null;

    const token = match[ 1 ].trim();

    if ( !token || token.length > MAX_TOKEN_LENGTH ) return null;

    return token;
};

/**
 * Valida o payload esperado pela aplicação.
 * Hoje os controllers dependem de req.userId e req.userRole, então preservamos esses campos.
 */
const normalizeAuthPayload = ( decoded ) => {
    if ( !decoded || typeof decoded !== 'object' ) return null;

    const userId = decoded.id || decoded.sub;
    const userRole = typeof decoded.role === 'string'
        ? decoded.role.trim().toUpperCase()
        : '';

    if ( !userId || !userRole || !ALLOWED_ROLES.has( userRole ) ) return null;

    return {
        userId: String( userId ),
        userRole,
        tokenIssuedAt: decoded.iat,
        tokenExpiresAt: decoded.exp
    };
};

/**
 * Middleware de autenticação.
 * Responsabilidade:
 * - validar o header Authorization;
 * - verificar assinatura, expiração, algoritmo e claims opcionais do JWT;
 * - injetar dados mínimos do usuário na requisição.
 *
 * Observação: este middleware não consulta o banco para manter as rotas rápidas.
 * Bloqueio/revogação de usuários pode ser adicionado futuramente com cache ou sessão persistida.
 */
export const authMiddleware = ( req, res, next ) => {
    const token = extractBearerToken( req.headers.authorization );

    if ( !token ) {
        return sendAuthError(
            res,
            401,
            'Unauthorized',
            `Acesso negado. Envie o cabeçalho Authorization no formato "${ TOKEN_TYPE } <token>".`,
            req.requestId
        );
    }

    try {
        const decoded = jwt.verify( token, getJwtSecret(), getJwtVerifyOptions() );
        const authPayload = normalizeAuthPayload( decoded );

        if ( !authPayload ) {
            return sendAuthError(
                res,
                401,
                'InvalidToken',
                'Token de autenticação inválido ou incompleto.',
                req.requestId
            );
        }

        req.userId = authPayload.userId;
        req.userRole = authPayload.userRole;

        // Objeto adicional para usos futuros sem quebrar controllers existentes.
        req.auth = authPayload;

        return next();
    } catch ( error ) {
        if ( error.name === 'TokenExpiredError' ) {
            return sendAuthError(
                res,
                401,
                'TokenExpired',
                'Sua sessão expirou. Faça login novamente para continuar.',
                req.requestId
            );
        }

        if ( error.name === 'NotBeforeError' ) {
            return sendAuthError(
                res,
                401,
                'TokenNotActive',
                'Token de autenticação ainda não está ativo.',
                req.requestId
            );
        }

        if (
            error.message?.includes( 'JWT_SECRET' ) ||
            error.message?.includes( 'JWT_CLOCK_TOLERANCE_SECONDS' )
        ) {
            return sendAuthError(
                res,
                500,
                'ServerMisconfigured',
                'A autenticação do servidor não está configurada de forma segura.',
                req.requestId
            );
        }

        return sendAuthError(
            res,
            401,
            'InvalidToken',
            'Token de autenticação inválido ou corrompido.',
            req.requestId
        );
    }
};

/**
 * Utilitário para testes automatizados.
 * Evita que um JWT_SECRET antigo fique em cache entre cenários de teste.
 */
export const clearJwtSecretCacheForTests = () => {
    if ( isProduction ) {
        throw new Error( 'clearJwtSecretCacheForTests não pode ser usado em produção.' );
    }

    cachedJwtSecret = null;
};
