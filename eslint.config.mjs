import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/*
 * The admin's code stays out of the public gallery's bundle.
 *
 * Relay (the admin's client for the dmbk GraphQL API, through the session
 * proxy) and react-dropzone (the upload screen) belong to /admin. Imported
 * from anything the gallery renders they would ship to every visitor. The
 * gallery reads the API anonymously with plain fetch (src/lib/photos/api.ts).
 */
const adminOnly = {
  paths: [
    { name: "react-dropzone", message: "react-dropzone is admin-only: import it from src/components/admin/." },
    { name: "react-relay", message: "Relay is admin-only: import it from src/app/admin/ or src/components/admin/." },
    { name: "relay-runtime", message: "Relay is admin-only: import it from src/app/admin/ or src/components/admin/." },
  ],
  patterns: [
    { group: ["react-relay/*", "relay-runtime/*"], message: "Relay is admin-only: import it from src/app/admin/ or src/components/admin/." },
  ],
};

const eslintConfig = [
  // Generated: __generated__ by `pnpm relay`, src/themes by `pnpm theme`.
  { ignores: ["**/__generated__/**", "src/themes/**"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    files: ["src/**"],
    ignores: ["src/app/admin/**", "src/components/admin/**"],
    rules: { "no-restricted-imports": ["error", adminOnly] },
  },
];

export default eslintConfig;
