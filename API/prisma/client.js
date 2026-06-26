import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const { Pool } = pg;

const isProduction = process.env.NODE_ENV === 'production';
const globalForPrisma = globalThis;

/**
 * Lê uma variável obrigatória do ambiente.
 * A aplicação falha cedo quando algo essencial não está configurado,
 * evitando erros confusos no meio de uma requisição real.
 */
const getRequiredEnv = ( name ) => {
    const value = process.env[ name ];

    if ( !value || !String( value ).trim() ) {
        throw new Error( `Variável de ambiente obrigatória ausente: ${ name }.` );
    }

    return String( value ).trim();
};

/**
 * Converte variáveis de ambiente numéricas com fallback seguro.
 * Também impede valores inválidos, negativos ou fora do intervalo permitido.
 */
const parseIntegerEnv = ( name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {} ) => {
    const rawValue = process.env[ name ];

    if ( rawValue === undefined || rawValue === '' ) return fallback;

    const parsedValue = Number.parseInt( rawValue, 10 );

    if ( Number.isNaN( parsedValue ) || parsedValue < min || parsedValue > max ) {
        throw new Error(
            `Variável ${ name } inválida. Use um número inteiro entre ${ min } e ${ max }.`
        );
    }

    return parsedValue;
};

/**
 * Converte variáveis booleanas vindas do .env.
 * Aceita true/false, 1/0, yes/no e on/off para facilitar configuração no deploy.
 */
const parseBooleanEnv = ( name, fallback ) => {
    const rawValue = process.env[ name ];

    if ( rawValue === undefined || rawValue === '' ) return fallback;

    const normalizedValue = String( rawValue ).trim().toLowerCase();

    if ( [ 'true', '1', 'yes', 'y', 'on' ].includes( normalizedValue ) ) return true;
    if ( [ 'false', '0', 'no', 'n', 'off' ].includes( normalizedValue ) ) return false;

    throw new Error( `Variável ${ name } inválida. Use true ou false.` );
};

const databaseUrl = getRequiredEnv( 'DATABASE_URL' );

/**
 * Valida a DATABASE_URL sem expor usuário ou senha nos logs.
 */
const parseDatabaseUrl = ( connectionString ) => {
    try {
        const parsedUrl = new URL( connectionString );
        const allowedProtocols = new Set( [ 'postgres:', 'postgresql:' ] );

        if ( !allowedProtocols.has( parsedUrl.protocol ) ) {
            throw new Error( 'A DATABASE_URL deve usar o protocolo postgres:// ou postgresql://.' );
        }

        if ( !parsedUrl.hostname ) {
            throw new Error( 'A DATABASE_URL precisa conter um host válido.' );
        }

        return parsedUrl;
    } catch ( error ) {
        throw new Error( `DATABASE_URL inválida: ${ error.message }` );
    }
};

const parsedDatabaseUrl = parseDatabaseUrl( databaseUrl );

/**
 * Mascara a URL para logs, mantendo apenas informações úteis de diagnóstico.
 * Nunca registre DATABASE_URL completa, pois ela contém usuário e senha do banco.
 */
