import { decryptSensitiveData } from './sensitiveDataCrypto.Util.js';

/**
 * Campos sensíveis armazenados criptografados no banco.
 * Mantemos este mapa centralizado para evitar repetição entre selects e presenters.
 */
const SENSITIVE_FIELD_MAP = Object.freeze( {
    document: 'documentEncrypted',
    phone: 'phoneEncrypted',
    addressStreet: 'addressStreetEncrypted',
    addressCity: 'addressCityEncrypted',
    addressState: 'addressStateEncrypted',
    addressNumber: 'addressNumberEncrypted',
    addressZipCode: 'addressZipCodeEncrypted'
} );

/**
 * Normaliza espaços sem alterar acentos, letras maiúsculas/minúsculas ou pontuação útil.
 */
const normalizeSpaces = ( value ) => String( value ?? '' ).trim().replace( /\s+/g, ' ' );

/**
 * Select mínimo para identificar e exibir um usuário em respostas públicas.
 *
 * Observação: a coluna signature pode guardar uma imagem em base64, então ela pode ser pesada.
 * Ela foi mantida aqui por compatibilidade com os controllers atuais, que retornam apenas Boolean(signature).
 * Em listagens grandes, prefira publicUserLeanSelect quando a tela não precisar saber se há assinatura.
 */
export const publicUserSelect = Object.freeze( {
    id: true,
    name: true,
    lastName: true,
    email: true,
    role: true,
    signature: true
} );

/**
 * Versão mais leve do select público, sem assinatura.
 * Use em listagens onde o front-end não precisa exibir indicador de assinatura.
 */
export const publicUserLeanSelect = Object.freeze( {
    id: true,
    name: true,
    lastName: true,
    email: true,
    role: true
} );

/**
 * Select completo para pontos da API que realmente precisam descriptografar dados pessoais.
 * Nunca use este select em listagens públicas ou endpoints que não precisam de CPF/endereço.
 */
export const sensitiveUserSelect = Object.freeze( {
    ...publicUserSelect,
    ...Object.values( SENSITIVE_FIELD_MAP ).reduce( ( select, encryptedField ) => {
        select[ encryptedField ] = true;
        return select;
    }, {} )
} );

/**
 * Select sensível com datas de auditoria, útil para tela de perfil.
 */
export const sensitiveUserWithTimestampsSelect = Object.freeze( {
    ...sensitiveUserSelect,
    createdAt: true,
    updatedAt: true
} );

/**
 * Monta o nome completo priorizando fullName quando já vier pronto de alguma query customizada.
 */
export const buildFullName = ( user ) => normalizeSpaces(
    user?.fullName ||
    [ user?.name, user?.lastName ].filter( Boolean ).join( ' ' ) ||
    user?.name ||
    ''
);

/**
 * Retorna somente a existência da assinatura.
 * Nunca devolvemos a imagem em base64 no presenter público para evitar vazamento e payload pesado.
 */
const buildSignatureStatus = ( user ) => {
    if ( !Object.prototype.hasOwnProperty.call( user ?? {}, 'signature' ) ) return undefined;
    return Boolean( user.signature );
};

/**
 * Presenter público padrão.
 * Ideal para /me, listagens de contrato e dados básicos de cliente/freelancer.
 */
export const toPublicUser = ( user ) => {
    if ( !user ) return null;

    const signature = buildSignatureStatus( user );

    return {
        id: user.id,
        name: normalizeSpaces( user.name ),
        lastName: normalizeSpaces( user.lastName ),
        fullName: buildFullName( user ) || normalizeSpaces( user.name ),
        email: normalizeSpaces( user.email ).toLowerCase(),
        role: user.role,
        ...( signature !== undefined && { signature } )
    };
};

/**
 * Presenter público enxuto para casos de alta performance.
 * Não inclui o campo signature quando ele não foi selecionado no banco.
 */
export const toPublicUserLean = ( user ) => toPublicUser( user );

/**
 * Descriptografa um campo sensível mantendo null/undefined como string vazia,
 * que é o formato já esperado pelo front-end nos formulários de perfil.
 */
const decryptUserField = ( user, encryptedField ) => decryptSensitiveData( user?.[ encryptedField ] );

/**
 * Descriptografa os campos sensíveis em formato plano.
 * Mantém compatibilidade com o front-end atual: document, phone, addressStreet etc.
 */
export const toSensitiveFields = ( user ) => Object.entries( SENSITIVE_FIELD_MAP ).reduce(
    ( fields, [ publicField, encryptedField ] ) => {
        fields[ publicField ] = decryptUserField( user, encryptedField );
        return fields;
    },
    {}
);

/**
 * Presenter sensível.
 * Use somente em endpoints protegidos e com autorização adequada.
 */
export const toSensitiveUser = ( user ) => {
    if ( !user ) return null;

    return {
        ...toPublicUser( user ),
        ...toSensitiveFields( user ),
        ...( user.createdAt !== undefined && { createdAt: user.createdAt } ),
        ...( user.updatedAt !== undefined && { updatedAt: user.updatedAt } )
    };
};

/**
 * Presenter específico para perfil próprio.
 * É semanticamente igual ao sensível, mas deixa claro no controller que esses dados são privados.
 */
export const toPrivateProfile = ( user ) => toSensitiveUser( user );
