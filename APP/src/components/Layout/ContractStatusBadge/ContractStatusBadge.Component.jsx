import { FileClock } from 'lucide-react';
import { getContractStatusMeta } from './contractStatusMeta.js';

const BASE_BADGE_CLASSES = 'inline-flex items-center rounded-full font-black border transition-colors whitespace-nowrap shadow-sm';

const SIZE_CLASSES = Object.freeze( {
    sm: 'px-2.5 py-1 text-xs gap-1.5',
    md: 'px-3 py-1.5 text-xs gap-1.5',
    lg: 'px-4 py-2 text-sm gap-2'
} );

const ICON_SIZE_CLASSES = Object.freeze( {
    sm: 'h-3.5 w-3.5',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
} );

const DOT_SIZE_CLASSES = Object.freeze( {
    sm: 'h-1.5 w-1.5',
    md: 'h-2 w-2',
    lg: 'h-2.5 w-2.5'
} );

const ContractStatusBadge = ( {
    contract,
    status,
    size = 'md',
    className = '',
    showLongLabel = true,
    showIcon = true,
    showDot = false
} ) => {
    const meta = getContractStatusMeta( contract || status );
    const Icon = meta.Icon || FileClock;
    const label = showLongLabel ? meta.label : meta.shortLabel;
    const safeSize = SIZE_CLASSES[ size ] ? size : 'md';

    return (
        <span
            className={`${ BASE_BADGE_CLASSES } ${ SIZE_CLASSES[ safeSize ] } ${ meta.badgeClasses } ${ className }`}
            title={meta.description || meta.label}
            aria-label={`Status do contrato: ${ meta.label }`}
        >
            {showDot && (
                <span
                    className={`shrink-0 rounded-full ${ DOT_SIZE_CLASSES[ safeSize ] } ${ meta.dotClasses }`}
                    aria-hidden="true"
                />
            )}

            {showIcon && (
                <Icon className={`${ ICON_SIZE_CLASSES[ safeSize ] } shrink-0`} aria-hidden="true" />
            )}

            <span className="truncate">{label}</span>
        </span>
    );
};

export default ContractStatusBadge;
