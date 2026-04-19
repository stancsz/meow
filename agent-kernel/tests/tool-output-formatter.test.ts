/**
 * tool-output-formatter.test.ts
 */
import { describe, it, expect, beforeAll } from "bun:test";
import {
  formatJSON,
  renderJSON,
  formatTable,
  formatTree,
  autoFormat,
  formatToolOutput,
} from "../src/sidecars/tool-output-formatter.ts";

describe("tool-output-formatter", () => {
  describe("formatJSON", () => {
    it("formats a simple JSON object", () => {
      const obj = { name: "meow", age: 1 };
      const result = formatJSON(obj);
      expect(result).toContain("name");
      expect(result).toContain("meow");
      expect(result).toContain("age");
    });

    it("formats nested objects", () => {
      const obj = { nested: { key: "value" }, arr: [1, 2, 3] };
      const result = formatJSON(obj);
      expect(result).toContain("nested");
      expect(result).toContain("key");
    });

    it("highlights null values", () => {
      const result = formatJSON({ foo: null });
      expect(result).toContain("null");
    });
  });

  describe("renderJSON", () => {
    it("renders JSON string input", () => {
      const result = renderJSON('{"foo": "bar"}');
      expect(result).toContain("foo");
      expect(result).toContain("bar");
    });

    it("returns content on invalid JSON", () => {
      const result = renderJSON("not json");
      expect(result).toBe("not json");
    });
  });

  describe("formatTable", () => {
    it("formats data rows into a table", () => {
      const data = [
        { name: "Alice", age: "30" },
        { name: "Bob", age: "25" },
      ];
      const columns = [
        { header: "Name", key: "name" },
        { header: "Age", key: "age" },
      ];
      const result = formatTable(data, columns);
      expect(result).toContain("Name");
      expect(result).toContain("Alice");
      expect(result).toContain("Bob");
      expect(result).toContain("\u2502"); // box drawing vertical
    });

    it("returns empty message for empty data", () => {
      const result = formatTable([], [{ header: "Col", key: "col" }]);
      expect(result).toContain("empty");
    });

    it("respects custom column widths", () => {
      const data = [{ short: "a", longer: "bbb" }];
      const columns = [
        { header: "Short", key: "short", width: 20 },
        { header: "Longer", key: "longer", width: 10 },
      ];
      const result = formatTable(data, columns);
      expect(result).toContain("Short");
      expect(result).toContain("Longer");
    });
  });

  describe("formatTree", () => {
    it("formats a simple tree", () => {
      const tree = {
        label: "root",
        children: [{ label: "child1" }, { label: "child2" }],
      };
      const result = formatTree(tree);
      expect(result).toContain("root");
      expect(result).toContain("child1");
      expect(result).toContain("child2");
    });

    it("formats nested children", () => {
      const tree = {
        label: "root",
        children: [
          {
            label: "level1",
            children: [{ label: "level2" }],
          },
        ],
      };
      const result = formatTree(tree);
      expect(result).toContain("root");
      expect(result).toContain("level1");
      expect(result).toContain("level2");
    });
  });

  describe("autoFormat", () => {
    it("detects and formats JSON", () => {
      const json = '{"name": "meow", "age": 1}';
      const result = autoFormat(json);
      expect(result).toContain("name");
    });

    it("passes through plain text", () => {
      const plain = "hello world";
      const result = autoFormat(plain);
      expect(result).toBe(plain);
    });

    it("handles empty input", () => {
      const result = autoFormat("");
      expect(result).toBe("");
    });

    it("trims whitespace before detection", () => {
      const result = autoFormat("  \n{  }  \n");
      expect(result).toContain("{");
    });
  });

  describe("formatToolOutput", () => {
    it("returns empty content for empty result", () => {
      const result = formatToolOutput({ content: "" });
      expect(result).toBe("");
    });

    it("formats JSON content", () => {
      const result = formatToolOutput({ content: '{"foo":"bar"}' });
      expect(result).toContain("foo");
    });

    it("returns error content as-is", () => {
      const result = formatToolOutput({ content: "error occurred", error: "failed" });
      expect(result).toBe("error occurred");
    });
  });
});
