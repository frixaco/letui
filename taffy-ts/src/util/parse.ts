export class ParseError extends Error {
    input: string;
    constructor(message: string, input: string) {
        super(message);
        this.input = input;
        this.name = "ParseError";
    }
}

type ParsedLengthPercentageToken =
    | { type: "Length"; value: number }
    | { type: "Percent"; value: number }
    | { type: "Auto" };

export function parseKeywordEnum<T>(input: string, keywords: Map<string, T>, typeName: string): T {
    const keyword = input.trim();
    const parsed = keywords.get(keyword.toLowerCase());
    if (parsed !== undefined && keyword === input.trim() && isCssIdent(keyword))
        return parsed;
    throw new ParseError(`Failed to parse ${typeName} from "${input}"`, input);
}
export function parseLengthPercentageToken(input: string, typeName: string, allowAuto: boolean): ParsedLengthPercentageToken {
    const trimmed = input.trim();
    const px = /^([+-]?(?:(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?))px$/.exec(trimmed);
    if (px !== null)
        return { type: "Length", value: Number(px[1]) };
    const percent = /^([+-]?(?:(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?))%$/.exec(trimmed);
    if (percent !== null)
        return { type: "Percent", value: Number(percent[1]) / 100 };
    if (allowAuto && trimmed === "auto")
        return { type: "Auto" };
    throw parseError(typeName, input);
}
export function parseCssIdentifiers(input: string, typeName: string, maxCount: number): string[] {
    const trimmed = input.trim();
    if (trimmed.length === 0)
        throw new ParseError(`Failed to parse ${typeName} from "${input}"`, input);
    const identifiers = trimmed.split(/\s+/);
    if (identifiers.length > maxCount || identifiers.some((identifier: string) => !isCssIdent(identifier))) {
        throw new ParseError(`Failed to parse ${typeName} from "${input}"`, input);
    }
    return identifiers;
}
export function parseError(typeName: string, input: string): ParseError {
    return new ParseError(`Failed to parse ${typeName} from "${input}"`, input);
}
export function isCssIdent(value: string): boolean {
    return /^-?[a-z_][a-z0-9_-]*$/i.test(value);
}
