import { Source } from '@graphql-toolkit/common';
import { DefinitionNode } from 'graphql';
declare type AddValidSource = (source: Source) => void;
declare type ParseOptions = {
    partialSource: Partial<Source>;
    options: any;
    globOptions: any;
    pointerOptionMap: any;
    addValidSource: AddValidSource;
    cache: DefinitionNode[][];
};
export declare function parseSource({ partialSource, options, globOptions, pointerOptionMap, addValidSource, cache, }: ParseOptions): Promise<void>;
export declare function parseSourceSync({ partialSource, options, globOptions, pointerOptionMap, addValidSource, cache, }: ParseOptions): void;
export {};
