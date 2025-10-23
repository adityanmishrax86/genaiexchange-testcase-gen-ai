# evalution methods for the judge LLM to implement LLM-as-as-Judge method.
import os,json, logging
import time
import re
from google import genai
from typing import Dict,Any, Optional,List,Union
from pydantic import BaseModel, Field
import enum
from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(
    format='%(asctime)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

GEMINI_API_KEY=os.getenv('GEMINI_API_KEY')
_PROMPT_DIR = os.path.join(os.path.dirname(__file__), "prompts")

class TriggerOperator(enum.Enum):
    lt = "<"
    le = "<="
    eq = "=="
    gt = ">"
    ge = ">="
    ne = "!="
    outside_range = "outside_range"   # allows: {"min":..., "max":...} or a string
    inside_range = "inside_range"
    rising_edge = "rising_edge"
    falling_edge = "falling_edge"
    
class Trigger(BaseModel):
    metric: str
    operator: Union[str, TriggerOperator]  
    value: Union[int, float, str]
    unit: Optional[str] = None  

# pydantic converts Dict[str, float] to JSON schema, it creates:
#{
#  "type": "object",
#  "additionalProperties": {"type": "number"}  // ❌ Gemini rejects this
#}
# so spread the nested pydantic model or create a wrapper class 
    
class JudgeVerdict(BaseModel):
    feedback: str                      # one-line summary
    evaluation: str                    # short rationale
    total_rating: int = Field(ge=1, le=4)
    # Optional rubric subscores (flattened to avoid nested types)
    correctness_of_trigger: Optional[float] = Field(None, ge=0, le=1)
    timing_and_latency: Optional[float] = Field(None, ge=0, le=1)
    actions_and_priority: Optional[float] = Field(None, ge=0, le=1)
    logging_and_traceability: Optional[float] = Field(None, ge=0, le=1)
    standards_citations: Optional[float] = Field(None, ge=0, le=1)
    boundary_readiness: Optional[float] = Field(None, ge=0, le=1)
    consistency_and_no_hallucination: Optional[float] = Field(None, ge=0, le=1)
    confidence_and_warnings: Optional[float] = Field(None, ge=0, le=1)

class FieldConfidences(BaseModel):
    requirement_id: Optional[float] = None
    type: Optional[float] = None
    subject: Optional[float] = None
    trigger: Optional[float] = None
    actions: Optional[float] = None
    timing_ms: Optional[float] = None
    numbers_units: Optional[float] = None

class ExtractionResponse(BaseModel):
    requirement_id: Optional[str] = None
    type: str
    subject: str
    trigger: Optional[Trigger] = None
    actions: List[str]
    timing_ms: Optional[int] = None
    numbers_units: List[str]
    field_confidences: FieldConfidences
    confidence_reasoning: Optional[str] = None
    thinking_reasoning:Optional[str]=None


# based on xml schema
class ParsedEntities(BaseModel):
    Actor: Optional[str] = None
    Signal: Optional[str] = None
    Comparator: Optional[str] = None
    Threshold: Optional[Union[int, float, str]] = None
    Units: Optional[str] = None
    Latency: Optional[str] = None
    Mode: Optional[str] = None
    Interface: Optional[str] = None


class Standards(BaseModel):
    IEC62304Sections: Optional[str] = None
    FDA82030Sections: Optional[str] = None
    ISO14971Sections: Optional[str] = None
    IEC62366_1Sections: Optional[str] = None
    ISO27001Sections: Optional[str] = None


class SafetyClassEnum(enum.Enum):
    Unspecified = "Unspecified"
    A = "A"
    B = "B"
    C = "C"


class Risk(BaseModel):
    HazardDescription: Optional[str] = None
    RiskControl: Optional[str] = None


class TestSteps(BaseModel):
    Step: List[str]


class AcceptanceCriteria(BaseModel):
    Criterion: Optional[str] = None


class Evidence(BaseModel):
    LogsRequired: bool
    AuditLogFields: Optional[str] = None


class Traceability(BaseModel):
    RequirementLink: Optional[str] = None
    RiskControlLink: Optional[str] = None
    ChangeSetLink: Optional[str] = None


class JiraTool(BaseModel):
    IssueType: Optional[str] = None
    Summary: Optional[str] = None


class Toolchain(BaseModel):
    Jira: Optional[JiraTool] = None


class TestCase(BaseModel):
    RequirementID: Optional[str] = None
    RequirementDescription: Optional[str] = None
    ParsedEntities: Optional[ParsedEntities] = None
    Standards: Optional[Standards] = None
    SafetyClass: Optional[Union[str, SafetyClassEnum]] = None
    Risk: Optional[Risk] = None
    TestObjective: Optional[str] = None
    Preconditions: Optional[str] = None
    TestData: Optional[str] = None
    TestSteps: Optional[TestSteps] = None
    ExpectedResult: Optional[str] = None
    AcceptanceCriteria: Optional[AcceptanceCriteria] = None
    VerificationMethod: Optional[str] = None
    Evidence: Optional[Evidence] = None
    Traceability: Optional[Traceability] = None
    Toolchain: Optional[Toolchain] = None

# top level test case schema, batch or single
class TestCaseBatch(BaseModel):
    TestCase: List[TestCase]

class GeminiClient:
    def __init__(self, api_key:str, model_name:str):
        self.api_key=api_key
        self.model_name=model_name

    # TODO convert this into a common prompt template
    def build_prompt(self, template_filepath:str,test_content:str):
        """
        reads the prompt template and inserts the test content
        """
        try:
            with open(os.path.join(_PROMPT_DIR, template_filepath), 'r',encoding='utf-8') as f:
                prompt_template=f.read()
        except FileNotFoundError:
            logging.error(f"CRITICAL: template file '{template_filepath}' not found in prompts/ directory.")
            raise
        
        return prompt_template.replace("{{TEXT_TO_ANALYZE}}",test_content)

    def build_judge_prompt(self,template_filepath:str,question:str, answer:Any):
        """
        reads the prompt template and insert the QA pair to be verified
    
        """
        try:
            
            with open(os.path.join(_PROMPT_DIR, template_filepath),"r", encoding="utf-8") as f:
                prompt_template=f.read()
        except FileNotFoundError:
            logging.error(f"CRITICAL: template file '{template_filepath}' not found in prompts/ directory.")
            raise
        
        prompt_template.replace("{{QUESTION}}", question)
        prompt_template.replace("{{ANSWER}}", answer)
        
        return prompt_template
        
            
        
    
    def generate_structured_response(self, contents:str, response_schema:Optional[Any]=None):
        '''
        Generate structured response and JSON parse them into dict.
        '''
        client=genai.Client(
            api_key=self.api_key,
        )
        response=client.models.generate_content(
            model=self.model_name,
            contents=contents,
            config={
                "response_mime_type":"application/json",
                "response_schema":response_schema
            }
            
        )
        # return response.parsed or None
        return response.text or " "


if __name__=="__main__":
    evaluator=GeminiClient(api_key=GEMINI_API_KEY, model_name="gemini-2.5-flash-lite")
    test="REQ-AL-045: If SpO₂ < 88% the system SHALL alert clinician and log event in audit trail within 2 seconds."
    # test="System shall reject sensor readings outside valid range (20-600 mg/dL)"
    prompt=evaluator.build_prompt("extraction_prompt_v2.txt",test)
    evaluator_response=evaluator.generate_structured_response(prompt,response_schema=TestCaseBatch)

    logging.info(f"The evaluator result is {evaluator_response}")
    #  add 1 second gap to prevent rate limiting
    # time.sleep(1)
    judge=GeminiClient(api_key=GEMINI_API_KEY, model_name="gemini-2.5-pro")
    judge_insruction=judge.build_judge_prompt("judge_prompt_v1.txt", question=test, answer=evaluator_response)
    judge_verdict=judge.generate_structured_response(judge_insruction, response_schema=JudgeVerdict)

    logging.info(f"The verdict is {judge_verdict}")






