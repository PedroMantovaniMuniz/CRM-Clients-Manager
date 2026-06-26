import prisma from '../prisma/client.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_STRUCTURE_BLOCKS = 120;
const MAX_BLOCK_CONTENT_LENGTH = 3000;
const MAX_SEARCH_LENGTH = 120;

const ALLOWED_STRUCTURE_TYPES = new Set( [
    'CLAUSE',
    'SUBCLAUSE',
    'PARAGRAPH',
    'INCISO',
    'ITEM',
    'ALINEA',
    'FREE_TEXT'
] );

const normalizeSpaces = ( value ) => String( value ?? '' ).trim().replace( /\s+/g, ' ' );
const hasOwn = ( object, property ) => Object.prototype.hasOwnProperty.call( object ?? {}, property );

const sendError = ( res, statusCode, error, message, requestId ) => res.status( statusCode ).json( {
    status: 'error',
    error,
    message,
    ...( requestId && { requestId } )
} );

const parsePagination = ( query ) => {
    const page = Math.max( Number.parseInt( query.page, 10 ) || DEFAULT_PAGE, 1 );
    const requestedLimit = Number.parseInt( query.limit, 10 ) || DEFAULT_LIMIT;
    const limit = Math.min( Math.max( requestedLimit, 1 ), MAX_LIMIT );
    const skip = ( page - 1 ) * limit;

    return { page, limit, skip };
};

const parseSearch = ( rawSearch ) => {
    const search = normalizeSpaces( rawSearch );

    if ( search.length > MAX_SEARCH_LENGTH ) {
        return { error: `A busca deve possuir no máximo ${ MAX_SEARCH_LENGTH } caracteres.` };
    }

    return { search };
};

const normalizeStructureBlockId = ( blockId, index ) => {
    const normalizedId = normalizeSpaces( blockId );

    if ( normalizedId && normalizedId.length <= 80 && /^[\w:.-]+$/u.test( normalizedId ) ) {
        return normalizedId;
    }

    return `template-block-${ index + 1 }`;
};

const validateStructure = ( structure ) => {
    if ( !Array.isArray( structure ) ) {
        return { error: 'A estrutura do modelo deve ser enviada como uma lista de blocos.' };
    }

    if ( structure.length === 0 ) {
        return { error: 'A estrutura do modelo precisa ter ao menos um bloco.' };
    }

    if ( structure.length > MAX_STRUCTURE_BLOCKS ) {
        return { error: `A estrutura do modelo pode ter no máximo ${ MAX_STRUCTURE_BLOCKS } blocos.` };
    }

    const cleanStructure = [];

    for ( const [ index, block ] of structure.entries() ) {
        if ( !block || typeof block !== 'object' || Array.isArray( block ) ) {
            return { error: `O bloco ${ index + 1 } da estrutura deve ser um objeto válido.` };
        }

        const type = ALLOWED_STRUCTURE_TYPES.has( block.type ) ? block.type : 'FREE_TEXT';
        const content = normalizeSpaces( block.content );

        if ( !content || content.length > MAX_BLOCK_CONTENT_LENGTH ) {
            return {
                error: `O bloco ${ index + 1 } da estrutura deve possuir conteúdo e no máximo ${ MAX_BLOCK_CONTENT_LENGTH } caracteres.`
            };
        }

        cleanStructure.push( {
            id: normalizeStructureBlockId( block.id, index ),
            type,
            content
        } );
    }

    return { structure: cleanStructure };
};

const validateTemplatePayload = ( payload, { partial = false } = {} ) => {
    const clean = {};

    if ( !partial || hasOwn( payload, 'title' ) ) {
        clean.title = normalizeSpaces( payload?.title );

        if ( !clean.title || clean.title.length < 3 || clean.title.length > MAX_TITLE_LENGTH ) {
            return { error: `O título deve possuir entre 3 e ${ MAX_TITLE_LENGTH } caracteres.` };
        }
    }

    if ( !partial || hasOwn( payload, 'description' ) ) {
        const description = normalizeSpaces( payload?.description );

        if ( description.length > MAX_DESCRIPTION_LENGTH ) {
            return { error: `A descrição deve possuir no máximo ${ MAX_DESCRIPTION_LENGTH } caracteres.` };
        }

        clean.description = description || null;
    }

    if ( !partial || hasOwn( payload, 'structure' ) ) {
        const structureValidation = validateStructure( payload?.structure );

        if ( structureValidation.error ) return { error: structureValidation.error };

        clean.structure = structureValidation.structure;
    }

    if ( partial && Object.keys( clean ).length === 0 ) {
        return { error: 'Envie ao menos um campo permitido para atualizar o modelo.' };
    }

    return { clean };
};

