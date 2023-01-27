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
    protected clusterSeedUrls?: string[];
    protected serverListenPort?: number;
    protected clusterListenUrl?: string;
    protected exeName?: string;
    protected appName?: string;

    constructor(
        onUnexpectedStop?: (stderr: string) => void,
        serverListenPort?: number,
        clusterSeedUrls?: string[],
        clusterListenUrl?: string,
        appName?: string
    ) {
        this.onUnexpectedStop = onUnexpectedStop;
        this.clusterSeedUrls = clusterSeedUrls;
        this.serverListenPort = serverListenPort;
        this.clusterListenUrl = clusterListenUrl;
        this.appName = appName;
    }

    public start(): void {
        const arch = determineArch();
        const platform = determinePlatform();
        const ext = platform === 'windows' ? '.exe' : '';
        const filename = `nats-server-${platform}-${arch}${ext}`;
        const path = __dirname + '/../../binaries/';
        const fullname = path + filename;
        this.exeName = fullname;

        const args = [];
        args.push('--cluster_name');
        args.push('darlean');

        if (this.appName) {
            args.push('--pid');
            args.push(this.appName + '.pid');
        }

        if (this.serverListenPort !== undefined) {
            args.push('--port');
            args.push(this.serverListenPort.toString());
        }

        if (this.clusterListenUrl) {
            args.push('--cluster');
            args.push(this.clusterListenUrl);

            if (this.clusterSeedUrls !== undefined && this.clusterSeedUrls.length > 0) {
                args.push('--routes');
                args.push(this.clusterSeedUrls.join(','));
            }
        }

        // console.log('STARTNG', fullname, args);

        const process = cp.execFile(fullname, args, (error, stdout, stderr) => {
            this.running = false;
            this.process = undefined;
            // console.log('NATS', error, stdout, stderr);
            if (!this.stopping) {
                this.onUnexpectedStop?.(stderr);
            }
        });
        this.running = true;
        this.process = process;
    }

    public stop(): void {
        if (this.process && this.exeName && this.process.pid) {
            this.stopping = true;

            // TODO: Improve shuwdown on windows. Wndows does not know signals, it just has a hard kill, but
            // we want de graceful shutdown. We have filed an issue as Nats for this:
            // https://github.com/nats-io/nats-server/issues/3809

            // Note: ctrlc-windows package kills entire process tree including ourselves, so that
            // does not work.

            //const args = ['--signal', `stop=${this.process.pid}`]
            //console.log('----- STOPPING NATS', this.exeName, args);
            //cp.execFileSync(this.exeName, args);
            //this.process.stdin?.write('\u001a');
            //ctrlc.ctrlc(this.process.pid);
            this.process.kill();
            this.process = undefined;
        }
    }

    public isRunning(): boolean {
        return this.running;
    }
}
