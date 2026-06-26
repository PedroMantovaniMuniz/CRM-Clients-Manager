import crypto from 'crypto';
import prisma from '../prisma/client.js';
import {
    sensitiveUserSelect,
    toPublicUser,
    toSensitiveUser
} from '../utils/userProfilePresenter.Util.js';

const CONTRACT_STATUSES = Object.freeze( [ 'PENDING', 'SIGNED', 'CANCELLED', 'COMPLETED' ] );
const ALLOWED_STRUCTURE_TYPES = new Set( [ 'CLAUSE', 'SUBCLAUSE', 'PARAGRAPH', 'INCISO', 'ITEM', 'ALINEA', 'FREE_TEXT' ] );

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const DEFAULT_SIGNATURE_MAX_BYTES = 2_500_000;
const MAX_CONTRACT_VALUE = 1_000_000_000;
const MAX_STEPS = 30;
const MAX_STRUCTURE_BLOCKS = 120;
const MAX_BLOCK_CONTENT_LENGTH = 3000;
const MAX_STEP_DESCRIPTION_LENGTH = 500;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeSpaces = ( value ) => String( value ?? '' ).trim().replace( /\s+/g, ' ' );

const sendError = ( res, statusCode, error, message, requestId ) => res.status( statusCode ).json( {
    status: 'error',
    error,
    message,
    ...( requestId && { requestId } )
} );

const createHttpError = ( statusCode, error, message ) => {
    const appError = new Error( message );
    appError.statusCode = statusCode;
    appError.error = error;
    return appError;
};

const parseIntegerEnv = ( name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {} ) => {
    const rawValue = process.env[ name ];

    if ( rawValue === undefined || rawValue === '' ) return fallback;

    const parsedValue = Number.parseInt( rawValue, 10 );

    if ( Number.isNaN( parsedValue ) || parsedValue < min || parsedValue > max ) {
        throw new Error( `Variável ${ name } inválida. Use um número inteiro entre ${ min } e ${ max }.` );
    }

    return parsedValue;
};

const getSignatureMaxBytes = () => parseIntegerEnv( 'SIGNATURE_MAX_BYTES', DEFAULT_SIGNATURE_MAX_BYTES, {
    min: 50_000,
    max: 5_000_000
} );

/**
 * Datas vindas de inputs date são tratadas como data civil, não como horário local.
 * Isso evita contrato “voltar um dia” por diferença de fuso horário entre front, API e banco.
 */
const parseDateOnly = ( value ) => {
    if ( !value ) return null;

    const match = String( value ).trim().match( /^(\d{4})-(\d{2})-(\d{2})/ );
    if ( !match ) return null;

    const [ , year, month, day ] = match.map( Number );
    const date = new Date( Date.UTC( year, month - 1, day, 0, 0, 0, 0 ) );

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return date;
};

/**
 * Aceita formatos comuns do Brasil e do JavaScript:
 * 1500, 1500.50, 1500,50, 1.500,50, R$ 1.500,50.
 */
const parseContractValue = ( value ) => {
    if ( typeof value === 'number' ) return Number.isFinite( value ) ? value : null;

    const rawValue = String( value ?? '' )
        .trim()
        .replace( /R\$/gi, '' )
        .replace( /\s/g, '' );

    if ( !rawValue ) return null;

    const normalizedValue = rawValue.includes( ',' )
        ? rawValue.replace( /\./g, '' ).replace( ',', '.' )
        : rawValue;

    if ( !/^\d+(\.\d{1,2})?$/.test( normalizedValue ) ) return null;

    const parsedValue = Number( normalizedValue );

    if ( !Number.isFinite( parsedValue ) || parsedValue <= 0 || parsedValue > MAX_CONTRACT_VALUE ) {
        return null;
    }

    return parsedValue;
};

const isStrictBase64 = ( value ) => (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test( value )
);

/**
 * Valida assinatura em data URL e limita o tamanho real da imagem decodificada.
 * A API nunca tenta interpretar pixels; ela apenas valida tipo, base64 e tamanho.
 */
