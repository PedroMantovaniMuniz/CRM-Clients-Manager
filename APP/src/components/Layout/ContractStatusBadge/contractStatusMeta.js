import {
    AlertTriangle,
    BadgeCheck,
    CheckCircle2,
    CircleHelp,
    Clock3,
    XCircle
} from 'lucide-react';

export const CONTRACT_STATUS_KEYS = Object.freeze( {
    PENDING: 'PENDING',
    SIGNED: 'SIGNED',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
    CANCELLATION_REQUESTED: 'CANCELLATION_REQUESTED',
    UNKNOWN: 'UNKNOWN'
} );

export const CONTRACT_STATUS_META = Object.freeze( {
    PENDING: {
        key: CONTRACT_STATUS_KEYS.PENDING,
        label: 'Pendente de assinatura',
        shortLabel: 'Pendente',
        description: 'Aguardando assinatura do cliente.',
        Icon: Clock3,
        badgeClasses: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-400/20',
        iconBoxClasses: 'bg-amber-50 text-amber-600 group-hover:bg-amber-100 group-hover:text-amber-700 dark:bg-amber-500/10 dark:text-amber-300 dark:group-hover:bg-amber-500/15 dark:group-hover:text-amber-200',
        dotClasses: 'bg-amber-500 dark:bg-amber-300'
    },
    SIGNED: {
        key: CONTRACT_STATUS_KEYS.SIGNED,
        label: 'Assinado',
        shortLabel: 'Assinado',
        description: 'Contrato assinado e aguardando conclusão administrativa.',
        Icon: CheckCircle2,
        badgeClasses: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-400/20',
        iconBoxClasses: 'bg-blue-50 text-blue-600 group-hover:bg-blue-100 group-hover:text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 dark:group-hover:bg-blue-500/15 dark:group-hover:text-blue-200',
        dotClasses: 'bg-blue-500 dark:bg-blue-300'
    },
    COMPLETED: {
        key: CONTRACT_STATUS_KEYS.COMPLETED,
        label: 'Concluído',
        shortLabel: 'Concluído',
        description: 'Contrato concluído com sucesso.',
        Icon: BadgeCheck,
        badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-400/20',
        iconBoxClasses: 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 group-hover:text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 dark:group-hover:bg-emerald-500/15 dark:group-hover:text-emerald-200',
        dotClasses: 'bg-emerald-500 dark:bg-emerald-300'
    },
    CANCELLED: {
        key: CONTRACT_STATUS_KEYS.CANCELLED,
        label: 'Cancelado',
        shortLabel: 'Cancelado',
        description: 'Contrato cancelado.',
        Icon: XCircle,
        badgeClasses: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-400/20',
        iconBoxClasses: 'bg-red-50 text-red-600 group-hover:bg-red-100 group-hover:text-red-700 dark:bg-red-500/10 dark:text-red-300 dark:group-hover:bg-red-500/15 dark:group-hover:text-red-200',
        dotClasses: 'bg-red-500 dark:bg-red-300'
    },
    CANCELLATION_REQUESTED: {
        key: CONTRACT_STATUS_KEYS.CANCELLATION_REQUESTED,
        label: 'Cancelamento solicitado',
        shortLabel: 'Cancelamento pendente',
        description: 'Existe uma solicitação de cancelamento aguardando resposta da outra parte.',
        Icon: AlertTriangle,
        badgeClasses: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-400/20',
        iconBoxClasses: 'bg-orange-50 text-orange-600 group-hover:bg-orange-100 group-hover:text-orange-700 dark:bg-orange-500/10 dark:text-orange-300 dark:group-hover:bg-orange-500/15 dark:group-hover:text-orange-200',
        dotClasses: 'bg-orange-500 dark:bg-orange-300'
    },
    UNKNOWN: {
        key: CONTRACT_STATUS_KEYS.UNKNOWN,
        label: 'Status desconhecido',
        shortLabel: 'Desconhecido',
        description: 'O status retornado pela API não foi reconhecido pelo front-end.',
        Icon: CircleHelp,
        badgeClasses: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        iconBoxClasses: 'bg-slate-100 text-slate-600 group-hover:bg-slate-200 group-hover:text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-slate-700 dark:group-hover:text-white',
        dotClasses: 'bg-slate-400 dark:bg-slate-500'
    }
} );

export const normalizeContractStatus = ( status ) => String( status || '' ).trim().toUpperCase();

export const hasPendingCancellationRequest = ( contract ) => {
    const status = normalizeContractStatus( contract?.status );

    return Boolean(
        contract?.cancellationRequestedBy &&
        status !== CONTRACT_STATUS_KEYS.CANCELLED &&
        status !== CONTRACT_STATUS_KEYS.COMPLETED
    );
};

export const getContractStatusMeta = ( contractOrStatus ) => {
    if ( typeof contractOrStatus === 'object' && contractOrStatus !== null ) {
        if ( hasPendingCancellationRequest( contractOrStatus ) ) {
            return CONTRACT_STATUS_META.CANCELLATION_REQUESTED;
        }

        return CONTRACT_STATUS_META[ normalizeContractStatus( contractOrStatus.status ) ] || CONTRACT_STATUS_META.UNKNOWN;
    }

    return CONTRACT_STATUS_META[ normalizeContractStatus( contractOrStatus ) ] || CONTRACT_STATUS_META.UNKNOWN;
};
