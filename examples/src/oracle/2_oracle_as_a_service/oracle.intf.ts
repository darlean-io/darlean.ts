export interface IOracleActor {
    ask(question: string): Promise<number>;
    teach(fact: string, answer: number): Promise<void>;
}

export interface IOracleService {
    ask(topic: string, question: string): Promise<number>;
    teach(topic: string, fact: string, answer: number): Promise<void>;
}

export const ORACLE_SERVICE = 'OracleService';
