import { encodeNumber, wildcardMatch } from '@darlean/utils';

export interface IFilterContext {
    data(): { [key: string]: unknown };
    sortKey(idx: number): string;
    partitionKey(idx: number): string;
}

export class Filterer {
    private evaluators: Map<string, (context: IFilterContext, command: unknown[]) => unknown>;

    constructor() {
        this.evaluators = new Map();
        this.fillEvaluators();
    }

    private fillEvaluators() {
        this.evaluators.set('or', (context, command) => {
            for (let idx = 1; idx < command.length; idx++) {
                const value = this.eval(context, command[idx]);
                if (this.isTruthy(value)) {
                    return value;
                }
            }
            return false;
        });

        this.evaluators.set('and', (context, command) => {
            for (let idx = 1; idx < command.length; idx++) {
                const value = this.eval(context, command[idx]);
                if (this.isFalsy(value)) {
                    return false;
                }
            }
            return true;
        });

        this.evaluators.set('eq', (context, command) => {
            return this.eval(context, command[1]) === this.eval(context, command[2]);
        });

        this.evaluators.set('neq', (context, command) => {
            return this.eval(context, command[1]) !== this.eval(context, command[2]);
        });

        this.evaluators.set('lte', (context, command) => {
            return this.compare(this.eval(context, command[1]), this.eval(context, command[2])) <= 0;
        });

        this.evaluators.set('lt', (context, command) => {
            return this.compare(this.eval(context, command[1]), this.eval(context, command[2])) < 0;
        });

        this.evaluators.set('gte', (context, command) => {
            return this.compare(this.eval(context, command[1]), this.eval(context, command[2])) >= 0;
        });

        this.evaluators.set('gt', (context, command) => {
            return this.compare(this.eval(context, command[1]), this.eval(context, command[2])) > 0;
        });

        this.evaluators.set('literal', (_context, command) => {
            return command[1];
        });

        this.evaluators.set('wildcardmatch', (context, command) => {
            const input = this.toString(this.eval(context, command[1]));
            const mask = this.toString(this.eval(context, command[2]));
            return wildcardMatch(input, mask);
        });

        this.evaluators.set('uppercase', (context, command) => {
            const input = this.toString(this.eval(context, command[1]));
            return input.toUpperCase();
        });

        this.evaluators.set('lowercase', (context, command) => {
            const input = this.toString(this.eval(context, command[1]));
            return input.toLowerCase();
        });

        this.evaluators.set('not', (context, command) => {
            return this.isFalsy(this.eval(context, command[1]));
        });

        this.evaluators.set('prefix', (context, command) => {
            return this.toString(this.eval(context, command[1])).startsWith(this.toString(this.eval(context, command[2])));
        });

        this.evaluators.set('contains', (context, command) => {
            return this.toString(this.eval(context, command[1])).includes(this.toString(this.eval(context, command[2])));
        });

        this.evaluators.set('field', (context, command) => {
            const data = context.data();
            const path = this.toCompareString(this.eval(context, command[1]));
            const value = data[path];
            return value;
        });

        this.evaluators.set('sk', (context, command) => {
            const idx = parseInt(this.eval(context, command[1]) as string);
            return context.sortKey(idx);
        });

        this.evaluators.set('pk', (context, command) => {
            const idx = parseInt(this.eval(context, command[1]) as string);
            return context.partitionKey(idx);
        });
    }

    public process(context: IFilterContext, command: unknown) {
        return this.eval(context, command);
    }

    public isTruthy(value: unknown) {
        return !this.isFalsy(value);
    }

    public isFalsy(value: unknown) {
        return (
            value === undefined || value === '' || value === 0 || value === false || (Array.isArray(value) && value.length === 0)
        );
    }

    private eval(context: IFilterContext, command: unknown) {
        if (Array.isArray(command)) {
            const handler = this.evaluators.get(command[0]);
            if (!handler) {
                throw new Error(`No handler for [${command[0]}]`);
            }
            return handler(context, command);
        } else {
            return command;
        }
    }

    private compare(a: unknown, b: unknown): number {
        return Buffer.from(this.toCompareString(a), 'utf-8').compare(Buffer.from(this.toCompareString(b)));
    }

    private toCompareString(value: unknown): string {
        switch (typeof value) {
            case 'boolean':
                return value ? 'true' : 'false';
            case 'number':
                return encodeNumber(value);
            case 'string':
                return value;
        }
        return '';
    }

    private toString(value: unknown): string {
        switch (typeof value) {
            case 'boolean':
                return value ? 'true' : 'false';
            case 'number':
                return value.toString();
            case 'string':
                return value;
        }
        return '';
    }
}
