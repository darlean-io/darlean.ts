import { PathPrefixMatcher } from "../path-prefix-matcher";

describe('PathPrefixMatcher', () => {
    test('Plain', () => {
        expect( new PathPrefixMatcher('/').match('/')).toBe('');
        expect( new PathPrefixMatcher('/').match('/foo')).toBe(undefined);
        expect( new PathPrefixMatcher('/').match('/foo/')).toBe(undefined);

        expect( new PathPrefixMatcher('/foo').match('/')).toBe(undefined);
        expect( new PathPrefixMatcher('/foo').match('/foo')).toBe('');
        expect( new PathPrefixMatcher('/foo').match('/foo/')).toBe(undefined);
        expect( new PathPrefixMatcher('/foo').match('/bar')).toBe(undefined);

        expect( new PathPrefixMatcher('/foo/').match('/')).toBe(undefined);
        expect( new PathPrefixMatcher('/foo/').match('/foo')).toBe(undefined);
        expect( new PathPrefixMatcher('/foo/').match('/foo/')).toBe('');
        expect( new PathPrefixMatcher('/foo/').match('/bar')).toBe(undefined);
    });

    test('Wildcard', () => {
        expect( new PathPrefixMatcher('/*').match('/')).toBe('');
        expect( new PathPrefixMatcher('/*').match('/foo')).toBe('foo');
        expect( new PathPrefixMatcher('/*').match('/foo/')).toBe('foo/');

        expect( new PathPrefixMatcher('/foo*').match('/')).toBe(undefined);
        expect( new PathPrefixMatcher('/foo*').match('/foo')).toBe('');
        expect( new PathPrefixMatcher('/foo*').match('/foo/')).toBe('/');
        expect( new PathPrefixMatcher('/foo*').match('/bar')).toBe(undefined);

        expect( new PathPrefixMatcher('/foo/*').match('/')).toBe(undefined);
        expect( new PathPrefixMatcher('/foo/*').match('/foo')).toBe(undefined);
        expect( new PathPrefixMatcher('/foo/*').match('/foo/')).toBe('');
        expect( new PathPrefixMatcher('/foo/*').match('/foo/bar')).toBe('bar');
        expect( new PathPrefixMatcher('/foo/*').match('/bar')).toBe(undefined);
    });
    
    test('Plus', () => {
        expect( new PathPrefixMatcher('+').match('/')).toBe('/');
        expect( new PathPrefixMatcher('+').match('/foo')).toBe('/foo');
        expect( new PathPrefixMatcher('+').match('/foo/')).toBe('/foo/');

        expect( () => new PathPrefixMatcher('/+').match('/')).toThrow();

        expect( new PathPrefixMatcher('/foo+').match('/')).toBe(undefined);
        expect( new PathPrefixMatcher('/foo+').match('/foo')).toBe('');
        expect( new PathPrefixMatcher('/foo+').match('/foo/')).toBe('/');
        expect( new PathPrefixMatcher('/foo+').match('/foo/bar')).toBe('/bar');
        expect( new PathPrefixMatcher('/foo+').match('/bar')).toBe(undefined);

        expect( () => new PathPrefixMatcher('/foo/+').match('/')).toThrow();
    });
});
