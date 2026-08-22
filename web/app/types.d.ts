import type React from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      /**
       * App Bridge levert dit custom element; het vult het menu in de
       * admin-balk. Geen React-component, dus TypeScript moet het hier leren
       * kennen.
       */
      "ui-nav-menu": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

export {};
