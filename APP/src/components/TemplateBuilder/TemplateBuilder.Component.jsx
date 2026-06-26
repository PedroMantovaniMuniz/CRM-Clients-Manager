import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    ArrowLeft,
    ChevronDown,
    ChevronUp,
    FileText,
    GripVertical,
    Hash,
    Layers,
    List,
    ListOrdered,
    Loader2,
    Plus,
    Quote,
    Save,
    Sparkles,
    Trash2,
    Type
} from 'lucide-react';
import api, { getApiErrorMessage } from '../../services/api.Service.js';

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_BLOCK_CONTENT_LENGTH = 3000;
const MAX_STRUCTURE_BLOCKS = 120;

const BLOCK_TYPES = Object.freeze( [
    {
        type: 'CLAUSE',
        label: 'Cláusula',
        description: 'Título principal do contrato.',
        placeholder: 'Ex: DO PREÇO E DO PAGAMENTO',
        Icon: FileText,
        accentClasses: 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-200',
        textClasses: 'border-l-4 border-blue-600 pl-3 font-black uppercase text-slate-950 dark:border-blue-400 dark:text-white'
    },
    {
        type: 'SUBCLAUSE',
        label: 'Subcláusula',
        description: 'Desdobramento numerado da cláusula.',
        placeholder: 'Ex: O pagamento será realizado em até 5 dias úteis.',
        Icon: Layers,
        accentClasses: 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:border-cyan-400/30 dark:bg-cyan-500/10 dark:text-cyan-200',
        textClasses: 'border-l-4 border-cyan-500 pl-4 font-bold text-slate-800 dark:border-cyan-400 dark:text-slate-100'
    },
    {
        type: 'PARAGRAPH',
        label: 'Parágrafo',
        description: 'Complemento jurídico da cláusula.',
        placeholder: 'Ex: O atraso no pagamento poderá gerar multa contratual.',
        Icon: Type,
        accentClasses: 'border-slate-400 bg-slate-50 text-slate-700 dark:border-slate-500/40 dark:bg-slate-800 dark:text-slate-200',
        textClasses: 'border-l-4 border-slate-400 pl-4 text-slate-700 dark:border-slate-500 dark:text-slate-200'
    },
    {
        type: 'INCISO',
        label: 'Inciso',
        description: 'Item em algarismos romanos.',
        placeholder: 'Ex: Entregar os materiais descritos no escopo.',
        Icon: ListOrdered,
        accentClasses: 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200',
        textClasses: 'border-l-4 border-amber-500 pl-6 text-slate-700 dark:border-amber-400 dark:text-slate-200'
    },
    {
        type: 'ITEM',
        label: 'Item',
        description: 'Subitem numerado.',
        placeholder: 'Ex: Layout responsivo da página inicial.',
        Icon: Hash,
        accentClasses: 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400/30 dark:bg-orange-500/10 dark:text-orange-200',
        textClasses: 'border-l-4 border-orange-400 pl-8 text-slate-700 dark:border-orange-400 dark:text-slate-200'
    },
    {
        type: 'ALINEA',
        label: 'Alínea',
        description: 'Subdivisão em letras.',
        placeholder: 'Ex: arquivos editáveis do projeto;',
        Icon: List,
        accentClasses: 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200',
        textClasses: 'border-l-4 border-emerald-500 pl-10 text-slate-700 dark:border-emerald-400 dark:text-slate-200'
    },
    {
        type: 'FREE_TEXT',
        label: 'Texto livre',
        description: 'Texto sem numeração automática.',
        placeholder: 'Ex: Observações gerais do contrato.',
        Icon: Quote,
        accentClasses: 'border-slate-300 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
        textClasses: 'border-l-4 border-slate-200 pl-3 italic text-slate-600 dark:border-slate-700 dark:text-slate-300'
    }
] );

const BLOCK_TYPE_MAP = new Map( BLOCK_TYPES.map( ( blockType ) => [ blockType.type, blockType ] ) );
const VALID_BLOCK_TYPES = new Set( BLOCK_TYPES.map( ( blockType ) => blockType.type ) );

const normalizeSpaces = ( value ) => String( value ?? '' ).trim().replace( /\s+/g, ' ' );
const sanitizeIdPart = ( value ) => String( value ?? '' ).replace( /[^a-zA-Z0-9_.-]/g, '' ) || 'template';

