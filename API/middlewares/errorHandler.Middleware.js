const isProduction = process.env.NODE_ENV === 'production';

const HTTP_STATUS_MESSAGES = Object.freeze( {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    413: 'Payload Too Large',
    415: 'Unsupported Media Type',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    503: 'Service Unavailable'
} );

/**
 * Converte qualquer valor recebido como status em um código HTTP seguro.
 * Isso impede que erros malformados retornem status inválidos ou causem novas falhas.
 */
const normalizeStatusCode = ( statusCode ) => {
    const parsedStatus = Number( statusCode );

    if ( Number.isInteger( parsedStatus ) && parsedStatus >= 400 && parsedStatus <= 599 ) {
        return parsedStatus;
    }

    return 500;
};

/**
 * Evita que logs acidentais exponham dados sensíveis vindos de erros externos.
 * Não registramos body, headers de autorização nem valores enviados pelo usuário.
 */
const buildLogPayload = ( err, req, statusCode ) => ( {
    requestId: req.requestId,
    statusCode,
    name: err.name,
    code: err.code,
    type: err.type,
    message: err.message,
    method: req.method,
    path: req.originalUrl || req.path,
    ip: req.ip,
    stack: isProduction ? undefined : err.stack
} );

const sendErrorResponse = ( res, statusCode, error, message, requestId, details ) => res.status( statusCode ).json( {
    status: 'error',
    error,
    message,
    ...( requestId && { requestId } ),
    ...( !isProduction && details && { details } )
} );

const getUniqueConstraintMessage = ( err ) => {
    const target = Array.isArray( err.meta?.target )
        ? err.meta.target.join( ',' )
        : String( err.meta?.target || 'campo' );

    if ( target.includes( 'documentHash' ) ) {
        return 'Este CPF/CNPJ já está vinculado a outro usuário.';
    }

    if ( target.includes( 'email' ) ) {
        return 'O e-mail informado já está em uso.';
    }

    if ( target.includes( 'freelancerId_clientId' ) ) {
        return 'Este cliente já está vinculado à carteira do freelancer.';
    }

    return 'O valor informado já está em uso.';
};

/**
 * Traduz erros conhecidos do Prisma para mensagens seguras para o usuário.
 * A aplicação continua sem expor nomes internos de tabela, query ou stack trace.
 */
const getPrismaErrorResponse = ( err ) => {
    switch ( err.code ) {
        case 'P2000':
            return {
                statusCode: 400,
                error: 'Bad Request',
                message: 'Um dos valores enviados excede o tamanho permitido.'
            };

        case 'P2002':
            return {
                statusCode: 409,
                error: 'Conflict',
                message: getUniqueConstraintMessage( err )
            };

        case 'P2003':
            return {
                statusCode: 400,
                error: 'Bad Request',
                message: 'Erro de consistência de dados. O registro relacionado não foi encontrado.'
            };

        case 'P2014':
            return {
                statusCode: 409,
                error: 'Conflict',
                message: 'A alteração solicitada violaria uma relação obrigatória entre registros.'
            };

        case 'P2025':
            return {
                statusCode: 404,
                error: 'Not Found',
                message: 'O registro solicitado não foi encontrado no sistema.'
            };

        case 'P1000':
        case 'P1001':
        case 'P1002':
        case 'P1008':
        case 'P1017':
            return {
                statusCode: 503,
                error: 'Service Unavailable',
                message: 'O banco de dados está temporariamente indisponível. Tente novamente em instantes.'
            };

        default:
            return null;
    }
};

const getBodyParserErrorResponse = ( err ) => {
    if ( err instanceof SyntaxError && err.status === 400 && 'body' in err ) {
        return {
            statusCode: 400,
            error: 'Bad Request',
            message: 'O corpo da requisição JSON está malformado.'
        };
    }

    if ( err.type === 'entity.too.large' ) {
        return {
            statusCode: 413,
            error: 'Payload Too Large',
            message: 'O tamanho do arquivo, imagem ou corpo enviado excede o limite permitido.'
        };
    }

    if ( err.type === 'parameters.too.many' ) {
        return {
            statusCode: 413,
            error: 'Payload Too Large',
            message: 'A requisição possui parâmetros demais.'
        };
    }

    if ( err.type === 'encoding.unsupported' ) {
        return {
            statusCode: 415,
            error: 'Unsupported Media Type',
            message: 'A codificação da requisição não é suportada pela API.'
        };
    }

    return null;
};

const getJwtErrorResponse = ( err ) => {
    if ( err.name === 'TokenExpiredError' ) {
        return {
            statusCode: 401,
            error: 'TokenExpired',
            message: 'Sua sessão expirou. Faça login novamente para continuar.'
        };
    }

    if ( err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError' ) {
        return {
            statusCode: 401,
            error: 'InvalidToken',
            message: 'Token de autenticação inválido.'
        };
    }

    return null;
};

const getKnownErrorResponse = ( err ) => (
    getPrismaErrorResponse( err ) ||
    getBodyParserErrorResponse( err ) ||
    getJwtErrorResponse( err )
);

/**
 * Middleware Global de Tratamento de Erros.
 *
 * Responsabilidades:
 * - registrar erros de forma útil sem vazar dados sensíveis;
 * - traduzir erros técnicos do Prisma, JWT e body-parser;
 * - manter o formato JSON de erro consistente em toda a API;
 * - esconder mensagens internas em produção.
 */
export const errorHandler = ( err, req, res, next ) => {
    if ( res.headersSent ) {
        return next( err );
    }

    const knownError = getKnownErrorResponse( err );

    const statusCode = normalizeStatusCode(
        knownError?.statusCode || err.statusCode || err.status
    );

    const error = knownError?.error || err.error || HTTP_STATUS_MESSAGES[ statusCode ] || 'AppError';

    const safeMessage = knownError?.message || (
        statusCode >= 500 && isProduction
            ? 'Ocorreu um erro interno no servidor.'
            : err.message || 'Ocorreu um erro interno no servidor.'
    );

    const logPayload = buildLogPayload( err, req, statusCode );

    if ( statusCode >= 500 ) {
        console.error( '❌ Erro interno capturado:', logPayload );
    } else {
        console.warn( '⚠️ Erro operacional capturado:', logPayload );
    }

    return sendErrorResponse(
        res,
        statusCode,
        error,
        safeMessage,
        req.requestId,
        {
            code: err.code,
            type: err.type,
            stack: err.stack
        }
    );
};