const isValidSignatureDataUrl = ( value ) => {
    if ( typeof value !== 'string' ) return false;

    const match = value.match( /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i );
    if ( !match ) return false;

    const base64Payload = match[ 2 ];
    if ( !isStrictBase64( base64Payload ) ) return false;

    try {
        const imageBuffer = Buffer.from( base64Payload, 'base64' );
        return imageBuffer.length > 0 && imageBuffer.length <= getSignatureMaxBytes();
    } catch {
        return false;
    }
};

const validateSteps = ( steps, startDate, endDate ) => {
    if ( steps === undefined ) return [];
    if ( !Array.isArray( steps ) ) return { error: 'As etapas devem ser enviadas em formato de lista.' };
    if ( steps.length > MAX_STEPS ) return { error: `O contrato pode ter no máximo ${ MAX_STEPS } etapas.` };

    const cleanSteps = [];

    for ( const [ index, step ] of steps.entries() ) {
        if ( !step || typeof step !== 'object' || Array.isArray( step ) ) {
            return { error: `A etapa ${ index + 1 } deve ser um objeto válido.` };
        }

        const description = normalizeSpaces( step.description );
        const deliveryDate = parseDateOnly( step.deliveryDate );

        if ( description.length < 3 || description.length > MAX_STEP_DESCRIPTION_LENGTH ) {
            return {
                error: `A descrição da etapa ${ index + 1 } deve possuir entre 3 e ${ MAX_STEP_DESCRIPTION_LENGTH } caracteres.`
            };
        }

        if ( !deliveryDate ) {
            return { error: `Informe uma data válida para a etapa ${ index + 1 }.` };
        }

        if ( deliveryDate < startDate || deliveryDate > endDate ) {
            return { error: `A etapa ${ index + 1 } deve ter prazo entre a data de início e a data de fim do contrato.` };
        }

        cleanSteps.push( {
            description,
            deliveryDate,
            status: 'PENDING'
        } );
    }

    return cleanSteps;
};
const normalizeStructureBlockId = ( blockId ) => {
    const normalizedId = normalizeSpaces( blockId );

    if ( normalizedId && normalizedId.length <= 80 && /^[\w:.-]+$/u.test( normalizedId ) ) {
        return normalizedId;
    }

    return crypto.randomUUID();
};

const validateStructure = ( structure ) => {
    if ( structure === undefined || structure === null ) return [];
    if ( !Array.isArray( structure ) ) return { error: 'A estrutura do contrato deve ser uma lista de blocos.' };
    if ( structure.length > MAX_STRUCTURE_BLOCKS ) {
        return { error: `A estrutura do contrato pode ter no máximo ${ MAX_STRUCTURE_BLOCKS } blocos.` };
    }

    const cleanStructure = [];

    for ( const [ index, block ] of structure.entries() ) {
        if ( !block || typeof block !== 'object' || Array.isArray( block ) ) {
            return { error: `O bloco ${ index + 1 } da estrutura deve ser um objeto válido.` };
        }

        const type = ALLOWED_STRUCTURE_TYPES.has( block.type ) ? block.type : 'FREE_TEXT';
        const content = normalizeSpaces( block.content );

        if ( content.length < 1 || content.length > MAX_BLOCK_CONTENT_LENGTH ) {
            return {
                error: `O bloco ${ index + 1 } da estrutura deve possuir conteúdo e no máximo ${ MAX_BLOCK_CONTENT_LENGTH } caracteres.`
            };
        }

        cleanStructure.push( {
            id: normalizeStructureBlockId( block.id ),
            type,
            content
        } );
    }

    return cleanStructure;
};

const parsePagination = ( query ) => {
    const page = Math.max( Number.parseInt( query.page, 10 ) || DEFAULT_PAGE, 1 );
    const requestedLimit = Number.parseInt( query.limit, 10 ) || DEFAULT_LIMIT;
    const limit = Math.min( Math.max( requestedLimit, 1 ), MAX_LIMIT );
    const skip = ( page - 1 ) * limit;

    return { page, limit, skip };
};

const parseStatusFilter = ( rawStatus ) => {
    const status = normalizeSpaces( rawStatus ).toUpperCase();

    if ( !status ) return {};

    if ( !CONTRACT_STATUSES.includes( status ) ) {
        return { error: 'Status de contrato inválido.' };
    }

    return { status };
};

