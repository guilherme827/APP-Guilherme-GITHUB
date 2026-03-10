import fs from 'node:fs';
import path from 'node:path';

export function loadProcessStoreClass() {
    const storePath = path.resolve(process.cwd(), 'src/utils/ProcessStore.js');
    const source = fs.readFileSync(storePath, 'utf8');
    const withoutImports = source.replace(/^import\s.+;$/gm, '');
    const withoutInstance = withoutImports.replace(/\nexport const processStore = new ProcessStore\(\);\s*$/m, '\n');
    const classModule = withoutInstance.replace('export class ProcessStore', 'class ProcessStore');
    const factory = new Function(
        'MOCK_PROCESSES',
        'MOCK_PROJECTS',
        `${classModule}\nreturn ProcessStore;`
    );
    return factory([], []);
}
