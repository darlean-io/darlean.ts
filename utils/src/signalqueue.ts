export class SignalQueue<T> {
    protected items: Map<number, T>;
    protected firstIdx: number;
    protected lastIdx: number;
    protected resolves: Array<(lastIdx: number) => void>;

    constructor() {
        this.items = new Map();
        this.firstIdx = 0;
        this.lastIdx = -1;
        this.resolves = [];
    }

    /**
     * Waits for at most timeout milliseconds until new items after startIdx become available.
     * @param startIdx The index from where to receive items.
     * @param timeout The number of milliseconds to wait.
     * @returns
     */
    public async fetch(startIdx: number, timeout: number): Promise<number> {
        if (this.lastIdx >= startIdx) {
            return this.lastIdx;
        }

        return new Promise<number>((resolve) => {
            const handle = setTimeout(() => {
                const idx = this.resolves.indexOf(resolve);
                if (idx > 0) {
                    this.resolves.splice(idx, 1);
                }
                resolve(this.lastIdx);
            }, timeout);

            this.resolves.push((value) => {
                clearTimeout(handle);
                resolve(value);
            });
        });
    }

    public add(value: T): void {
        const idx = this.lastIdx++;
        this.items.set(idx, value);
        const resolves = this.resolves;
        this.resolves = [];
        for (const r of resolves) {
            r(idx);
        }
    }

    public get(idx: number): T | undefined {
        return this.items.get(idx);
    }
}
