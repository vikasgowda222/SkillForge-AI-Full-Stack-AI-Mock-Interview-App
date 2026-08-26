// Test stub for the "server-only" import guard.
//
// The real package throws when imported outside a React Server Component so
// that server secrets can never reach the client bundle. In the Vitest (node)
// environment there is no such risk, and we deliberately import Server Actions
// to test them, so this stub resolves to a harmless empty module.
export {};
