import { DefinitionNode, DocumentNode } from 'graphql';
import { LoadTypedefsOptions } from '../load-typedefs';
import { Source } from '@graphql-toolkit/common';
/**
 * Describes the information from a single import line
 *
 */
export interface RawModule {
    imports: string[];
    from: string;
}
/**
 * Parse a single import line and extract imported types and schema filename
 *
 * @param importLine Import line
 * @returns Processed import line
 */
export declare function parseImportLine(importLine: string): RawModule;
/**
 * Parse a schema and analyze all import lines
 *
 * @param sdl Schema to parse
 * @returns Array with collection of imports per import line (file)
 */
export declare function parseSDL(sdl: string): RawModule[];
/**
 * Main entry point. Recursively process all import statement in a schema
 *
 * @param filePath File path to the initial schema file
 * @returns Single bundled schema with all imported types
 */
export declare function processImportSyntax(documentSource: Source, options: LoadTypedefsOptions, allDefinitions: DefinitionNode[][]): Promise<DefinitionNode[]>;
/**
 * Main entry point. Recursively process all import statement in a schema
 *
 * @param documentSource File path to the initial schema file
 * @returns Single bundled schema with all imported types
 */
export declare function processImportSyntaxSync(documentSource: Source, options: LoadTypedefsOptions, allDefinitions: DefinitionNode[][]): DefinitionNode[];
/**
 * Parses a schema into a graphql DocumentNode.
 * If the schema is empty a DocumentNode with empty definitions will be created.
 *
 * @param sdl Schema to parse
 * @returns A graphql DocumentNode with definitions of the parsed sdl.
 */
export declare function getDocumentFromSDL(sdl: string): DocumentNode;
/**
 * Check if a schema contains any type definitions at all.
 *
 * @param sdl Schema to parse
 * @returns True if SDL only contains comments and/or whitespaces
 */
export declare function isEmptySDL(sdl: string): boolean;
/**
 * Resolve the path of an import.
 * First it will try to find a file relative from the file the import is in, if that fails it will try to resolve it as a module so imports from packages work correctly.
 *
 * @param filePath Path the import was made from
 * @param importFrom Path given for the import
 * @returns Full resolved path to a file
 */
export declare function resolveModuleFilePath(filePath: string, importFrom: string, options: LoadTypedefsOptions): string;
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
export declare function collectDefinitions(imports: string[], source: Source, options: LoadTypedefsOptions, typeDefinitions: DefinitionNode[][], allDefinitions: DefinitionNode[][]): Promise<void>;
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
export declare function collectDefinitionsSync(imports: string[], source: Source, options: LoadTypedefsOptions, typeDefinitions: DefinitionNode[][], allDefinitions: DefinitionNode[][]): void;
