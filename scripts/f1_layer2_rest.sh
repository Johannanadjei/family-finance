#!/usr/bin/env bash
# =============================================================================
# f1_layer2_rest.sh   (F1 RLS audit — LAYER 2: the real PostgREST path)
#
# Layer 1 (f1_write_probe / f1_t4b_diag / f1_t4c_diag) proved the POLICIES, by
# impersonating a standard member inside a DO block. This layer proves the STACK:
# that PostgREST sets request.jwt.claims the way those probes assumed, and that the
# forbidden writes are actually rejected over the wire a real client uses.
#
# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║ THERE IS NO ROLLBACK HERE. THIS IS THE DIFFERENCE FROM EVERY OTHER PROBE. ║
# ╚═══════════════════════════════════════════════════════════════════════════╝
# Every layer-1 probe lived in a transaction that COULD NOT COMMIT — forbidden writes
# could be fired at production data with zero risk. This script has no such wrapper.
# Each request is its own transaction and commits on success. If a write is rejected,
# nothing happens. If the fix does NOT hold over this path, the write LANDS AND STAYS.
#
# We have strong SQL-level evidence every write below is rejected. "Strong evidence it
# is already safe" is the belief this investigation demolished twice. Hence: snapshot
# first, ascending blast radius, hard gate on the last step.
#
# ── REQUIRED ENV ─────────────────────────────────────────────────────────────
#   SUPABASE_URL        https://<project>.supabase.co
#   SUPABASE_ANON_KEY   the anon/publishable key
#   STANDARD_JWT        access_token of a live STANDARD-member session, lifted from
#                       the app's localStorage while signed in as that member
#                       (the method that proved the read side on 2026-07-13)
#
# ── WHY Prefer: return=minimal ON EVERY WRITE — NOT OPTIONAL ─────────────────
# PostgREST defaults to Prefer: return=representation, which appends RETURNING. A
# RETURNING clause makes the statement require ACL_SELECT, which pulls the type-aware
# SELECT policy in as a post-image check — so the INSERTs would be rejected by the
# READ policy even if the write gate were missing entirely. That is a FALSE ALL-CLEAR
# on paths (a) and (b), the two we actually reproduced. return=minimal drops the
# RETURNING and leaves the write policy as the only gate. This is the whole reason
# this layer needs designing rather than just firing curl.
#
# ── THE 401 vs 403 TRAP ──────────────────────────────────────────────────────
# A rejection proves nothing unless the session is known-good. 401 = the token is
# expired/garbage — every subsequent "rejection" is meaningless, not a pass. That is
# what CONTROL 1 exists to rule out, and why it must SUCCEED before anything else
# runs. Same discipline as layer 1's "permission denied" vs "row-level security"
# branch: a rejection for the wrong reason is INCONCLUSIVE, never evidence.
#
# ── RUN ORDER (enforced below; do not reorder) ───────────────────────────────
#   STEP 0  snapshot        SQL, run in Supabase FIRST. Save the output. Restore path.
#   STEP 1a resolve hub     from the session; ABORTS unless exactly one match
#   STEP 1b CONTROL         GET expenses      MUST return rows  (token is live)
#   STEP 2  CONTROL         GET income_sources MUST return []   (read side holds)
#   STEP 3  W1 POST income_source        blast radius: 1 new row
#   STEP 4  W2 POST income transaction   blast radius: 1 new row
#   STEP 5  W3 PATCH income_sources      blast radius: overwrites existing amounts
#   STEP 6  W4 PATCH transactions        blast radius: EVERY row in the hub flips
#                                        <<< POINT OF NO RETURN — env-gated >>>
# Additive writes (W1/W2) come before destructive ones (W3/W4): a landed INSERT is one
# row to delete, a landed PATCH has overwritten data that only the snapshot restores.
#
# ── RESULT LOG — run 2026-07-16 against live, post-migrate_24/25 ─────────────
# Controls all passed FIRST, so the rejections below are evidence and not artefacts:
#   identity assertion  token sub = the STANDARD member (not the owner)
#   STEP 1b             GET expenses       200 + rows -> token live, PostgREST honours it
#   STEP 2              GET income_sources []         -> read side (migrate_22) still holds
# Prefer: return=minimal was set on every write, so no RETURNING was appended and
# ACL_SELECT was never engaged — the INSERT rejections are the WRITE gate, not the read
# policy leaking in. That distinction is the entire reason this layer exists.
#
# THE FOUR PATHS ARE NOT PROVEN THE SAME WAY HERE. The difference is the finding:
#
# RLS REJECTIONS — the DB write gate fired, over the real client path:
#   W1  POST income_sources   403 / code 42501   path (b) CLOSED over REST
#   W2  POST transactions     403 / code 42501   path (a) CLOSED over REST
#
# CLIENT-LEVEL REFUSALS — PostgREST refused before the DB was ever asked:
#   W3  PATCH income_sources  400 / code 21000  "UPDATE requires a WHERE clause"
#   W4  PATCH transactions    400 / code 21000  (same)
#   This is NOT an RLS rejection and must never be logged as one. It says the
#   unqualified-UPDATE vector is UNREACHABLE over PostgREST — the statement dies at the
#   client layer, so migrate_24/25's WITH CHECK was not exercised on this path and this
#   run says nothing about whether it would have held. The DB-level proof for the UPDATE
#   paths (c)/(d) is at SQL level only: f1_t4b_diag's ACCEPTED->REJECTED flip (d) and
#   f1_t4c_diag's standard-0/owner-1 isolation (c). Neither is superseded by this run.
#
# NET: paths (a)/(b) are proven at BOTH layers — DB gate (SQL) and over the wire (REST).
# Paths (c)/(d) are proven at the DB gate (SQL) and are additionally unreachable via the
# only client the app ships. Defense in depth per path; the two layers prove different
# things and the REST layer is not a substitute for the SQL one.
#
# NOTHING LANDED. Post-run check for the marker returned [] and []:
#   SELECT id FROM public.transactions   WHERE description = 'F1-LAYER2-DELETE-ME';
#   SELECT id FROM public.income_sources WHERE label       = 'F1-LAYER2-DELETE-ME';
# No cleanup was required and the STEP 0 snapshot was never needed.
# =============================================================================
set -uo pipefail