const templateSelect = Object.freeze( {
    id: true,
    title: true,
    description: true,
    structure: true,
    freelancerId: true,
    createdAt: true,
    updatedAt: true
} );

const templateListSelect = Object.freeze( {
    id: true,
    title: true,
    description: true,
    createdAt: true,
    updatedAt: true
} );

const buildTemplateWhereClause = ( freelancerId, search ) => ( {
    freelancerId,
    ...( search && {
        OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } }
        ]
    } )
} );

const findOwnedTemplate = ( id, freelancerId, select = templateSelect ) => prisma.contractTemplate.findFirst( {
    where: { id, freelancerId },
    select
} );

export const createTemplate = async ( req, res, next ) => {
    try {
        res.setHeader( 'Cache-Control', 'no-store' );

        const validation = validateTemplatePayload( req.body ?? {} );

        if ( validation.error ) {
            return sendError( res, 400, 'Bad Request', validation.error, req.requestId );
        }

        const template = await prisma.contractTemplate.create( {
            data: {
                ...validation.clean,
                freelancerId: req.userId
            },
            select: templateSelect
        } );

        return res.status( 201 ).json( {
            status: 'success',
            message: 'Modelo de contrato salvo com sucesso.',
            data: template,
            template
        } );
    } catch ( error ) {
        next( error );
    }
};

export const getTemplates = async ( req, res, next ) => {
    try {
        res.setHeader( 'Cache-Control', 'no-store' );

        const searchValidation = parseSearch( req.query.search );

        if ( searchValidation.error ) {
            return sendError( res, 400, 'Bad Request', searchValidation.error, req.requestId );
        }

        const { page, limit, skip } = parsePagination( req.query );
        const whereClause = buildTemplateWhereClause( req.userId, searchValidation.search );

        const [ total, templates ] = await prisma.$transaction( [
            prisma.contractTemplate.count( { where: whereClause } ),
            prisma.contractTemplate.findMany( {
                where: whereClause,
                select: templateListSelect,
                orderBy: { updatedAt: 'desc' },
                skip,
                take: limit
            } )
        ] );

        return res.status( 200 ).json( {
            status: 'success',
            results: templates.length,
            total,
            pagination: {
                page,
                limit,
                totalPages: Math.max( Math.ceil( total / limit ), 1 ),
                hasNextPage: page * limit < total,
                hasPreviousPage: page > 1
            },
            data: { templates },
            templates
        } );
    } catch ( error ) {
        next( error );
    }
};

export const getTemplateById = async ( req, res, next ) => {
    try {
        res.setHeader( 'Cache-Control', 'no-store' );

        const template = await findOwnedTemplate( req.params.id, req.userId );

        if ( !template ) {
            return sendError(
                res,
                404,
                'Not Found',
                'Modelo de contrato não localizado ou sem permissão de acesso.',
                req.requestId
            );
        }

        return res.status( 200 ).json( {
            status: 'success',
            data: { template },
            template
        } );
    } catch ( error ) {
        next( error );
    }
};

export const updateTemplate = async ( req, res, next ) => {
    try {
        res.setHeader( 'Cache-Control', 'no-store' );

        const existingTemplate = await findOwnedTemplate( req.params.id, req.userId, { id: true } );

        if ( !existingTemplate ) {
            return sendError(
                res,
                404,
                'Not Found',
                'Modelo de contrato não encontrado ou sem permissão para alteração.',
                req.requestId
            );
        }

        const validation = validateTemplatePayload( req.body ?? {}, { partial: true } );

        if ( validation.error ) {
            return sendError( res, 400, 'Bad Request', validation.error, req.requestId );
        }

        const updatedTemplate = await prisma.contractTemplate.update( {
            where: { id: req.params.id },
            data: validation.clean,
            select: templateSelect
        } );

        return res.status( 200 ).json( {
            status: 'success',
            message: 'Modelo atualizado com sucesso.',
            data: updatedTemplate,
            template: updatedTemplate
        } );
    } catch ( error ) {
        next( error );
    }
};

export const deleteTemplate = async ( req, res, next ) => {
    try {
        res.setHeader( 'Cache-Control', 'no-store' );

        const existingTemplate = await findOwnedTemplate( req.params.id, req.userId, { id: true } );

        if ( !existingTemplate ) {
            return sendError(
                res,
                404,
                'Not Found',
                'Modelo não localizado para exclusão ou sem permissão de acesso.',
                req.requestId
            );
        }

        await prisma.contractTemplate.delete( {
            where: { id: req.params.id }
        } );

        return res.status( 200 ).json( {
            status: 'success',
            message: 'Modelo de contrato removido definitivamente.'
        } );
    } catch ( error ) {
        next( error );
    }
};
