import * as cp from 'child_process';

// Mapping from Node's `process.arch` to Golang's `$GOARCH`
const ARCH_MAPPING: { [key: string]: string } = {
    ia32: '386',
    x64: 'amd64',
    arm: 'arm'
};

// Mapping between Node's `process.platform` to Golang's
const PLATFORM_MAPPING: { [key: string]: string } = {
    darwin: 'darwin',
    linux: 'linux',
    win32: 'windows',
    freebsd: 'freebsd'
};

function determineArch(): string {
    const arch = process.arch as string;
    const mapped = ARCH_MAPPING[arch];

    if (!mapped) {
        throw new Error('Unsupported architecture: ' + arch);
    }

    return mapped;
}

function determinePlatform(): string {
    const p = process.platform as string;
    const mapped = PLATFORM_MAPPING[p];

    if (!mapped) {
        throw new Error('Unsupported platform: ' + p);
    }

    return mapped;
}

export class NatsServer {
    protected process?: cp.ChildProcess;
    protected stopping = false;
    protected onUnexpectedStop?: (stderr: string) => void;
    protected running = false;

    constructor(onUnexpectedStop?: (stderr: string) => void) {
        this.onUnexpectedStop = onUnexpectedStop;
    }

    public start(): void {
        const arch = determineArch();
        const platform = determinePlatform();
        const ext = platform === 'windows' ? '.exe' : '';
        const filename = `nats-server-${platform}-${arch}${ext}`;
        const path = __dirname + '/../../binaries/';
        const fullname = path + filename;

        // console.log('STARTNG', fullname);
        const process = cp.execFile(fullname, {}, (_error, _stdout, stderr) => {
            this.running = false;
            this.process = undefined;
            if (!this.stopping) {
                this.onUnexpectedStop?.(stderr);
            }
        });
        this.running = true;
        this.process = process;
    }

    public stop(): void {
        if (this.process) {
            this.stopping = true;
            this.process.kill();
        }
    }

    public isRunning(): boolean {
        return this.running;
    }
}
