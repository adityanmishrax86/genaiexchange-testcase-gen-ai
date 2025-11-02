"""Router for LLM-as-a-Judge evaluation of generated test cases."""
import json
import logging
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from src.db import get_session
from src.models import TestCase, Requirement, ReviewEvent
from src.services.gemini_client import GeminiClient, JudgeVerdict
import os
import datetime

router = APIRouter()
logger = logging.getLogger("judge")
logger.setLevel(logging.INFO)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
JUDGE_MODEL = os.getenv("JUDGE_MODEL", "gemini-2.5-pro")


class JudgeEvaluationRequest(BaseModel):
    """Request to evaluate a test case."""

    test_case_id: int
    requirement_id: Optional[int] = None
    judge_model: Optional[str] = None  # Override default judge model


class BatchJudgeRequest(BaseModel):
    """Batch evaluation of multiple test cases."""

    test_case_ids: List[int]
    judge_model: Optional[str] = None


class JudgeEvaluationResponse(BaseModel):
    """Judge evaluation result with detailed rubric."""

    test_case_id: int
    feedback: str
    evaluation: str
    total_rating: int
    correctness_of_trigger: Optional[float] = None
    timing_and_latency: Optional[float] = None
    actions_and_priority: Optional[float] = None
    logging_and_traceability: Optional[float] = None
    standards_citations: Optional[float] = None
    boundary_readiness: Optional[float] = None
    consistency_and_no_hallucination: Optional[float] = None
    confidence_and_warnings: Optional[float] = None
    evaluated_at: str


