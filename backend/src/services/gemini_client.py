# evalution methods for the judge LLM to implement LLM-as-as-Judge method.
from google import genai
from typing import Dict,Any, Optional,List,Union
from pydantic import BaseModel
import os,json, logging
from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(
    format='%(asctime)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

GEMINI_API_KEY=os.getenv('GEMINI_API_KEY')
_PROMPT_DIR = os.path.join(os.path.dirname(__file__), "prompts")

class Trigger(BaseModel):
    metric: str
    operator: str
    value: Union[int, float, str]

# pydantic converts Dict[str, float] to JSON schema, it creates:
#{
#  "type": "object",
#  "additionalProperties": {"type": "number"}  // ❌ Gemini rejects this
#}

class FieldConfidences(BaseModel):
    requirement_id: float
    type: float
    subject: float
    trigger: float
    actions: float
    timing_ms: float
    numbers_units: float

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



class GeminiClient:
    def __init__(self, api_key:str, model_name:str):
        self.api_key=api_key
        self.model_name=model_name

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
    gemini_client=GeminiClient(api_key=GEMINI_API_KEY, model_name="gemini-2.5-flash-lite")
    test="REQ-AL-045: If SpO₂ < 88% the system SHALL alert clinician and log event in audit trail within 2 seconds."
    prompt=gemini_client.build_prompt("extraction_prompt.txt",test)
    response=gemini_client.generate_structured_response(prompt,response_schema=ExtractionResponse)
    print(response)






