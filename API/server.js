import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

// Prisma é importado aqui para permitir encerramento seguro das conexões no shutdown.
import prisma from './prisma/client.js';

// Rotas da API organizadas por responsabilidade.
import authRoutes from './routes/auth.Routes.js';
import contractRoutes from './routes/contract.Routes.js';
import clientRoutes from './routes/client.Routes.js';
import templateRoutes from './routes/template.Routes.js';

// Middleware global responsável por padronizar todas as respostas de erro.
import { errorHandler } from './middlewares/errorHandler.Middleware.js';

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

// Remove o cabeçalho "X-Powered-By: Express", reduzindo exposição desnecessária da stack.
app.disable( 'x-powered-by' );

const databaseUrl = process.env.DATABASE_URL || '';

/**
 * Converte variáveis de ambiente em lista.
 * Exemplo: FRONTEND_ALLOWED_ORIGINS="http://localhost:5173,https://app.com"
 */
const parseCsvEnv = ( value ) => String( value ?? '' )
    .split( ',' )
    .map( item => item.trim() )
    .filter( Boolean );

/**
 * Em produção, normalmente a API roda atrás de proxy/reverse proxy.
 * O trust proxy permite que o rate-limit leia corretamente o IP real do cliente.
 * Use TRUST_PROXY=0 para desativar, TRUST_PROXY=1 para um proxy, ou informe um valor aceito pelo Express.
 */
const configureTrustProxy = () => {
    const rawTrustProxy = process.env.TRUST_PROXY ?? ( isProduction ? '1' : '0' );

    if ( rawTrustProxy === '0' || rawTrustProxy === 'false' ) return;

    const numericValue = Number( rawTrustProxy );
    app.set(
        'trust proxy',
        Number.isNaN( numericValue ) ? rawTrustProxy : numericValue
    );
};

configureTrustProxy();

/**
 * Lista fechada de origens permitidas.
 * Em desenvolvimento, libera o Vite local por padrão.
 * Em produção, prefira configurar FRONTEND_URL ou FRONTEND_ALLOWED_ORIGINS no .env/host.
 */
const allowedOrigins = new Set( [
    process.env.FRONTEND_URL,
    ...parseCsvEnv( process.env.FRONTEND_ALLOWED_ORIGINS ),
    !isProduction ? 'http://localhost:5173' : null,
    !isProduction ? 'http://127.0.0.1:5173' : null
].filter( Boolean ) );

const corsOptions = {
    origin( origin, callback ) {
        // Requisições server-to-server, Postman, Insomnia e health checks geralmente não enviam Origin.
        if ( !origin ) return callback( null, true );

        if ( allowedOrigins.has( origin ) ) return callback( null, true );

        const error = new Error( 'Origem não autorizada pelo CORS.' );
        error.statusCode = 403;
        error.error = 'Forbidden';
        return callback( error, false );
    },
    methods: [ 'GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS' ],
    allowedHeaders: [ 'Authorization', 'Content-Type' ],
    credentials: true,
    maxAge: 600,
    optionsSuccessStatus: 204
};

/**
 * Comprime respostas somente quando fizer sentido.
 * O header X-No-Compression permite desativar compressão em casos específicos.
 */
const shouldCompress = ( req, res ) => {
    if ( req.headers[ 'x-no-compression' ] ) return false;
    return compression.filter( req, res );
};

// =========================================================================
// 1. SEGURANÇA, PERFORMANCE E OBSERVABILIDADE
// =========================================================================

app.use( ( req, res, next ) => {
    // ID simples por requisição, útil para rastrear erros no console/logs.
    req.requestId = crypto.randomUUID();
    res.setHeader( 'X-Request-Id', req.requestId );
    next();
} );

app.use( helmet( {
    // APIs consumidas por frontend em outra origem precisam permitir leitura cross-origin controlada pelo CORS.
    crossOriginResourcePolicy: { policy: 'cross-origin' },

    // HSTS só deve ser enviado em produção com HTTPS real.
    hsts: isProduction
        ? {
            maxAge: 15552000, // 180 dias
            includeSubDomains: true,
            preload: false
        }
        : false
} ) );

