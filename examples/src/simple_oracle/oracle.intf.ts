export interface IOracleActor {
    ask(question: string): Promise<number>;
    teach(fact: string, answer: number): Promise<void>;
}

export const ORACLE_ACTOR = 'OracleActor';