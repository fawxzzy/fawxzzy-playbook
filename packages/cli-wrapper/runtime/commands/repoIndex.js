import { buildModuleDigestsArtifact, buildModuleContextDigests, generateCompactionCandidateArtifact, generateRepositoryGraph, generateRepositoryIndex, MODULE_DIGESTS_RELATIVE_PATH, MODULE_CONTEXT_DIR_RELATIVE_PATH, REPOSITORY_GRAPH_RELATIVE_PATH, SYSTEM_MAP_RELATIVE_PATH, writeModuleDigestsArtifact, writeModuleContextDigests, writeSystemMapArtifact } from '@zachariahredfield/playbook-engine';
import fs from 'node:fs';
import path from 'node:path';
import { ExitCode } from '../lib/cliContract.js';
import { emitJsonOutput, writeJsonArtifactAbsolute } from '../lib/jsonArtifact.js';
const INDEX_RELATIVE_PATH = '.playbook/repo-index.json';
const ARCHITECTURE_REGISTRY_RELATIVE_PATH = '.playbook/architecture/subsystems.json';
const writeRepositoryIndex = (cwd) => {
    const index = generateRepositoryIndex(cwd);
    const graph = generateRepositoryGraph(index);
    const indexPath = path.join(cwd, INDEX_RELATIVE_PATH);
    const graphPath = path.join(cwd, REPOSITORY_GRAPH_RELATIVE_PATH);
    writeJsonArtifactAbsolute(indexPath, index, 'index', { envelope: false });
    writeJsonArtifactAbsolute(graphPath, graph, 'index', { envelope: false });
    const moduleDigests = buildModuleContextDigests(cwd, index, graph);
    writeModuleContextDigests(cwd, moduleDigests);
    const compactModuleDigests = buildModuleDigestsArtifact(cwd, index, graph);
    writeModuleDigestsArtifact(cwd, compactModuleDigests);
    generateCompactionCandidateArtifact({ repoRoot: cwd, index, graph });
    const architectureRegistryPath = path.join(cwd, ARCHITECTURE_REGISTRY_RELATIVE_PATH);
    if (fs.existsSync(architectureRegistryPath)) {
        writeSystemMapArtifact(cwd);
    }
    return {
        indexPath,
        result: {
            command: 'index',
            ok: true,
            indexFile: INDEX_RELATIVE_PATH,
            graphFile: REPOSITORY_GRAPH_RELATIVE_PATH,
            moduleDigestFile: MODULE_DIGESTS_RELATIVE_PATH,
            systemMapFile: SYSTEM_MAP_RELATIVE_PATH,
            contextDir: MODULE_CONTEXT_DIR_RELATIVE_PATH,
            framework: index.framework,
            architecture: index.architecture,
            modules: index.modules.map((moduleEntry) => moduleEntry.name)
        }
    };
};
export const runIndex = async (cwd, options) => {
    const { result } = writeRepositoryIndex(cwd);
    if (options.format === 'json') {
        emitJsonOutput({ cwd, command: 'index', payload: result, outFile: options.outFile });
        return ExitCode.Success;
    }
    if (!options.quiet) {
        console.log('Repository Intelligence');
        console.log('───────────────────────');
        console.log(`Index file: ${result.indexFile}`);
        console.log(`Graph file: ${result.graphFile}`);
        console.log(`Module digests: ${result.moduleDigestFile}`);
        console.log(`System map file: ${result.systemMapFile}`);
        console.log(`Context digests: ${result.contextDir}`);
        console.log(`Framework: ${result.framework}`);
        console.log(`Architecture: ${result.architecture}`);
        console.log(`Modules: ${result.modules.length > 0 ? result.modules.join(', ') : 'none'}`);
    }
    return ExitCode.Success;
};
//# sourceMappingURL=repoIndex.js.map