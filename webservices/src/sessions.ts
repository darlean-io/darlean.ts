import { WebRequest, WebResponse } from './wrapper';

const MAX_AGE = 30 * 24 * 60 * 60;

export const NO_SESSION = 'NO_SESSION';

export const COOKIE_NAME = 'darlean-session';
export const HEADER_SESSION_TOKEN = 'X-Darlean-Session-Token';
export const HEADER_SESSION_ID = 'X-Darlean-Session-Id';
export const HEADER_SESSION_JSSECRET = 'X-Darlean-Session-Jssecret';

interface INewSession {
    id: string;
    jsSecret: string;
    cookieToken: string;
    meta?: unknown;
}

export const SESSION_SERVICE = 'io.darlean.SessionService';

export interface ISessionService {
    create(): Promise<INewSession>;
    validate<Meta>(jsToken: string, cookieToken: string): Promise<IValidateResult<Meta>>;
    setMeta(id: string, meta: unknown): Promise<void>;
    getMeta(id: string): Promise<unknown>;
}

// Conflicted: An old interval that should not have been used anymore was used. This may indicate that a hyjacker
// has stolen our secret and is trying to break in.
// Expired: The tokens are too old.
export type ValidateReason = 'expired' | 'no-session' | 'invalid-signature' | 'conflicted' | 'no-id' | 'no-token';

interface IValidateResult<Meta> {
    valid?: { id: string; newCookieToken?: string | undefined; meta: Meta | undefined };
    invalid?: { id?: string | undefined; reason: string; meta: Meta | undefined };
}

export interface ISession<Meta> {
    obtainMeta(): Promise<Meta | undefined>;
    assignMeta(meta: Meta | undefined): Promise<void>;
    valid?: {
        id: string;
        newCookieToken?: string | undefined;
        meta: Meta | undefined;
    };

    invalid?: {
        id?: string | undefined;
        reason: string;
        meta: Meta | undefined;
    };
}

export class Session<Meta> implements ISession<Meta> {
    public constructor(private manager: SessionManager<Meta>, vr: IValidateResult<Meta>) {
        this.valid = vr.valid;
        this.invalid = vr.invalid;
    }

    public async obtainMeta(): Promise<Meta | undefined> {
        const id = this.valid?.id ?? this.invalid?.id;
        if (!id) {
            return undefined;
        }
        return await this.manager.obtainMetaForId(id);
    }

    public async assignMeta(meta: Meta | undefined): Promise<void> {
        const id = this.valid?.id ?? this.invalid?.id;
        if (!id) {
            return undefined;
        }
        await this.manager.assignMetaForId(id, meta);
    }

    public valid?: {
        id: string;
        newCookieToken?: string | undefined;
        meta: Meta | undefined;
    };

    public invalid?: {
        id?: string | undefined;
        reason: string;
        meta: Meta | undefined;
    };
}

export interface ISessionManager<Meta> {
    process(request: WebRequest, response: WebResponse): Promise<ISession<Meta>>;
    obtainMeta(request: WebRequest): Promise<Meta>;
    obtainMetaForId(id: string): Promise<Meta | undefined>;
    assignMeta(request: WebRequest, meta: Meta | undefined): Promise<void>;
    assignMetaForId(id: string, meta: Meta | undefined): Promise<void>;
}

export class SessionManager<Meta> implements ISessionManager<Meta> {
    constructor(private service: ISessionService) {}

    public async process(request: WebRequest, response: WebResponse): Promise<ISession<Meta>> {
        const cookieToken = request.getCookie(COOKIE_NAME) ?? '';
        const jsToken = request.getHeader(HEADER_SESSION_TOKEN) ?? '';

        if (jsToken === 'CREATE') {
            const newSession = await this.service.create();
            response.setCookie(
                `${COOKIE_NAME}="${newSession.cookieToken}"; HttpOnly; Secure; Partitioned; SameSite=Strict; MaxAge=${MAX_AGE}; Path=/`
            );
            response.setHeader(HEADER_SESSION_JSSECRET, newSession.jsSecret);
            response.setHeader(HEADER_SESSION_ID, newSession.id);
            return new Session(this, { valid: { id: newSession.id, newCookieToken: newSession.cookieToken, meta: undefined } });
        }

        const validateResult = await this.service.validate<Meta>(jsToken, cookieToken);

        if (!validateResult.valid) {
            new Session(this, validateResult);
        }

        if (validateResult.valid?.newCookieToken) {
            //console.log('NEWCOOKIE', validateResult.valid.newCookieToken);
            response.setCookie(
                `${COOKIE_NAME}="${validateResult.valid.newCookieToken}"; HttpOnly; Secure; Partitioned; SameSite=Strict; MaxAge=${MAX_AGE}; Path=/`
            );
        }

        if (validateResult.valid?.id) {
            response.setHeader(HEADER_SESSION_ID, validateResult.valid.id);
        }

        return new Session<Meta>(this, validateResult);
    }

    public async obtainMeta(request: WebRequest): Promise<Meta> {
        const jsToken = request.getHeader(HEADER_SESSION_TOKEN) ?? '';
        if (!jsToken) {
            throw new Error('No session');
        }
        const id = extractTokenId(jsToken);
        if (!id) {
            throw new Error('No id');
        }

        return (await this.service.getMeta(id)) as Meta;
    }

    public async obtainMetaForId(id: string): Promise<Meta | undefined> {
        if (!id) {
            return undefined;
        }
        return (await this.service.getMeta(id)) as Meta;
    }

    public async assignMeta(request: WebRequest, meta: Meta | undefined) {
        const jsToken = request.getHeader(HEADER_SESSION_TOKEN) ?? '';
        if (!jsToken) {
            throw new Error('No session');
        }
        const id = extractTokenId(jsToken);
        if (!id) {
            throw new Error('No id');
        }

        await this.service.setMeta(id, meta);
    }

    public async assignMetaForId(id: string, meta: Meta | undefined) {
        await this.service.setMeta(id, meta);
    }
}

export function extractTokenId(token: string) {
    return token.split(':')[1];
}
