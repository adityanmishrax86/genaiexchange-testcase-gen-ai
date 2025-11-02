"""Enhanced review router for human-in-the-loop test case evaluation."""
import json
import datetime
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from src.db import get_session
from src.models import TestCase, Requirement, ReviewEvent
from sqlmodel import select

router = APIRouter()


class HumanReviewDecision(BaseModel):
    """Human QA decision on a test case after judge evaluation."""

    test_case_id: int
    decision: str  # "approve" | "reject" | "regenerate"
    notes: Optional[str] = None
    edits: Optional[Dict[str, Any]] = None  # Optional edits to test case fields
    regenerate_reason: Optional[str] = None


class TestCaseReviewPackage(BaseModel):
    """Package of test case + requirement + judge evaluation for human review."""

    test_case_id: int
    test_case: Dict[str, Any]
    requirement: Dict[str, Any]
    judge_verdict: Optional[Dict[str, Any]] = None  # From JudgeVerdict


@router.get("/api/review/package/{test_case_id}")
def get_review_package(test_case_id: int):
    """
    Get a complete package for human review:
    - Test case details
    - Original requirement
    - Judge verdict (if available)

    Perfect for showing in a human review modal/panel in React Flow.
    """
    sess = get_session()
    try:
        tc = sess.get(TestCase, test_case_id)
        if not tc:
            raise HTTPException(status_code=404, detail="Test case not found")

        req = sess.get(Requirement, tc.requirement_id)
        if not req:
            raise HTTPException(status_code=404, detail="Requirement not found")

        # Get judge verdict if exists
        judge_verdict = None
        stmt = select(ReviewEvent).where(
            (ReviewEvent.requirement_id == tc.requirement_id)
            & (ReviewEvent.reviewer == "judge-llm")
        )
        reviews = sess.exec(stmt).all()
        if reviews:
            latest = max(reviews, key=lambda r: r.timestamp)
            judge_verdict = {
                "feedback": latest.note,
                "confidence": latest.reviewer_confidence,
                "evaluated_at": latest.timestamp.isoformat(),
            }

        return TestCaseReviewPackage(
            test_case_id=test_case_id,
            test_case={
                "id": tc.id,
                "test_case_id": tc.test_case_id,
                "test_type": tc.test_type,
                "status": tc.status,
                "gherkin": tc.gherkin,
                "evidence": json.loads(tc.evidence_json) if tc.evidence_json else [],
                "automated_steps": json.loads(tc.automated_steps_json)
                if tc.automated_steps_json
                else [],
                "sample_data": json.loads(tc.sample_data_json) if tc.sample_data_json else {},
                "code_scaffold": tc.code_scaffold_str,
                "generated_at": tc.generated_at.isoformat(),
            },
            requirement={
                "id": req.id,
                "requirement_id": req.requirement_id,
                "raw_text": req.raw_text,
                "structured": json.loads(req.structured) if req.structured else {},
                "overall_confidence": req.overall_confidence,
                "status": req.status,
            },
            judge_verdict=judge_verdict,
        ).model_dump()

    finally:
        sess.close()


