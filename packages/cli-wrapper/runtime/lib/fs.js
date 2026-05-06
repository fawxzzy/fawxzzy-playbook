import fs from 'node:fs';
import path from 'node:path';
export const ensureDir = (dirPath) => {
    fs.mkdirSync(dirPath, { recursive: true });
};
export const listFilesRecursive = (baseDir) => {
    const out = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory())
                walk(full);
            else
                out.push(full);
        }
    };
    walk(baseDir);
    return out;
};
//# sourceMappingURL=fs.js.map