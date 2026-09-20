import { defineConfig } from "steiger";
import fsd from "@feature-sliced/steiger-plugin";

export default defineConfig([
  ...fsd.configs.recommended,
  {
    // Прототип волны 0: слайсы заведены под волны 2–4 и пока используются одной страницей.
    rules: {
      "fsd/insignificant-slice": "off",
    },
  },
]);
