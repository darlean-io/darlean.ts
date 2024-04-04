import { ActorSuite, IActorCreateContext, IActorSuite, IPersistable, ITypedPortal, action } from '@darlean/base';
import { IConfigEnv, ITime } from '@darlean/utils';
import { createHash, randomBytes } from 'crypto';

export interface ISessionState {
    lastIssuedCookieIntervals: (number | undefined)[];
    lastReceivedJsIntervals: (number | undefined)[];
    meta?: unknown;
}

export interface INewSession {
    id: string;
    jsSecret: string;
    cookieToken: string;
    meta?: unknown;
}

// Conflicted: An old interval that should not have been used anymore was used. This may indicate that a hyjacker
// has stolen our secret and is trying to break in.
// Expired: The tokens are too old.
export type ValidateReason = 'expired' | 'no-session' | 'invalid-signature' | 'conflicted' | 'no-id' | 'no-token';

export interface IValidateResult<Meta> {
    valid?: { id: string; newCookieToken?: string | undefined; meta: Meta | undefined };
    invalid?: { id?: string | undefined; reason: string; meta?: Meta };
}

function deriveSecret(id: string, kind: string, secret: string): string {
    const hash = createHash('sha256');
    hash.update(id);
    hash.update(':');
    hash.update(kind);
    hash.update(':');
    hash.update(secret);
    return hash.digest('base64');
}

export function deriveJsSecret(id: string, secret: string): string {
    return deriveSecret(id, 'js', secret);
}

export function deriveCookieSecret(id: string, secret: string): string {
    return deriveSecret(id, 'cookie', secret);
}

export function extractTokenId(token: string) {
    return token.split(':')[1];
}

const COOKIE_VERSION = '0';
const JS_VERSION = 0;
const MOMENT_GRANULARITY = 60 * 1000;
const MAX_AGE_INTERVAL = (28 * 24 * 60 * 60 * 1000) / MOMENT_GRANULARITY;

// Amount of interval-units to allow for time drift between
// client and server.
const ALLOWED_TIME_OFFSET_INTERVALS = 5;

export function momentToInterval(moment: number) {
    return Math.floor(moment / MOMENT_GRANULARITY);
}

export function deriveCookieToken(id: string, secret: string, interval: number) {
    const cookieSecret = deriveCookieSecret(id, secret);
    const hash = createHash('sha256');
    hash.update(cookieSecret);
    hash.update(':');
    hash.update(interval.toString());
    const signature = hash.digest('base64');
    return COOKIE_VERSION + ':' + id + ':' + interval.toString() + ':' + signature;
}

export function validateCookieToken(expectedId: string, token: string, secret: string) {
    if (!token) {
        return 0;
    }
    const parts = token.split(':');
    //console.log('PARTS', parts);
    if (parts.length != 4) {
        return 0;
    }
    if (parts[0] > COOKIE_VERSION) {
        return 0;
    }
    const id = parts[1];
    if (expectedId !== id) {
        //console.log('CID mismatch', expectedId, id);
        return 0;
    }
    const interval = parseInt(parts[2]);
    const expectedToken = deriveCookieToken(id, secret, interval);
    if (expectedToken !== token) {
        //console.log('EXPMM', expectedToken, token);
        return 0;
    }
    //console.log('INT', interval);
    return interval;
}

export function deriveJsToken(id: string, secret: string, interval: number) {
    const jsSecret = deriveJsSecret(id, secret);
    const hash = createHash('sha256');
    //console.log('JSSecret', jsSecret, interval)
    hash.update(jsSecret);
    hash.update(':');
    hash.update(interval.toString());
    const signature = hash.digest('base64');
    return JS_VERSION + ':' + id + ':' + interval.toString() + ':' + signature;
}

