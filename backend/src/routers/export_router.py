"""Router for exporting test cases to various formats (JIRA, CSV, etc).

Provides endpoints to push generated test cases to external systems (JIRA),
export traceability matrices, and download test cases in CSV format.
JIRA configuration is loaded from environment variables.
"""
import csv
import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from sqlmodel import select

from src.db import get_session
from src.models import Document, Requirement, TestCase
from src.services.jira_client import create_jira_issues_from_testcases

logger = logging.getLogger(__name__)

router = APIRouter()

# JIRA configuration from environment
JIRA_BASE_URL = os.getenv("JIRA_BASE_URL_PRAJNA")
JIRA_API_USER = os.getenv("JIRA_API_USER_PRAJNA")
JIRA_API_TOKEN = os.getenv("JIRA_API_TOKEN_PRAJNA")
JIRA_PROJECT_KEY = os.getenv("JIRA_PROJECT_KEY", "TCG")
JIRA_ISSUE_TYPE = os.getenv("JIRA_ISSUE_TYPE", "Test")


def _get_jira_config() -> Dict[str, str]:
    """Build JIRA configuration from environment variables.

    Returns:
        Dictionary with JIRA connection details.

    Raises:
        ValueError: If required JIRA configuration is missing.
    """
    if not all([JIRA_BASE_URL, JIRA_API_USER, JIRA_API_TOKEN]):
        raise ValueError(
            "JIRA configuration incomplete. Check JIRA_BASE_URL_PRAJNA, "
            "JIRA_API_USER_PRAJNA, and JIRA_API_TOKEN_PRAJNA env vars."
        )

    return {
        "url": JIRA_BASE_URL,
        "username": JIRA_API_USER,
        "api_token": JIRA_API_TOKEN,
        "project_key": JIRA_PROJECT_KEY,
        "issue_type_name": JIRA_ISSUE_TYPE,
    }


def _build_jira_payload(
    test_cases: List[TestCase],
    requirements: Dict[int, Requirement],
) -> Dict[str, Any]:
    """Build JIRA-compatible test case payload.

    Args:
        test_cases: List of TestCase objects from database.
        requirements: Dict mapping requirement_id to Requirement objects.

    Returns:
        Payload dict with "TestCase" key containing formatted test cases.
    """
    payload_cases = []

    for tc in test_cases:
        req = requirements.get(tc.requirement_id)
        if not req:
            logger.warning(
                "Requirement %d not found for test case %d",
                tc.requirement_id,
                tc.id,
            )
            continue

        # Start with structured requirement data
        req_structured = (
            json.loads(req.structured) if req.structured else {}
        )

        # Build test case object for JIRA
        tc_obj = {
            "RequirementID": (
                req.requirement_id or f"REQ-{req.id}"
            ),
            "RequirementDescription": req.raw_text,
            "TestObjective": req_structured.get("subject", ""),
            "VerificationMethod": tc.test_type.title(),
            "Gherkin": tc.gherkin or "",
            "TestData": (
                json.loads(tc.sample_data_json)
                if tc.sample_data_json
                else {}
            ),
            "TestSteps": (
                json.loads(tc.automated_steps_json)
                if tc.automated_steps_json
                else []
            ),
            "Evidence": (
                json.loads(tc.evidence_json) if tc.evidence_json else {}
            ),
            "CodeScaffold": tc.code_scaffold_str or "",
        }

        # Add optional fields from structured requirement
        for optional_field in [
            "ParsedEntities",
            "Standards",
            "SafetyClass",
            "Preconditions",
            "ExpectedResult",
            "AcceptanceCriteria",
            "Traceability",
        ]:
            if optional_field in req_structured:
                tc_obj[optional_field] = req_structured[optional_field]

        payload_cases.append(tc_obj)

    return {"TestCase": payload_cases}


@router.post("/api/export/jira")
def push_to_jira(test_case_ids: List[int] = Query(...)):
    """Push test cases to JIRA as new issues.

    Args:
        test_case_ids: List of TestCase IDs to export to JIRA.

    Returns:
        Dictionary with created issue keys and status.

    Raises:
        HTTPException: If JIRA config is missing or creation fails.
    """
    try:
        jira_config = _get_jira_config()
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    sess = get_session()
    created_keys = []
    failed_ids = []

    try:
        # Fetch test cases and requirements
        test_cases = []
        requirements = {}

        for tc_id in test_case_ids:
            tc = sess.get(TestCase, tc_id)
            if not tc:
                logger.warning("Test case %d not found", tc_id)
                failed_ids.append({"id": tc_id, "reason": "Not found"})
                continue

            req = sess.get(Requirement, tc.requirement_id)
            if not req:
                logger.warning(
                    "Requirement %d not found for test case %d",
                    tc.requirement_id,
                    tc_id,
                )
                failed_ids.append(
                    {
                        "id": tc_id,
                        "reason": "Requirement not found",
                    }
                )
                continue

            test_cases.append(tc)
            requirements[req.id] = req

        if not test_cases:
            raise HTTPException(
                status_code=404,
                detail="No valid test cases found to export",
            )

        # Build and send payload to JIRA
        payload = _build_jira_payload(test_cases, requirements)

        logger.info(
            "Pushing %d test cases to JIRA project %s",
            len(test_cases),
            jira_config["project_key"],
        )

        try:
            created_keys = create_jira_issues_from_testcases(
                jira_config, payload
            )
        except Exception as e:
            logger.error("JIRA creation failed: %s", str(e))
            raise HTTPException(
                status_code=500,
                detail=f"Failed to create JIRA issues: {str(e)}",
            ) from e

        # Update test case status to "pushed" and store JIRA key
        for tc, jira_key in zip(test_cases, created_keys):
            tc.jira_issue_key = jira_key
            tc.status = "pushed"
            sess.add(tc)

        sess.commit()

        logger.info(
            "Successfully pushed %d test cases to JIRA",
            len(created_keys),
        )

        return {
            "message": "Successfully pushed to JIRA",
            "created_count": len(created_keys),
            "issue_keys": created_keys,
            "failed_count": len(failed_ids),
            "failed_ids": failed_ids,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error in push_to_jira: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}",
        ) from e
    finally:
        sess.close()

