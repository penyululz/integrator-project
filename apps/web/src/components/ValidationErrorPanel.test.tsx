import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ValidationErrorPanel } from "./ValidationErrorPanel";

describe("ValidationErrorPanel", () => {
  it("renders nothing when there are no errors", () => {
    const html = renderToStaticMarkup(<ValidationErrorPanel errors={[]} />);
    expect(html).toBe("");
  });

  it("renders all validation errors", () => {
    const html = renderToStaticMarkup(
      <ValidationErrorPanel
        title="Workflow validation"
        errors={["duplicate step id", "invalid ref"]}
      />,
    );

    expect(html).toContain("Workflow validation");
    expect(html).toContain("duplicate step id");
    expect(html).toContain("invalid ref");
  });
});
