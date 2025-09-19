from fastapi import APIRouter, Body, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Any
from src.db import get_session
from src.models import TestCase, Requirement
from src.services.jira_client import create_jira_issue
from sqlmodel import select
import json, tempfile, os, csv, datetime
from fastapi.responses import FileResponse

router = APIRouter()

class JiraConfig(BaseModel):
    url: str
    project_key: str
    api_token: str
    username: str # Your email address

class JiraExportPayload(BaseModel):
    jira_config: JiraConfig
    test_case_ids: List[int]

@router.post("/api/export/jira")
def push_to_jira(payload: JiraExportPayload):
    """
    Receives a list of test case IDs and pushes them as new issues to JIRA.
    """
    created_issue_keys = []
    errors = []
    
    with get_session() as sess:
        for tc_id in payload.test_case_ids:
            test_case = sess.get(TestCase, tc_id)
            if not test_case:
                errors.append(f"Test Case with ID {tc_id} not found.")
                continue

            requirement = sess.get(Requirement, test_case.requirement_id)
            if not requirement:
                errors.append(f"Requirement for Test Case ID {tc_id} not found.")
                continue
            
            try:
                test_case_dict = test_case.model_dump()
                requirement_dict = requirement.model_dump()
                
                jira_config_dict = payload.jira_config.model_dump()
                
                new_key = create_jira_issue(jira_config_dict, test_case_dict, requirement_dict)
                
                test_case.jira_issue_key = new_key
                test_case.status = "pushed"
                sess.add(test_case)
                sess.commit()
                
                created_issue_keys.append(new_key)

            except Exception as e:
                errors.append(f"Failed to create issue for Test Case {test_case.test_case_id}: {e}")

    if errors:
        if created_issue_keys:
             raise HTTPException(
                status_code=207, 
                detail={"message": "Partial success", "created_issues": created_issue_keys, "errors": errors}
            )
        else:
            raise HTTPException(status_code=500, detail={"message": "Failed to create any issues", "errors": errors})

    return {"message": "Success", "created_issues_count": len(created_issue_keys), "issue_keys": created_issue_keys}

@router.get("/api/export/traceability_matrix")
def export_traceability_matrix(doc_id: int = Query(...)):
    """
    Generates a CSV Traceability Matrix for a given document.
    """
    with get_session() as sess:
        requirements = sess.exec(
            select(Requirement)
            .where(Requirement.doc_id == doc_id)
            .where(Requirement.status != "archived")
        ).all()

        if not requirements:
            raise HTTPException(status_code=404, detail="No requirements found for this document.")

        fd, tmp_path = tempfile.mkstemp(suffix=".csv")
        
        with os.fdopen(fd, "w", newline="", encoding="utf-8") as csvfile:
            fieldnames = ["Requirement ID", "Requirement Text", "Test Case ID", "Test Case Status"]
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()

            for req in requirements:
                test_cases = sess.exec(
                    select(TestCase).where(TestCase.requirement_id == req.id)
                ).all()

                if not test_cases:
                    writer.writerow({
                        "Requirement ID": req.requirement_id or f"REQ-{req.id}",
                        "Requirement Text": req.raw_text,
                        "Test Case ID": "N/A",
                        "Test Case Status": "N/A",
                    })
                else:
                    for tc in test_cases:
                        writer.writerow({
                            "Requirement ID": req.requirement_id or f"REQ-{req.id}",
                            "Requirement Text": req.raw_text,
                            "Test Case ID": tc.test_case_id,
                            "Test Case Status": tc.status,
                        })

    return FileResponse(
        tmp_path, 
        filename=f"traceability_matrix_{doc_id}_{int(datetime.datetime.now().timestamp())}.csv", 
        media_type="text/csv"
    )