const extractTemplate = ( responseData ) => (
    responseData?.template ||
    responseData?.data?.template ||
    responseData?.data ||
    null
);

const normalizeStructure = ( structure ) => {
    if ( !Array.isArray( structure ) ) return [];

    return structure.map( ( block, index ) => {
        const fallbackType = VALID_BLOCK_TYPES.has( block?.type ) ? block.type : 'FREE_TEXT';

        return {
            id: normalizeSpaces( block?.id ) || `template-block-${ index + 1 }`,
            type: fallbackType,
            content: String( block?.content ?? '' )
        };
    } );
};

const getCleanPayload = ( title, description, structure ) => ( {
    title: normalizeSpaces( title ),
    description: normalizeSpaces( description ),
    structure: structure.map( ( block, index ) => ( {
        id: normalizeSpaces( block.id ) || `template-block-${ index + 1 }`,
        type: VALID_BLOCK_TYPES.has( block.type ) ? block.type : 'FREE_TEXT',
        content: normalizeSpaces( block.content )
    } ) )
} );

const validateTemplatePayload = ( payload ) => {
    if ( payload.title.length < 3 || payload.title.length > MAX_TITLE_LENGTH ) {
        return `O nome do modelo deve possuir entre 3 e ${ MAX_TITLE_LENGTH } caracteres.`;
    }

    if ( payload.description.length > MAX_DESCRIPTION_LENGTH ) {
        return `A descrição deve possuir no máximo ${ MAX_DESCRIPTION_LENGTH } caracteres.`;
    }

    if ( payload.structure.length === 0 ) {
        return 'Adicione ao menos um bloco ao modelo.';
    }

    if ( payload.structure.length > MAX_STRUCTURE_BLOCKS ) {
        return `O modelo pode possuir no máximo ${ MAX_STRUCTURE_BLOCKS } blocos.`;
    }

    const emptyBlockIndex = payload.structure.findIndex( ( block ) => !block.content );

    if ( emptyBlockIndex >= 0 ) {
        return `Preencha o conteúdo do bloco ${ emptyBlockIndex + 1 } antes de salvar.`;
    }

    const oversizedBlockIndex = payload.structure.findIndex( ( block ) => block.content.length > MAX_BLOCK_CONTENT_LENGTH );

    if ( oversizedBlockIndex >= 0 ) {
        return `O bloco ${ oversizedBlockIndex + 1 } ultrapassou o limite de ${ MAX_BLOCK_CONTENT_LENGTH } caracteres.`;
    }

    return '';
};

const moveArrayItem = ( array, sourceIndex, targetIndex ) => {
    if ( targetIndex < 0 || targetIndex >= array.length ) return array;

    const updatedArray = [ ...array ];
    const [ movedItem ] = updatedArray.splice( sourceIndex, 1 );
    updatedArray.splice( targetIndex, 0, movedItem );

    return updatedArray;
};

const getBlockCounterSummary = ( structure ) => {
    const summary = structure.reduce( ( accumulator, block ) => {
        const type = VALID_BLOCK_TYPES.has( block.type ) ? block.type : 'FREE_TEXT';
        accumulator[ type ] = ( accumulator[ type ] || 0 ) + 1;
        return accumulator;
    }, {} );

    return BLOCK_TYPES
        .map( ( blockType ) => ( {
            ...blockType,
            count: summary[ blockType.type ] || 0
        } ) )
        .filter( ( blockType ) => blockType.count > 0 );
};

const getBlockReadablePrefix = ( block, index ) => {
    switch ( block.type ) {
        case 'CLAUSE': return `Cláusula ${ index + 1 }`;
        case 'SUBCLAUSE': return 'Subcláusula';
        case 'PARAGRAPH': return 'Parágrafo';
        case 'INCISO': return 'Inciso';
        case 'ITEM': return 'Item';
        case 'ALINEA': return 'Alínea';
        case 'FREE_TEXT':
        default: return 'Texto livre';
    }
};

