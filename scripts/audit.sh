#!/bin/bash

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"
PASS=0
FAIL=0

green() { echo "  ✅ $1"; PASS=$((PASS + 1)); }
red()   { echo "  ❌ $1"; echo "$2"; FAIL=$((FAIL + 1)); }
header(){ echo ""; echo "=== $1 ==="; }

# ── A: Banned imports ────────────────────────────────────────
header "A: Banned imports"

result=$(grep -rn "^import.*\bfmt\b.*finance" "$SRC" --include="*.jsx" --include="*.js" | grep -v "\.test\.")
[ -z "$result" ] && green "No direct fmt import from finance" || red "Direct fmt import found" "$result"

result=$(grep -rn "^import.*HOUSEHOLD" "$SRC" --include="*.jsx" --include="*.js" | grep -v "\.test\.")
[ -z "$result" ] && green "No HOUSEHOLD import" || red "HOUSEHOLD import found" "$result"

result=$(grep -rn "^import.*FIXED_EXPENSES" "$SRC" --include="*.jsx" --include="*.js" | grep -v "\.test\.")
[ -z "$result" ] && green "No FIXED_EXPENSES import" || red "FIXED_EXPENSES import found" "$result"

result=$(grep -rn "^import.*mockData" "$SRC" --include="*.jsx" --include="*.js" | grep -v "\.test\.")
[ -z "$result" ] && green "No mockData import" || red "mockData import found" "$result"

result=$(grep -rn "^import.*INITIAL_TXS\|^import.*INITIAL_INCOMES" "$SRC" --include="*.jsx" --include="*.js" | grep -v "\.test\.")
[ -z "$result" ] && green "No INITIAL_TXS import" || red "INITIAL_TXS import found" "$result"

# ── B: Module-level calculations ─────────────────────────────
header "B: Module-level calculations"

result=$(grep -rn "^const.*= calc\|^const.*= fmt" "$SRC/views" "$SRC/components" "$SRC/features" --include="*.jsx" 2>/dev/null | grep -v "\.test\.")
[ -z "$result" ] && green "No module-level calcs in views/components/features" || red "Module-level calcs found" "$result"

# ── C: Hardcoded currency ────────────────────────────────────
header "C: Hardcoded currency"

result=$(grep -rn "'GHS'\|\"GHS\"" "$SRC/views" "$SRC/features" "$SRC/components" --include="*.jsx" 2>/dev/null | grep -v "fallback\|default\||| '\|\.test\.\|currency:")
[ -z "$result" ] && green "No hardcoded GHS in views/features/components" || red "Hardcoded GHS found" "$result"

# ── D: Silent error swallowing ───────────────────────────────
header "D: Silent error swallowing"

result=$(grep -rn "const { data" "$SRC/hooks" --include="*.js" | grep -v "error\|subscription\|session\|user\|\.test\.")
[ -z "$result" ] && green "No silent errors in hooks" || red "Silent errors in hooks" "$result"

result=$(grep -rn "const { data" "$SRC/services" --include="*.js" | grep -v "error\|user\|session\|\.test\.")
[ -z "$result" ] && green "No silent errors in services" || red "Silent errors in services" "$result"

# ── E: No hard deletes ──────────────────────────────────────
header "E: No hard deletes"

result=$(grep -rn "\.delete()" "$SRC/services" --include="*.js" | grep -v "\.test\.")
[ -z "$result" ] && green "No hard deletes" || red "Hard delete found" "$result"

# ── F: Soft delete pattern ───────────────────────────────────
header "F: Soft delete uses deleted_at"

result=$(grep -rn "update({ deleted_at" "$SRC/services" --include="*.js")
if [ -n "$result" ]; then
  green "Soft deletes use deleted_at=now()"
else
  red "No soft delete pattern found" "Expected update({ deleted_at: ... }) in services"
fi

# ── G: PIN security ──────────────────────────────────────────
header "G: PIN security"

result=$(grep -rn "\.select.*pin_hash" "$SRC/services" --include="*.js" | grep -v "pin\.service")
[ -z "$result" ] && green "pin_hash never in select fields (except pin.service)" || red "pin_hash exposed in select" "$result"

result=$(grep -rn "pin_hash\s*=" "$SRC/services" --include="*.js" | grep -v "hashPin\|await\|cleaned\|const {")
[ -z "$result" ] && green "PIN always hashed before storing" || red "Raw PIN may be stored" "$result"

# ── H: No mock data ──────────────────────────────────────────
header "H: No mock data"

result=$(grep -rn "^import.*mockData\|^const.*mockData\|^export.*mockData" "$SRC" --include="*.jsx" --include="*.js" | grep -v "\.test\.")
[ -z "$result" ] && green "No mock data" || red "Mock data found" "$result"