const publicContractUserSelect = Object.freeze( {
    id: true,
    name: true,
    lastName: true,
    email: true,
    role: true
} );

const contractIncludePublic = Object.freeze( {
    client: { select: publicContractUserSelect },
    freelancer: { select: publicContractUserSelect },
    steps: {
        orderBy: { deliveryDate: 'asc' },
        select: {
            id: true,
            description: true,
            deliveryDate: true,
            status: true,
            createdAt: true,
            updatedAt: true
        }
    }
} );

/**
 * Select enxuto para listagens.
 * Não retorna assinaturas nem estrutura JSON completa, reduzindo payload e evitando vazamento de base64.
 */
const contractListSelect = Object.freeze( {
    id: true,
    clientId: true,
    freelancerId: true,
    value: true,
    startDate: true,
    endDate: true,
    status: true,
    cancellationRequestedBy: true,
    createdAt: true,
    updatedAt: true,
    ...contractIncludePublic
} );

const contractIncludeSensitive = Object.freeze( {
    client: { select: sensitiveUserSelect },
    freelancer: { select: sensitiveUserSelect },
    steps: { orderBy: { deliveryDate: 'asc' } }
} );

const toContractListResponse = ( contract ) => ( {
    ...contract,
    client: toPublicUser( contract.client ),
    freelancer: toPublicUser( contract.freelancer )
} );

const toContractDetailResponse = ( contract ) => ( {
    ...contract,
    client: toSensitiveUser( contract.client ),
    freelancer: toSensitiveUser( contract.freelancer )
} );

const buildAccessWhereClause = ( userId, userRole ) => {
    if ( userRole === 'FREELANCER' ) return { freelancerId: userId };
    if ( userRole === 'CLIENT' ) return { clientId: userId };
    return { id: '__no_access__' };
};

const ensureContractAccess = ( contract, userId, userRole ) => {
    if ( !contract ) return false;
    if ( userRole === 'FREELANCER' ) return contract.freelancerId === userId;
    if ( userRole === 'CLIENT' ) return contract.clientId === userId;
    return false;
};

const isContractParticipant = ( contract, userId ) => (
    contract?.clientId === userId || contract?.freelancerId === userId
);

const isOtherParticipant = ( contract, userId, participantId ) => (
    participantId && participantId !== userId && isContractParticipant( contract, participantId )
);

/**
 * Cria um contrato para um cliente vinculado ao freelancer autenticado.
 * A assinatura do freelancer é reaproveitada quando já existe; caso contrário, é salva na primeira criação.
 */
