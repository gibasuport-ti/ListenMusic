# Project Security Policies

This application is designed for distribution. The following security policies MUST be maintained:

## 1. Secrets Management (Gemini API)
- **DO NOT** use environment variables starting with `VITE_` for sensitive secrets.
- **DO NOT** use the `define` block in `vite.config.ts` to expose server-side variables.
- **MANDATORY**: All requests involving the Gemini API or other private keys must be handled through the Express backend (`server.ts`).
- Create proxy endpoints (e.g., `/api/ai/*`) to communicate with third-party services.

## 2. Firebase Security
- **CLIENT SDK**: The Firebase configuration in `firebase-applet-config.json` is public by design.
- **SECURITY RULES**: All data protection MUST be enforced via Firestore Security Rules (`firestore.rules`). 
- **HARDENED RULES**: Always use the "Eight Pillars of Hardened Rules" (Identity, Integrity, Relational Sync, etc.) as defined in `security_spec.md`.

## 3. Storage Security
- **LOCAL FIRST**: User media is stored in IndexedDB for privacy and offline access.
- **SENSITIVE DATA**: Avoid storing PII (Personally Identifiable Information) in plain text in IndexedDB if possible.

## 4. Production Build
- Ensure the production start command uses the server: `node dist/server.cjs` (or similar depending on compilation).
- In development, use `tsx server.ts`.