const cardClasses = 'rounded-[2rem] border border-slate-200/80 bg-white/85 shadow-sm shadow-slate-900/5 backdrop-blur transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900/75 dark:shadow-black/20';
const labelClasses = 'mb-1.5 block text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400';
const inputClasses = 'w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm font-bold text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-800 dark:bg-slate-950/70 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:bg-slate-950';

const LoadingState = () => (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[2rem] border border-slate-200 bg-white/80 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-blue-600 dark:text-blue-400" aria-hidden="true" />
        <p className="animate-pulse font-bold text-slate-500 dark:text-slate-400">
            Carregando o modelo de contrato...
        </p>
    </div>
);

const TemplateBuilderComp = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const generatedIdPrefix = sanitizeIdPart( useId() );
    const blockCounterRef = useRef( 0 );
    const isEditMode = Boolean( id );

    const [ title, setTitle ] = useState( '' );
    const [ description, setDescription ] = useState( '' );
    const [ structure, setStructure ] = useState( [] );
    const [ loading, setLoading ] = useState( isEditMode );
    const [ isSaving, setIsSaving ] = useState( false );

    const blockCounterSummary = useMemo( () => getBlockCounterSummary( structure ), [ structure ] );
    const blockListNeedsScroll = structure.length >= 3;

    const createBlockId = useCallback( ( type ) => {
        blockCounterRef.current += 1;
        return `${ generatedIdPrefix }-${ type.toLowerCase() }-${ blockCounterRef.current }`;
    }, [ generatedIdPrefix ] );

    const loadTemplateDetails = useCallback( async ( { signal } = {} ) => {
        if ( !isEditMode ) return;

        try {
            setLoading( true );

            const response = await api.get( `/templates/${ id }`, { signal } );

            if ( signal?.aborted ) return;

            const template = extractTemplate( response.data );

            if ( !template ) {
                throw new Error( 'A API não retornou os dados do modelo.' );
            }

            setTitle( template.title || '' );
            setDescription( template.description || '' );
            setStructure( normalizeStructure( template.structure ) );
        } catch ( requestError ) {
            if ( signal?.aborted ) return;

            toast.error( getApiErrorMessage( requestError, 'Erro ao recuperar dados do modelo de contrato.' ) );
            navigate( '/templates', { replace: true } );
        } finally {
            if ( !signal?.aborted ) {
                setLoading( false );
            }
        }
    }, [ id, isEditMode, navigate ] );

    useEffect( () => {
        if ( !isEditMode ) return undefined;

        const controller = new AbortController();
        const timeoutId = window.setTimeout( () => {
            void loadTemplateDetails( { signal: controller.signal } );
        }, 0 );

        return () => {
            window.clearTimeout( timeoutId );
            controller.abort();
        };
    }, [ isEditMode, loadTemplateDetails ] );

    const addBlock = ( type ) => {
        const safeType = VALID_BLOCK_TYPES.has( type ) ? type : 'FREE_TEXT';

        setStructure( ( currentStructure ) => {
            if ( currentStructure.length >= MAX_STRUCTURE_BLOCKS ) {
                toast.error( `O modelo pode possuir no máximo ${ MAX_STRUCTURE_BLOCKS } blocos.` );
                return currentStructure;
            }

            return [
                ...currentStructure,
                {
                    id: createBlockId( safeType ),
                    type: safeType,
                    content: ''
                }
            ];
        } );
    };

    const handleBlockContentChange = ( blockId, text ) => {
        setStructure( ( currentStructure ) => currentStructure.map( ( block ) => (
            block.id === blockId ? { ...block, content: text } : block
        ) ) );
    };

    const removeBlock = ( blockId ) => {
        setStructure( ( currentStructure ) => currentStructure.filter( ( block ) => block.id !== blockId ) );
    };

    const moveBlock = ( index, direction ) => {
        const offset = direction === 'up' ? -1 : 1;

        setStructure( ( currentStructure ) => moveArrayItem( currentStructure, index, index + offset ) );
    };

    const handleSave = async ( event ) => {
        event.preventDefault();

        const payload = getCleanPayload( title, description, structure );
        const validationMessage = validateTemplatePayload( payload );

        if ( validationMessage ) {
            toast.error( validationMessage );
            return;
        }

        setIsSaving( true );

        try {
            if ( isEditMode ) {
                await api.put( `/templates/${ id }`, payload );
                toast.success( 'Modelo atualizado com sucesso!' );
            } else {
                await api.post( '/templates', payload );
                toast.success( 'Modelo registrado com sucesso!' );
            }

            navigate( '/templates' );
        } catch ( requestError ) {
            toast.error( getApiErrorMessage( requestError, 'Falha ao salvar o modelo de contrato.' ) );
        } finally {
            setIsSaving( false );
        }
    };

    if ( loading ) return <LoadingState />;

    return (
        <form onSubmit={handleSave} className="animate-in fade-in slide-in-from-bottom-3 space-y-6 duration-500">
            <section className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/85 p-5 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/75 dark:shadow-black/20 sm:p-6">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.12),transparent_30%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_32%)]" />

                <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                        <button
                            type="button"
                            onClick={() => navigate( '/templates' )}
                            className="rounded-2xl p-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                            aria-label="Voltar para a lista de modelos"
                        >
                            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                        </button>

                        <div>
                            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                                {isEditMode ? 'Editar modelo' : 'Novo modelo'}
                            </p>
                            <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                                <Sparkles className="h-7 w-7 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                                Builder de Template
                            </h1>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                                Monte a estrutura jurídica do contrato apenas com o texto-base. A numeração de cláusulas, parágrafos, incisos, itens e alíneas será aplicada automaticamente no contrato e no PDF.
                            </p>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isSaving}
                        className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/30 focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
                    >
                        {isSaving ? (
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
                        ) : (
                            <Save className="mr-2 h-5 w-5" aria-hidden="true" />
                        )}
                        {isSaving ? 'Salvando...' : isEditMode ? 'Salvar alterações' : 'Salvar novo modelo'}
                    </button>
                </div>
            </section>

            <section className={`${ cardClasses } p-5 sm:p-6`}>
                <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-800 dark:text-slate-200">
                            Dados do modelo
                        </h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Use um nome claro para facilitar a escolha do template na criação do contrato.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                    <label className="lg:col-span-1">
                        <span className={labelClasses}>Nome do modelo *</span>
                        <input
                            type="text"
                            value={title}
                            onChange={( event ) => setTitle( event.target.value )}
                            required
                            maxLength={MAX_TITLE_LENGTH}
                            className={inputClasses}
                            placeholder="Ex: Prestação de Serviços Web"
                            disabled={isSaving}
                        />
                    </label>

                    <label className="lg:col-span-2">
                        <span className={labelClasses}>Descrição</span>
                        <input
                            type="text"
                            value={description}
                            onChange={( event ) => setDescription( event.target.value )}
                            maxLength={MAX_DESCRIPTION_LENGTH}
                            className={inputClasses}
                            placeholder="Ex: Modelo para projetos de desenvolvimento web com etapas de entrega"
                            disabled={isSaving}
                        />
                    </label>
                </div>
            </section>

            <section className={`${ cardClasses } overflow-hidden`}>
                <div className="flex flex-col gap-4 border-b border-slate-200/80 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-950/40 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                        <h2 className="flex items-center text-lg font-black text-slate-950 dark:text-white">
                            <Type className="mr-2 h-5 w-5 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                            Estrutura do documento
                        </h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            A lista passa a ter rolagem automaticamente quando houver 3 ou mais blocos.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {BLOCK_TYPES.map( ( blockType ) => {
                            const Icon = blockType.Icon;

                            return (
                                <button
                                    key={blockType.type}
                                    type="button"
                                    onClick={() => addBlock( blockType.type )}
                                    disabled={isSaving || structure.length >= MAX_STRUCTURE_BLOCKS}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-600 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-500/30 dark:hover:text-blue-300"
                                    title={blockType.description}
                                >
                                    <Plus className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                                    {blockType.label}
                                </button>
                            );
                        } )}
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-0 xl:grid-cols-[280px_1fr]">
                    <aside className="border-b border-slate-200/80 bg-white/70 p-5 dark:border-slate-800 dark:bg-slate-950/20 xl:border-b-0 xl:border-r">
                        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-blue-800 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200">
                            <p className="text-xs font-black uppercase tracking-[0.18em] opacity-75">Resumo</p>
                            <p className="mt-1 text-3xl font-black">{structure.length}</p>
                            <p className="text-sm font-semibold opacity-80">
                                {structure.length === 1 ? 'bloco criado' : 'blocos criados'}
                            </p>
                        </div>

                        {blockCounterSummary.length > 0 ? (
                            <div className="mt-4 space-y-2">
                                {blockCounterSummary.map( ( blockType ) => {
                                    const Icon = blockType.Icon;

                                    return (
                                        <div key={blockType.type} className={`flex items-center justify-between rounded-2xl border px-3 py-2 text-sm font-bold ${ blockType.accentClasses }`}>
                                            <span className="flex items-center gap-2">
                                                <Icon className="h-4 w-4" aria-hidden="true" />
                                                {blockType.label}
                                            </span>
                                            <span>{blockType.count}</span>
                                        </div>
                                    );
                                } )}
                            </div>
                        ) : (
                            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                Nenhum bloco adicionado ainda.
                            </div>
                        )}
                    </aside>

                    <div className="bg-slate-50/40 p-5 dark:bg-slate-950/20">
                        {structure.length === 0 ? (
                            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/70 p-8 text-center dark:border-slate-800 dark:bg-slate-900/50">
                                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                                    <FileText className="h-8 w-8" aria-hidden="true" />
                                </div>
                                <h3 className="text-lg font-black text-slate-950 dark:text-white">Folha de modelo vazia</h3>
                                <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                                    Insira apenas o texto nos blocos. A numeração como “Cláusula Primeira”, “1.1”, “§ 1º”, incisos e alíneas será aplicada automaticamente.
                                </p>
                            </div>
                        ) : (
                            <div className={`space-y-4 ${ blockListNeedsScroll ? 'max-h-[720px] overflow-y-auto pr-2' : '' }`}>
                                {structure.map( ( block, index ) => {
                                    const config = BLOCK_TYPE_MAP.get( block.type ) || BLOCK_TYPE_MAP.get( 'FREE_TEXT' );
                                    const Icon = config.Icon;

                                    return (
                                        <article
                                            key={block.id}
                                            className="group relative rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/10 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-blue-500/30 dark:hover:shadow-blue-950/30"
                                        >
                                            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                                                        <GripVertical className="h-5 w-5" aria-hidden="true" />
                                                    </div>

                                                    <div>
                                                        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${ config.accentClasses }`}>
                                                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                                                            {config.label}
                                                        </span>
                                                        <p className="mt-1 text-xs font-semibold text-slate-400 dark:text-slate-500">
                                                            Bloco {index + 1} • {getBlockReadablePrefix( block, index )}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                                                    <button
                                                        type="button"
                                                        disabled={index === 0 || isSaving}
                                                        onClick={() => moveBlock( index, 'up' )}
                                                        className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                                        aria-label="Mover bloco para cima"
                                                    >
                                                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                                                    </button>

                                                    <button
                                                        type="button"
                                                        disabled={index === structure.length - 1 || isSaving}
                                                        onClick={() => moveBlock( index, 'down' )}
                                                        className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                                        aria-label="Mover bloco para baixo"
                                                    >
                                                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                                    </button>

                                                    <button
                                                        type="button"
                                                        disabled={isSaving}
                                                        onClick={() => removeBlock( block.id )}
                                                        className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-4 focus:ring-red-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                                                        aria-label="Remover bloco"
                                                    >
                                                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                    </button>
                                                </div>
                                            </div>

                                            <textarea
                                                rows={4}
                                                value={block.content}
                                                onChange={( event ) => handleBlockContentChange( block.id, event.target.value )}
                                                maxLength={MAX_BLOCK_CONTENT_LENGTH}
                                                disabled={isSaving}
                                                placeholder={config.placeholder}
                                                className={`min-h-[104px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-800 dark:bg-slate-950/60 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:bg-slate-950 ${ config.textClasses }`}
                                            />

                                            <div className="mt-2 flex justify-end text-xs font-semibold text-slate-400 dark:text-slate-500">
                                                {normalizeSpaces( block.content ).length}/{MAX_BLOCK_CONTENT_LENGTH} caracteres
                                            </div>
                                        </article>
                                    );
                                } )}
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </form>
    );
};

export default TemplateBuilderComp;
