import { Source, SingleFileOptions, Loader } from '@graphql-toolkit/common';
import { RawModule } from './import-parser';
export declare type LoadTypedefsOptions<ExtraConfig = {
    [key: string]: any;
}> = SingleFileOptions & ExtraConfig & {
    processedFiles?: Map<string, RawModule[]>;
    cache?: {
        [key: string]: Source;
    };
    loaders: Loader[];
    filterKinds?: string[];
    ignore?: string | string[];
    sort?: boolean;
    skipGraphQLImport?: boolean;
    forceGraphQLImport?: boolean;
    fs?: typeof import('fs');
    path?: typeof import('path');
    os?: typeof import('os');
};
export declare type UnnormalizedTypeDefPointer = {
    [key: string]: any;
} | string;
export declare function loadTypedefs<AdditionalConfig = {}>(pointerOrPointers: UnnormalizedTypeDefPointer | UnnormalizedTypeDefPointer[], options: LoadTypedefsOptions<Partial<AdditionalConfig>>): Promise<Source[]>;
export declare function loadTypedefsSync<AdditionalConfig = {}>(pointerOrPointers: UnnormalizedTypeDefPointer | UnnormalizedTypeDefPointer[], options: LoadTypedefsOptions<Partial<AdditionalConfig>>): Source[];
