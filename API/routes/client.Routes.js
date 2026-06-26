import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
    createClient,
    getClients,
    getClientById
} from '../controllers/client.Controller.js';
import { authMiddleware } from '../middlewares/auth.Middleware.js';
import { authorizeRoles } from '../middlewares/role.Middleware.js';

const router = Router();
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Os IDs do schema Prisma usam @default(uuid()).
 * Validar antes do controller evita consultas desnecessárias ao banco com IDs obviamente inválidos.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Lê variáveis numéricas do .env com limites seguros.
 * Isso permite ajustar rate limits em produção sem mexer no código.
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

    // O server.js já controla trust proxy. Aqui evitamos warnings duplicados do express-rate-limit.
    validate: {
        trustProxy: false
    }
} );

/**
 * Leituras são chamadas com mais frequência pelo front-end, então recebem limite mais amplo.
 * Ainda assim, protegemos listagem e detalhes porque retornam dados sensíveis do cliente.
 */
const clientReadLimiter = createLimiter( {
    windowMs: parseIntegerEnv( 'CLIENT_READ_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, {
        min: 60 * 1000,
        max: 60 * 60 * 1000
    } ),
    max: parseIntegerEnv( 'CLIENT_READ_RATE_LIMIT_MAX', isProduction ? 120 : 500, {
        min: 10,
        max: 2000
    } ),
    message: 'Muitas consultas de clientes em pouco tempo. Aguarde alguns minutos e tente novamente.'
} );

/**
 * Cadastro/vínculo de clientes é operação de escrita e envolve dados pessoais,
 * então recebe limite separado e mais rígido.
 */
const clientWriteLimiter = createLimiter( {
    windowMs: parseIntegerEnv( 'CLIENT_WRITE_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, {
        min: 60 * 1000,
        max: 60 * 60 * 1000
    } ),
    max: parseIntegerEnv( 'CLIENT_WRITE_RATE_LIMIT_MAX', isProduction ? 30 : 150, {
        min: 1,
        max: 1000
    } ),
    message: 'Muitos cadastros ou vínculos de clientes em pouco tempo. Aguarde alguns minutos e tente novamente.'
} );

/**
 * Evita cache de dados pessoais em proxies, navegador ou ferramentas intermediárias.
 * Mesmo que o server.js revisado já aplique isso em /api, manter aqui documenta a sensibilidade da rota.
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
        message: 'ID de cliente inválido.',
        ...( req.requestId && { requestId: req.requestId } )
    } );
};

// Todas as rotas de clientes trafegam dados pessoais e não devem ser cacheadas.
router.use( noStore );

// Todas as rotas de clientes são privadas.
router.use( authMiddleware );

// Apenas freelancers podem gerenciar carteira de clientes.
router.use( authorizeRoles( 'FREELANCER' ) );

// Validação centralizada para qualquer rota que use :id.
router.param( 'id', validateUuidParam );

router.get( '/', clientReadLimiter, getClients );
router.post( '/', clientWriteLimiter, createClient );
router.get( '/:id', clientReadLimiter, getClientById );

export default router;
