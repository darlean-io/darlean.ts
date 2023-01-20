import { Knowledge } from './oracle.actor';

export interface IOracleControlActor {
    teach(fact: string, answer: number): Promise<void>;
    fetch(nonce: string): Promise<{ nonce: string; knowledge: Knowledge }>;
}

export interface IOracleReadActor {
    ask(question: string): Promise<number>;
}

export interface IOracleService {
    ask(topic: string, question: string): Promise<number>;
    teach(topic: string, fact: string, answer: number): Promise<void>;
}

export const ORACLE_SERVICE = 'OracleService';
