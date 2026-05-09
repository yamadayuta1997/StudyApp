import { pageToX, xToPage, clampFrom, clampTo } from "../pageRangeSlider";

describe("pageToX", () => {
  it("maps min to 0", () => {
    expect(pageToX(1, 1, 100, 300)).toBe(0);
  });

  it("maps max to trackWidth", () => {
    expect(pageToX(100, 1, 100, 300)).toBe(300);
  });

  it("maps mid value proportionally", () => {
    expect(pageToX(50, 0, 100, 200)).toBe(100);
  });

  it("returns 0 when trackWidth is 0", () => {
    expect(pageToX(50, 1, 100, 0)).toBe(0);
  });

  it("returns 0 when max equals min", () => {
    expect(pageToX(5, 5, 5, 300)).toBe(0);
  });
});

describe("xToPage", () => {
  it("maps x=0 to min", () => {
    expect(xToPage(0, 1, 100, 300)).toBe(1);
  });

  it("maps x=trackWidth to max", () => {
    expect(xToPage(300, 1, 100, 300)).toBe(100);
  });

  it("clamps x below 0 to min", () => {
    expect(xToPage(-50, 1, 100, 300)).toBe(1);
  });

  it("clamps x above trackWidth to max", () => {
    expect(xToPage(400, 1, 100, 300)).toBe(100);
  });

  it("rounds to nearest integer", () => {
    expect(xToPage(150, 0, 100, 300)).toBe(50);
  });

  it("returns min when trackWidth is 0", () => {
    expect(xToPage(100, 1, 100, 0)).toBe(1);
  });
});

describe("clampFrom", () => {
  it("keeps value within [min, to-1]", () => {
    expect(clampFrom(5, 1, 10)).toBe(5);
  });

  it("clamps below min to min", () => {
    expect(clampFrom(0, 1, 10)).toBe(1);
  });

  it("clamps above to-1 to to-1", () => {
    expect(clampFrom(10, 1, 10)).toBe(9);
  });
});

describe("clampTo", () => {
  it("keeps value within [from+1, max]", () => {
    expect(clampTo(8, 1, 10)).toBe(8);
  });

  it("clamps below from+1 to from+1", () => {
    expect(clampTo(1, 1, 10)).toBe(2);
  });

  it("clamps above max to max", () => {
    expect(clampTo(15, 1, 10)).toBe(10);
  });
});