@router.get("/api/export/traceability_matrix")
def export_traceability_matrix(doc_id: int = Query(...)):
    """Export traceability matrix as CSV for a document.

    Maps requirements to their test cases for compliance tracking.

    Args:
        doc_id: Document ID to export traceability for.

    Returns:
        CSV file download with requirement-to-test-case mappings.

    Raises:
        HTTPException: If no requirements found for document.
    """
    sess = get_session()
    try:
        requirements = sess.exec(
            select(Requirement).where(
                Requirement.doc_id == doc_id,
                Requirement.status != "archived",
            )
        ).all()

        if not requirements:
            raise HTTPException(
                status_code=404,
                detail="No requirements found for this document",
            )

        fd, tmp_path = tempfile.mkstemp(suffix=".csv")

        with os.fdopen(fd, "w", newline="", encoding="utf-8") as csvfile:
            fieldnames = [
                "Requirement ID",
                "Requirement Text",
                "Test Case ID",
                "Test Case Status",
                "JIRA Issue Key",
            ]
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()

            for req in requirements:
                test_cases = sess.exec(
                    select(TestCase).where(TestCase.requirement_id == req.id)
                ).all()

                if not test_cases:
                    writer.writerow(
                        {
                            "Requirement ID": (
                                req.requirement_id or f"REQ-{req.id}"
                            ),
                            "Requirement Text": req.raw_text,
                            "Test Case ID": "N/A",
                            "Test Case Status": "N/A",
                            "JIRA Issue Key": "N/A",
                        }
                    )
                else:
                    for tc in test_cases:
                        writer.writerow(
                            {
                                "Requirement ID": (
                                    req.requirement_id or f"REQ-{req.id}"
                                ),
                                "Requirement Text": req.raw_text,
                                "Test Case ID": tc.test_case_id,
                                "Test Case Status": tc.status,
                                "JIRA Issue Key": (
                                    tc.jira_issue_key or "N/A"
                                ),
                            }
                        )

        timestamp = int(datetime.now(timezone.utc).timestamp())
        return FileResponse(
            tmp_path,
            filename=(
                f"traceability_matrix_{doc_id}_{timestamp}.csv"
            ),
            media_type="text/csv",
        )

    finally:
        sess.close()

@router.get("/api/export/testcases/download")
def export_testcases_download(
    upload_session_id: str = Query(None),
    doc_id: int = Query(None),
):
    """Export generated test cases to CSV format.

    Exports test cases that have been confirmed as 'generated' or 'pushed'.
    Optionally filters by upload session ID and/or document ID.

    Args:
        upload_session_id: Optional upload session ID to filter by.
        doc_id: Optional document ID to filter by.

    Returns:
        CSV file with test case details and evidence.

    Raises:
        HTTPException: If no test cases found matching criteria.
    """
    sess = get_session()
    try:
        query = (
            select(TestCase)
            .join(
                Requirement,
                TestCase.requirement_id == Requirement.id,
            )
            .join(Document, Requirement.doc_id == Document.id)
            .where(
                TestCase.status.in_(["generated", "pushed"])
            )
        )

        if upload_session_id:
            query = query.where(
                Document.upload_session_id == upload_session_id
            )

        if doc_id:
            query = query.where(Requirement.doc_id == doc_id)

        rows = sess.exec(query).all()

        if not rows:
            raise HTTPException(
                status_code=404,
                detail="No test cases found matching criteria",
            )

        fd, tmp_path = tempfile.mkstemp(suffix=".csv")

        with os.fdopen(
            fd, "w", newline="", encoding="utf-8"
        ) as csvfile:
            fieldnames = [
                "test_case_id",
                "requirement_id",
                "test_type",
                "generated_at",
                "status",
                "jira_issue_key",
                "gherkin",
            ]
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()

            for tc in rows:
                writer.writerow(
                    {
                        "test_case_id": tc.test_case_id,
                        "requirement_id": tc.requirement_id,
                        "test_type": tc.test_type,
                        "generated_at": tc.generated_at.isoformat(),
                        "status": tc.status,
                        "jira_issue_key": tc.jira_issue_key or "N/A",
                        "gherkin": tc.gherkin or "",
                    }
                )

        timestamp = int(datetime.now(timezone.utc).timestamp())
        return FileResponse(
            tmp_path,
            filename=f"test_cases_{timestamp}.csv",
            media_type="text/csv",
        )

    finally:
        sess.close()