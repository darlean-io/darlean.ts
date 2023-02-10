export interface IWebServiceRequest {
    // The percent-encode url (part after the hostname)
    url: string;
    // The full host name, without the port part, percent-decoded
    hostname?: string;
    port?: number;
    protocol?: string;
    // Percent-decoded search params. When there is no value, it is [].
    searchParams?: { [key: string]: string[] };
    method?: string;
    // Percent-decoded path.
    path?: string;
    // Percent-decoded user name
    username?: string;
    // Percent-decoded placeholders
    placeholders?: { [name: string]: string };
    // Headers except for cookies header.
    headers?: { [header: string]: string };
    cookies?: string[];
    body?: Buffer;
}

export interface IWebServiceResponse {
    statusCode: number;
    statusMessage: string;
    headers?: { [header: string]: string | string[] };
    cookies?: string[];
    body?: Buffer;
}
