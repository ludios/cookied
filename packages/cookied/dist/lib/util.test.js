// Model-output: Claude Opus 5.5
import { AssertionError } from "ayy";
import { describe, expect, it } from "vitest";
import { int8_to_number } from "./util.js";
describe("int8_to_number", () => {
    it("converts each form in which a postgres.js pool may return a bigint", () => {
        expect(int8_to_number("1234")).toBe(1234);
        expect(int8_to_number(1234)).toBe(1234);
        expect(int8_to_number(1234n)).toBe(1234);
        expect(int8_to_number("-9007199254740991")).toBe(-9007199254740991);
    });
    it("throws on a value that a number cannot represent exactly", () => {
        expect(() => int8_to_number("9007199254740992")).toThrow(AssertionError);
        expect(() => int8_to_number(2n ** 53n)).toThrow(AssertionError);
        expect(() => int8_to_number("1.5")).toThrow(AssertionError);
    });
});
//# sourceMappingURL=util.test.js.map