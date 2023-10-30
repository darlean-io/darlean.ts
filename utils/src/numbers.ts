import { IBufWithCursor } from './bufferwithcursor';

// Ascii-codes
const CHAR_CODE_ZERO_DIGITS = 'a'.charCodeAt(0);
const CHAR_CODE_ONE_DIGIT = 'b'.charCodeAt(0);
const CHAR_CODE_TWO_DIGITS = 'c'.charCodeAt(0);
const CHAR_CODE_THREE_DIGITS = 'd'.charCodeAt(0);
const CHAR_CODE_A = 'A'.charCodeAt(0);
const CHAR_CODE_Z = 'Z'.charCodeAt(0);
const CHAR_CODE_a = 'a'.charCodeAt(0);
const CHAR_CODE_z = 'z'.charCodeAt(0);
const CHAR_CODE_0 = '0'.charCodeAt(0);
const CHAR_CODE_9 = '9'.charCodeAt(0);

/**
 * Encodes a number to a string in such a way that sorting encoded strings in lexicographical order gives
 * the same order as sorting the numbers.
 * @param value The value to be encoded. Can be a positive or negative integer or float, but the absolute value must be < 10^21.
 * @param maxDigits The maximum number of digits to be taken into account.
 * @remarks The encoding works by counting the number of digits before the '.', and encoding that number as a
 * character. For positive numbers, characters 'a'..'z' are used for 0, 1 .. 26 digits. For negative numbers,
 * characters 'Y'..'A' are used for 1 .. 26 digits. The resulting character is prepadded to the number.
 *
 * Because the number of digits before the '.' is already encoded by the leading character, the '.' is removed
 * from the textual representation of the number.
 *
 * For negative numbers, the textual representation of the number is complemented ('0' becomes '9' .. '9' becomes '0').
 * This ensure that negative numbers are sorted properly ("the other way around").
 *
 * Numbers are converted into a textual representation via `value.toFixed(maxDigits)`. After that, zeroes on the
 * end are removed (only for zeroes after the '.'). For positive numbers, this has no impact on sorting: `b35` (3.5) still
 * comes before `b351` (3.51). For negative numbers, this is different: the sorted order would become -3.52, -3.51, -3.4, -3.49.
 * To accomodate for this, the complemented value is incremented by 1 (taking into account that any leading zeroes are preserved
 * during this addition).
 */
export function encodeNumber(value: number, maxDigits = 0) {
    if (value === 0) {
        return 'a';
    }
    if (value >= 0) {
        let base = value.toFixed(maxDigits);
        let len = base.indexOf('.');
        if (len < 0) {
            len = base.length;
        } else {
            while (base.endsWith('0')) {
                base = base.substring(0, base.length - 1);
            }
        }
        const prefix = String.fromCharCode(CHAR_CODE_a + len);
        return prefix + base.replace('.', '');
    } else {
        let base = value.toFixed(maxDigits);
        if (base[0] === '-') {
            base = base.substring(1);
        }
        let len = base.indexOf('.');
        if (len < 0) {
            len = base.length;
        } else {
            while (base.endsWith('0')) {
                base = base.substring(0, base.length - 1);
            }
        }
        const prefix = String.fromCharCode(CHAR_CODE_Z - len);
        // Complicated story. Why the +1? -2 becomes Y7. -2.1 becomes Y78. Where this sorting goes fine for
        // positive numbers (because shorter strings come before longer strings with the same prefix), for negative
        // numbers, this goes wrong. The order would become -3.2, -3.1, -2, -2.9, -2.8 -- which is wrong.
        // By adding 1 to the complementary value, this issue 'magically' (mathematically) disppears. What the +1
        // is effectively doing is to increment the rightmost fractional digit with 1. That is sufficient to have
        // "shorter" numbers (like -2) sort well with longer numbers (like 2.1).
        // We use BigInt here to avoid rounding errors.
        // We use the "'1' +"" to make sure that number '000' becomes '001' after +1n (and not '1').
        return prefix + (BigInt('1' + complement(base.replace('.', ''))) + 1n).toString().substring(1);
    }
}

/**
 * Decodes a string that was previously encoded using {@link encodeNumber}.
 */
export function decodeNumber(text: string) {
    const prefixCode = text.charCodeAt(0);
    if (prefixCode === CHAR_CODE_a) {
        return 0;
    }
    if (prefixCode === CHAR_CODE_Z) {
        return 0;
    }
    if (prefixCode >= CHAR_CODE_A && prefixCode <= CHAR_CODE_Z) {
        // Negative number
        const len = CHAR_CODE_Z - prefixCode;
        const base = (BigInt('1' + text.substring(1)) - 1n).toString().substring(1);
        const compl = complement(base);
        return compl.length > len
            ? parseFloat('-' + compl.substring(0, len) + '.' + compl.substring(len))
            : parseInt('-' + compl);
    } else if (prefixCode >= CHAR_CODE_a && prefixCode <= CHAR_CODE_z) {
        // Positive number or zero
        const len = prefixCode - CHAR_CODE_a;
        const base = text.substring(1);
        return base.length > len ? parseFloat(base.substring(0, len) + '.' + base.substring(len)) : parseInt(base);
    } else {
        throw new Error('Not a decoded number');
    }
}

