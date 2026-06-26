import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

const normalizeSpaces = ( value ) => String( value ?? '' ).trim().replace( /\s+/g, ' ' );
const onlyDigits = ( value ) => String( value ?? '' ).replace( /\D/g, '' );

const currencyFormatter = new Intl.NumberFormat( 'pt-BR', {
    style: 'currency',
    currency: 'BRL'
} );

const dateFormatter = new Intl.DateTimeFormat( 'pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
} );

const buildFullName = ( entity ) => {
    if ( !entity ) return '[nome não informado]';

    return normalizeSpaces(
        entity.fullName ||
        [ entity.name, entity.lastName ].filter( Boolean ).join( ' ' ) ||
        entity.name ||
        '[nome não informado]'
    );
};

const getEntityDocument = ( entity, fallback = '' ) => (
    entity?.document ||
    entity?.cpfCnpj ||
    entity?.cnpjCpf ||
    entity?.documentNumber ||
    fallback ||
    ''
);

const getDocumentLabel = ( value ) => {
    const digits = onlyDigits( value );

    if ( digits.length === 11 ) return 'CPF';
    if ( digits.length === 14 ) return 'CNPJ';
    return 'CPF/CNPJ';
};

const formatDocument = ( value ) => {
    const digits = onlyDigits( value );

    if ( digits.length === 11 ) {
        return digits.replace( /(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4' );
    }

    if ( digits.length === 14 ) {
        return digits.replace( /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5' );
    }

    return normalizeSpaces( value ) || '[não informado]';
};

const formatZipCode = ( value ) => {
    const digits = onlyDigits( value );

    if ( digits.length === 8 ) {
        return digits.replace( /(\d{5})(\d{3})/, '$1-$2' );
    }

    return normalizeSpaces( value );
};

const getAddressParts = ( entity ) => ( {
    street: normalizeSpaces( entity?.addressStreet || entity?.street || entity?.address?.street || '' ),
    number: normalizeSpaces( entity?.addressNumber || entity?.number || entity?.address?.number || '' ),
    city: normalizeSpaces( entity?.addressCity || entity?.city || entity?.address?.city || '' ),
    state: normalizeSpaces( entity?.addressState || entity?.state || entity?.address?.state || '' ).toUpperCase(),
    zipCode: normalizeSpaces( entity?.addressZipCode || entity?.zipCode || entity?.address?.zipCode || '' )
} );

const buildAddressText = ( entity ) => {
    const { street, number, city, state, zipCode } = getAddressParts( entity );
    const line1 = [ street, number && `nº ${ number }` ].filter( Boolean ).join( ', ' );
    const line2 = [ city, state ].filter( Boolean ).join( ' - ' );
    const line3 = zipCode ? `CEP ${ formatZipCode( zipCode ) }` : '';

    return [ line1, line2, line3 ].filter( Boolean ).join( ', ' );
};

const getOrdinal = ( value ) => {
    const ordinals = [
        '',
        'PRIMEIRA',
        'SEGUNDA',
        'TERCEIRA',
        'QUARTA',
        'QUINTA',
        'SEXTA',
        'SÉTIMA',
        'OITAVA',
        'NONA',
        'DÉCIMA',
        'DÉCIMA PRIMEIRA',
        'DÉCIMA SEGUNDA',
        'DÉCIMA TERCEIRA',
        'DÉCIMA QUARTA',
        'DÉCIMA QUINTA'
    ];

    return value <= 15 ? ordinals[ value ] : `${ value }ª`;
};

const getRoman = ( value ) => {
    const romanMap = {
        M: 1000,
        CM: 900,
        D: 500,
        CD: 400,
        C: 100,
        XC: 90,
        L: 50,
        XL: 40,
        X: 10,
        IX: 9,
        V: 5,
        IV: 4,
        I: 1
    };
    let remainingValue = value;
    let result = '';

    for ( const [ romanSymbol, numberValue ] of Object.entries( romanMap ) ) {
        const quantity = Math.floor( remainingValue / numberValue );
        remainingValue -= quantity * numberValue;
        result += romanSymbol.repeat( quantity );
    }

    return result;
};

const getAlphabet = ( value ) => String.fromCharCode( 96 + value );

const formatCurrency = ( value ) => {
    const numberValue = Number( value );

    if ( !Number.isFinite( numberValue ) ) return 'Valor não informado';

    return currencyFormatter.format( numberValue );
};

const formatDate = ( value ) => {
    if ( !value ) return 'Data não informada';

    const date = new Date( value );

    if ( Number.isNaN( date.getTime() ) ) return 'Data inválida';

    return dateFormatter.format( date );
};

const getBlockPrefixAndContent = ( block, counters ) => {
    const content = normalizeSpaces( block?.content );

    switch ( block?.type ) {
        case 'CLAUSE': {
            counters.clause += 1;
            counters.subclause = 0;
            counters.paragraph = 0;
            counters.inciso = 0;
            counters.item = 0;
            counters.alinea = 0;

            return {
                prefix: `CLÁUSULA ${ getOrdinal( counters.clause ) }: `,
                content: content.toUpperCase()
            };
        }
        case 'SUBCLAUSE': {
            counters.subclause += 1;
            counters.paragraph = 0;
            counters.inciso = 0;
            counters.item = 0;
            counters.alinea = 0;

            return { prefix: `${ counters.clause }.${ counters.subclause }. `, content };
        }
        case 'PARAGRAPH': {
            counters.paragraph += 1;
            counters.inciso = 0;
            counters.item = 0;
            counters.alinea = 0;

            return {
                prefix: counters.paragraph <= 9 ? `§ ${ counters.paragraph }º ` : `§ ${ counters.paragraph } `,
                content
            };
        }
        case 'INCISO': {
            counters.inciso += 1;
            counters.item = 0;
            counters.alinea = 0;

            return { prefix: `${ getRoman( counters.inciso ) } - `, content };
        }
        case 'ITEM': {
            counters.item += 1;
            counters.alinea = 0;

            return { prefix: `${ counters.item }. `, content };
        }
        case 'ALINEA': {
            counters.alinea += 1;

            return { prefix: `${ getAlphabet( counters.alinea ) }) `, content };
        }
        case 'FREE_TEXT':
        default:
            return { prefix: '', content };
    }
};

const formatContractStructure = ( structure ) => {
    if ( !Array.isArray( structure ) ) return [];

    const counters = {
        clause: 0,
        subclause: 0,
        paragraph: 0,
        inciso: 0,
        item: 0,
        alinea: 0
    };

    return structure.map( ( block, index ) => {
        const { prefix, content } = getBlockPrefixAndContent( block, counters );

        return {
            id: block?.id || `${ block?.type || 'BLOCK' }-${ index }`,
            type: block?.type || 'FREE_TEXT',
            formattedContent: `${ prefix }${ content }`
        };
    } ).filter( ( block ) => normalizeSpaces( block.formattedContent ) );
};

const styles = StyleSheet.create( {
    page: {
        paddingTop: 48,
        paddingBottom: 70,
        paddingHorizontal: 48,
        fontFamily: 'Helvetica',
        fontSize: 10.5,
        color: '#1f2937',
        lineHeight: 1.45
    },
    headerBox: {
        marginBottom: 24,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#dbe3ef'
    },
    headerEyebrow: {
        fontSize: 8,
        fontFamily: 'Helvetica-Bold',
        textAlign: 'center',
        textTransform: 'uppercase',
        color: '#2563eb',
        letterSpacing: 1.6,
        marginBottom: 6
    },
    headerTitle: {
        fontSize: 15,
        fontFamily: 'Helvetica-Bold',
        textAlign: 'center',
        textTransform: 'uppercase',
        color: '#0f172a'
    },
    headerSubtitle: {
        marginTop: 5,
        fontSize: 9,
        textAlign: 'center',
        color: '#64748b'
    },
    summaryBox: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 18
    },
    summaryItem: {
        width: '31%',
        padding: 10,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 8,
        backgroundColor: '#f8fafc'
    },
    summaryLabel: {
        fontSize: 7.5,
        fontFamily: 'Helvetica-Bold',
        textTransform: 'uppercase',
        color: '#64748b',
        marginBottom: 4
    },
    summaryValue: {
        fontSize: 10,
        fontFamily: 'Helvetica-Bold',
        color: '#0f172a'
    },
    sectionLabel: {
        marginTop: 8,
        marginBottom: 8,
        fontSize: 9,
        fontFamily: 'Helvetica-Bold',
        textTransform: 'uppercase',
        color: '#0f172a'
    },
    preambleText: {
        fontFamily: 'Helvetica',
        fontSize: 10.5,
        marginBottom: 9,
        textAlign: 'justify'
    },
    boldText: {
        fontFamily: 'Helvetica-Bold'
    },
    dynamicClause: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 10.8,
        marginTop: 14,
        marginBottom: 6,
        textTransform: 'uppercase',
        color: '#0f172a'
    },
    dynamicSubclause: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 10.5,
        marginLeft: 10,
        marginTop: 4,
        marginBottom: 2,
        textAlign: 'justify'
    },
    dynamicParagraph: {
        fontFamily: 'Helvetica',
        fontSize: 10.5,
        marginLeft: 10,
        marginTop: 4,
        marginBottom: 2,
        textAlign: 'justify'
    },
    dynamicInciso: {
        fontFamily: 'Helvetica',
        fontSize: 10.5,
        marginLeft: 25,
        marginBottom: 2,
        textAlign: 'justify'
    },
    dynamicItem: {
        fontFamily: 'Helvetica',
        fontSize: 10.5,
        marginLeft: 40,
        marginBottom: 2,
        textAlign: 'justify'
    },
    dynamicAlinea: {
        fontFamily: 'Helvetica',
        fontSize: 10.5,
        marginLeft: 55,
        marginBottom: 2,
        textAlign: 'justify'
    },
    dynamicFreeText: {
        fontFamily: 'Helvetica',
        fontSize: 10.5,
        marginTop: 4,
        marginBottom: 4,
        textAlign: 'justify'
    },
    emptyBox: {
        marginTop: 8,
        padding: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 8,
        backgroundColor: '#f8fafc'
    },
    emptyText: {
        color: '#64748b',
        textAlign: 'center',
        fontSize: 10
    },
    signatureSection: {
        marginTop: 38
    },
    signatureDate: {
        textAlign: 'left',
        marginTop: 8,
        marginBottom: 38
    },
    signatureContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 10
    },
    signatureBlock: {
        width: '45%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
    },
    signatureImageContainer: {
        height: 62,
        width: '100%',
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center'
    },
    signatureImage: {
        width: 130,
        height: 55,
        objectFit: 'contain'
    },
    signaturePlaceholder: {
        marginBottom: 8,
        fontSize: 8.5,
        color: '#94a3b8',
        fontStyle: 'italic'
    },
    signatureLine: {
        width: '100%',
        borderTopWidth: 1,
        borderTopColor: '#0f172a',
        paddingTop: 6,
        display: 'flex',
        alignItems: 'center'
    },
    signatureName: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 10.5,
        textAlign: 'center'
    },
    signatureRole: {
        fontSize: 9.5,
        color: '#475569',
        textAlign: 'center',
        marginTop: 2
    },
    footer: {
        position: 'absolute',
        bottom: 28,
        left: 48,
        right: 48,
        textAlign: 'center',
        fontSize: 8.5,
        color: '#94a3b8',
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
        paddingTop: 9
    }
} );