const getSafeDatabaseLabel = () => {
    const host = parsedDatabaseUrl.hostname;
    const databaseName = parsedDatabaseUrl.pathname.replace( /^\//, '' ) || 'database';

    return `${ host }/${ databaseName }`;
};

const isSupabaseHost = /supabase\.(co|com)$/i.test( parsedDatabaseUrl.hostname ) ||
    parsedDatabaseUrl.hostname.includes( '.supabase.' );

/**
 * SSL é recomendado em produção e necessário na maioria das conexões remotas do Supabase.
 * Para banco local, deixe DATABASE_SSL=false.
 */
const shouldUseSsl = () => {
    if ( process.env.DATABASE_SSL !== undefined ) {
        return parseBooleanEnv( 'DATABASE_SSL', true );
    }

    return isProduction || isSupabaseHost;
};

/**
 * Por padrão, mantemos verificação de certificado ativa.
 * Se seu provedor exigir desativação, configure DATABASE_SSL_REJECT_UNAUTHORIZED=false,
 * mas prefira manter true sempre que possível.
 */
const getSslConfig = () => {
    if ( !shouldUseSsl() ) return false;

    return {
        rejectUnauthorized: parseBooleanEnv( 'DATABASE_SSL_REJECT_UNAUTHORIZED', true )
    };
};

/**
 * Configurações do pool.
 * A ideia é evitar excesso de conexões no Supabase Free/Pooler e ainda manter respostas rápidas.
 */
const poolConfig = {
    connectionString: databaseUrl,

    // Quantidade máxima de conexões simultâneas do processo Node.
    // Em produção, controle por DATABASE_POOL_MAX conforme o plano do banco.
    max: parseIntegerEnv( 'DATABASE_POOL_MAX', isProduction ? 10 : 5, { min: 1, max: 50 } ),

    // Tempo máximo aguardando uma conexão livre antes de falhar a requisição.
    connectionTimeoutMillis: parseIntegerEnv( 'DATABASE_CONNECTION_TIMEOUT_MS', 5000, {
        min: 1000,
        max: 30000
    } ),

    // Tempo para encerrar conexões ociosas e liberar recursos do banco.
    idleTimeoutMillis: parseIntegerEnv( 'DATABASE_IDLE_TIMEOUT_MS', 15000, {
        min: 1000,
        max: 120000
    } ),

    // Tempo máximo de vida de cada conexão. Ajuda a reciclar conexões antigas em ambientes cloud.
    maxLifetimeSeconds: parseIntegerEnv( 'DATABASE_MAX_LIFETIME_SECONDS', 60 * 10, {
        min: 30,
        max: 60 * 60
    } ),

    // Identifica esta aplicação nos logs/monitores do PostgreSQL.
    application_name: process.env.DATABASE_APPLICATION_NAME || 'contracts-crm-api',

    ssl: getSslConfig()
};

/**
 * Em desenvolvimento, usar globalThis evita criar vários PrismaClients/pools
 * quando o servidor reinicia módulos com watch mode ou hot reload.
 */
const createDatabaseClient = () => {
    const pool = new Pool( poolConfig );

    pool.on( 'error', ( error ) => {
        console.error( '🚨 Erro assíncrono no pool PostgreSQL:', {
            message: error.message,
            database: getSafeDatabaseLabel()
        } );
    } );

    const adapter = new PrismaPg( pool );

    const prisma = new PrismaClient( {
        adapter,

        // Query log pode expor estrutura e valores sensíveis. Por isso, fica opt-in.
        log: parseBooleanEnv( 'PRISMA_LOG_QUERIES', false )
            ? [ 'query', 'warn', 'error' ]
            : [ 'warn', 'error' ]
    } );

    return { prisma, pool };
};

const databaseClient = globalForPrisma.__contractsCrmDatabaseClient ?? createDatabaseClient();

if ( !isProduction ) {
    globalForPrisma.__contractsCrmDatabaseClient = databaseClient;
}

const { prisma, pool } = databaseClient;

const originalDisconnect = prisma.$disconnect.bind( prisma );
let disconnectPromise = null;

/**
 * Fecha tanto o Prisma quanto o pool externo do pg.
 * Como estamos usando driver adapter, é mais seguro garantir que o pool também seja encerrado.
 */
const closeDatabaseClient = async () => {
    if ( disconnectPromise ) return disconnectPromise;

    disconnectPromise = ( async () => {
        await originalDisconnect();
        await pool.end();
    } )();

    return disconnectPromise;
};

// Mantém compatibilidade com código existente que já chama prisma.$disconnect().
prisma.$disconnect = closeDatabaseClient;

/**
 * Retorna estatísticas leves do pool para diagnóstico interno/health checks.
 * Não inclui credenciais nem dados de usuários.
 */
export const getDatabasePoolStatus = () => ( {
    database: getSafeDatabaseLabel(),
    maxConnections: pool.options.max,
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingRequests: pool.waitingCount,
    ssl: Boolean( pool.options.ssl )
} );

/**
 * Testa a conectividade com o banco.
 * Útil para health checks mais profundos ou scripts de diagnóstico.
 */
export const checkDatabaseConnection = async () => {
    await prisma.$queryRaw`SELECT 1`;

    return {
        status: 'healthy',
        ...getDatabasePoolStatus()
    };
};

/**
 * Encerra Prisma e pool manualmente.
 * O server.js já pode chamar prisma.$disconnect(), mas esta função também finaliza o pool do pg.
 */
export const disconnectDatabase = closeDatabaseClient;

export default prisma;
