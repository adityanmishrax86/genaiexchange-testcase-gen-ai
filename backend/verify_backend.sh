#!/bin/bash

# Backend Verification Script for Hackathon
# Run this to verify all components are working correctly

set -e

echo "=========================================="
echo "Backend Final Verification Check"
echo "=========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counter
PASSED=0
FAILED=0

# Function to check test
check_test() {
    local test_name="$1"
    local command="$2"

    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅${NC} $test_name"
        ((PASSED++))
    else
        echo -e "${RED}❌${NC} $test_name"
        ((FAILED++))
    fi
}

# Function to warn
warn_test() {
    local test_name="$1"
    echo -e "${YELLOW}⚠️${NC}  $test_name"
}

echo "[1] ENVIRONMENT CHECK"
echo "---"
check_test "GEMINI_API_KEY set" "[[ -n \$GEMINI_API_KEY ]] || grep -q 'GEMINI_API_KEY' .env"
check_test "GENAI_MODEL configured" "grep -q 'GENAI_MODEL' .env || [[ -n \$GENAI_MODEL ]]"
check_test "JIRA_BASE_URL configured" "grep -q 'JIRA_BASE_URL_PRAJNA' .env"
echo ""

echo "[2] PYTHON FILES SYNTAX CHECK"
echo "---"
python_files=(
    "src/services/gemini_client.py"
    "src/routers/extraction_router.py"
    "src/routers/generate_router.py"
    "src/routers/judge_router.py"
    "src/routers/export_router.py"
    "src/services/document_parser.py"
    "src/models.py"
    "src/db.py"
)

for file in "${python_files[@]}"; do
    check_test "$file compiles" "python -m py_compile $file"
done
echo ""

echo "[3] IMPORTS CHECK"
echo "---"
check_test "GeminiClient imports" "python -c 'from src.services.gemini_client import GeminiClient, JudgeVerdict'"
check_test "Extraction router imports" "python -c 'from src.routers.extraction_router import router'"
check_test "Generate router imports" "python -c 'from src.routers.generate_router import router'"
check_test "Judge router imports" "python -c 'from src.routers.judge_router import router'"
check_test "Database models import" "python -c 'from src.models import Document, Requirement, TestCase, GenerationEvent'"
echo ""

echo "[4] CRITICAL CONFIGURATIONS CHECK"
echo "---"
check_test "Response schema usage in extraction" "grep -q 'response_schema=None' src/routers/extraction_router.py"
check_test "Response schema usage in generate" "grep -q 'response_schema=None' src/routers/generate_router.py"
check_test "JudgeVerdict schema in judge" "grep -q 'response_schema=JudgeVerdict' src/routers/judge_router.py"
check_test "GeminiClient .parsed handling" "grep -q 'response.parsed.model_dump_json()' src/services/gemini_client.py"
check_test "CSV fallback implementation" "grep -q 'on_bad_lines=' src/services/document_parser.py"
echo ""

echo "[5] NO REGRESSIONS CHECK"
echo "---"
# These should NOT be found (they were removed)
if grep -q 'TestCaseBatch' src/routers/extraction_router.py 2>/dev/null; then
    echo -e "${RED}❌${NC} extraction_router should NOT import TestCaseBatch"
    ((FAILED++))
else
    echo -e "${GREEN}✅${NC} No TestCaseBatch import in extraction_router"
    ((PASSED++))
fi

if grep -q '"TestCase" in' src/routers/generate_router.py 2>/dev/null; then
    echo -e "${RED}❌${NC} generate_router should NOT have unwrapping logic"
    ((FAILED++))
else
    echo -e "${GREEN}✅${NC} No TestCaseBatch unwrapping logic in generate_router"
    ((PASSED++))
fi
echo ""

echo "[6] PROMPT FILES CHECK"
echo "---"
check_test "extraction_prompt_v2.txt exists" "test -f src/services/prompts/extraction_prompt_v2.txt"
check_test "judge_prompt_v1.txt exists" "test -f src/services/prompts/judge_prompt_v1.txt"
echo ""

echo "[7] DATABASE CHECK"
echo "---"
check_test "SQLite database accessible" "python -c 'from src.db import engine; engine.dispose()'"
echo ""

echo "[8] QUICK INTEGRATION TEST"
echo "---"
python3 << 'EOF'
try:
    from src.services.gemini_client import GeminiClient
    from src.models import Document, Requirement, TestCase
    from src.db import get_session

    # Verify GeminiClient initialization
    client = GeminiClient(api_key="test", model_name="gemini-2.5-flash-lite")

    # Verify database session
    sess = get_session()
    sess.close()

    print("✅ GeminiClient initialization works")
    print("✅ Database session management works")
    exit(0)
except Exception as e:
    print(f"❌ Integration test failed: {e}")
    exit(1)
EOF

if [ $? -eq 0 ]; then
    ((PASSED++))
else
    ((FAILED++))
fi
echo ""

# Summary
echo "=========================================="
echo "SUMMARY"
echo "=========================================="
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ ALL CHECKS PASSED${NC}"
    echo "Backend is ready for hackathon submission!"
    exit 0
else
    echo -e "${RED}❌ SOME CHECKS FAILED${NC}"
    echo "Please review the failures above before submitting."
    exit 1
fi