export const createContract = async ( req, res, next ) => {
    try {
        res.setHeader( 'Cache-Control', 'no-store' );

        const {
            clientId,
            value,
            startDate,
            endDate,
            steps,
            contractedSignature,
            structure
        } = req.body ?? {};

        const freelancerId = req.userId;

        if ( !UUID_REGEX.test( String( clientId ?? '' ) ) || value === undefined || !startDate || !endDate ) {
            return sendError(
                res,
                400,
                'Bad Request',
                'Dados incompletos. Cliente, valor, data de início e data de fim são obrigatórios.',
                req.requestId
            );
        }

        const parsedValue = parseContractValue( value );
        if ( parsedValue === null ) {
            return sendError( res, 400, 'Bad Request', 'Informe um valor válido para o contrato.', req.requestId );
        }

        const parsedStartDate = parseDateOnly( startDate );
        const parsedEndDate = parseDateOnly( endDate );

        if ( !parsedStartDate || !parsedEndDate ) {
            return sendError( res, 400, 'Bad Request', 'Informe datas válidas de início e fim.', req.requestId );
        }

        if ( parsedEndDate <= parsedStartDate ) {
            return sendError( res, 400, 'Bad Request', 'A data de fim deve ser posterior à data de início.', req.requestId );
        }

        const cleanSteps = validateSteps( steps, parsedStartDate, parsedEndDate );
        if ( cleanSteps.error ) {
            return sendError( res, 400, 'Bad Request', cleanSteps.error, req.requestId );
        }

        const cleanStructure = validateStructure( structure );
        if ( cleanStructure.error ) {
            return sendError( res, 400, 'Bad Request', cleanStructure.error, req.requestId );
        }
        const newContract = await prisma.$transaction( async ( tx ) => {
            const [ freelancer, client ] = await Promise.all( [
                tx.user.findFirst( {
                    where: { id: freelancerId, role: 'FREELANCER' },
                    select: { id: true, signature: true }
                } ),
                tx.user.findFirst( {
                    where: {
                        id: clientId,
                        role: 'CLIENT',
                        freelancerLinksAsClient: {
                            some: { freelancerId }
                        }
                    },
                    select: {
                        id: true,
                        documentEncrypted: true
                    }
                } )
            ] );

            if ( !freelancer ) {
                throw createHttpError( 403, 'Forbidden', 'Apenas freelancers autenticados podem criar contratos.' );
            }

            if ( !client ) {
                throw createHttpError( 404, 'Not Found', 'Cliente não encontrado ou ainda não está vinculado à sua carteira.' );
            }

            if ( !client.documentEncrypted ) {
                throw createHttpError(
                    400,
                    'Bad Request',
                    'O cliente selecionado ainda não possui CPF/CNPJ cadastrado. Atualize o cadastro do cliente antes de criar o contrato.'
                );
            }

            let finalSignature = freelancer.signature;

            if ( !finalSignature ) {
                if ( !isValidSignatureDataUrl( contractedSignature ) ) {
                    throw createHttpError( 400, 'Bad Request', 'Assinatura obrigatória e válida no primeiro contrato.' );
                }

                finalSignature = contractedSignature;

                await tx.user.update( {
                    where: { id: freelancerId },
                    data: { signature: finalSignature }
                } );
            }

            return tx.contract.create( {
                data: {
                    clientId,
                    freelancerId,
                    value: parsedValue,
                    startDate: parsedStartDate,
                    endDate: parsedEndDate,
                    contractedSignature: finalSignature,
                    status: 'PENDING',
                    structure: cleanStructure,
                    steps: {
                        create: cleanSteps
                    }
                },
                include: contractIncludeSensitive
            } );
        } );

        const contractResponse = toContractDetailResponse( newContract );

        return res.status( 201 ).json( {
            status: 'success',
            message: 'Contrato criado com sucesso.',
            contract: contractResponse,
            newContract: contractResponse
        } );
    } catch ( error ) {
        next( error );
    }
};

/**
 * Assina um contrato pendente pelo cliente autenticado.
 * Usa transação para evitar contrato parcialmente assinado em caso de falha no meio da operação.
 */
export const signContract = async ( req, res, next ) => {
    try {
        res.setHeader( 'Cache-Control', 'no-store' );

        const { id } = req.params;
        const { clientSignature } = req.body ?? {};
        const clientId = req.userId;

        const updatedContract = await prisma.$transaction( async ( tx ) => {
            const contract = await tx.contract.findUnique( {
                where: { id },
                select: {
                    id: true,
                    clientId: true,
                    freelancerId: true,
                    status: true
                }
            } );

            if ( !contract || contract.clientId !== clientId ) {
                throw createHttpError( 403, 'Forbidden', 'Contrato inválido ou não autorizado.' );
            }

            if ( contract.status === 'SIGNED' || contract.status === 'COMPLETED' ) {
                throw createHttpError( 409, 'Conflict', 'Este contrato já se encontra assinado.' );
            }

            if ( contract.status === 'CANCELLED' ) {
                throw createHttpError( 400, 'Bad Request', 'Contratos cancelados não podem ser assinados.' );
            }

            const client = await tx.user.findUnique( {
                where: { id: clientId },
                select: { signature: true }
            } );

            let finalSignature = client?.signature;

            if ( !finalSignature ) {
                if ( !isValidSignatureDataUrl( clientSignature ) ) {
                    throw createHttpError(
                        400,
                        'Bad Request',
                        'A assinatura é obrigatória e deve ser uma imagem válida na primeira vez.'
                    );
                }

                finalSignature = clientSignature;

                await tx.user.update( {
                    where: { id: clientId },
                    data: { signature: finalSignature }
                } );
            }

            const updateResult = await tx.contract.updateMany( {
                where: {
                    id,
                    clientId,
                    status: 'PENDING'
                },
                data: {
                    clientSignature: finalSignature,
                    status: 'SIGNED'
                }
            } );

            if ( updateResult.count !== 1 ) {
                throw createHttpError( 409, 'Conflict', 'O contrato não está mais pendente para assinatura.' );
            }

            return tx.contract.findUnique( {
                where: { id },
                include: contractIncludeSensitive
            } );
        } );

        const contractResponse = toContractDetailResponse( updatedContract );

        return res.status( 200 ).json( {
            status: 'success',
            message: 'Contrato assinado com sucesso.',
            contract: contractResponse,
            updatedContract: contractResponse
        } );
    } catch ( error ) {
        next( error );
    }
};

