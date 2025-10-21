import os
from typing import Dict, Any, List, Optional
from jira import JIRA, JIRAError
from dotenv import load_dotenv


load_dotenv()
JIRA_BASE_URL = os.getenv("JIRA_BASE_URL_PRAJNA")
JIRA_USER = os.getenv("JIRA_API_USER_PRAJNA")
JIRA_API_TOKEN = os.getenv("JIRA_API_TOKEN_PRAJNA")
JIRA_ORG_ID=os.getenv("JIRA_ORG_ID")


# Core: Create one or more JIRA "Test" issues from upstream Gemini TestCase JSON.
# Input payload shape (batch):
# {
#   "TestCase": [ { ...one test case... }, { ... }, ... ]
# }


def _get_jira_client(jira_config: Dict[str, Any]) -> JIRA:
    return JIRA(
        server=jira_config.get("url") or JIRA_BASE_URL,
        basic_auth=(
            jira_config.get("username") or JIRA_USER,
            jira_config.get("api_token") or JIRA_API_TOKEN,
        ),
    )



def resolve_issue_type(client: JIRA, project_key: str, preferred_names: List[str], explicit_id: Optional[str] = None) -> Dict[str, str]:
    """
    Return a valid issuetype dict for create_issue(fields=...).
    Priority:
      1) explicit_id (jira_config["issue_type_id"])
      2) first match by name from preferred_names (case-insensitive)
      3) fallback to first creatable type in the project

    Raises with a helpful message listing allowed types if none match.
    """
    # 1) If caller provided an explicit ID, use it directly
    if explicit_id:
        return {"id": explicit_id}

    meta = client.createmeta(projectKeys=project_key, expand="projects.issuetypes")
    projects = meta.get("projects") or []
    if not projects:
        raise RuntimeError(f"Cannot fetch create meta for project '{project_key}'. Check permissions and key.")

    issue_types = projects[0].get("issuetypes") or []
    # normalize list of available types
    by_name = {it.get("name", "").strip().lower(): it for it in issue_types if it.get("name")}
    # 2) Try preferred names
    for name in preferred_names:
        cand = by_name.get(name.strip().lower())
        if cand:
            # Jira Cloud likes id over name; id is unambiguous
            if "id" in cand:
                return {"id": cand["id"]}
            return {"name": cand["name"]}

    # 3) Fallback to first available type
    if issue_types:
        it = issue_types[0]
        return {"id": it["id"]} if "id" in it else {"name": it["name"]}

    # If we get here, we truly have nothing usable
    avail = ", ".join([it.get("name", "?") for it in issue_types])
    raise RuntimeError(f"No creatable issue types found for project '{project_key}'. Available: {avail or 'None'}")


def _format_list_block(title: str, items: List[str]) -> str:
    if not items:
        return f"h3. {title}\n_None_\n"
    lines = "\n".join([f"* {i}" for i in items])
    return f"h3. {title}\n{lines}\n"


def _format_kv_block(title: str, kv: Dict[str, Optional[str]]) -> str:
    parts = []
    for k, v in kv.items():
        v_disp = v if (v is not None and v != "") else "_None_"
        parts.append(f"* *{k}:* {v_disp}")
    return f"h3. {title}\n" + "\n".join(parts) + "\n"


def _format_steps_block(steps: Any) -> str:
    if not steps:
        return "h3. Test Steps\n_None_\n"
    rendered = []
    if isinstance(steps, list):
        for s in steps:
            if isinstance(s, dict) and "Step" in s:
                rendered.append(s["Step"])
            elif isinstance(s, str):
                rendered.append(s)
    content = "\n".join([f"# {line}" for line in rendered])
    return f"h3. Test Steps\n{content}\n"


def _format_acceptance_criteria_block(criteria: Any) -> str:
    if not criteria:
        return "h3. Acceptance Criteria\n_None_\n"
    items = []
    if isinstance(criteria, list):
        for c in criteria:
            if isinstance(c, dict) and "Criterion" in c:
                items.append(c["Criterion"])
            elif isinstance(c, str):
                items.append(c)
    return _format_list_block("Acceptance Criteria", items)


