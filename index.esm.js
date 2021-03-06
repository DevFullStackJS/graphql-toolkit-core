import { asArray, resolveBuiltinModule, resolveBuiltinModuleSync, debugLog, printSchemaWithDirectives, isDocumentString, parseGraphQLSDL, compareNodes, fixSchemaAst, compareStrings } from '@graphql-toolkit/common';
import { isSchema, parse, Kind, Source } from 'graphql';
import isGlob from 'is-glob';
import { __asyncValues } from 'tslib';
import pLimit from 'p-limit';
import { printWithComments, resetComments, mergeSchemasAsync, mergeSchemas } from '@graphql-toolkit/schema-merging';
import { uniqBy, keyBy, reverse, includes, flatten, isEqual, groupBy } from 'lodash';

function normalizePointers(unnormalizedPointerOrPointers) {
    return asArray(unnormalizedPointerOrPointers).reduce((normalizedPointers, unnormalizedPointer) => {
        if (typeof unnormalizedPointer === 'string') {
            normalizedPointers[unnormalizedPointer] = {};
        }
        else if (typeof unnormalizedPointer === 'object') {
            Object.assign(normalizedPointers, unnormalizedPointer);
        }
        else {
            throw new Error(`Invalid pointer ${unnormalizedPointer}`);
        }
        return normalizedPointers;
    }, {});
}

function applyDefaultOptions(options) {
    options.cache = options.cache || {};
    options.cwd = options.cwd || process.cwd();
    options.sort = 'sort' in options ? options.sort : true;
    options.processedFiles = options.processedFiles || new Map();
}
async function prepareOptions(options) {
    applyDefaultOptions(options);
    options.fs = await resolveBuiltinModule('fs', options.fs);
    options.path = await resolveBuiltinModule('path', options.path);
    options.os = await resolveBuiltinModule('os', options.os);
    return options;
}
async function prepareOptionsSync(options) {
    applyDefaultOptions(options);
    options.fs = resolveBuiltinModuleSync('fs', options.fs);
    options.path = resolveBuiltinModuleSync('path', options.path);
    options.os = resolveBuiltinModuleSync('os', options.os);
    return options;
}

