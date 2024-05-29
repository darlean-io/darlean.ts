/**
 * Matcher that matches url paths against a certain prefix pattern.
 * 
 * The prefix pattern can:
 * * End with `*`: a prefix match is performed.
 * * End with `+`: similar to the or of a match without the `+` and a match with the `+` replaced by `/*`.
 * * Otherwise: an exasct match is performed.
 */
export class PathPrefixMatcher {
    constructor(private pattern: string) {}
    
    /**
     * Checks whether path matches this matcher's prefix pattern.
     * @param path The path to be matched.
     * @returns Undefined when there is no match, or the remainder of the path when there is
     * a prefix match.
     */
    public match(path: string): string | undefined {
        if (this.pattern.endsWith('+')) {
            if (this.pattern.endsWith('/+')) {
                throw new Error('Pattern must not include a "/" before the "+"');
            }
            const patternCore = this.pattern.substring(0, this.pattern.length - 1);
            if (path === patternCore) {
                return '';
            }
            if (path.startsWith(patternCore + '/')) {
                return path.substring(patternCore.length);
            }
            return undefined;
        }

        if (this.pattern.endsWith('*')) {
            const patternCore = this.pattern.substring(0, this.pattern.length - 1);
            if (path.startsWith(patternCore)) {
                return path.substring(patternCore.length);
            }
            return undefined;
        }

        if (path === this.pattern) {
            return '';
        }
   }
}