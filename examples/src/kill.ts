import * as fs from 'fs';

const FOLDER = './pid/';

if (require.main === module) {
    const pid = process.argv[2] || '';
    if (pid === '') {
        const files = fs.readdirSync(FOLDER);
        for (const file of files) {
            if (file.endsWith('.run')) {
                fs.unlinkSync(`${FOLDER}${file}`);
            }
        }
    } else {
        fs.unlinkSync(`${FOLDER}${pid}.run`);
    }
}