async function loadFile(pointer, options) {
    var e_1, _a;
    const cached = useCache({ pointer, options });
    if (cached) {
        return cached;
    }
    try {
        for (var _b = __asyncValues(options.loaders), _c; _c = await _b.next(), !_c.done;) {
            const loader = _c.value;
            try {
                const canLoad = await loader.canLoad(pointer, options);
                if (canLoad) {
                    return await loader.load(pointer, options);
                }
            }
            catch (error) {
                debugLog(`Failed to find any GraphQL type definitions in: ${pointer} - ${error.message}`);
                throw error;
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b.return)) await _a.call(_b);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return undefined;
}
function loadFileSync(pointer, options) {
    const cached = useCache({ pointer, options });
    if (cached) {
        return cached;
    }
    for (const loader of options.loaders) {
        try {
            const canLoad = loader.canLoadSync && loader.loadSync && loader.canLoadSync(pointer, options);
            if (canLoad) {
                return loader.loadSync(pointer, options);
            }
        }
        catch (error) {
            debugLog(`Failed to find any GraphQL type definitions in: ${pointer} - ${error.message}`);
            throw error;
        }
    }
    return undefined;
}
function useCache({ pointer, options }) {
    if (pointer in options.cache) {
        return options.cache[pointer];
    }
}

/**
 * Converts a string to 32bit integer
 */
function stringToHash(str) {
    let hash = 0;
    // tslint:disable-next-line: triple-equals
    if (str.length == 0) {
        return hash;
    }
    let char;
    for (let i = 0; i < str.length; i++) {
        char = str.charCodeAt(i);
        // tslint:disable-next-line: no-bitwise
        hash = (hash << 5) - hash + char;
        // tslint:disable-next-line: no-bitwise
        hash = hash & hash;
    }
    return hash;
}
function useStack(...fns) {
    return (input) => {
        function createNext(i) {
            if (i >= fns.length) {
                return () => { };
            }
            return function next() {
                fns[i](input, createNext(i + 1));
            };
        }
        fns[0](input, createNext(1));
    };
}
function useLimit(concurrency) {
    return pLimit(concurrency);
}

async function getCustomLoaderByPath(path, cwd) {
    try {
        const { default: importFrom } = await import('import-from');
        const requiredModule = importFrom(cwd, path);
        if (requiredModule) {
            if (requiredModule.default && typeof requiredModule.default === 'function') {
                return requiredModule.default;
            }
            if (typeof requiredModule === 'function') {
                return requiredModule;
            }
        }
    }
    catch (e) { }
    return null;
}
function getCustomLoaderByPathSync(path, cwd) {
    try {
        let importFrom = require('import-from');
        importFrom = importFrom.default || importFrom;
        const requiredModule = importFrom(cwd, path);
        if (requiredModule) {
            if (requiredModule.default && typeof requiredModule.default === 'function') {
                return requiredModule.default;
            }
            if (typeof requiredModule === 'function') {
                return requiredModule;
            }
        }
    }
    catch (e) { }
    return null;
}
async function useCustomLoader(loaderPointer, cwd) {
    let loader;
    if (typeof loaderPointer === 'string') {
        loader = await getCustomLoaderByPath(loaderPointer, cwd);
    }
    else if (typeof loaderPointer === 'function') {
        loader = loaderPointer;
    }
    if (typeof loader !== 'function') {
        throw new Error(`Failed to load custom loader: ${loaderPointer}`);
    }
    return loader;
}
function useCustomLoaderSync(loaderPointer, cwd) {
    let loader;
    if (typeof loaderPointer === 'string') {
        loader = getCustomLoaderByPathSync(loaderPointer, cwd);
    }
    else if (typeof loaderPointer === 'function') {
        loader = loaderPointer;
    }
    if (typeof loader !== 'function') {
        throw new Error(`Failed to load custom loader: ${loaderPointer}`);
    }
    return loader;
}

function useQueue(options) {
    const queue = [];
    const limit = (options === null || options === void 0 ? void 0 : options.concurrency) ? pLimit(options.concurrency) : async (fn) => fn();
    return {
        add(fn) {
            queue.push(() => limit(fn));
        },
        runAll() {
            return Promise.all(queue.map(fn => fn()));
        },
    };
}
function useSyncQueue() {
    const queue = [];
    return {
        add(fn) {
            queue.push(fn);
        },
        runAll() {
            queue.forEach(fn => fn());
        },
    };
}

const CONCURRENCY_LIMIT = 50;
async function collectSources({ pointerOptionMap, options, }) {
    var _a;
    const sources = [];
    const globs = [];
    const globOptions = {};
    const queue = useQueue({ concurrency: CONCURRENCY_LIMIT });
    const unixify = await import('unixify').then(m => m.default || m);
    const { addSource, addGlob, collect } = createHelpers({
        sources,
        globs,
        options,
        globOptions,
        stack: [collectDocumentString, collectGlob, collectCustomLoader, collectFallback],
    });
    for (const pointer in pointerOptionMap) {
        const pointerOptions = Object.assign(Object.assign({}, ((_a = pointerOptionMap[pointer]) !== null && _a !== void 0 ? _a : {})), { unixify });
        collect({
            pointer,
            pointerOptions,
            pointerOptionMap,
            options,
            addSource,
            addGlob,
            queue: queue.add,
        });
    }
    if (globs.length) {
        includeIgnored({
            options,
            unixify,
            globs,
        });
        const { default: globby } = await import('globby');
        const paths = await globby(globs, createGlobbyOptions(options));
        collectSourcesFromGlobals({
            filepaths: paths,
            options,
            globOptions,
            pointerOptionMap,
            addSource,
            queue: queue.add,
        });
    }
    await queue.runAll();
    return sources;
}
function collectSourcesSync({ pointerOptionMap, options, }) {
    var _a;
    const sources = [];
    const globs = [];
    const globOptions = {};
    const queue = useSyncQueue();
    let unixify = require('unixify');
    unixify = unixify.default || unixify;
    const { addSource, addGlob, collect } = createHelpers({
        sources,
        globs,
        options,
        globOptions,
        stack: [collectDocumentString, collectGlob, collectCustomLoaderSync, collectFallbackSync],
    });
    for (const pointer in pointerOptionMap) {
        const pointerOptions = Object.assign(Object.assign({}, ((_a = pointerOptionMap[pointer]) !== null && _a !== void 0 ? _a : {})), { unixify });
        collect({
            pointer,
            pointerOptions,
            pointerOptionMap,
            options,
            addSource,
            addGlob,
            queue: queue.add,
        });
    }
    if (globs.length) {
        includeIgnored({
            options,
            unixify,
            globs,
        });
        const globby = require('globby');
        const paths = globby.sync(globs, createGlobbyOptions(options));
        collectSourcesFromGlobalsSync({
            filepaths: paths,
            options,
            globOptions,
            pointerOptionMap,
            addSource,
            queue: queue.add,
        });
    }
    queue.runAll();
    return sources;
}
//
function createHelpers({ sources, globs, options, globOptions, stack, }) {
    const addSource = ({ pointer, source, noCache, }) => {
        sources.push(source);
        if (!noCache) {
            options.cache[pointer] = source;
        }
    };
    const collect = useStack(...stack);
    const addGlob = ({ pointerOptions, pointer }) => {
        globs.push(pointer);
        Object.assign(globOptions, pointerOptions);
    };
    return {
        addSource,
        collect,
        addGlob,
    };
}
function includeIgnored({ options, unixify, globs }) {
    if (options.ignore) {
        const ignoreList = asArray(options.ignore)
            .map(g => `!(${g})`)
            .map(unixify);
        if (ignoreList.length > 0) {
            globs.push(...ignoreList);
        }
    }
}
function createGlobbyOptions(options) {
    return Object.assign(Object.assign({ absolute: true }, options), { ignore: [] });
}
function collectSourcesFromGlobals({ filepaths, options, globOptions, pointerOptionMap, addSource, queue, }) {
    const collectFromGlobs = useStack(collectCustomLoader, collectFallback);
    for (let i = 0; i < filepaths.length; i++) {
        const pointer = filepaths[i];
        collectFromGlobs({
            pointer,
            pointerOptions: globOptions,
            pointerOptionMap,
            options,
            addSource,
            addGlob: () => {
                throw new Error(`I don't accept any new globs!`);
            },
            queue,
        });
    }
}
function collectSourcesFromGlobalsSync({ filepaths, options, globOptions, pointerOptionMap, addSource, queue, }) {
    const collectFromGlobs = useStack(collectCustomLoaderSync, collectFallbackSync);
    for (let i = 0; i < filepaths.length; i++) {
        const pointer = filepaths[i];
        collectFromGlobs({
            pointer,
            pointerOptions: globOptions,
            pointerOptionMap,
            options,
            addSource,
            addGlob: () => {
                throw new Error(`I don't accept any new globs!`);
            },
            queue,
        });
    }
}
function addResultOfCustomLoader({ pointer, result, addSource, }) {
    if (isSchema(result)) {
        addSource({
            source: {
                location: pointer,
                schema: result,
                document: parse(printSchemaWithDirectives(result)),
            },
            pointer,
            noCache: true,
        });
    }
    else if (result.kind && result.kind === Kind.DOCUMENT) {
        addSource({
            source: {
                document: result,
                location: pointer,
            },
            pointer,
        });
    }
    else if (result.document) {
        addSource({
            source: Object.assign({ location: pointer }, result),
            pointer,
        });
    }
}
function collectDocumentString({ pointer, pointerOptions, options, addSource, queue }, next) {
    if (isDocumentString(pointer)) {
        return queue(() => {
            const source = parseGraphQLSDL(`${stringToHash(pointer)}.graphql`, pointer, Object.assign(Object.assign({}, options), pointerOptions));
            addSource({
                source,
                pointer,
            });
        });
    }
    next();
}
function collectGlob({ pointer, pointerOptions, addGlob }, next) {
    if (isGlob(pointerOptions.unixify(pointer))) {
        return addGlob({
            pointer: pointerOptions.unixify(pointer),
            pointerOptions,
        });
    }
    next();
}
function collectCustomLoader({ pointer, pointerOptions, queue, addSource, options, pointerOptionMap }, next) {
    if (pointerOptions.loader) {
        return queue(async () => {
            const loader = await useCustomLoader(pointerOptions.loader, options.cwd);
            const result = await loader(pointer, Object.assign(Object.assign({}, options), pointerOptions), pointerOptionMap);
            if (!result) {
                return;
            }
            addResultOfCustomLoader({ pointer, result, addSource });
        });
    }
    next();
}
function collectCustomLoaderSync({ pointer, pointerOptions, queue, addSource, options, pointerOptionMap }, next) {
    if (pointerOptions.loader) {
        return queue(() => {
            const loader = useCustomLoaderSync(pointerOptions.loader, options.cwd);
            const result = loader(pointer, Object.assign(Object.assign({}, options), pointerOptions), pointerOptionMap);
            if (result) {
                addResultOfCustomLoader({ pointer, result, addSource });
            }
        });
    }
    next();
}
function collectFallback({ queue, pointer, options, pointerOptions, addSource }) {
    return queue(async () => {
        const source = await loadFile(pointer, Object.assign(Object.assign({}, options), pointerOptions));
        if (source) {
            addSource({ source, pointer });
        }
    });
}
function collectFallbackSync({ queue, pointer, options, pointerOptions, addSource }) {
    return queue(() => {
        const source = loadFileSync(pointer, Object.assign(Object.assign({}, options), pointerOptions));
        if (source) {
            addSource({ source, pointer });
        }
    });
}

const builtinTypes = ['String', 'Float', 'Int', 'Boolean', 'ID', 'Upload'];
const builtinDirectives = [
    'deprecated',
    'skip',
    'include',
    'cacheControl',
    'key',
    'external',
    'requires',
    'provides',
    'connection',
    'client',
];
/**
 * Post processing of all imported type definitions. Loops over each of the
 * imported type definitions, and processes it using collectNewTypeDefinitions.
 *
 * @param allDefinitions All definitions from all schemas
 * @param definitionPool Current definitions (from first schema)
 * @param newTypeDefinitions All imported definitions
 * @returns Final collection of type definitions for the resulting schema
 */
function completeDefinitionPool(allDefinitions, definitionPool, newTypeDefinitions) {
    const visitedDefinitions = {};
    while (newTypeDefinitions.length > 0) {
        const schemaMap = keyBy(reverse(allDefinitions), (d) => ('name' in d ? d.name.value : 'schema'));
        const newDefinition = newTypeDefinitions.shift();
        const defName = 'name' in newDefinition ? newDefinition.name.value : 'schema';
        if (visitedDefinitions[defName]) {
            continue;
        }
        const collectedTypedDefinitions = collectNewTypeDefinitions(allDefinitions, definitionPool, newDefinition, schemaMap);
        newTypeDefinitions.push(...collectedTypedDefinitions);
        definitionPool.push(...collectedTypedDefinitions);
        visitedDefinitions[defName] = true;
    }
    return uniqBy(definitionPool, 'name.value');
}
/**
 * Processes a single type definition, and performs a number of checks:
 * - Add missing interface implementations
 * - Add missing referenced types
 * - Remove unused type definitions
 *
 * @param allDefinitions All definitions from all schemas
 * (only used to find missing interface implementations)
 * @param definitionPool Resulting definitions
 * @param newDefinition All imported definitions
 * @param schemaMap Map of all definitions for easy lookup
 * @returns All relevant type definitions to add to the final schema
 */
function collectNewTypeDefinitions(allDefinitions, definitionPool, newDefinition, schemaMap) {
    let newTypeDefinitions = [];
    if (newDefinition.kind !== Kind.DIRECTIVE_DEFINITION) {
        newDefinition.directives.forEach(collectDirective);
    }
    if (newDefinition.kind === Kind.ENUM_TYPE_DEFINITION) {
        newDefinition.values.forEach((value) => value.directives.forEach(collectDirective));
    }
    if (newDefinition.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION) {
        newDefinition.fields.forEach(collectNode);
    }
    if (newDefinition.kind === Kind.INTERFACE_TYPE_DEFINITION) {
        const interfaceName = newDefinition.name.value;
        newDefinition.fields.forEach(collectNode);
        const interfaceImplementations = allDefinitions.filter((d) => d.kind === Kind.OBJECT_TYPE_DEFINITION && d.interfaces.some((i) => i.name.value === interfaceName));
        newTypeDefinitions.push(...interfaceImplementations);
    }
    if (newDefinition.kind === Kind.UNION_TYPE_DEFINITION) {
        newDefinition.types.forEach((type) => {
            if (!definitionPool.some((d) => 'name' in d && d.name.value === type.name.value)) {
                const typeName = type.name.value;
                const typeMatch = schemaMap[typeName];
                if (!typeMatch) {
                    throw new Error(`Couldn't find type ${typeName} in any of the schemas.`);
                }
                newTypeDefinitions.push(schemaMap[type.name.value]);
            }
        });
    }
    if (newDefinition.kind === Kind.OBJECT_TYPE_DEFINITION) {
        // collect missing interfaces
        newDefinition.interfaces.forEach((int) => {
            if (!definitionPool.some((d) => 'name' in d && d.name.value === int.name.value)) {
                const interfaceName = int.name.value;
                const interfaceMatch = schemaMap[interfaceName];
                if (!interfaceMatch) {
                    throw new Error(`Couldn't find interface ${interfaceName} in any of the schemas.`);
                }
                newTypeDefinitions.push(schemaMap[int.name.value]);
            }
        });
        // iterate over all fields
        newDefinition.fields.forEach((field) => {
            collectNode(field);
            // collect missing argument input types
            field.arguments.forEach(collectNode);
        });
    }
    if (newDefinition.kind === Kind.SCHEMA_DEFINITION) {
        newDefinition.operationTypes.forEach((operationType) => {
            if (!definitionPool.some((d) => 'name' in d && d.name.value === operationType.type.name.value)) {
                const typeName = operationType.type.name.value;
                const typeMatch = schemaMap[typeName];
                if (!typeMatch) {
                    throw new Error(`Couldn't find type ${typeName} in any of the schemas.`);
                }
                newTypeDefinitions.push(schemaMap[operationType.type.name.value]);
            }
        });
    }
    if (newDefinition.kind === Kind.OPERATION_DEFINITION || newDefinition.kind === Kind.FRAGMENT_DEFINITION) {
        if (newDefinition.selectionSet) {
            for (const selection of newDefinition.selectionSet.selections) {
                collectFragments(selection);
            }
        }
    }
    return newTypeDefinitions;
    function collectFragments(node) {
        if (node.kind === Kind.FRAGMENT_SPREAD) {
            const fragmentName = node.name.value;
            if (!definitionPool.some((d) => 'name' in d && d.name.value === fragmentName)) {
                const fragmentMatch = schemaMap[fragmentName];
                if (!fragmentMatch) {
                    throw new Error(`Fragment ${fragmentName}: Couldn't find fragment ${fragmentName} in any of the documents.`);
                }
                newTypeDefinitions.push(fragmentMatch);
            }
        }
        else if (node.selectionSet) {
            for (const selection of node.selectionSet.selections) {
                for (const directive of node.directives) {
                    collectDirective(directive);
                }
                collectFragments(selection);
            }
        }
    }
    function collectNode(node) {
        const nodeType = getNamedType(node.type);
        const nodeTypeName = nodeType.name.value;
        // collect missing argument input types
        if (!definitionPool.some((d) => 'name' in d && d.name.value === nodeTypeName) &&
            !includes(builtinTypes, nodeTypeName)) {
            const argTypeMatch = schemaMap[nodeTypeName];
            if (!argTypeMatch) {
                throw new Error(`Field ${node.name.value}: Couldn't find type ${nodeTypeName} in any of the schemas.`);
            }
            newTypeDefinitions.push(argTypeMatch);
        }
        node.directives.forEach(collectDirective);
    }
    function collectDirective(directive) {
        const directiveName = directive.name.value;
        if (!definitionPool.some((d) => 'name' in d && d.name.value === directiveName) &&
            !includes(builtinDirectives, directiveName)) {
            const directive = schemaMap[directiveName];
            if (!directive) {
                throw new Error(`Directive ${directiveName}: Couldn't find type ${directiveName} in any of the schemas.`);
            }
            directive.arguments.forEach(collectNode);
            newTypeDefinitions.push(directive);
        }
    }
}
/**
 * Nested visitor for a type node to get to the final NamedType
 *
 * @param {TypeNode} type Type node to get NamedTypeNode for
 * @returns {NamedTypeNode} The found NamedTypeNode
 */
function getNamedType(type) {
    if (type.kind === Kind.NAMED_TYPE) {
        return type;
    }
    return getNamedType(type.type);
}

const gqlExt = /\.g(raph)?ql(s)?$/;
function isGraphQLFile(f) {
    return gqlExt.test(f);
}
const IMPORT_FROM_REGEX = /^import\s+(\*|(.*))\s+from\s+('|")(.*)('|");?$/;
const IMPORT_DEFAULT_REGEX = /^import\s+('|")(.*)('|");?$/;
/**
 * Parse a single import line and extract imported types and schema filename
 *
 * @param importLine Import line
 * @returns Processed import line
 */
function parseImportLine(importLine) {
    if (IMPORT_FROM_REGEX.test(importLine)) {
        // Apply regex to import line
        const matches = importLine.match(IMPORT_FROM_REGEX);
        if (matches && matches.length === 6 && matches[4]) {
            // Extract matches into named variables
            const [, wildcard, importsString, , from] = matches;
            // Extract imported types
            const imports = wildcard === '*' ? ['*'] : importsString.split(',').map((d) => d.trim());
            // Return information about the import line
            return { imports, from };
        }
    }
    else if (IMPORT_DEFAULT_REGEX.test(importLine)) {
        const [, , from] = importLine.match(IMPORT_DEFAULT_REGEX);
        return { imports: ['*'], from };
    }
    throw new Error(`
    Import statement is not valid: ${importLine}
    If you want to have comments starting with '# import', please use ''' instead!
    You can only have 'import' statements in the following pattern;
    # import [Type].[Field] from [File]
  `);
}
/**
 * Parse a schema and analyze all import lines
 *
 * @param sdl Schema to parse
 * @returns Array with collection of imports per import line (file)
 */
function parseSDL(sdl) {
    return sdl
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('# import ') || l.startsWith('#import '))
        .map((l) => l.replace('#', '').trim())
        .map(parseImportLine);
}
/**
 * Main entry point. Recursively process all import statement in a schema
 *
 * @param filePath File path to the initial schema file
 * @returns Single bundled schema with all imported types
 */
async function processImportSyntax(documentSource, options, allDefinitions) {
    const typeDefinitions = [];
    // Recursively process the imports, starting by importing all types from the initial schema
    await collectDefinitions(['*'], documentSource, options, typeDefinitions, allDefinitions);
    return process$1({
        typeDefinitions,
        options,
        allDefinitions,
    });
}
/**
 * Main entry point. Recursively process all import statement in a schema
 *
 * @param documentSource File path to the initial schema file
 * @returns Single bundled schema with all imported types
 */
function processImportSyntaxSync(documentSource, options, allDefinitions) {
    const typeDefinitions = [];
    // Recursively process the imports, starting by importing all types from the initial schema
    collectDefinitionsSync(['*'], documentSource, options, typeDefinitions, allDefinitions);
    return process$1({
        typeDefinitions,
        options,
        allDefinitions,
    });
}
function process$1({ typeDefinitions, options, allDefinitions, }) {
    // Post processing of the final schema (missing types, unused types, etc.)
    // Query, Mutation and Subscription should be merged
    // And should always be in the first set, to make sure they
    // are not filtered out.
    const firstTypes = flatten(typeDefinitions);
    const secondFirstTypes = typeDefinitions[0];
    const otherFirstTypes = flatten(typeDefinitions.slice(1));
    const firstSet = firstTypes.concat(secondFirstTypes, otherFirstTypes);
    const processedTypeNames = [];
    const mergedFirstTypes = [];
    for (const type of firstSet) {
        if ('name' in type) {
            if (!processedTypeNames.includes(type.name.value)) {
                processedTypeNames.push(type.name.value);
                mergedFirstTypes.push(type);
            }
            else {
                const existingType = mergedFirstTypes.find((t) => t.name.value === type.name.value);
                if ('fields' in existingType) {
                    existingType.fields = uniqBy(existingType.fields.concat(type.fields), 'name.value');
                    if (options.sort) {
                        existingType.fields = existingType.fields.sort(compareNodes);
                    }
                }
            }
        }
    }
    return completeDefinitionPool(flatten(allDefinitions), firstSet, flatten(typeDefinitions));
}
/**
 * Parses a schema into a graphql DocumentNode.
 * If the schema is empty a DocumentNode with empty definitions will be created.
 *
 * @param sdl Schema to parse
 * @returns A graphql DocumentNode with definitions of the parsed sdl.
 */
function getDocumentFromSDL(sdl) {
    if (isEmptySDL(sdl)) {
        return {
            kind: Kind.DOCUMENT,
            definitions: [],
        };
    }
    return parse(sdl, { noLocation: true });
}
/**
 * Check if a schema contains any type definitions at all.
 *
 * @param sdl Schema to parse
 * @returns True if SDL only contains comments and/or whitespaces
 */
function isEmptySDL(sdl) {
    return (sdl
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => !(l.length === 0 || l.startsWith('#'))).length === 0);
}
/**
 * Resolve the path of an import.
 * First it will try to find a file relative from the file the import is in, if that fails it will try to resolve it as a module so imports from packages work correctly.
 *
 * @param filePath Path the import was made from
 * @param importFrom Path given for the import
 * @returns Full resolved path to a file
 */
function resolveModuleFilePath(filePath, importFrom, options) {
    const { fs, path } = options;
    if (fs && path) {
        const fullPath = path.resolve(options.cwd, filePath);
        const dirName = path.dirname(fullPath);
        if (isGraphQLFile(fullPath) && isGraphQLFile(importFrom)) {
            try {
                return fs.realpathSync(path.join(dirName, importFrom));
            }
            catch (e) {
                if (e.code === 'ENOENT') {
                    let resolveFrom = require('resolve-from');
                    resolveFrom = resolveFrom.default || resolveFrom;
                    return resolveFrom(dirName, importFrom);
                }
            }
        }
    }
    return importFrom;
}
/**
 * Recursively process all schema files. Keeps track of both the filtered
 * type definitions, and all type definitions, because they might be needed
 * in post-processing (to add missing types)
 *
 * @param imports Types specified in the import statement
 * @param sdl Current schema
 * @param filePath File location for current schema
 * @param Tracking of processed schemas (for circular dependencies)
 * @param Tracking of imported type definitions per schema
 * @param Tracking of all type definitions per schema
 * @returns Both the collection of all type definitions, and the collection of imported type definitions
 */
async function collectDefinitions(imports, source, options, typeDefinitions, allDefinitions) {
    const rawModules = preapreRawModules({ allDefinitions, source, imports, options, typeDefinitions });
    // Process each file (recursively)
    await Promise.all(rawModules.map(async (module) => {
        // If it was not yet processed (in case of circular dependencies)
        const filepath = resolveModuleFilePath(source.location, module.from, options);
        if (canProcess({
            options,
            module,
            filepath,
        })) {
            const result = await loadFile(filepath, options);
            await collectDefinitions(module.imports, result, options, typeDefinitions, allDefinitions);
        }
    }));
}
/**
 * Recursively process all schema files. Keeps track of both the filtered
 * type definitions, and all type definitions, because they might be needed
 * in post-processing (to add missing types)
 *
 * @param imports Types specified in the import statement
 * @param sdl Current schema
 * @param filePath File location for current schema
 * @param Tracking of processed schemas (for circular dependencies)
 * @param Tracking of imported type definitions per schema
 * @param Tracking of all type definitions per schema
 * @returns Both the collection of all type definitions, and the collection of imported type definitions
 */
function collectDefinitionsSync(imports, source, options, typeDefinitions, allDefinitions) {
    const rawModules = preapreRawModules({ allDefinitions, source, imports, options, typeDefinitions });
    // Process each file (recursively)
    rawModules.forEach((module) => {
        // If it was not yet processed (in case of circular dependencies)
        const filepath = resolveModuleFilePath(source.location, module.from, options);
        if (canProcess({
            options,
            module,
            filepath,
        })) {
            const result = loadFileSync(filepath, options);
            collectDefinitionsSync(module.imports, result, options, typeDefinitions, allDefinitions);
        }
    });
}
//
function preapreRawModules({ allDefinitions, imports, options, typeDefinitions, source, }) {
    // Add all definitions to running total
    allDefinitions.push(source.document.definitions);
    // Filter TypeDefinitionNodes by type and defined imports
    const currentTypeDefinitions = filterImportedDefinitions(imports, source.document.definitions, allDefinitions, options.sort);
    // Add typedefinitions to running total
    typeDefinitions.push(currentTypeDefinitions);
    // Read imports from current file
    return parseSDL(source.rawSDL);
}
function canProcess({ options, module, filepath, }) {
    const processedFile = options.processedFiles.get(filepath);
    if (!processedFile || !processedFile.find((rModule) => isEqual(rModule, module))) {
        // Mark this specific import line as processed for this file (for cicular dependency cases)
        options.processedFiles.set(filepath, processedFile ? processedFile.concat(module) : [module]);
        return true;
    }
    return false;
}
/**
 * Filter the types loaded from a schema, first by relevant types,
 * then by the types specified in the import statement.
 *
 * @param imports Types specified in the import statement
 * @param typeDefinitions All definitions from a schema
 * @returns Filtered collection of type definitions
 */
function filterImportedDefinitions(imports, typeDefinitions, allDefinitions, sort) {
    // This should do something smart with fields
    const filteredDefinitions = typeDefinitions;
    if (imports.includes('*')) {
        if (imports.length === 1 && imports[0] === '*' && allDefinitions.length > 1) {
            const previousTypeDefinitions = keyBy(flatten(allDefinitions.slice(0, allDefinitions.length - 1)).filter((def) => 'name' in def), (def) => 'name' in def && def.name.value);
            return typeDefinitions.filter((typeDef) => typeDef.kind === 'ObjectTypeDefinition' && previousTypeDefinitions[typeDef.name.value]);
        }
        return filteredDefinitions;
    }
    else {
        const importedTypes = imports.map((i) => i.split('.')[0]);
        const result = filteredDefinitions.filter((d) => 'name' in d && importedTypes.includes(d.name.value));
        const fieldImports = imports.filter((i) => i.split('.').length > 1);
        const groupedFieldImports = groupBy(fieldImports, (x) => x.split('.')[0]);
        for (const rootType in groupedFieldImports) {
            const fields = groupedFieldImports[rootType].map((x) => x.split('.')[1]);
            const objectTypeDefinition = filteredDefinitions.find((def) => 'name' in def && def.name.value === rootType);
            if (objectTypeDefinition && 'fields' in objectTypeDefinition && !fields.includes('*')) {
                objectTypeDefinition.fields = objectTypeDefinition.fields.filter((f) => fields.includes(f.name.value) || fields.includes('*'));
                if (sort) {
                    objectTypeDefinition.fields.sort(compareNodes);
                }
            }
        }
        return result;
    }
}

const filterKind = (content, filterKinds) => {
    if (content && content.definitions && content.definitions.length && filterKinds && filterKinds.length > 0) {
        const invalidDefinitions = [];
        const validDefinitions = [];
        for (const definitionNode of content.definitions) {
            if (filterKinds.includes(definitionNode.kind)) {
                invalidDefinitions.push(definitionNode);
            }
            else {
                validDefinitions.push(definitionNode);
            }
        }
        if (invalidDefinitions.length > 0) {
            invalidDefinitions.forEach(d => {
                debugLog(`Filtered document of kind ${d.kind} due to filter policy (${filterKinds.join(', ')})`);
            });
        }
        return {
            kind: Kind.DOCUMENT,
            definitions: validDefinitions,
        };
    }
    return content;
};

async function parseSource({ partialSource, options, globOptions, pointerOptionMap, addValidSource, cache, }) {
    if (partialSource) {
        const input = prepareInput({
            source: partialSource,
            options,
            globOptions,
            pointerOptionMap,
        });
        parseSchema(input);
        parseRawSDL(input);
        if (input.source.document) {
            useKindsFilter(input);
            useComments(input);
            await useGraphQLImport(input, () => processImportSyntax(input.source, input.options, cache));
            collectValidSources(input, addValidSource);
        }
    }
}
function parseSourceSync({ partialSource, options, globOptions, pointerOptionMap, addValidSource, cache, }) {
    if (partialSource) {
        const input = prepareInput({
            source: partialSource,
            options,
            globOptions,
            pointerOptionMap,
        });
        parseSchema(input);
        parseRawSDL(input);
        if (input.source.document) {
            useKindsFilter(input);
            useComments(input);
            useGraphQLImport(input, () => processImportSyntaxSync(input.source, input.options, cache));
            collectValidSources(input, addValidSource);
        }
    }
}
//
function prepareInput({ source, options, globOptions, pointerOptionMap, }) {
    const specificOptions = Object.assign(Object.assign({}, options), (source.location in pointerOptionMap ? globOptions : pointerOptionMap[source.location]));
    return { source: Object.assign({}, source), options: specificOptions };
}
function parseSchema(input) {
    if (input.source.schema) {
        input.source.schema = fixSchemaAst(input.source.schema, input.options);
        input.source.rawSDL = printSchemaWithDirectives(input.source.schema, input.options);
    }
}
function parseRawSDL(input) {
    if (input.source.rawSDL) {
        input.source.document = isEmptySDL(input.source.rawSDL)
            ? {
                kind: Kind.DOCUMENT,
                definitions: [],
            }
            : parse(new Source(input.source.rawSDL, input.source.location), input.options);
    }
}
function useKindsFilter(input) {
    if (input.options.filterKinds) {
        input.source.document = filterKind(input.source.document, input.options.filterKinds);
    }
}
function useComments(input) {
    if (!input.source.rawSDL) {
        input.source.rawSDL = printWithComments(input.source.document);
        resetComments();
    }
}
function useGraphQLImport(input, definitionsGetter) {
    if (input.options.forceGraphQLImport ||
        (!input.options.skipGraphQLImport && /^\#.*import /i.test(input.source.rawSDL.trimLeft()))) {
        function rewriteDoc(definitions) {
            input.source.document = {
                kind: Kind.DOCUMENT,
                definitions,
            };
        }
        const result = definitionsGetter();
        if (isPromise(result)) {
            return result.then(rewriteDoc);
        }
        rewriteDoc(result);
    }
}
function isPromise(val) {
    return val instanceof Promise;
}
function collectValidSources(input, addValidSource) {
    if (input.source.document.definitions && input.source.document.definitions.length > 0) {
        addValidSource(input.source);
    }
}

const CONCURRENCY_LIMIT$1 = 100;
async function loadTypedefs(pointerOrPointers, options) {
    const pointerOptionMap = normalizePointers(pointerOrPointers);
    const globOptions = {};
    await prepareOptions(options);
    const sources = await collectSources({
        pointerOptionMap,
        options,
    });
    const validSources = [];
    const definitionsCacheForImport = [];
    // If we have few k of files it may be an issue
    const limit = useLimit(CONCURRENCY_LIMIT$1);
    await Promise.all(sources.map(partialSource => limit(() => parseSource({
        partialSource,
        options,
        globOptions,
        pointerOptionMap,
        addValidSource(source) {
            validSources.push(source);
        },
        cache: definitionsCacheForImport,
    }))));
    return prepareResult({ options, pointerOptionMap, validSources });
}
function loadTypedefsSync(pointerOrPointers, options) {
    const pointerOptionMap = normalizePointers(pointerOrPointers);
    const globOptions = {};
    prepareOptionsSync(options);
    const sources = collectSourcesSync({
        pointerOptionMap,
        options,
    });
    const validSources = [];
    const definitionsCacheForImport = [];
    sources.forEach(partialSource => {
        parseSourceSync({
            partialSource,
            options,
            globOptions,
            pointerOptionMap,
            addValidSource(source) {
                validSources.push(source);
            },
            cache: definitionsCacheForImport,
        });
    });
    return prepareResult({ options, pointerOptionMap, validSources });
}
//
function prepareResult({ options, pointerOptionMap, validSources, }) {
    const pointerList = Object.keys(pointerOptionMap);
    if (pointerList.length > 0 && validSources.length === 0) {
        throw new Error(`
      Unable to find any GraphQL type definitions for the following pointers: 
        ${pointerList.map(p => `
          - ${p}
          `)}`);
    }
    return options.sort
        ? validSources.sort((left, right) => compareStrings(left.location, right.location))
        : validSources;
}

const OPERATION_KINDS = [Kind.OPERATION_DEFINITION, Kind.FRAGMENT_DEFINITION];
const NON_OPERATION_KINDS = Object.keys(Kind)
    .reduce((prev, v) => [...prev, Kind[v]], [])
    .filter(v => !OPERATION_KINDS.includes(v));
function loadDocuments(documentDef, options) {
    return loadTypedefs(documentDef, Object.assign({ noRequire: true, filterKinds: NON_OPERATION_KINDS }, options));
}
function loadDocumentsSync(documentDef, options) {
    return loadTypedefsSync(documentDef, Object.assign({ noRequire: true, filterKinds: NON_OPERATION_KINDS }, options));
}

async function loadSchema(schemaPointers, options) {
    const sources = await loadTypedefs(schemaPointers, Object.assign({ filterKinds: OPERATION_KINDS }, options));
    const schemas = [];
    const typeDefs = [];
    sources.forEach(source => {
        if (source.schema) {
            schemas.push(source.schema);
        }
        else {
            typeDefs.push(source.document);
        }
    });
    const mergeSchemasOptions = Object.assign({ schemas,
        typeDefs }, options);
    return mergeSchemasAsync(mergeSchemasOptions);
}
function loadSchemaSync(schemaPointers, options) {
    const sources = loadTypedefsSync(schemaPointers, Object.assign({ filterKinds: OPERATION_KINDS }, options));
    const schemas = [];
    const typeDefs = [];
    sources.forEach(source => {
        if (source.schema) {
            schemas.push(source.schema);
        }
        else {
            typeDefs.push(source.document);
        }
    });
    const mergeSchemasOptions = Object.assign({ schemas,
        typeDefs }, options);
    return mergeSchemas(mergeSchemasOptions);
}

export { NON_OPERATION_KINDS, OPERATION_KINDS, collectDefinitions, collectDefinitionsSync, filterKind, getDocumentFromSDL, isEmptySDL, loadDocuments, loadDocumentsSync, loadSchema, loadSchemaSync, loadTypedefs, loadTypedefsSync, parseImportLine, parseSDL, processImportSyntax, processImportSyntaxSync, resolveModuleFilePath };
