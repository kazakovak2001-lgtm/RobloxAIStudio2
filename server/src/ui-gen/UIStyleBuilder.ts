/**
 * UIStyleBuilder.ts — Deterministic UI style properties.
 */

export class UIStyleBuilder {
  centerFrame(): Record<string, unknown> {
    return {
      AnchorPoint: [0.5, 0.5],
      Position: [0.5, 0, 0.5, 0],
      Size: [0.4, 0, 0.6, 0],
      BackgroundColor3: [0.15, 0.15, 0.2],
      BackgroundTransparency: 0.1,
      BorderSizePixel: 0,
    };
  }

  titleLabel(): Record<string, unknown> {
    return {
      Font: "GothamBold",
      TextSize: 28,
      TextColor3: [1, 1, 1],
      BackgroundTransparency: 1,
      Size: [1, 0, 0, 40],
      TextXAlignment: "Center",
    };
  }

  button(): Record<string, unknown> {
    return {
      Font: "Gotham",
      TextSize: 18,
      TextColor3: [1, 1, 1],
      BackgroundColor3: [0.2, 0.5, 0.8],
      Size: [0.8, 0, 0, 40],
      AnchorPoint: [0.5, 0],
      BorderSizePixel: 0,
    };
  }

  hudLabel(): Record<string, unknown> {
    return {
      Font: "Gotham",
      TextSize: 16,
      TextColor3: [1, 1, 1],
      BackgroundTransparency: 1,
      Size: [0.2, 0, 0, 30],
    };
  }

  progressBar(): Record<string, unknown> {
    return {
      BackgroundColor3: [0.3, 0.3, 0.3],
      Size: [0.2, 0, 0, 20],
      BorderSizePixel: 0,
    };
  }
}