MARK='F1-LAYER2-DELETE-ME'
HUB_PFX='0d3ccc2e'                           # fixture hub prefix, from the discovery grid
STD_PFX='3a36d46c'                           # the STANDARD member — asserted below
CAT_NAME='Groceries'
TX_DATE='2026-06-01'                         # inside the June 2026 cycle (avoids CYC02)
MONTH='2026-06'

for v in SUPABASE_URL SUPABASE_ANON_KEY STANDARD_JWT; do
  if [ -z "${!v:-}" ]; then echo "ABORT: \$$v is not set. See REQUIRED ENV in the header."; exit 1; fi
done
command -v jq >/dev/null || { echo "ABORT: jq is required."; exit 1; }

api() {  # api <METHOD> <PATH> [BODY] [EXTRA_HEADER...]
  local method="$1" path="$2" body="${3:-}"; shift 3 2>/dev/null || shift 2
  curl -sS -w $'\n<<<HTTP:%{http_code}>>>\n' -X "$method" \
    "$SUPABASE_URL/rest/v1/$path" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $STANDARD_JWT" \
    -H "Content-Type: application/json" \
    "$@" \
    ${body:+-d "$body"}
}

# ═══ IDENTITY ASSERTION — runs before ANYTHING else ═════════════════════════
# The single most dangerous mistake available in this script is pasting the OWNER's
# token into STANDARD_JWT. Both accounts belong to the same person, both sessions
# live in the same browser, and the tokens are visually identical blobs. With the
# owner's token EVERY forbidden write below SUCCEEDS — and unlike layer 1, they
# COMMIT: forged income rows land, the income source is zeroed, every transaction
# flips to income. The script would report "all writes accepted" and look like the
# fix had catastrophically failed, when in fact it was never tested.
# So: decode the JWT and prove the caller is the standard member, before STEP 0.
JWT_PAYLOAD="$(echo "$STANDARD_JWT" | cut -d. -f2)"
case $(( ${#JWT_PAYLOAD} % 4 )) in 2) JWT_PAYLOAD="${JWT_PAYLOAD}==";; 3) JWT_PAYLOAD="${JWT_PAYLOAD}=";; esac
JWT_SUB="$(echo "$JWT_PAYLOAD" | tr '_-' '/+' | base64 -d 2>/dev/null | jq -r '.sub // empty' 2>/dev/null)"
if [ -z "$JWT_SUB" ]; then
  echo "ABORT: could not decode a 'sub' claim from STANDARD_JWT. Is it a JWT?"; exit 1
fi
case "$JWT_SUB" in
  "$STD_PFX"*) echo "identity OK: token sub = $JWT_SUB (standard member)";;
  *) echo "ABORT: STANDARD_JWT belongs to $JWT_SUB, which is NOT the standard member ($STD_PFX...)."
     echo "       If this is the OWNER's token, every write below would SUCCEED and COMMIT."
     echo "       Nothing was attempted."; exit 1;;
esac
JWT_EXP="$(echo "$JWT_PAYLOAD" | tr '_-' '/+' | base64 -d 2>/dev/null | jq -r '.exp // empty' 2>/dev/null)"
if [ -n "$JWT_EXP" ] && [ "$JWT_EXP" -le "$(date +%s)" ]; then
  echo "ABORT: STANDARD_JWT expired at $(date -d @"$JWT_EXP" 2>/dev/null || echo "$JWT_EXP")."
  echo "       Every rejection below would be a 401, not evidence. Grab a fresh token."; exit 1
fi

echo "############################################################"
echo "# STEP 0 — SNAPSHOT. Run this in the Supabase SQL editor NOW."
echo "# Save the output. It is the ONLY restore path if a write lands."
echo "############################################################"
cat <<'SNAP'
-- F1 LAYER 2 — STEP 0: SNAPSHOT / RESTORE-SCRIPT GENERATOR.  Read-only.
--
-- Does not merely RECORD the values the forbidden writes could destroy — it emits
-- ready-to-run UPDATE statements that put them back. If a write lands, you paste the
-- output back into the SQL editor. No hand-writing a restore under pressure.
--
-- W4 destroys transactions.type + .description; W3 destroys income_sources
-- .expected_amount. Both are covered below, plus label/notes for completeness.
-- ONE result set on purpose: the Supabase editor only renders the last one.
--
-- SAVE THIS OUTPUT SOMEWHERE OUTSIDE THE EDITOR BEFORE CONTINUING.
SELECT restore_sql FROM (
  SELECT 1 AS ord, id::text AS k,
         format('UPDATE public.transactions SET type=%L, description=%L, amount=%L WHERE id=%L;',
                type, description, amount, id) AS restore_sql
  FROM public.transactions
  WHERE budget_centre_id::text LIKE '0d3ccc2e%'
  UNION ALL
  SELECT 2, id::text,
         format('UPDATE public.income_sources SET label=%L, notes=%L, expected_amount=%L WHERE id=%L;',
                label, notes, expected_amount, id)
  FROM public.income_sources
  WHERE budget_centre_id::text LIKE '0d3ccc2e%'
) s ORDER BY ord, k;
SNAP
echo
read -r -p "Snapshot captured and saved? Type YES to continue: " ack
[ "$ack" = "YES" ] || { echo "ABORT: snapshot not confirmed."; exit 1; }

echo
echo "=== STEP 1a — RESOLVE the fixture hub from the session itself =============="
echo "    The discovery grid only ever recorded 8-char PREFIXES. Rather than invent"
echo "    the remaining hex digits, resolve exactly as the layer-1 probes do: ask the"
echo "    DB, and ABORT unless exactly one row matches. A hardcoded UUID that is"
echo "    subtly wrong would make every request below target a hub that does not"
echo "    exist — returning empty and 'no rows affected', which READS LIKE A PASS."
echo "    That failure mode is why this is resolved, not typed."
HUBS_JSON="$(curl -sS "$SUPABASE_URL/rest/v1/budget_centres?select=id,name" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $STANDARD_JWT")"
echo "$HUBS_JSON" | jq . 2>/dev/null || { echo "ABORT: response was not JSON: $HUBS_JSON"; exit 1; }

