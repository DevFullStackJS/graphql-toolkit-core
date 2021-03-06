import { LoadTypedefsOptions, UnnormalizedTypeDefPointer } from './load-typedefs';
import { GraphQLSchema, BuildSchemaOptions } from 'graphql';
import { MergeSchemasConfig } from '@graphql-toolkit/schema-merging';
export declare type LoadSchemaOptions = BuildSchemaOptions & LoadTypedefsOptions & Partial<MergeSchemasConfig>;
export declare function loadSchema(schemaPointers: UnnormalizedTypeDefPointer | UnnormalizedTypeDefPointer[], options: LoadSchemaOptions): Promise<GraphQLSchema>;
export declare function loadSchemaSync(schemaPointers: UnnormalizedTypeDefPointer | UnnormalizedTypeDefPointer[], options: LoadSchemaOptions): GraphQLSchema;