/**
 * Lista contratos do usuário autenticado com paginação e filtro opcional por status.
 * A listagem não retorna assinaturas nem estrutura completa para manter resposta leve.
 */
export const getContracts = async ( req, res, next ) => {
    try {
        const { userId, userRole } = req;
        const { page, limit, skip } = parsePagination( req.query );
        const statusFilter = parseStatusFilter( req.query.status );

        if ( statusFilter.error ) {
            return sendError( res, 400, 'Bad Request', statusFilter.error, req.requestId );
        }

        const whereClause = {
            ...buildAccessWhereClause( userId, userRole ),
            ...( statusFilter.status && { status: statusFilter.status } )
        };

        const [ total, contracts ] = await prisma.$transaction( [
            prisma.contract.count( { where: whereClause } ),
            prisma.contract.findMany( {
                where: whereClause,
                select: contractListSelect,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            } )
        ] );

        return res.status( 200 ).json( {
            status: 'success',
            results: contracts.length,
            total,
            pagination: {
                page,
                limit,
                totalPages: Math.max( Math.ceil( total / limit ), 1 ),
                hasNextPage: page * limit < total,
                hasPreviousPage: page > 1
            },
            contracts: contracts.map( toContractListResponse )
        } );
    } catch ( error ) {
        next( error );
    }
};
/**
 * Busca contrato completo para visualização, preview e PDF.
 * Dados sensíveis aparecem somente após checagem de vínculo com o contrato.
 */
export const getContractById = async ( req, res, next ) => {
    try {
        res.setHeader( 'Cache-Control', 'no-store' );

        const { id } = req.params;
        const { userId, userRole } = req;

        const contract = await prisma.contract.findUnique( {
            where: { id },
            include: contractIncludeSensitive
        } );

        if ( !contract ) {
            return sendError( res, 404, 'Not Found', 'Contrato não encontrado.', req.requestId );
        }

        if ( !ensureContractAccess( contract, userId, userRole ) ) {
            return sendError( res, 403, 'Forbidden', 'Acesso negado a este contrato.', req.requestId );
        }

        return res.status( 200 ).json( {
            status: 'success',
            contract: toContractDetailResponse( contract )
        } );
    } catch ( error ) {
        next( error );
    }
};

/**
 * Solicita cancelamento de contrato.
 * A outra parte precisa confirmar para que o contrato seja efetivamente cancelado.
 */