export function validateJsToken(expectedId: string, token: string, secret: string) {
    //console.log('P0', token);
    if (!token) {
        return 0;
    }
    const parts = token.split(':');
    if (parts.length != 4) {
        return 0;
    }
    if (parts[0] > COOKIE_VERSION) {
        return 0;
    }
    const id = parts[1];
    //console.log('P1');
    if (expectedId !== id) {
        return 0;
    }
    const interval = parseInt(parts[2]);
    const expectedToken = deriveJsToken(id, secret, interval);
    if (expectedToken !== token) {
        //console.log('P2', expectedToken, token);
        return 0;
    }
    return interval;
}

export class SessionActor {
    constructor(private id: string, private time: ITime, private state: IPersistable<ISessionState>, private secret: string) {}

    public async activate() {
        await this.state.load();
    }

    public async deactivate() {
        await this.state.persist();
    }

    @action()
    public async begin(meta: unknown): Promise<INewSession> {
        if (this.state.hasValue()) {
            throw new Error('Session already exists');
        }

        const now = this.time.machineTime();
        const interval = momentToInterval(now);

        const state: ISessionState = { lastIssuedCookieIntervals: [], lastReceivedJsIntervals: [] };
        this.state.setValue(state);
        this.state.markDirty();
        await this.state.persist();

        return {
            id: this.id,
            jsSecret: deriveJsSecret(this.id, this.secret),
            cookieToken: deriveCookieToken(this.id, this.secret, interval),
            meta
        };
    }

    @action()
    public async validate<Meta>(jsToken: string, cookieToken: string): Promise<IValidateResult<Meta>> {
        if (!this.state.hasValue()) {
            return { invalid: { id: this.id, reason: 'no-session' } };
        }
        const state = this.state.getValue();
        const now = this.time.machineTime();
        const currentInterval = momentToInterval(now);
        const jsInterval = validateJsToken(this.id, jsToken, this.secret);
        const cookieInterval = validateCookieToken(this.id, cookieToken, this.secret);
        if (jsInterval <= 0 || cookieInterval <= 0) {
            // One of the tokens is invalid: wrong signature or other error. Ignore the token.
            // Or: should we invalidate? But that would allow an attacker to invalidate other people's
            // sessions (for which the attacker may know the id) by just sending a garbage token.
            return { invalid: { id: this.id, reason: 'invalid-signature' } };
        }

        const jsAgeInterval = currentInterval - jsInterval;
        if (jsAgeInterval > ALLOWED_TIME_OFFSET_INTERVALS) {
            // We have a valid JS token from the past. The chance that it comes from a legitimate user
            // is small, because the token is generated realtime. It must be generated before the computer
            // went to sleep, and sent after the computer woke up. Otherwise, we have fraud.

            // We trust the js token when its interval corresponds to the last or previously received js interval.
            if (!state.lastReceivedJsIntervals.includes(jsInterval)) {
                await this.doInvalidate();
                return { invalid: { id: this.id, reason: 'conflicted' } };
            }

            if (jsAgeInterval > MAX_AGE_INTERVAL) {
                return { invalid: { id: this.id, reason: 'expired' } };
            }
        }
        const cookieAgeInterval = currentInterval - cookieInterval;
        if (cookieAgeInterval > ALLOWED_TIME_OFFSET_INTERVALS) {
            // We have a cookie from the past. Only allow if equal to last or previously issued token.
            if (!state.lastIssuedCookieIntervals.includes(cookieInterval)) {
                await this.doInvalidate();
                return { invalid: { id: this.id, reason: 'conflicted' } };
            }
            if (cookieAgeInterval > MAX_AGE_INTERVAL) {
                return { invalid: { id: this.id, reason: 'expired' } };
            }
        }

        if (!state.lastIssuedCookieIntervals.includes(currentInterval)) {
            state.lastIssuedCookieIntervals = [
                state.lastIssuedCookieIntervals[1],
                state.lastIssuedCookieIntervals[2],
                currentInterval
            ];
            this.state.markDirty();
        }

        if (!state.lastReceivedJsIntervals.includes(currentInterval)) {
            state.lastReceivedJsIntervals = [state.lastReceivedJsIntervals[1], state.lastReceivedJsIntervals[2], currentInterval];
            this.state.markDirty();
        }

        await this.state.persist();

        return {
            valid: {
                id: this.id,
                newCookieToken: deriveCookieToken(this.id, this.secret, currentInterval),
                meta: state.meta as Meta
            }
        };
    }

