import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
    createContract,
    getContracts,
    getContractById,
    signContract,
    requestCancellation,
    confirmCancellation,
    deleteContract
} from '../controllers/contract.Controller.js';
import { authMiddleware } from '../middlewares/auth.Middleware.js';
import { authorizeRoles } from '../middlewares/role.Middleware.js';

const router = Router();
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Validação defensiva para IDs em formato UUID.
 * Impede consultas desnecessárias ao banco quando o parâmetro é obviamente inválido.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Lê variáveis numéricas do ambiente com fallback e limites seguros.
 * Assim é possível calibrar rate limits por ambiente sem alterar o código.
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

const buildRateLimitMessage = ( message ) => ( req ) => ( {
    status: 'error',
    error: 'Too Many Requests',
    message,
    ...( req.requestId && { requestId: req.requestId } )
} );

const createLimiter = ( { windowMs, max, message } ) => rateLimit( {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: buildRateLimitMessage( message ),
    validate: {
        trustProxy: false
    }
} );

const contractReadLimiter = createLimiter( {
    windowMs: parseIntegerEnv( 'CONTRACT_READ_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, {
        min: 60 * 1000,
        max: 60 * 60 * 1000
    } ),
    max: parseIntegerEnv( 'CONTRACT_READ_RATE_LIMIT_MAX', isProduction ? 120 : 500, {
        min: 10,
        max: 2000
    } ),
    message: 'Muitas consultas de contratos em pouco tempo. Aguarde alguns minutos e tente novamente.'
} );

const contractCreateLimiter = createLimiter( {
    windowMs: parseIntegerEnv( 'CONTRACT_CREATE_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, {
        min: 60 * 1000,
        max: 60 * 60 * 1000
    } ),
    max: parseIntegerEnv( 'CONTRACT_CREATE_RATE_LIMIT_MAX', isProduction ? 30 : 150, {
        min: 1,
        max: 1000
    } ),
    message: 'Muitas criações de contrato em pouco tempo. Aguarde alguns minutos e tente novamente.'
} );

const contractSignLimiter = createLimiter( {
    windowMs: parseIntegerEnv( 'CONTRACT_SIGN_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, {
        min: 60 * 1000,
        max: 60 * 60 * 1000
    } ),
    max: parseIntegerEnv( 'CONTRACT_SIGN_RATE_LIMIT_MAX', isProduction ? 20 : 100, {
        min: 1,
        max: 500
    } ),
    message: 'Muitas tentativas de assinatura em pouco tempo. Aguarde alguns minutos e tente novamente.'
} );

const contractCancellationLimiter = createLimiter( {
    windowMs: parseIntegerEnv( 'CONTRACT_CANCELLATION_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, {
        min: 60 * 1000,
        max: 60 * 60 * 1000
    } ),
    max: parseIntegerEnv( 'CONTRACT_CANCELLATION_RATE_LIMIT_MAX', isProduction ? 30 : 150, {
        min: 1,
        max: 1000
    } ),
    message: 'Muitas solicitações de cancelamento em pouco tempo. Aguarde alguns minutos e tente novamente.'
} );

const contractDeleteLimiter = createLimiter( {
    windowMs: parseIntegerEnv( 'CONTRACT_DELETE_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, {
        min: 60 * 1000,
        max: 60 * 60 * 1000
    } ),
    max: parseIntegerEnv( 'CONTRACT_DELETE_RATE_LIMIT_MAX', isProduction ? 15 : 80, {
        min: 1,
        max: 300
    } ),
    message: 'Muitas exclusões de contrato em pouco tempo. Aguarde alguns minutos e tente novamente.'
} );

const noStore = ( req, res, next ) => {
    res.setHeader( 'Cache-Control', 'no-store' );
    next();
};

const validateUuidParam = ( req, res, next, value ) => {
    if ( UUID_REGEX.test( value ) ) return next();

    return res.status( 400 ).json( {
        status: 'error',
        error: 'Bad Request',
        message: 'ID de contrato inválido.',
        ...( req.requestId && { requestId: req.requestId } )
    } );
};

router.use( noStore );
router.use( authMiddleware );

router.param( 'id', validateUuidParam );

router.get( '/', contractReadLimiter, getContracts );
router.get( '/:id', contractReadLimiter, getContractById );

router.post(
    '/',
    contractCreateLimiter,
    authorizeRoles( 'FREELANCER' ),
    createContract
);

router.patch(
    '/:id/sign',
    contractSignLimiter,
    authorizeRoles( 'CLIENT' ),
    signContract
);

router.patch(
    '/:id/request-cancel',
    contractCancellationLimiter,
    requestCancellation
);

router.patch(
    '/:id/confirm-cancel',
    contractCancellationLimiter,
    confirmCancellation
);

router.delete(
    '/:id',
    contractDeleteLimiter,
    authorizeRoles( 'FREELANCER' ),
    deleteContract
);

export default router;
