import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
    register,
    login,
    getMe,
    getProfile,
    updateProfile
} from '../controllers/auth.Controller.js';
import { authMiddleware } from '../middlewares/auth.Middleware.js';

const router = Router();
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Converte variáveis de ambiente numéricas em inteiros seguros.
 * Se a variável não existir, usa o fallback informado.
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

/**
 * Resposta padronizada para rate limits.
 * O requestId vem do server.js revisado e ajuda a rastrear bloqueios nos logs.
 */
const buildRateLimitMessage = ( message ) => ( req ) => ( {
    status: 'error',
    error: 'Too Many Requests',
    message,
    ...( req.requestId && { requestId: req.requestId } )
} );

/**
 * Factory para evitar repetição na criação de limitadores.
 * validate false evita ruído quando a API está atrás de proxy configurado pelo server.js.
 */
const createLimiter = ( {
    windowMs,
    max,
    message,
    skipSuccessfulRequests = false
} ) => rateLimit( {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    message: buildRateLimitMessage( message ),
    validate: {
        trustProxy: false
    }
} );

/**
 * Limite mais rígido para login.
 * skipSuccessfulRequests reduz punição para usuários legítimos que acertam a senha.
 */
const loginLimiter = createLimiter( {
    windowMs: parseIntegerEnv( 'AUTH_LOGIN_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, {
        min: 60 * 1000,
        max: 60 * 60 * 1000
    } ),
    max: parseIntegerEnv( 'AUTH_LOGIN_RATE_LIMIT_MAX', isProduction ? 8 : 30, {
        min: 1,
        max: 200
    } ),
    skipSuccessfulRequests: true,
    message: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.'
} );

/**
 * Limite separado para cadastro.
 * Cadastro costuma ser menos frequente e mais sensível a abuso/spam.
 */
const registerLimiter = createLimiter( {
    windowMs: parseIntegerEnv( 'AUTH_REGISTER_RATE_LIMIT_WINDOW_MS', 60 * 60 * 1000, {
        min: 5 * 60 * 1000,
        max: 24 * 60 * 60 * 1000
    } ),
    max: parseIntegerEnv( 'AUTH_REGISTER_RATE_LIMIT_MAX', isProduction ? 5 : 30, {
        min: 1,
        max: 200
    } ),
    message: 'Muitas tentativas de cadastro. Aguarde antes de criar uma nova conta.'
} );

/**
 * Limite para leitura de dados autenticados.
 * Mais permissivo porque /me pode ser chamado pelo front-end para restaurar sessão.
 */
const sessionLimiter = createLimiter( {
    windowMs: parseIntegerEnv( 'AUTH_SESSION_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, {
        min: 60 * 1000,
        max: 60 * 60 * 1000
    } ),
    max: parseIntegerEnv( 'AUTH_SESSION_RATE_LIMIT_MAX', isProduction ? 120 : 500, {
        min: 10,
        max: 2000
    } ),
    message: 'Muitas consultas de sessão em pouco tempo. Aguarde alguns minutos e tente novamente.'
} );

/**
 * Limite para perfil sensível.
 * Mantemos separado porque esse endpoint trafega CPF/CNPJ, telefone e endereço descriptografados.
 */
const profileReadLimiter = createLimiter( {
    windowMs: parseIntegerEnv( 'AUTH_PROFILE_READ_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, {
        min: 60 * 1000,
        max: 60 * 60 * 1000
    } ),
    max: parseIntegerEnv( 'AUTH_PROFILE_READ_RATE_LIMIT_MAX', isProduction ? 60 : 300, {
        min: 5,
        max: 1000
    } ),
    message: 'Muitas consultas de perfil em pouco tempo. Aguarde alguns minutos e tente novamente.'
} );

/**
 * Limite para atualização de perfil.
 * Escritas no banco são mais custosas e devem ser mais protegidas contra automação.
 */
const profileWriteLimiter = createLimiter( {
    windowMs: parseIntegerEnv( 'AUTH_PROFILE_WRITE_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, {
        min: 60 * 1000,
        max: 60 * 60 * 1000
    } ),
    max: parseIntegerEnv( 'AUTH_PROFILE_WRITE_RATE_LIMIT_MAX', isProduction ? 20 : 120, {
        min: 1,
        max: 500
    } ),
    message: 'Muitas atualizações de perfil em pouco tempo. Aguarde alguns minutos e tente novamente.'
} );

/**
 * Cabeçalhos de não-cache para rotas de autenticação.
 * Mesmo que o server.js revisado já aplique no /api, manter aqui torna a intenção explícita.
 */
const noStore = ( req, res, next ) => {
    res.setHeader( 'Cache-Control', 'no-store' );
    next();
};

router.use( noStore );

// Rotas públicas de autenticação.
router.post( '/register', registerLimiter, register );
router.post( '/login', loginLimiter, login );

// A partir daqui todas as rotas exigem token JWT válido.
router.use( authMiddleware );

// Rota leve usada pelo front-end para validar sessão/autologin.
router.get( '/me', sessionLimiter, getMe );

// Perfil completo contém dados sensíveis e recebe limitadores próprios.
router.get( '/profile', profileReadLimiter, getProfile );
router.patch( '/profile', profileWriteLimiter, updateProfile );

export default router;
