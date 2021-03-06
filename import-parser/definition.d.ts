import { DefinitionNode } from 'graphql';
export interface DefinitionMap {
    [key: string]: DefinitionNode;
}
/**
 * Post processing of all imported type definitions. Loops over each of the
 * imported type definitions, and processes it using collectNewTypeDefinitions.
 *
 * @param allDefinitions All definitions from all schemas
 * @param definitionPool Current definitions (from first schema)
 * @param newTypeDefinitions All imported definitions
 * @returns Final collection of type definitions for the resulting schema
 */
export declare function completeDefinitionPool(allDefinitions: DefinitionNode[], definitionPool: DefinitionNode[], newTypeDefinitions: DefinitionNode[]): DefinitionNode[];