# This read is itself the token-validity control. RLS on budget_centres scopes it to
# the caller's hubs, so a live standard session returns exactly their memberships.
# 401/[] here => the token is dead or the member is in no hub, and EVERY rejection
# below would be meaningless rather than evidence.
HUB="$(echo "$HUBS_JSON" | jq -r --arg p "$HUB_PFX" '[.[] | select(.id | startswith($p)) | .id] | if length == 1 then .[0] else empty end' 2>/dev/null)"
if [ -z "$HUB" ]; then
  echo
  echo "ABORT: the fixture hub prefix '$HUB_PFX' did not match exactly one hub visible"
  echo "       to this session. Either the token is dead (401/empty above), or the"
  echo "       member's memberships are not what the discovery grid recorded."
  echo "       Nothing was attempted."
  exit 1
fi
echo
echo "    RESOLVED: $HUB"

echo
echo "=== STEP 1b — CONTROL: token is live and PostgREST honours it =============="
echo "    MUST return expense rows. If 401 -> token dead, everything below is"
echo "    INCONCLUSIVE, not a pass. If [] -> no expenses in the hub; fix first,"
echo "    because STEP 2's [] would then be unreadable."
api GET "transactions?budget_centre_id=eq.$HUB&type=eq.expense&select=id,type,amount&limit=3"
echo
read -r -p "Did STEP 1b return expense rows (HTTP 200, non-empty)? Type YES: " ack
[ "$ack" = "YES" ] || { echo "ABORT: session not proven live. Every rejection below would be meaningless."; exit 1; }

