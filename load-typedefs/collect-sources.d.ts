import { Source } from '@graphql-toolkit/common';
import { LoadTypedefsOptions } from '../load-typedefs';
export declare function collectSources<TOptions>({ pointerOptionMap, options, }: {
    pointerOptionMap: {
        [key: string]: any;
    };
    options: LoadTypedefsOptions<Partial<TOptions>>;
}): Promise<Source[]>;
export declare function collectSourcesSync<TOptions>({ pointerOptionMap, options, }: {
    pointerOptionMap: {
        [key: string]: any;
    };
    options: LoadTypedefsOptions<Partial<TOptions>>;
}): Source[];
