import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
    createTemplate,
    getTemplates,
    getTemplateById,
    updateTemplate,
    deleteTemplate
} from '../controllers/template.Controller.js';
import { authMiddleware } from '../middlewares/auth.Middleware.js';
import { authorizeRoles } from '../middlewares/role.Middleware.js';

const router = Router();
const isProduction = process.env.NODE_ENV === 'production';

/**
 * IDs do Prisma são UUIDs. Validar antes do controller evita consultas inúteis
 * e padroniza a resposta para parâmetros obviamente inválidos.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Lê variáveis numéricas do .env com fallback seguro.
 * Isso permite ajustar limites no deploy sem alterar o código fonte.
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

    // O server.js revisado já configura trust proxy; aqui evitamos validações duplicadas.
    validate: {
        trustProxy: false
    }
} );

/**
 * Leituras de templates são chamadas com frequência pela interface de criação de contratos.
 * O limite é mais amplo, mas ainda protege contra abuso automatizado.
 */
const templateReadLimiter = createLimiter( {
    windowMs: parseIntegerEnv( 'TEMPLATE_READ_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, {
        min: 60 * 1000,
        max: 60 * 60 * 1000
    } ),
    max: parseIntegerEnv( 'TEMPLATE_READ_RATE_LIMIT_MAX', isProduction ? 150 : 700, {
        min: 10,
        max: 3000
    } ),
    message: 'Muitas consultas de modelos em pouco tempo. Aguarde alguns minutos e tente novamente.'
} );

/**
 * Escritas em templates podem salvar estruturas JSON grandes.
 * Mantemos limite separado para criação/edição e exclusão.
 */
const templateWriteLimiter = createLimiter( {
    windowMs: parseIntegerEnv( 'TEMPLATE_WRITE_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, {
        min: 60 * 1000,
        max: 60 * 60 * 1000
    } ),
    max: parseIntegerEnv( 'TEMPLATE_WRITE_RATE_LIMIT_MAX', isProduction ? 40 : 200, {
        min: 1,
        max: 1000
    } ),
    message: 'Muitas alterações de modelos em pouco tempo. Aguarde alguns minutos e tente novamente.'
} );

const templateDeleteLimiter = createLimiter( {
    windowMs: parseIntegerEnv( 'TEMPLATE_DELETE_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, {
        min: 60 * 1000,
        max: 60 * 60 * 1000
    } ),
    max: parseIntegerEnv( 'TEMPLATE_DELETE_RATE_LIMIT_MAX', isProduction ? 20 : 100, {
        min: 1,
        max: 500
    } ),
    message: 'Muitas exclusões de modelos em pouco tempo. Aguarde alguns minutos e tente novamente.'
} );

/**
 * Templates não costumam conter senhas, mas podem conter cláusulas privadas de negócio.
 * Evitamos cache intermediário para manter o comportamento consistente com o restante da API.
 */
const noStore = ( req, res, next ) => {
    res.setHeader( 'Cache-Control', 'no-store' );
    next();
};

const validateUuidParam = ( req, res, next, value ) => {
    if ( UUID_REGEX.test( value ) ) return next();

    return res.status( 400 ).json( {
        status: 'error',
        error: 'Bad Request',
        message: 'ID de modelo de contrato inválido.',
        ...( req.requestId && { requestId: req.requestId } )
    } );
};

router.use( noStore );
router.use( authMiddleware );
router.use( authorizeRoles( 'FREELANCER' ) );

router.param( 'id', validateUuidParam );

router.get( '/', templateReadLimiter, getTemplates );
router.post( '/', templateWriteLimiter, createTemplate );
router.get( '/:id', templateReadLimiter, getTemplateById );
router.put( '/:id', templateWriteLimiter, updateTemplate );
router.patch( '/:id', templateWriteLimiter, updateTemplate );
router.delete( '/:id', templateDeleteLimiter, deleteTemplate );

export default router;