echo
echo "=== STEP 2 — CONTROL: read side still holds (regression) ==================="
echo "    MUST return []  (migrate_22: standard cannot read income_sources)"
api GET "income_sources?budget_centre_id=eq.$HUB&select=id,label,expected_amount"

echo
echo "=== STEP 3 — W1: POST income_source  [blast radius: 1 new row] ============="
echo "    EXPECT 403 + code 42501.  If 201 -> path (b) is OPEN over REST; the row"
echo "    LANDED and must be deleted (find it by label='$MARK')."
api POST "income_sources" \
  "{\"budget_centre_id\":\"$HUB\",\"label\":\"$MARK\",\"month\":\"$MONTH\",\"expected_amount\":99999,\"notes\":\"$MARK\"}" \
  -H "Prefer: return=minimal"

echo
echo "=== STEP 4 — W2: POST income transaction  [blast radius: 1 new row] ========"
echo "    EXPECT 403 + code 42501.  If 201 -> path (a) is OPEN over REST; the row"
echo "    LANDED (find it by description='$MARK')."
api POST "transactions" \
  "{\"budget_centre_id\":\"$HUB\",\"date\":\"$TX_DATE\",\"week\":\"Week 1\",\"type\":\"income\",\"category_name\":\"$CAT_NAME\",\"amount\":99999,\"description\":\"$MARK\"}" \
  -H "Prefer: return=minimal"

echo
echo "=== STEP 5 — W3: PATCH income_sources, UNFILTERED  [DESTRUCTIVE] =========="
echo "    ACTUAL (2026-07-16): 400 / code 21000 'UPDATE requires a WHERE clause' —"
echo "    PostgREST refused at the CLIENT layer; the DB was never asked. This is the"
echo "    same branch STEP 6 anticipates. Record it as unreachable-over-REST, NOT as"
echo "    'RLS rejected'."
echo
echo "    ORIGINAL EXPECTATION (kept — it is the SQL-level behaviour, still true there):"
echo "    204 and ZERO rows affected — SILENCE IS THE PASS. USING is can_view_income,"
echo "    which admits nothing, so the WITH CHECK is unreachable. Do NOT read the"
echo "    absence of a 42501 as failure (that is the T2 inversion)."
echo "    If rows WERE modified -> expected_amount is overwritten; restore from STEP 0."
read -r -p "STEP 5 overwrites existing amounts if it lands. Snapshot saved? Type YES: " ack
[ "$ack" = "YES" ] || { echo "ABORT."; exit 1; }
api PATCH "income_sources" '{"expected_amount":1}' -H "Prefer: return=minimal"

echo
echo "############################################################################"
echo "# STEP 6 — W4: PATCH transactions, UNFILTERED"
echo "#"
echo "#   >>> POINT OF NO RETURN <<<"
echo "#"
echo "# This is the exact statement f1_t4b_diag proved was ACCEPTED before"
echo "# migrate_24 and REJECTED after. There it ran inside a transaction that could"
echo "# not commit. HERE IT COMMITS. If the fix does not hold on this path, EVERY"
echo "# transaction in the hub permanently becomes type='income' and every"
echo "# description is overwritten. Only STEP 0's snapshot restores them."
echo "#"
echo "# EXPECT 403 + code 42501."
echo "# If 400/405 -> PostgREST refused an unfiltered PATCH. That is a CLIENT-level"
echo "#   protection, not RLS. Good news, but different evidence: it means this"
echo "#   vector is unreachable via PostgREST, NOT that the DB gate fired. Record it"
echo "#   as such — do not log it as 'RLS rejected'."
echo "# If 204 -> THE FIX FAILED ON THIS PATH. Restore from STEP 0 immediately."
echo "############################################################################"
if [ "${CONFIRM_UNQUALIFIED_PATCH:-}" != "I-HAVE-THE-SNAPSHOT" ]; then
  echo
  echo "SKIPPED — hard gate. To run STEP 6, re-invoke with:"
  echo "    CONFIRM_UNQUALIFIED_PATCH=I-HAVE-THE-SNAPSHOT $0"
  echo "Deliberately not a y/n prompt: this one should take a decision, not a reflex."
  exit 0
fi
api PATCH "transactions" "{\"type\":\"income\",\"description\":\"$MARK\"}" -H "Prefer: return=minimal"

echo
echo "=== DONE. If ANY write landed, restore from STEP 0 and tell someone. ======="
echo "    Cleanup for landed INSERTs (run as postgres in the SQL editor):"
echo "      DELETE FROM public.transactions   WHERE description = '$MARK';"
echo "      DELETE FROM public.income_sources WHERE label       = '$MARK';"
