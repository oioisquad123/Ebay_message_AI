/**
 * V0-only constants. V1 derives these from auth context.
 *
 * Per CLAUDE.md constraint #4 (multi-tenant from D1), every tenant table
 * carries `user_id`. V0 hardcodes a single user — but the column,
 * the contracts, and the indexes are all multi-tenant-shaped so V1 can
 * graduate without contract changes.
 */
export const V0_USER_ID = "u-bayu";