@router.post("/api/review/decide")
def human_review_decision(decision: HumanReviewDecision):
    """
    Record human QA's decision on a test case.

    Decisions:
    - approve: Mark as ready to push to JIRA
    - reject: Mark as rejected and don't regenerate
    - regenerate: Request regeneration (optionally with edits)

    This is the critical human-in-the-loop step.
    """
    sess = get_session()
    try:
        tc = sess.get(TestCase, decision.test_case_id)
        if not tc:
            raise HTTPException(status_code=404, detail="Test case not found")

        if decision.decision == "approve":
            tc.status = "generated"

            review_event = ReviewEvent(
                requirement_id=tc.requirement_id,
                reviewer="human-qa",
                action="approved",
                note=decision.notes or "Approved by QA after judge review",
                reviewer_confidence=1.0,
                timestamp=datetime.datetime.now(datetime.timezone.utc),
            )
            sess.add(review_event)

        elif decision.decision == "reject":
            tc.status = "rejected"

            review_event = ReviewEvent(
                requirement_id=tc.requirement_id,
                reviewer="human-qa",
                action="rejected",
                note=decision.notes or "Rejected by QA",
                reviewer_confidence=0.0,
                timestamp=datetime.datetime.now(datetime.timezone.utc),
            )
            sess.add(review_event)

        elif decision.decision == "regenerate":
            tc.status = "stale"
            tc.regeneration_count += 1

            # Apply optional edits before regeneration
            if decision.edits:
                for field, value in decision.edits.items():
                    if hasattr(tc, field):
                        setattr(tc, field, value)

            review_event = ReviewEvent(
                requirement_id=tc.requirement_id,
                reviewer="human-qa",
                action="request_regeneration",
                note=decision.regenerate_reason or decision.notes or "Requested regeneration by QA",
                diffs=json.dumps(decision.edits) if decision.edits else None,
                timestamp=datetime.datetime.now(datetime.timezone.utc),
            )
            sess.add(review_event)

        sess.add(tc)
        sess.commit()

        return {
            "test_case_id": decision.test_case_id,
            "decision": decision.decision,
            "status": tc.status,
            "regeneration_count": tc.regeneration_count,
            "message": f"Test case {decision.decision} by human QA",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Review decision failed: {str(e)}")
    finally:
        sess.close()


@router.post("/api/review/batch-decide")
def batch_review_decisions(decisions: List[HumanReviewDecision]):
    """
    Batch process multiple human review decisions.
    Useful for approving/rejecting multiple test cases at once.
    """
    sess = get_session()
    results = []
    errors = []

    try:
        for decision in decisions:
            try:
                tc = sess.get(TestCase, decision.test_case_id)
                if not tc:
                    errors.append(f"Test case {decision.test_case_id} not found")
                    continue

                if decision.decision == "approve":
                    tc.status = "generated"
                elif decision.decision == "reject":
                    tc.status = "rejected"
                elif decision.decision == "regenerate":
                    tc.status = "stale"
                    tc.regeneration_count += 1
                    if decision.edits:
                        for field, value in decision.edits.items():
                            if hasattr(tc, field):
                                setattr(tc, field, value)

                review_event = ReviewEvent(
                    requirement_id=tc.requirement_id,
                    reviewer="human-qa",
                    action=decision.decision,
                    note=decision.notes or f"Batch {decision.decision}",
                    diffs=json.dumps(decision.edits) if decision.edits else None,
                    timestamp=datetime.datetime.now(datetime.timezone.utc),
                )
                sess.add(review_event)
                sess.add(tc)

                results.append({
                    "test_case_id": decision.test_case_id,
                    "decision": decision.decision,
                    "status": tc.status,
                })

            except Exception as e:
                errors.append(f"Test case {decision.test_case_id}: {str(e)}")

        sess.commit()

        return {
            "processed": len(results),
            "results": results,
            "errors": errors,
            "success": len(errors) == 0,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch review failed: {str(e)}")
    finally:
        sess.close()


@router.get("/api/review/pending-approval")
def get_pending_approval_testcases(doc_id: Optional[int] = None, limit: int = 50):
    """
    Get all test cases pending human approval.
    Useful for showing a queue of items that need human review.

    Filters for test cases in "preview" or "stale" status.
    """
    sess = get_session()
    try:
        stmt = select(TestCase).where(
            TestCase.status.in_(["preview", "stale"])
        )

        # Optionally filter by document
        if doc_id:
            req_ids = sess.exec(
                select(Requirement.id).where(Requirement.doc_id == doc_id)
            ).all()
            stmt = stmt.where(TestCase.requirement_id.in_(req_ids))

        test_cases = sess.exec(stmt.limit(limit)).all()

        results = []
        for tc in test_cases:
            req = sess.get(Requirement, tc.requirement_id)
            results.append({
                "test_case_id": tc.id,
                "test_case_identifier": tc.test_case_id,
                "test_type": tc.test_type,
                "status": tc.status,
                "requirement_id": req.requirement_id if req else None,
                "requirement_text": req.raw_text if req else None,
                "gherkin_preview": tc.gherkin[:100] + "..." if tc.gherkin and len(tc.gherkin) > 100 else tc.gherkin,
            })

        sess.close()
        return {
            "total_pending": len(results),
            "test_cases": results,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get pending items: {str(e)}")


@router.get("/api/review/audit-trail/{test_case_id}")
def get_test_case_audit_trail(test_case_id: int):
    """
    Get the complete audit trail of all decisions made on a test case.
    Shows judge evaluations, human decisions, edits, regenerations.
    """
    sess = get_session()
    try:
        tc = sess.get(TestCase, test_case_id)
        if not tc:
            raise HTTPException(status_code=404, detail="Test case not found")

        # Get all review events for this test case's requirement
        stmt = select(ReviewEvent).where(
            ReviewEvent.requirement_id == tc.requirement_id
        )
        events = sess.exec(stmt).all()

        audit_trail = []
        for event in sorted(events, key=lambda e: e.timestamp):
            audit_trail.append({
                "timestamp": event.timestamp.isoformat(),
                "reviewer": event.reviewer,
                "action": event.action,
                "note": event.note,
                "confidence": event.reviewer_confidence,
                "diffs": json.loads(event.diffs) if event.diffs else None,
            })

        sess.close()
        return {
            "test_case_id": test_case_id,
            "requirement_id": tc.requirement_id,
            "audit_trail": audit_trail,
            "total_events": len(audit_trail),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get audit trail: {str(e)}")