export const requestCancellation = async ( req, res, next ) => {
    try {
        res.setHeader( 'Cache-Control', 'no-store' );

        const { id } = req.params;
        const userId = req.userId;

        const contract = await prisma.contract.findUnique( {
            where: { id },
            select: {
                id: true,
                clientId: true,
                freelancerId: true,
                status: true,
                cancellationRequestedBy: true
            }
        } );

        if ( !contract ) {
            return sendError( res, 404, 'Not Found', 'Contrato não encontrado.', req.requestId );
        }

        if ( !isContractParticipant( contract, userId ) ) {
            return sendError( res, 403, 'Forbidden', 'Acesso negado.', req.requestId );
        }

        if ( contract.status === 'PENDING' ) {
            return sendError(
                res,
                400,
                'Bad Request',
                'Contratos pendentes ainda podem ser excluídos pelo freelancer, não precisam de solicitação de cancelamento.',
                req.requestId
            );
        }

        if ( contract.status === 'CANCELLED' ) {
            return sendError( res, 409, 'Conflict', 'Este contrato já está cancelado.', req.requestId );
        }

        if ( contract.cancellationRequestedBy === userId ) {
            return sendError( res, 409, 'Conflict', 'Você já solicitou o cancelamento deste contrato.', req.requestId );
        }

        if ( isOtherParticipant( contract, userId, contract.cancellationRequestedBy ) ) {
            return sendError(
                res,
                409,
                'Conflict',
                'A outra parte já solicitou o cancelamento. Use a confirmação de cancelamento para finalizar.',
                req.requestId
            );
        }

        const updatedContract = await prisma.contract.update( {
            where: { id },
            data: { cancellationRequestedBy: userId },
            select: contractListSelect
        } );

        return res.status( 200 ).json( {
            status: 'success',
            message: 'Cancelamento solicitado com sucesso.',
            updatedContract: toContractListResponse( updatedContract )
        } );
    } catch ( error ) {
        next( error );
    }
};

/**
 * Confirma cancelamento solicitado pela outra parte.
 */
export const confirmCancellation = async ( req, res, next ) => {
    try {
        res.setHeader( 'Cache-Control', 'no-store' );

        const { id } = req.params;
        const userId = req.userId;

        const contract = await prisma.contract.findUnique( {
            where: { id },
            select: {
                id: true,
                clientId: true,
                freelancerId: true,
                status: true,
                cancellationRequestedBy: true
            }
        } );

        if ( !contract ) {
            return sendError( res, 404, 'Not Found', 'Contrato não encontrado.', req.requestId );
        }

        if ( !isContractParticipant( contract, userId ) ) {
            return sendError( res, 403, 'Forbidden', 'Acesso negado.', req.requestId );
        }

        if ( contract.status === 'PENDING' ) {
            return sendError(
                res,
                400,
                'Bad Request',
                'Contratos pendentes podem ser excluídos pelo freelancer e não precisam de confirmação de cancelamento.',
                req.requestId
            );
        }

        if ( contract.status === 'CANCELLED' ) {
            return sendError( res, 409, 'Conflict', 'Este contrato já está cancelado.', req.requestId );
        }

        if ( !contract.cancellationRequestedBy ) {
            return sendError( res, 400, 'Bad Request', 'Não há solicitação de cancelamento pendente.', req.requestId );
        }

        if ( contract.cancellationRequestedBy === userId ) {
            return sendError(
                res,
                400,
                'Bad Request',
                'Você não pode confirmar sua própria solicitação de cancelamento.',
                req.requestId
            );
        }

        const updatedContract = await prisma.contract.update( {
            where: { id },
            data: { status: 'CANCELLED' },
            select: contractListSelect
        } );

        return res.status( 200 ).json( {
            status: 'success',
            message: 'Contrato cancelado com sucesso.',
            updatedContract: toContractListResponse( updatedContract )
        } );
    } catch ( error ) {
        next( error );
    }
};

/**
 * Exclui fisicamente apenas contratos pendentes criados pelo freelancer autenticado.
 */
export const deleteContract = async ( req, res, next ) => {
    try {
        res.setHeader( 'Cache-Control', 'no-store' );

        const { id } = req.params;
        const userId = req.userId;

        const contract = await prisma.contract.findUnique( {
            where: { id },
            select: {
                id: true,
                freelancerId: true,
                status: true
            }
        } );

        if ( !contract ) {
            return sendError( res, 404, 'Not Found', 'Contrato não encontrado.', req.requestId );
        }

        if ( contract.freelancerId !== userId ) {
            return sendError( res, 403, 'Forbidden', 'Apenas o criador do contrato pode excluí-lo.', req.requestId );
        }

        if ( contract.status !== 'PENDING' ) {
            return sendError(
                res,
                400,
                'Bad Request',
                'Contratos em andamento, assinados ou cancelados não podem ser excluídos.',
                req.requestId
            );
        }

        await prisma.contract.delete( { where: { id } } );

        return res.status( 200 ).json( {
            status: 'success',
            message: 'Contrato excluído com sucesso.'
        } );
    } catch ( error ) {
        next( error );
    }
};