const getBlockStyle = ( type ) => {
    switch ( type ) {
        case 'CLAUSE': return styles.dynamicClause;
        case 'SUBCLAUSE': return styles.dynamicSubclause;
        case 'PARAGRAPH': return styles.dynamicParagraph;
        case 'INCISO': return styles.dynamicInciso;
        case 'ITEM': return styles.dynamicItem;
        case 'ALINEA': return styles.dynamicAlinea;
        case 'FREE_TEXT':
        default: return styles.dynamicFreeText;
    }
};

const SignatureBlock = ( { signature, name, role, placeholder } ) => (
    <View style={styles.signatureBlock}>
        <View style={styles.signatureImageContainer}>
            {signature ? (
                <Image src={signature} style={styles.signatureImage} />
            ) : (
                <Text style={styles.signaturePlaceholder}>{placeholder}</Text>
            )}
        </View>
        <View style={styles.signatureLine}>
            <Text style={styles.signatureName}>{name}</Text>
            <Text style={styles.signatureRole}>{role}</Text>
        </View>
    </View>
);

const ContractPDFComp = ( { contract } ) => {
    if ( !contract ) return null;

    const freelancerName = buildFullName( contract.freelancer );
    const clientName = buildFullName( contract.client );
    const freelancerDocument = getEntityDocument( contract.freelancer );
    const clientDocument = getEntityDocument( contract.client, contract.cnpjCpf );
    const freelancerAddress = buildAddressText( contract.freelancer );
    const clientAddress = buildAddressText( contract.client );
    const formattedStructure = formatContractStructure( contract.structure );
    const formalizationDate = formatDate( contract.createdAt || new Date() );

    return (
        <Document
            title={`Contrato de Prestação de Serviços - ${ clientName }`}
            author="CRM Contratos"
            subject={`Contrato ${ contract.id || '' }`}
            keywords="contrato, prestação de serviços, assinatura eletrônica"
        >
            <Page size="A4" style={styles.page}>
                <View style={styles.headerBox}>
                    <Text style={styles.headerEyebrow}>CRM Contratos</Text>
                    <Text style={styles.headerTitle}>Contrato de Prestação de Serviços</Text>
                    <Text style={styles.headerSubtitle}>Documento eletrônico gerado pela plataforma</Text>
                </View>

                <View style={styles.summaryBox}>
                    <View style={styles.summaryItem}>
                        <Text style={styles.summaryLabel}>Valor Total</Text>
                        <Text style={styles.summaryValue}>{formatCurrency( contract.value )}</Text>
                    </View>
                    <View style={styles.summaryItem}>
                        <Text style={styles.summaryLabel}>Início</Text>
                        <Text style={styles.summaryValue}>{formatDate( contract.startDate )}</Text>
                    </View>
                    <View style={styles.summaryItem}>
                        <Text style={styles.summaryLabel}>Término</Text>
                        <Text style={styles.summaryValue}>{formatDate( contract.endDate )}</Text>
                    </View>
                </View>

                <Text style={styles.sectionLabel}>Qualificação das partes</Text>

                <View style={{ marginBottom: 18 }}>
                    <Text style={styles.preambleText}>
                        <Text style={styles.boldText}>CONTRATADA: </Text>
                        {freelancerName}, inscrita no {getDocumentLabel( freelancerDocument )} sob o nº {formatDocument( freelancerDocument )}
                        {freelancerAddress ? `, com endereço em ${ freelancerAddress }` : ''}.
                    </Text>

                    <Text style={styles.preambleText}>
                        <Text style={styles.boldText}>CONTRATANTE: </Text>
                        {clientName}, inscrito(a) no {getDocumentLabel( clientDocument )} sob o nº {formatDocument( clientDocument )}
                        {clientAddress ? `, com endereço em ${ clientAddress }` : ''}.
                    </Text>

                    <Text style={styles.preambleText}>
                        As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Prestação de Serviços, que se regerá pelas cláusulas abaixo.
                    </Text>
                </View>

                <Text style={styles.sectionLabel}>Cláusulas contratuais</Text>

                {formattedStructure.length > 0 ? (
                    <View>
                        {formattedStructure.map( ( block ) => (
                            <Text key={block.id} style={getBlockStyle( block.type )}>
                                {block.formattedContent}
                            </Text>
                        ) )}
                    </View>
                ) : (
                    <View style={styles.emptyBox}>
                        <Text style={styles.emptyText}>Este contrato não possui cláusulas personalizadas cadastradas.</Text>
                    </View>
                )}

                <View style={styles.signatureSection} wrap={false}>
                    <Text style={styles.dynamicFreeText}>
                        Por estarem assim justos e contratados, firmam o presente instrumento, reconhecendo a validade jurídica das assinaturas eletrônicas e digitais aqui apostas para todos os fins de direito.
                    </Text>

                    <Text style={styles.signatureDate}>
                        Data da formalização: {formalizationDate}
                    </Text>

                    <View style={styles.signatureContainer}>
                        <SignatureBlock
                            signature={contract.contractedSignature}
                            name={freelancerName}
                            role="Contratada"
                            placeholder="Sem assinatura registrada"
                        />

                        <SignatureBlock
                            signature={contract.clientSignature}
                            name={clientName}
                            role="Contratante"
                            placeholder="Aguardando assinatura"
                        />
                    </View>
                </View>

                <Text style={styles.footer} fixed>
                    Documento com Assinatura Eletrônica • Plataforma CRM Contratos • ID Único: {contract.id || '[não informado]'}
                </Text>
            </Page>
        </Document>
    );
};

export default ContractPDFComp;