app.use( compression( {
    filter: shouldCompress,
    threshold: 1024
} ) );

app.use( cors( corsOptions ) );

// Mantém o payload controlado. 5mb cobre assinatura em base64 com folga, sem abrir demais a API.
app.use( express.json( {
    limit: process.env.JSON_BODY_LIMIT || '5mb',
    strict: true
} ) );

// Suporte defensivo a forms simples, caso algum cliente envie application/x-www-form-urlencoded.
app.use( express.urlencoded( {
    extended: false,
    limit: '100kb',
    parameterLimit: 100
} ) );

const apiLimiter = rateLimit( {
    windowMs: Number( process.env.RATE_LIMIT_WINDOW_MS ) || 15 * 60 * 1000,
    max: Number( process.env.RATE_LIMIT_MAX ) || ( isProduction ? 300 : 1000 ),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 'error',
        error: 'Too Many Requests',
        message: 'Muitas requisições originadas deste IP. Por favor, tente novamente mais tarde.'
    }
} );

// Health check leve para monitoramento, Render/Railway/Vercel/Supabase Edge checks etc.
app.get( '/health', ( req, res ) => {
    res.status( 200 ).json( {
        status: 'success',
        service: 'contracts-crm-api',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    } );
} );

// Todas as respostas da API carregam dados privados do usuário, então evitamos cache intermediário.
app.use( '/api', ( req, res, next ) => {
    res.setHeader( 'Cache-Control', 'no-store' );
    next();
} );

app.use( '/api', apiLimiter );

// =========================================================================
// 2. ROTAS DA API
// =========================================================================

app.use( '/api/auth', authRoutes );
app.use( '/api/contracts', contractRoutes );
app.use( '/api/clients', clientRoutes );
app.use( '/api/templates', templateRoutes );

// Resposta JSON padronizada para endpoints inexistentes dentro da API.
app.use( '/api', ( req, res ) => {
    res.status( 404 ).json( {
        status: 'error',
        error: 'Not Found',
        message: 'Rota da API não encontrada.',
        requestId: req.requestId
    } );
} );

// Resposta enxuta para qualquer rota fora de /api.
app.use( ( req, res ) => {
    res.status( 404 ).json( {
        status: 'error',
        error: 'Not Found',
        message: 'Recurso não encontrado.',
        requestId: req.requestId
    } );
} );

// =========================================================================
// 3. TRATAMENTO GLOBAL DE ERROS
// =========================================================================

app.use( errorHandler );

// =========================================================================
// 4. INICIALIZAÇÃO E SHUTDOWN SEGURO
// =========================================================================

const PORT = Number( process.env.PORT ) || 3000;

const server = app.listen( PORT, "0.0.0.0", () => {
    console.log( `🚀 API do Contracts CRM rodando na porta ${ PORT }.` );
} );

const shutdown = async ( signal ) => {
    console.log( `\n${ signal } recebido. Encerrando servidor com segurança...` );

    server.close( async () => {
        try {
            await prisma.$disconnect();
            console.log( '✅ Conexões encerradas. Processo finalizado.' );
            process.exit( 0 );
        } catch ( error ) {
            console.error( '❌ Erro ao encerrar conexões:', error );
            process.exit( 1 );
        }
    } );

    // Evita processo preso indefinidamente caso alguma conexão HTTP não finalize.
    setTimeout( () => {
        console.error( '⏱️ Encerramento forçado por timeout.' );
        process.exit( 1 );
    }, 10_000 ).unref();
};

process.on( 'SIGTERM', () => shutdown( 'SIGTERM' ) );
process.on( 'SIGINT', () => shutdown( 'SIGINT' ) );

process.on( 'unhandledRejection', ( reason ) => {
    console.error( '❌ Promise rejeitada sem tratamento:', reason );
} );

process.on( 'uncaughtException', ( error ) => {
    console.error( '❌ Exceção não capturada:', error );
    shutdown( 'uncaughtException' );
} );

export default app;
