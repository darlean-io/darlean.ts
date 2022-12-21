/**
 * Replaces all occurrances of `search` within `input` with `replace`. The replacement is
 * performed in one sweep (when the result of the replacement contains occurrances of
 * 'input', they are not replaced again).
 * @param input The text in which the search and replace should take place
 * @param search The text to search for
 * @param replace The text to replace the search text with
 * @returns The input with all occurrances of search replaced by replace.
 */
export function replaceAll(input: string, search: string, replace: string): string {
    return input.split(search).join(replace);
}
