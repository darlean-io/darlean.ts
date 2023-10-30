export const TRANSPORT_ERROR_UNKNOWN_RECEIVER = 'UNKNOWN_RECEIVER';

/**
 * Represents a collection of message tags for transport functionality.
 *
 * Because a message is a collection (union) of multiple sets of tags, the fields
 * are prefixed with `transport_` to make them unique.
 */
export interface ITransportTags {
    /**
     * The receiver of the message
     */
    transport_receiver: string;

    /**
     * The return address to return a response to.
     */
    transport_return?: string;
}

/**
 * Represents a collection of message tags for remote-call functionality.
 *
 * Because a message is a collection (union) of multiple sets of tags, the fields
 * are prefixed with `remotecall_` to make them unique.
 */
export interface IRemoteCallTags {
    /**
     * The kind of the call (regular call or return call).
     */
    remotecall_kind: 'call' | 'return';

    /**
     * The unique id of the call.  The id must be globally unique and is intended to correlate
     * corresponding call and return messages.
     */
    remotecall_id: string;
}

/**
 * Represents a collection of message tags for tracing functionality.
 *
 * Because a message is a collection (union) of multiple sets of tags, the fields
 * are prefixed with `tracing_` to make them unique.
 */

export interface ITracingTags {
    /**
     * Optional array of correlation id's.
     */
    tracing_cids?: string[];

    /**
     * Optional uid of the parent trace section under which the current tracing request falls.
     */
    tracing_parentUid?: string;
}
