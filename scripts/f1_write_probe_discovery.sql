Discovery grid — all sections resolved, section 0 is one row (sanity check passes):
- hub 0d3ccc2e (sal income, GHS)
- standard 3a36d46c, owner 8b453c16
- cycle: date 2026-06-01, month 2026-06 (June 2026)
- income_src 2cd9a273 (salary/5000), expense_tx d6b3b86c (Groceries/250)
- categories: [10 IDs available if a probe INSERT needs one — e.g. Groceries a5ce688d]
- foreign hubs (standard NOT a member): b9aae0dc "The Adjei household", d9c21685 "The Adjei", ff992ac2 "The Family Business"

One flag before you fill the params: section 7's foreign hubs are all REAL family hubs — there's no fixture foreign hub. You earlier warned T2/T6 take brief row locks on live rows. Confirm the cross-hub test (T7) is INSERT-only (a rejected INSERT locks nothing) and does NOT touch/lock any real row in those family hubs — and that the always-rollback guarantee fully covers the foreign-hub attempt. If T7 as designed would lock or risk anything in a real hub, scope it so it can't, or tell me and we make a throwaway foreign hub instead.

If T7 is clean INSERT-only with no real-row lock, fill the params into f1_write_probe.sql and show me the FINALIZED probe in full plain text — I read it before running: confirm every path ends in RAISE EXCEPTION (unconditional rollback), it targets fixture hub 0d3ccc2e for the owned-hub tests, and the foreign-hub test only attempts an insert that gets rejected.