    @action()
    public async setMeta(meta: unknown) {
        const state = this.checkState();
        state.meta = meta;
        this.state.markDirty();
    }

    @action()
    public async getMeta(): Promise<unknown> {
        const state = this.checkState();
        return state.meta;
    }

    @action()
    public async invalidate(): Promise<void> {
        return this.doInvalidate();
    }

    private async doInvalidate() {
        this.state.clear();
        await this.state.persist();
    }

    private checkState(): ISessionState {
        if (!this.state.hasValue()) {
            throw new Error('No session');
        }
        return this.state.getValue();
    }
}

export interface ISessionService {
    create(): Promise<INewSession>;
    validate<Meta>(jsToken: string, cookieToken: string): Promise<IValidateResult<Meta>>;
    setMeta(id: string, meta: unknown): Promise<void>;
    getMeta(id: string): Promise<unknown>;
}

export class SessionService {
    constructor(private sessionActors: ITypedPortal<SessionActor>) {}

    @action({ locking: 'shared' })
    public async create(meta: unknown): Promise<INewSession> {
        const id = randomBytes(20).toString('base64');
        const actor = this.sessionActors.retrieve([id]);
        return await actor.begin(meta);
    }

    @action({ locking: 'shared' })
    public async validate<Meta>(jsToken: string, cookieToken: string): Promise<IValidateResult<Meta>> {
        if (!jsToken) {
            return { invalid: { reason: 'no-token' } };
        }

        const id = extractTokenId(jsToken);
        if (!id) {
            return { invalid: { reason: 'no-id' } };
        }

        const actor = this.sessionActors.retrieve([id]);
        return await actor.validate(jsToken, cookieToken);
    }

    @action({ locking: 'shared' })
    public async getMeta(id: string): Promise<unknown> {
        const actor = this.sessionActors.retrieve([id]);
        return actor.getMeta();
    }

    @action({ locking: 'shared' })
    public async setMeta(id: string, meta: unknown): Promise<void> {
        const actor = this.sessionActors.retrieve([id]);
        return actor.setMeta(meta);
    }

    @action({ locking: 'shared' })
    public async invalidate(id: string): Promise<void> {
        const actor = this.sessionActors.retrieve([id]);
        return actor.invalidate();
    }
}

const SESSION_ACTOR = 'io.darlean.SessionActor';
export const SESSION_SERVICE = 'io.darlean.SessionService';

function createTablePersistence(context: IActorCreateContext) {
    return context.tablePersistence<ISessionState>({
        id: ['io.darlean.Sessions'],
        scope: 'cluster',
        specifier: 'sessions'
    });
}

export interface IWebSessionsSuiteOptions {
    secret: string;
}

export function createWebSessionsSuite(options: IWebSessionsSuiteOptions): IActorSuite {
    return new ActorSuite([
        {
            type: SESSION_ACTOR,
            kind: 'singular',
            capacity: 1000,
            creator(context) {
                const persistence = createTablePersistence(context);
                return new SessionActor(
                    context.id[0],
                    context.time,
                    persistence.persistable([context.id[0]], undefined),
                    options.secret
                );
            }
        },
        {
            type: SESSION_SERVICE,
            kind: 'multiplar',
            creator(context) {
                const portal = context.portal.typed<SessionActor>(SESSION_ACTOR);
                return new SessionService(portal);
            }
        }
    ]);
}

export interface IWebSessionsSuiteConfig {
    secret: string;
}

export function createWebSessionsSuiteFromConfig(config: IConfigEnv<IWebSessionsSuiteConfig>) {
    const secret = config.fetchString('secret');
    if (!secret) {
        throw new Error('A secret must be configured for session management');
    }
    return createWebSessionsSuite({ secret });
}