def _format_standards_block(std: Dict[str, Any]) -> str:
    return _format_kv_block(
        "Standards & Citations",
        {
            "IEC 62304": (std or {}).get("IEC62304Sections"),
            "FDA 21 CFR 820.30": (std or {}).get("FDA82030Sections"),
            "ISO 14971": (std or {}).get("ISO14971Sections"),
            "IEC 62366-1": (std or {}).get("IEC62366_1Sections"),
            "ISO/IEC 27001": (std or {}).get("ISO27001Sections"),
        },
    )


def _format_parsed_entities_block(pe: Dict[str, Any]) -> str:
    return _format_kv_block(
        "Parsed Entities",
        {
            "Actor": (pe or {}).get("Actor"),
            "Signal": (pe or {}).get("Signal"),
            "Comparator": (pe or {}).get("Comparator"),
            "Threshold": str((pe or {}).get("Threshold")) if (pe or {}).get("Threshold") is not None else None,
            "Units": (pe or {}).get("Units"),
            "Latency": (pe or {}).get("Latency"),
            "Mode": (pe or {}).get("Mode"),
            "Interface": (pe or {}).get("Interface"),
        },
    )


def _format_evidence_block(evd: Dict[str, Any]) -> str:
    logs_required = (evd or {}).get("LogsRequired")
    logs_required_disp = "true" if logs_required is True else ("false" if logs_required is False else "_None_")
    audit_fields = (evd or {}).get("AuditLogFields") or []
    if isinstance(audit_fields, list):
        audit_lines = "\n".join([f"* {f}" for f in audit_fields]) or "_None_"
    else:
        audit_lines = f"* {audit_fields}" if audit_fields else "_None_"
    return (
        "h3. Evidence\n"
        f"* *LogsRequired:* {logs_required_disp}\n"
        f"* *AuditLogFields:*\n{audit_lines}\n"
    )


def _format_traceability_block(tr: Dict[str, Any]) -> str:
    return _format_kv_block(
        "Traceability",
        {
            "RequirementLink": (tr or {}).get("RequirementLink"),
            "RiskControlLink": (tr or {}).get("RiskControlLink"),
            "ChangeSetLink": (tr or {}).get("ChangeSetLink"),
        },
    )


def _build_issue_description(tc: Dict[str, Any]) -> str:
    req_id = tc.get("RequirementID") or ""
    req_desc = tc.get("RequirementDescription") or ""
    obj = tc.get("TestObjective") or ""
    pre = tc.get("Preconditions") or ""
    exp = tc.get("ExpectedResult") or ""
    ver = tc.get("VerificationMethod") or ""
    safety_class = tc.get("SafetyClass") or "Unspecified"

    parsed_entities = _format_parsed_entities_block(tc.get("ParsedEntities") or {})
    standards = _format_standards_block(tc.get("Standards") or {})
    steps = _format_steps_block(tc.get("TestSteps"))
    acceptance = _format_acceptance_criteria_block(tc.get("AcceptanceCriteria"))
    evidence = _format_evidence_block(tc.get("Evidence") or {})
    trace = _format_traceability_block(tc.get("Traceability") or {})
    test_data = tc.get("TestData") or "_None_"

    return (
        f"*Requirement:* {req_id}\n"
        f"{{quote}}\n{req_desc}\n{{quote}}\n\n"
        f"h3. Test Objective\n{obj}\n\n"
        f"h3. Preconditions\n{pre}\n\n"
        f"h3. Verification Method\n{ver}\n\n"
        f"h3. Safety Class\n{safety_class}\n\n"
        f"h3. Test Data\n{test_data}\n\n"
        f"{parsed_entities}\n"
        f"{standards}\n"
        f"{steps}\n"
        f"{acceptance}\n"
        f"h3. Expected Result\n{exp}\n\n"
        f"{evidence}\n"
        f"{trace}\n"
    )


