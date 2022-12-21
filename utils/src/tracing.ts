export interface ITraceInfo {
    correlationIds: string[];
    parentSegmentId?: string;
}

export interface ISegmentOptions {
    correlationIds?: string[];
    parentSegmentId?: string;
    id?: string;
    attributes?: { [key: string]: unknown };
    startMoment?: number;
    endMoment?: number;
}

export interface ISegment {
    options: ISegmentOptions;
    sub(options: ISegmentOptions): ISegment;
    finish(): void;
    getCorrelationIds(): string[];
}

export interface ITracer {
    trace(options: ITraceInfo): ISegment;
}
