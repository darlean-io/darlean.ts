import { action, ApplicationError, IPortal } from '@darlean/base';
import { replaceAll, wildcardMatch } from '@darlean/utils';
import {
    IPersistenceService,
    IPersistenceStoreOptions,
    IPersistenceLoadOptions,
    IPersistenceLoadResult,
    IPersistenceQueryOptions,
    IPersistenceQueryResult
} from '.';

export interface IPersistenceMapping {
    specifier: string;
    compartment: string;
}

export interface IPersistenceHandler {
    compartment: string;
    actorType: string;
}

export interface IPersistenceServiceOptions {
    compartments: IPersistenceMapping[];
    handlers: IPersistenceHandler[];
}

export class PersistenceService implements IPersistenceService {
    protected options: IPersistenceServiceOptions;
    protected portal: IPortal;

    constructor(options: IPersistenceServiceOptions, portal: IPortal) {
        this.options = options;
        this.portal = portal;
    }

    @action()
    public async store(options: IPersistenceStoreOptions): Promise<void> {
        const compartment = this.deriveCompartment(options.specifiers || []);
        const handler = this.deriveHandler(compartment);
        const p = this.portal.retrieve<IPersistenceService>(handler.actorType, [compartment]);
        await p.store(options);
    }

    @action()
    public async load(options: IPersistenceLoadOptions): Promise<IPersistenceLoadResult> {
        const compartment = this.deriveCompartment(options.specifiers || []);
        const handler = this.deriveHandler(compartment);
        const p = this.portal.retrieve<IPersistenceService>(handler.actorType, [compartment]);
        return await p.load(options);
    }

    @action()
    public async query(options: IPersistenceQueryOptions): Promise<IPersistenceQueryResult> {
        const compartment = this.deriveCompartment(options.specifiers || []);
        const handler = this.deriveHandler(compartment);
        const p = this.portal.retrieve<IPersistenceService>(handler.actorType, [compartment]);
        return await p.query(options);
    }

    protected deriveCompartment(specifiers: string[]): string {
        for (const specifier of specifiers) {
            for (const mapping of this.options.compartments) {
                const fields: string[] = [];
                if (wildcardMatch(specifier, mapping.specifier, fields)) {
                    let compartment = mapping.compartment;
                    for (let idx = 0; idx < 10; idx++) {
                        compartment = replaceAll(compartment, '${*' + idx.toString() + '}', fields[idx] ?? '');
                    }
                    return compartment;
                }
            }
        }

        throw new ApplicationError('NO_COMPARTMENT', 'No compartment could be derived for specifiers [Specifiers]', {
            Specifiers: specifiers
        });
    }

    protected deriveHandler(compartment: string): IPersistenceHandler {
        for (const handler of this.options.handlers) {
            if (wildcardMatch(compartment, handler.compartment)) {
                return handler;
            }
        }

        throw new ApplicationError('NO_HANDLER', 'No handler could be derived for compartment [Compartment]', {
            Compartment: compartment
        });
    }
}
