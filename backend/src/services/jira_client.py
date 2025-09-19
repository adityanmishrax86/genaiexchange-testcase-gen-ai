from jira import JIRA, JIRAError
from typing import Dict, Any

def create_jira_issue(jira_config: Dict[str, Any], test_case: Dict[str, Any], requirement: Dict[str, Any]) -> str:
    """
    Connects to JIRA and creates a new issue from a test case.

    :param jira_config: A dict with 'url', 'username' (email), and 'api_token'.
    :param test_case: A dict representing the test case.
    :param requirement: A dict representing the original requirement.
    :return: The key of the newly created JIRA issue (e.g., "PROJ-123").
    """
    try:
        # Establish connection to the JIRA Cloud instance
        jira_client = JIRA(
            server=jira_config["url"],
            basic_auth=(jira_config["username"], jira_config["api_token"])
        )

        # Prepare the fields for the new JIRA issue
        issue_fields = {
            "project": {"key": jira_config["project_key"]},
            "summary": f"Test Case: {test_case['test_case_id']}",
            "description": f"""
*Generated Test Case for Requirement: {requirement['requirement_id']}*

h2. Gherkin Script
{{code:gherkin}}
{test_case['gherkin']}
{{code}}

h2. Original Requirement
{{quote}}
{requirement['raw_text']}
{{quote}}
            """,
            "issuetype": {"name": "Test"},  
        }

        # Create the issue
        new_issue = jira_client.create_issue(fields=issue_fields)
        return new_issue.key

    except JIRAError as e:
        raise RuntimeError(f"JIRA API Error: {e.status_code} - {e.text}")
    except Exception as e:
        raise RuntimeError(f"An unexpected error occurred with JIRA: {e}")