# ── I: No hardcoded financial amounts ────────────────────────
header "I: No hardcoded financial amounts"

result=$(grep -rn "[^0-9a-zA-Z_][0-9]\{5,\}" "$SRC/services" "$SRC/hooks" "$SRC/views" "$SRC/features" --include="*.js" --include="*.jsx" | grep -v "node_modules\|\.test\.\|#[0-9a-fA-F]")
[ -z "$result" ] && green "No hardcoded 5+ digit amounts" || red "Hardcoded amounts found" "$result"

# ── J: No direct supabase.from() outside services ────────────
header "J: No direct supabase.from() outside services"

result=$(grep -rn "supabase\.from(" "$SRC" --include="*.jsx" --include="*.js" | grep -v "$SRC/services\|node_modules\|\.test\.")
[ -z "$result" ] && green "supabase.from() only in services" || red "Direct supabase.from() found outside services" "$result"

# ── K: No console.log in production code ─────────────────────
header "K: No console.log in production code"

result=$(grep -rn "console\.log(" "$SRC" --include="*.jsx" --include="*.js" | grep -v "node_modules\|\.test\.")
[ -z "$result" ] && green "No console.log in production code" || red "console.log found" "$result"

# ── L: Import integrity ──────────────────────────────────────
header "L: Import integrity"

missing=0
while IFS= read -r line; do
  srcfile=$(echo "$line" | cut -d: -f1)
  importpath=$(echo "$line" | grep -o "from '[./][^']*'" | sed "s/from '//;s/'//")
  importpath=${importpath%%\?*}  # strip Vite query suffix (?raw, ?url, ?worker) before resolving
  if [ -z "$importpath" ]; then continue; fi
  dir=$(dirname "$srcfile")
  base="$dir/$importpath"
  if [ ! -f "$base" ] && [ ! -f "${base}.js" ] && [ ! -f "${base}.jsx" ]; then
    echo "  MISSING: $importpath (in $(basename $srcfile))"
    missing=$((missing + 1))
    FAIL=$((FAIL + 1))
  fi
done < <(grep -rn "^import" "$SRC" --include="*.js" --include="*.jsx" | grep -v "node_modules\|from 'react\|from '@supabase\|from 'lucide\|from 'react-router\|\.test\.")

if [ "$missing" -eq 0 ]; then
  green "All local imports resolve to existing files"
fi

# ── M: File size limits ──────────────────────────────────────
header "M: File size limits"

while IFS= read -r file; do
  lines=$(wc -l < "$file")
  name=$(basename "$file")
  filepath="${file#$SRC/}"

  # Determine limit based on full path not just immediate parent
  limit=400
  if echo "$filepath" | grep -q "^services/";  then limit=250; fi
  if echo "$filepath" | grep -q "^context/";   then limit=100; fi
  if echo "$filepath" | grep -q "^hooks/";     then limit=450; fi
  if echo "$filepath" | grep -q "^views/";     then limit=200; fi
  if echo "$filepath" | grep -q "^components/"; then limit=200; fi
  if echo "$filepath" | grep -q "^features/";  then limit=200; fi

  if [ "$lines" -gt "$limit" ]; then
    red "$name ($filepath): $lines lines (limit $limit)" ""
  else
    green "$name ($filepath): $lines lines (limit $limit)"
  fi
done < <(find "$SRC" -name "*.jsx" -o -name "*.js" | grep -v "node_modules" | grep -v "\.test\." | sort)

# ── N: Test file size limits ─────────────────────────────────
header "N: Test file size limits (max 600 lines)"

while IFS= read -r file; do
  lines=$(wc -l < "$file")
  name=$(basename "$file")
  if [ "$lines" -gt 600 ]; then
    red "$name: $lines lines (limit 600)" ""
  else
    green "$name: $lines lines (limit 600)"
  fi
done < <(find "$SRC" -name "*.test.js" -o -name "*.test.jsx" | grep -v "node_modules" | sort)

# ── O: No TODO or FIXME ─────────────────────────────────────
header "O: No TODO or FIXME"

result=$(grep -rn "TODO\|FIXME" "$SRC" --include="*.jsx" --include="*.js" | grep -v "node_modules\|\.test\.")
[ -z "$result" ] && green "No TODO or FIXME" || red "TODO/FIXME found" "$result"

# ── Summary ──────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  AUDIT COMPLETE"
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
if [ "$FAIL" -eq 0 ]; then
  echo "  STATUS: ✅ ALL CHECKS PASSED"
else
  echo "  STATUS: ❌ $FAIL CHECKS FAILED — DO NOT COMMIT"
fi
echo "============================================"
echo ""