@router.post("/api/judge/evaluate", response_model=JudgeEvaluationResponse)
def evaluate_test_case(request: JudgeEvaluationRequest):
    """
    Use judge LLM to evaluate a generated test case.
    Returns detailed rubric scores (1-4 scale).

    Perfect for human-in-the-loop: frontend shows scores and asks
    human QA whether to regenerate or approve.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    try:
        sess = get_session()
        tc = sess.get(TestCase, request.test_case_id)

        if not tc:
            sess.close()
            raise HTTPException(status_code=404, detail="Test case not found")

        req = sess.get(Requirement, tc.requirement_id)
        if not req:
            sess.close()
            raise HTTPException(status_code=404, detail="Requirement not found")

        # Build judge prompt
        judge_input = {
            "requirement": json.loads(req.structured) if req.structured else {},
            "test_case": {
                "gherkin": tc.gherkin,
                "evidence": json.loads(tc.evidence_json) if tc.evidence_json else [],
                "automated_steps": json.loads(tc.automated_steps_json)
                if tc.automated_steps_json
                else [],
                "sample_data": json.loads(tc.sample_data_json) if tc.sample_data_json else {},
            },
        }

        # Initialize judge client
        judge_client = GeminiClient(
            api_key=GEMINI_API_KEY,
            model_name=request.judge_model or JUDGE_MODEL,
        )

        # Build judge prompt
        judge_prompt = judge_client.build_judge_prompt(
            "judge_prompt_v1.txt",
            question="Evaluate this test case",
            answer=json.dumps(judge_input, indent=2),
        )

        # Get judge verdict
        verdict_response = judge_client.generate_structured_response(
            judge_prompt, response_schema=JudgeVerdict
        )

        # Parse verdict
        verdict_json = json.loads(verdict_response) if isinstance(
            verdict_response, str
        ) else verdict_response
        verdict = JudgeVerdict(**verdict_json)

        # Store evaluation result (optional: create ReviewEvent for audit trail)
        review_event = ReviewEvent(
            requirement_id=tc.requirement_id,
            reviewer="judge-llm",
            action="judge_evaluation",
            note=verdict.feedback,
            reviewer_confidence=verdict.total_rating / 4.0,  # Normalize to 0-1
            timestamp=datetime.datetime.now(datetime.timezone.utc),
        )
        sess.add(review_event)
        sess.commit()
        sess.close()

        return JudgeEvaluationResponse(
            test_case_id=request.test_case_id,
            feedback=verdict.feedback,
            evaluation=verdict.evaluation,
            total_rating=verdict.total_rating,
            correctness_of_trigger=verdict.correctness_of_trigger,
            timing_and_latency=verdict.timing_and_latency,
            actions_and_priority=verdict.actions_and_priority,
            logging_and_traceability=verdict.logging_and_traceability,
            standards_citations=verdict.standards_citations,
            boundary_readiness=verdict.boundary_readiness,
            consistency_and_no_hallucination=verdict.consistency_and_no_hallucination,
            confidence_and_warnings=verdict.confidence_and_warnings,
            evaluated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Judge evaluation failed for test case {request.test_case_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Judge evaluation failed: {str(e)}")


@router.post("/api/judge/evaluate-batch")
def evaluate_batch(request: BatchJudgeRequest):
    """
    Evaluate multiple test cases in batch.
    Returns list of evaluations with detailed scores.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    evaluations = []
    errors = []

    sess = get_session()

    for tc_id in request.test_case_ids:
        try:
            tc = sess.get(TestCase, tc_id)
            if not tc:
                errors.append(f"Test case {tc_id} not found")
                continue

            req = sess.get(Requirement, tc.requirement_id)
            if not req:
                errors.append(f"Requirement for test case {tc_id} not found")
                continue

            # Build judge input
            judge_input = {
                "requirement": json.loads(req.structured) if req.structured else {},
                "test_case": {
                    "gherkin": tc.gherkin,
                    "evidence": json.loads(tc.evidence_json) if tc.evidence_json else [],
                    "automated_steps": json.loads(tc.automated_steps_json)
                    if tc.automated_steps_json
                    else [],
                    "sample_data": json.loads(tc.sample_data_json)
                    if tc.sample_data_json
                    else {},
                },
            }

            # Initialize judge client
            judge_client = GeminiClient(
                api_key=GEMINI_API_KEY,
                model_name=request.judge_model or JUDGE_MODEL,
            )

            # Get judge verdict
            judge_prompt = judge_client.build_judge_prompt(
                "judge_prompt_v1.txt",
                question="Evaluate this test case",
                answer=json.dumps(judge_input, indent=2),
            )

            verdict_response = judge_client.generate_structured_response(
                judge_prompt, response_schema=JudgeVerdict
            )

            verdict_json = json.loads(verdict_response) if isinstance(
                verdict_response, str
            ) else verdict_response
            verdict = JudgeVerdict(**verdict_json)

            evaluations.append({
                "test_case_id": tc_id,
                "feedback": verdict.feedback,
                "total_rating": verdict.total_rating,
                "correctness_of_trigger": verdict.correctness_of_trigger,
                "timing_and_latency": verdict.timing_and_latency,
                "actions_and_priority": verdict.actions_and_priority,
                "logging_and_traceability": verdict.logging_and_traceability,
                "standards_citations": verdict.standards_citations,
                "boundary_readiness": verdict.boundary_readiness,
                "consistency_and_no_hallucination": verdict.consistency_and_no_hallucination,
                "confidence_and_warnings": verdict.confidence_and_warnings,
            })

            # Create review event
            review_event = ReviewEvent(
                requirement_id=tc.requirement_id,
                reviewer="judge-llm",
                action="judge_evaluation",
                note=verdict.feedback,
                reviewer_confidence=verdict.total_rating / 4.0,
                timestamp=datetime.datetime.now(datetime.timezone.utc),
            )
            sess.add(review_event)

        except Exception as e:
            logger.error(f"Judge evaluation failed for test case {tc_id}: {e}")
            errors.append(f"Test case {tc_id}: {str(e)}")

    sess.commit()
    sess.close()

    return {
        "evaluations": evaluations,
        "total_evaluated": len(evaluations),
        "errors": errors,
        "success": len(errors) == 0,
    }


@router.get("/api/judge/scores/{test_case_id}")
def get_judge_scores(test_case_id: int):
    """
    Retrieve cached judge evaluation scores for a test case.
    Used for reviewing what the judge said about this test case.
    """
    sess = get_session()
    try:
        tc = sess.get(TestCase, test_case_id)
        if not tc:
            raise HTTPException(status_code=404, detail="Test case not found")

        # Retrieve judge evaluations from ReviewEvent
        from sqlmodel import select
        stmt = select(ReviewEvent).where(
            (ReviewEvent.requirement_id == tc.requirement_id)
            & (ReviewEvent.reviewer == "judge-llm")
        )
        reviews = sess.exec(stmt).all()

        if not reviews:
            return {
                "test_case_id": test_case_id,
                "evaluated": False,
                "message": "No judge evaluation found for this test case",
            }

        # Return most recent evaluation
        latest = max(reviews, key=lambda r: r.timestamp)

        return {
            "test_case_id": test_case_id,
            "evaluated": True,
            "feedback": latest.note,
            "confidence": latest.reviewer_confidence,
            "evaluated_at": latest.timestamp.isoformat(),
        }

    finally:
        sess.close()
