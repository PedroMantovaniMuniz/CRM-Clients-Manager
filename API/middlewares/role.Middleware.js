const DEFAULT_ALLOWED_ROLES = Object.freeze( [ 'FREELANCER', 'CLIENT' ] );
const KNOWN_ROLES = new Set( DEFAULT_ALLOWED_ROLES );

/**
 * Normaliza roles para um formato único.
 * Isso evita falhas por diferenças de caixa, espaços ou valores vindos de req.auth/req.userRole.
 */
const normalizeRole = ( role ) => {
    if ( typeof role !== 'string' ) return '';
    return role.trim().toUpperCase();
};

/**
 * Resposta padronizada para falhas de autorização.
 * O requestId facilita encontrar a requisição nos logs sem expor detalhes internos ao cliente.
 */
const sendAuthorizationError = ( res, statusCode, error, message, requestId ) => res.status( statusCode ).json( {
    status: 'error',
    error,
    message,
    ...( requestId && { requestId } )
} );

/**
 * Extrai o papel autenticado da requisição.
 * Mantém compatibilidade com o authMiddleware atual, que injeta req.userRole,
 * e também aceita req.auth.userRole caso você use a versão otimizada do middleware.
 */
const getAuthenticatedRole = ( req ) => normalizeRole( req.userRole || req.auth?.userRole );

/**
 * Normaliza e valida a lista de roles permitidas para uma rota.
 * Essa validação roda quando a rota é registrada, não a cada requisição.
 */
const buildAllowedRoleSet = ( allowedRoles ) => {
    const normalizedRoles = allowedRoles
        .flat()
        .map( normalizeRole )
        .filter( Boolean );

    if ( normalizedRoles.length === 0 ) {
        throw new Error( 'authorizeRoles precisa receber pelo menos uma role permitida.' );
    }

    const invalidRoles = normalizedRoles.filter( role => !KNOWN_ROLES.has( role ) );

    if ( invalidRoles.length > 0 ) {
        throw new Error(
            `authorizeRoles recebeu roles desconhecidas: ${ [ ...new Set( invalidRoles ) ].join( ', ' ) }.`
        );
    }

    return new Set( normalizedRoles );
};

/**
 * Middleware de Autorização baseado em papéis (RBAC - Role-Based Access Control).
 *
 * Use depois do authMiddleware:
 * router.post('/', authMiddleware, authorizeRoles('FREELANCER'), controller)
 *
 * Responsabilidades:
 * - garantir que o usuário já foi autenticado;
 * - verificar se a role autenticada está na lista permitida;
 * - retornar erros padronizados sem revelar regras internas da aplicação.
 */
export const authorizeRoles = ( ...allowedRoles ) => {
    const allowedRoleSet = buildAllowedRoleSet( allowedRoles );

    return ( req, res, next ) => {
        const authenticatedRole = getAuthenticatedRole( req );

        if ( !authenticatedRole ) {
            return sendAuthorizationError(
                res,
                500,
                'AuthorizationContextMissing',
                'Falha na verificação de permissões. O contexto de autenticação não foi encontrado na requisição.',
                req.requestId
            );
        }

        if ( !KNOWN_ROLES.has( authenticatedRole ) ) {
            return sendAuthorizationError(
                res,
                403,
                'Forbidden',
                'Acesso negado. Seu nível de acesso não é reconhecido pela aplicação.',
                req.requestId
            );
        }

        if ( !allowedRoleSet.has( authenticatedRole ) ) {
            return sendAuthorizationError(
                res,
                403,
                'Forbidden',
                'Acesso negado. Você não possui permissão para acessar este recurso.',
                req.requestId
            );
        }

        return next();
    };
};

/**
 * Helper simples para controllers ou middlewares futuros.
 * Exemplo: if ( hasRole(req, 'FREELANCER') ) { ... }
 */
export const hasRole = ( req, role ) => {
    const authenticatedRole = getAuthenticatedRole( req );
    return authenticatedRole === normalizeRole( role );
};

/**
 * Helper para casos em que uma ação pode ser feita por várias roles.
 */
export const hasAnyRole = ( req, roles = [] ) => {
    const authenticatedRole = getAuthenticatedRole( req );
    const allowedRoleSet = buildAllowedRoleSet( Array.isArray( roles ) ? roles : [ roles ] );

    return allowedRoleSet.has( authenticatedRole );
};