export function readIntNumberFromBuffer(buf: IBufWithCursor, skip: boolean) {
    const prefixCode = buf.buffer[buf.cursor];
    if (prefixCode === CHAR_CODE_a) {
        buf.cursor++;
        return 0;
    }
    if (prefixCode === CHAR_CODE_Z) {
        buf.cursor++;
        return 0;
    }
    if (prefixCode >= CHAR_CODE_A && prefixCode <= CHAR_CODE_Z) {
        // Negative number
        const len = CHAR_CODE_Z - prefixCode;
        if (skip) {
            buf.cursor += 1 + len;
            return 0;
        }
        const substr = buf.buffer.toString('ascii', buf.cursor + 1, buf.cursor + 1 + len);
        const base = (BigInt('1' + substr) - 1n).toString().substring(1);
        const compl = complement(base);
        buf.cursor += 1 + len;
        return parseInt('-' + compl);
    } else if (prefixCode >= CHAR_CODE_a && prefixCode <= CHAR_CODE_z) {
        // Positive number or zero
        const len = prefixCode - CHAR_CODE_a;
        if (skip) {
            buf.cursor += 1 + len;
            return 0;
        }
        const base = buf.buffer.toString('ascii', buf.cursor + 1, buf.cursor + 1 + len);
        buf.cursor += 1 + len;
        return parseInt(base);
    } else {
        throw new Error('Not a decoded number');
    }
}

function complement(value: string) {
    let compl = '';
    for (let i = 0; i < value.length; i++) {
        compl += String.fromCharCode(CHAR_CODE_9 - (value.charCodeAt(i) - CHAR_CODE_0));
    }
    return compl;
}

/**
 * Takes an unsigned integer (positive or zero) and writes it in a buffer. The format consists of
 * a character 'a', 'b', 'c', etc that indicates the length of the decimal representation
 * of the value ('a' -> 0 digits = the number 0, 'b' -> 1 digit, 'c' -> 2 digits, and so on).
 * This is followed by the decimal representation.
 * @param buf The buf to which the number is written.
 * @param value The value to be written.
 */
export function writeUnsignedInt(buf: IBufWithCursor, value: number): void {
    const buffer = buf.buffer;
    const cursor = buf.cursor;
    if (value === 0) {
        buffer[buf.cursor] = CHAR_CODE_ZERO_DIGITS;
        buf.cursor = cursor + 1;
        return;
    }
    if (value < 10) {
        buffer[cursor] = CHAR_CODE_ONE_DIGIT;
        buffer[cursor + 1] = CHAR_CODE_0 + value;
        buf.cursor = cursor + 2;
        return;
    }
    if (value < 100) {
        buffer[cursor] = CHAR_CODE_TWO_DIGITS;
        const ones = value % 10;
        const tens = Math.trunc(value * 0.1);
        buffer[cursor + 1] = CHAR_CODE_0 + tens;
        buffer[cursor + 2] = CHAR_CODE_0 + ones;
        buf.cursor = cursor + 3;
        return;
    }
    if (value < 1000) {
        buffer[cursor] = CHAR_CODE_THREE_DIGITS;
        const ones = value % 10;
        const tens = Math.trunc((value * 0.1) % 10);
        const hundreds = Math.trunc(value * 0.01);
        buffer[cursor + 1] = CHAR_CODE_0 + hundreds;
        buffer[cursor + 2] = CHAR_CODE_0 + tens;
        buffer[cursor + 3] = CHAR_CODE_0 + ones;
        buf.cursor = cursor + 4;
        return;
    }

    const str = value.toString();
    const len = str.length;
    buffer[cursor] = CHAR_CODE_ZERO_DIGITS + len;
    buffer.write(str, cursor + 1, 'ascii');
    buf.cursor = cursor + 1 + len;
}

/**
 * Decodes an unsigned int from a buffer that was written previously via {@link writeUnsignedInt} and
 * increments the cursor.
 * @param buf The buffer to read from.
 * @returns The read number.
 */
export function readUnsignedInt(buf: IBufWithCursor): number {
    const buffer = buf.buffer;
    const cursor = buf.cursor;

    const v = buffer[cursor];
    if (v === CHAR_CODE_ZERO_DIGITS) {
        buf.cursor = cursor + 1;
        return 0;
    }
    if (v === CHAR_CODE_ONE_DIGIT) {
        buf.cursor = cursor + 2;
        return buffer[cursor + 1] - CHAR_CODE_0;
    }
    if (v === CHAR_CODE_TWO_DIGITS) {
        buf.cursor = cursor + 3;
        return 10 * (buffer[cursor + 1] - CHAR_CODE_0) + (buffer[cursor + 2] - CHAR_CODE_0);
    }
    const len = v - CHAR_CODE_ZERO_DIGITS;
    buf.cursor = cursor + 1 + len;
    return parseInt(buffer.toString('ascii', cursor + 1, cursor + 1 + len));
}