def create_jira_issues_from_testcases(
    jira_config: Dict[str, Any],
    payload: Dict[str, Any],
) -> List[str]:
    """
    Creates one JIRA issue per TestCase in payload["TestCase"].
    jira_config requires: url, username, api_token, project_key
    Optional: issue_type_name (default "Test"), issue_type_id (overrides name)
    Returns: list of created issue keys.
    """
    if "project_key" not in jira_config:
        raise ValueError("jira_config['project_key'] is required")

    preferred_names = [
        jira_config.get("issue_type_name") or "Test",
        "Test Case",
        "Task",
        "Story",
        "Bug",
    ]

    client = _get_jira_client(jira_config)
    issuetype = resolve_issue_type(
        client=client,
        project_key=jira_config["project_key"],
        preferred_names=preferred_names,
        explicit_id=jira_config.get("issue_type_id"),
    )

    testcases: List[Dict[str, Any]] = payload.get("TestCase") or []
    if not isinstance(testcases, list):
        raise ValueError("payload['TestCase'] must be a list")

    created_keys: List[str] = []

    for tc in testcases:
        req_id = tc.get("RequirementID") or "UNKNOWN-REQ"
        ver_method = tc.get("VerificationMethod") or "Test"
        summary = f"TC for {req_id} — {ver_method}"

        description = _build_issue_description(tc)
        fields = {
            "project": {"key": jira_config["project_key"]},
            "summary": summary[:255],
            "description": description,
            "issuetype": issuetype,  
        }

        try:
            new_issue = client.create_issue(fields=fields)
            created_keys.append(new_issue.key)
        except JIRAError as e:
            raise RuntimeError(
                f"JIRA API Error while creating issue for {req_id}: {e.status_code} - {e.text}"
            )
        except Exception as e:
            raise RuntimeError(f"Unexpected error while creating issue for {req_id}: {e}")

    return created_keys




