export interface IWebGatewayRequest {
    // The percent-encode url (part after the hostname)
    url: string;
    // The full host name, without the port part, percent-decoded
    hostname?: string;
    port?: number;
    protocol?: string;
    // Percent-decoded search params. When there is no value, it is [].
    searchParams?: { [key: string]: string[] };
    // Http method in all uppercase characters (like GET, POST)
    method?: string;
    // Percent-encoded path.
    path?: string;
    // Any remaining path (percent-encoded) after a prefix matching
    pathRemainder?: string;
    // Percent-decoded user name
    username?: string;
    // Headers except for cookies header.
    headers?: { [header: string]: string };
    cookies?: string[];
    body?: Buffer;
}

export interface IWebGatewayResponse {
    statusCode: number;
    statusMessage: string;
    headers?: { [header: string]: string | string[] };
    cookies?: string[];
    body?: Buffer;
}