if __name__ == "__main__":
    jira_config = {
        "url": JIRA_BASE_URL,
        "username": JIRA_USER,
        "api_token": JIRA_API_TOKEN,
        "project_key": "TCG",
        # "issue_type_name": "Bug"  # optional
    }
    payload= {
  "TestCase": [
    {
      "RequirementID": "REQ-AL-045",
      "RequirementDescription": "If SpO₂ < 88% the system SHALL alert clinician and log event in audit trail within 2 seconds.",
      "ParsedEntities": {
        "Actor": "clinician",
        "Signal": "SpO₂",
        "Comparator": "<",
        "Threshold": "88",
        "Units": "%",
        "Latency": "2 s",
        "Mode": None,
        "Interface": "audit trail"
      },
      "Standards": {
        "IEC62304Sections": "§5.7",
        "FDA82030Sections": "§820.30(f); §820.30(g)",
        "ISO14971Sections": None,
        "IEC62366_1Sections": None,
        "ISO27001Sections": None
      },
      "SafetyClass": "Unspecified",
      "Risk": None,
      "TestObjective": "Verify that the system alerts the clinician and logs the event within 2 seconds when SpO₂ drops below 88%.",
      "Preconditions": "The system is operational and monitoring SpO₂. The audit trail is enabled.",
      "TestData": "Simulated SpO₂ readings.",
      "TestSteps": [
        {
          "Step": "1. Set the simulated SpO₂ value to a stable reading above 88% (e.g., 95%)."
        },
        {
          "Step": "2. Monitor the system for alerts and the audit trail."
        },
        {
          "Step": "3. Immediately change the simulated SpO₂ value to a reading below 88% (e.g., 87%)."
        },
        {
          "Step": "4. Observe the system for a clinician alert and record the time the alert is triggered."
        },
        {
          "Step": "5. Check the audit trail for the logged event and record the timestamp of the log entry."
        }
      ],
      "ExpectedResult": "The system shall present an alert to the clinician and log the event in the audit trail within 2 seconds of the SpO₂ reading falling below 88%.",
      "AcceptanceCriteria": [
        {
          "Criterion": "Clinician alert is visible/audible within 2 seconds of SpO₂ dropping below 88%."
        },
        {
          "Criterion": "An event log entry corresponding to the SpO₂ < 88% condition is recorded in the audit trail within 2 seconds of the condition occurring."
        }
      ],
      "VerificationMethod": "Functional Test",
      "Evidence": {
        "LogsRequired": True,
        "AuditLogFields": [
          "UTC time",
          "Event type (e.g., Low SpO₂ Alarm)",
          "SpO₂ value",
          "Timestamp of event occurrence",
          "Timestamp of log entry"
        ]
      },
      "Traceability": {
        "RequirementLink": "REQ-AL-045",
        "RiskControlLink": None,
        "ChangeSetLink": None
      },
      "Toolchain": {
        "Jira": None
      }
    },
    {
      "RequirementID": "REQ-AL-045",
      "RequirementDescription": "If SpO₂ < 88% the system SHALL alert clinician and log event in audit trail within 2 seconds.",
      "ParsedEntities": {
        "Actor": "clinician",
        "Signal": "SpO₂",
        "Comparator": "<",
        "Threshold": "88",
        "Units": "%",
        "Latency": "2 s",
        "Mode": None,
        "Interface": "audit trail"
      },
      "Standards": {
        "IEC62304Sections": "§5.7",
        "FDA82030Sections": "§820.30(f); §820.30(g)",
        "ISO14971Sections": None,
        "IEC62366_1Sections": None,
        "ISO27001Sections": None
      },
      "SafetyClass": "Unspecified",
      "Risk": None,
      "TestObjective": "Verify that the system does not alert the clinician and does not log an event when SpO₂ is at or above 88%.",
      "Preconditions": "The system is operational and monitoring SpO₂. The audit trail is enabled.",
      "TestData": "Simulated SpO₂ readings.",
      "TestSteps": [
        {
          "Step": "1. Set the simulated SpO₂ value to exactly 88%."
        },
        {
          "Step": "2. Monitor the system for alerts and the audit trail for the specified 2-second window."
        },
        {
          "Step": "3. Set the simulated SpO₂ value to a stable reading above 88% (e.g., 95%)."
        },
        {
          "Step": "4. Monitor the system for alerts and the audit trail for the specified 2-second window."
        }
      ],
      "ExpectedResult": "The system shall not present an alert to the clinician and shall not log an event in the audit trail when the SpO₂ reading is at or above 88%.",
      "AcceptanceCriteria": [
        {
          "Criterion": "No clinician alert is presented when SpO₂ is 88%."
        },
        {
          "Criterion": "No clinician alert is presented when SpO₂ is above 88%."
        },
        {
          "Criterion": "No event log entry corresponding to a low SpO₂ alarm is recorded in the audit trail when SpO₂ is 88%."
        },
        {
          "Criterion": "No event log entry corresponding to a low SpO₂ alarm is recorded in the audit trail when SpO₂ is above 88%."
        }
      ],
      "VerificationMethod": "Negative Test",
      "Evidence": {
        "LogsRequired": True,
        "AuditLogFields": [
          "UTC time",
          "Event type (e.g., Low SpO₂ Alarm)",
          "SpO₂ value",
          "Timestamp of event occurrence",
          "Timestamp of log entry"
        ]
      },
      "Traceability": {
        "RequirementLink": "REQ-AL-045",
        "RiskControlLink": None,
        "ChangeSetLink": None
      },
      "Toolchain": {
        "Jira": None
      }
    },
    {
      "RequirementID": "REQ-AL-045",
      "RequirementDescription": "If SpO₂ < 88% the system SHALL alert clinician and log event in audit trail within 2 seconds.",
      "ParsedEntities": {
        "Actor": "clinician",
        "Signal": "SpO₂",
        "Comparator": "<",
        "Threshold": "88",
        "Units": "%",
        "Latency": "2 s",
        "Mode": None,
        "Interface": "audit trail"
      },
      "Standards": {
        "IEC62304Sections": "§5.7",
        "FDA82030Sections": "§820.30(f); §820.30(g)",
        "ISO14971Sections": None,
        "IEC62366_1Sections": None,
        "ISO27001Sections": None
      },
      "SafetyClass": "Unspecified",
      "Risk": None,
      "TestObjective": "Verify that the system alerts the clinician and logs the event within 2 seconds when SpO₂ is just below 88%.",
      "Preconditions": "The system is operational and monitoring SpO₂. The audit trail is enabled.",
      "TestData": "Simulated SpO₂ readings.",
      "TestSteps": [
        {
          "Step": "1. Set the simulated SpO₂ value to a stable reading above 88% (e.g., 90%)."
        },
        {
          "Step": "2. Monitor the system for alerts and the audit trail."
        },
        {
          "Step": "3. Immediately change the simulated SpO₂ value to 87.9%."
        },
        {
          "Step": "4. Observe the system for a clinician alert and record the time the alert is triggered."
        },
        {
          "Step": "5. Check the audit trail for the logged event and record the timestamp of the log entry."
        }
      ],
      "ExpectedResult": "The system shall present an alert to the clinician and log the event in the audit trail within 2 seconds of the SpO₂ reading falling to 87.9%.",
      "AcceptanceCriteria": [
        {
          "Criterion": "Clinician alert is visible/audible within 2 seconds of SpO₂ dropping to 87.9%."
        },
        {
          "Criterion": "An event log entry corresponding to the SpO₂ < 88% condition is recorded in the audit trail within 2 seconds of the condition occurring."
        }
      ],
      "VerificationMethod": "Boundary Test",
      "Evidence": {
        "LogsRequired": True,
        "AuditLogFields": [
          "UTC time",
          "Event type (e.g., Low SpO₂ Alarm)",
          "SpO₂ value",
          "Timestamp of event occurrence",
          "Timestamp of log entry"
        ]
      },
      "Traceability": {
        "RequirementLink": "REQ-AL-045",
        "RiskControlLink": None,
        "ChangeSetLink": None
      },
      "Toolchain": {
        "Jira": None
      }
    },
    {
      "RequirementID": "REQ-AL-045",
      "RequirementDescription": "If SpO₂ < 88% the system SHALL alert clinician and log event in audit trail within 2 seconds.",
      "ParsedEntities": {
        "Actor": "clinician",
        "Signal": "SpO₂",
        "Comparator": "<",
        "Threshold": "88",
        "Units": "%",
        "Latency": "2 s",
        "Mode": None,
        "Interface": "audit trail"
      },
      "Standards": {
        "IEC62304Sections": "§5.7",
        "FDA82030Sections": "§820.30(f); §820.30(g)",
        "ISO14971Sections": None,
        "IEC62366_1Sections": None,
        "ISO27001Sections": None
      },
      "SafetyClass": "Unspecified",
      "Risk": None,
      "TestObjective": "Verify the system's behavior when the SpO₂ sensor fails or provides invalid data.",
      "Preconditions": "The system is operational and monitoring SpO₂. The audit trail is enabled. A mechanism to simulate sensor faults is available.",
      "TestData": "Simulated SpO₂ sensor faults (e.g., disconnect, out-of-range values, checksum error).",
      "TestSteps": [
        {
          "Step": "1. Establish a stable SpO₂ reading above 88%."
        },
        {
          "Step": "2. Simulate a SpO₂ sensor disconnect."
        },
        {
          "Step": "3. Observe the system for alerts and check the audit trail within 2 seconds of the simulated fault."
        },
        {
          "Step": "4. Re-establish a valid SpO₂ reading below 88%."
        },
        {
          "Step": "5. Observe the system for alerts and check the audit trail within 2 seconds of the SpO₂ dropping below 88%."
        }
      ],
      "ExpectedResult": "Upon simulated sensor failure (e.g., disconnect), the system should ideally indicate a sensor fault, not trigger a low SpO₂ alarm, and potentially log a sensor fault event. Upon restoring a valid reading below 88%, the system shall alert and log as per the requirement.",
      "AcceptanceCriteria": [
        {
          "Criterion": "System indicates a sensor fault when the SpO₂ sensor signal is lost."
        },
        {
          "Criterion": "A low SpO₂ alarm (SpO₂ < 88%) is NOT triggered solely due to a sensor fault/disconnect."
        },
        {
          "Criterion": "When a valid SpO₂ reading below 88% is restored after a sensor fault, the system correctly triggers the low SpO₂ alarm and logs the event within 2 seconds."
        }
      ],
      "VerificationMethod": "Fault Injection",
      "Evidence": {
        "LogsRequired": True,
        "AuditLogFields": [
          "UTC time",
          "Event type (e.g., Sensor Fault, Low SpO₂ Alarm)",
          "SpO₂ value (if applicable)",
          "Timestamp of event occurrence",
          "Timestamp of log entry"
        ]
      },
      "Traceability": {
        "RequirementLink": "REQ-AL-045",
        "RiskControlLink": None,
        "ChangeSetLink": None
      },
      "Toolchain": {
        "Jira": None
      }
    }
  ]
}
    keys = create_jira_issues_from_testcases(jira_config, payload)
    print(keys)
    