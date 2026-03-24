from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
from google import genai 
import json
import re
# Deben quedar así, con el # al principio:
# from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.getenv('DB_NAME', 'crash_database')]

# COMENTA ESTAS LÍNEAS (Línea 12 aproximadamente)
# from emergentintegrations.llm.chat import LlmChat, UserMessage

# Create the main app
app = FastAPI(title="C.R.A.S.H. API", description="Collision Response and Safety Hardware")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")
@app.on_event("startup")
async def startup_db_client():
    try:
        await client.admin.command('ping')
        print(" Conexión exitosa a MongoDB: crash_database está lista.")
    except Exception as e:
        print(f"Error al conectar a MongoDB: {e}")
# ==================== MODELS ====================

class EmergencyContact(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: str
    relationship: str
    is_primary: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

class EmergencyContactCreate(BaseModel):
    name: str
    phone: str
    relationship: str
    is_primary: bool = False

class ImpactEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    g_force: float
    acceleration_x: float
    acceleration_y: float
    acceleration_z: float
    gyro_x: float
    gyro_y: float
    gyro_z: float
    severity: str  # low, medium, high, critical
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    was_false_alarm: bool = False
    ai_diagnosis: Optional[str] = None
    first_aid_guide: Optional[str] = None

class ImpactEventCreate(BaseModel):
    g_force: float
    acceleration_x: float
    acceleration_y: float
    acceleration_z: float
    gyro_x: float
    gyro_y: float
    gyro_z: float
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class DeviceSettings(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    device_name: str = "CASCO_V2.0"
    impact_threshold: float = 5.0  # G-force threshold
    countdown_seconds: int = 30
    auto_call_enabled: bool = True
    sms_enabled: bool = True
    message_type: str = "sms"  # "sms" or "whatsapp"
    language: str = "es"  # es or en
    theme: str = "dark"  # dark or light
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class DeviceSettingsUpdate(BaseModel):
    device_name: Optional[str] = None
    impact_threshold: Optional[float] = None
    countdown_seconds: Optional[int] = None
    auto_call_enabled: Optional[bool] = None
    sms_enabled: Optional[bool] = None
    message_type: Optional[str] = None  # "sms" or "whatsapp"
    language: Optional[str] = None
    theme: Optional[str] = None

class UserProfile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    blood_type: Optional[str] = None
    allergies: Optional[str] = None
    medical_conditions: Optional[str] = None
    emergency_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserProfileCreate(BaseModel):
    name: str
    blood_type: Optional[str] = None
    allergies: Optional[str] = None
    medical_conditions: Optional[str] = None
    emergency_notes: Optional[str] = None

class AIDiagnosisRequest(BaseModel):
    g_force: float
    acceleration_x: float
    acceleration_y: float
    acceleration_z: float
    gyro_x: float
    gyro_y: float
    gyro_z: float
    blood_type: Optional[str] = None
    allergies: Optional[str] = None
    medical_conditions: Optional[str] = None
    language: str = "es"

class AIDiagnosisResponse(BaseModel):
    severity_assessment: str
    probable_injuries: List[str]
    first_aid_steps: List[str]
    warnings: List[str]
    recommendation: str

# ==================== HELPER FUNCTIONS ====================

def classify_severity(g_force: float) -> str:
    """Classify impact severity based on G-force"""
    if g_force < 5:
        return "low"
    elif g_force < 10:
        return "medium"
    elif g_force < 15:
        return "high"
    else:
        return "critical"

import google.generativeai as genai
import json
import re
import os
import logging
import uuid

async def get_ai_diagnosis(data: AIDiagnosisRequest) -> AIDiagnosisResponse:
    """
    Obtiene el diagnóstico de la IA utilizando el SDK oficial de Google Generative AI.
    Implementa un sistema de respaldo (fallback) en caso de error de red o de API.
    """
    try:
        # 1. Configuración del Cliente
        api_key = os.getenv("EMERGENT_LLM_KEY")
        if not api_key:
            raise ValueError("La clave EMERGENT_LLM_KEY no está configurada en el archivo .env")
            
        genai.configure(api_key=api_key)
        
        # Seleccionar el modelo
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # 2. Preparación de variables
        severity = classify_severity(data.g_force)
        lang = "Spanish" if data.language == "es" else "English"
        
        system_context = (
            "You are an emergency medical AI assistant for the C.R.A.S.H. system. "
            "Analyze motorcycle accident telemetry and provide guidance. "
            "Focus on actionable guidance for bystanders. Not a professional medical diagnosis."
        )
        
        prompt = f"""{system_context}
        
        Analyze this motorcycle accident impact data and provide emergency guidance in {lang}:

        IMPACT DATA:
        - G-Force: {data.g_force:.2f}G
        - Acceleration: X={data.acceleration_x:.2f}, Y={data.acceleration_y:.2f}, Z={data.acceleration_z:.2f}
        - Gyroscope: X={data.gyro_x:.2f}, Y={data.gyro_y:.2f}, Z={data.gyro_z:.2f}
        - Severity Classification: {severity.upper()}

        RIDER MEDICAL INFO:
        - Blood Type: {data.blood_type or 'Unknown'}
        - Allergies: {data.allergies or 'None reported'}
        - Medical Conditions: {data.medical_conditions or 'None reported'}

        Provide your analysis in this EXACT JSON format:
        {{
            "severity_assessment": "Brief assessment",
            "probable_injuries": ["injury1", "injury2"],
            "first_aid_steps": ["step1", "step2"],
            "warnings": ["warning1", "warning2"],
            "recommendation": "Final recommendation"
        }}"""

        # 3. Llamada a la IA
        response = model.generate_content(prompt)
        response_text = response.text

        # 4. Procesamiento de la respuesta (Extracción de JSON)
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if json_match:
            diagnosis_data = json.loads(json_match.group())
            return AIDiagnosisResponse(**diagnosis_data)
        else:
            raise ValueError("No se encontró un formato JSON válido en la respuesta de la IA")
            
    except Exception as e:
        # 5. Sistema de Fallback (Respaldo en caso de error)
        logging.error(f"AI Diagnosis error: {e}")
        
        severity = classify_severity(data.g_force)
        
        if data.language == "es":
            return AIDiagnosisResponse(
                severity_assessment=f"Impacto detectado (Fuerza G: {data.g_force:.1f}). Clasificación: {severity}.",
                probable_injuries=["Posible trauma craneal", "Contusiones múltiples", "Posibles fracturas"],
                first_aid_steps=[
                    "No mover a la víctima bajo ninguna circunstancia",
                    "Llamar inmediatamente al 911",
                    "NO QUITAR EL CASCO (puede empeorar lesiones cervicales)",
                    "Verificar si la víctima está consciente y respira",
                    "Hablar con la víctima para mantenerla despierta"
                ],
                warnings=[
                    "Riesgo inminente de lesión en columna vertebral",
                    "No administrar agua ni alimentos"
                ],
                recommendation="Mantener la calma. Asegurar el área del accidente y esperar a los servicios profesionales."
            )
        else:
            return AIDiagnosisResponse(
                severity_assessment=f"Impact detected ({data.g_force:.1f}G). Severity: {severity}.",
                probable_injuries=["Possible head trauma", "Multiple contusions", "Possible fractures"],
                first_aid_steps=[
                    "Do not move the victim under any circumstances",
                    "Call 911 immediately",
                    "DO NOT REMOVE THE HELMET",
                    "Check if the victim is conscious and breathing",
                    "Keep the victim awake by talking to them"
                ],
                warnings=[
                    "Risk of spinal cord injury",
                    "Do not provide liquids or food"
                ],
                recommendation="Stay calm. Secure the accident scene and wait for professional emergency services."
            )
# ==================== ROUTES ====================

@api_router.get("/")
async def root():
    return {"message": "C.R.A.S.H. API - Collision Response and Safety Hardware", "version": "2.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# Emergency Contacts
@api_router.post("/contacts", response_model=EmergencyContact)
async def create_contact(contact: EmergencyContactCreate):
    contact_obj = EmergencyContact(**contact.dict())
    await db.emergency_contacts.insert_one(contact_obj.dict())
    return contact_obj

@api_router.get("/contacts", response_model=List[EmergencyContact])
async def get_contacts():
    contacts = await db.emergency_contacts.find().to_list(100)
    return [EmergencyContact(**c) for c in contacts]

@api_router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str):
    result = await db.emergency_contacts.delete_one({"id": contact_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"message": "Contact deleted"}

@api_router.put("/contacts/{contact_id}", response_model=EmergencyContact)
async def update_contact(contact_id: str, contact: EmergencyContactCreate):
    contact_dict = contact.dict()
    contact_dict["id"] = contact_id
    result = await db.emergency_contacts.update_one(
        {"id": contact_id},
        {"$set": contact_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    updated = await db.emergency_contacts.find_one({"id": contact_id})
    return EmergencyContact(**updated)

# Impact Events
@api_router.post("/impacts", response_model=ImpactEvent)
async def create_impact(impact: ImpactEventCreate):
    severity = classify_severity(impact.g_force)
    impact_obj = ImpactEvent(
        **impact.dict(),
        severity=severity
    )
    await db.impact_events.insert_one(impact_obj.dict())
    return impact_obj

@api_router.get("/impacts", response_model=List[ImpactEvent])
async def get_impacts(limit: int = 50):
    impacts = await db.impact_events.find().sort("timestamp", -1).to_list(limit)
    return [ImpactEvent(**i) for i in impacts]

@api_router.get("/impacts/{impact_id}", response_model=ImpactEvent)
async def get_impact(impact_id: str):
    impact = await db.impact_events.find_one({"id": impact_id})
    if not impact:
        raise HTTPException(status_code=404, detail="Impact not found")
    return ImpactEvent(**impact)

@api_router.put("/impacts/{impact_id}/false-alarm")
async def mark_false_alarm(impact_id: str):
    result = await db.impact_events.update_one(
        {"id": impact_id},
        {"$set": {"was_false_alarm": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Impact not found")
    return {"message": "Marked as false alarm"}

# Device Settings
@api_router.get("/settings", response_model=DeviceSettings)
async def get_settings():
    settings = await db.device_settings.find_one({})
    if not settings:
        default_settings = DeviceSettings()
        await db.device_settings.insert_one(default_settings.dict())
        return default_settings
    return DeviceSettings(**settings)

@api_router.put("/settings", response_model=DeviceSettings)
async def update_settings(settings: DeviceSettingsUpdate):
    update_data = {k: v for k, v in settings.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    existing = await db.device_settings.find_one({})
    if existing:
        await db.device_settings.update_one({}, {"$set": update_data})
    else:
        new_settings = DeviceSettings(**update_data)
        await db.device_settings.insert_one(new_settings.dict())
    
    updated = await db.device_settings.find_one({})
    return DeviceSettings(**updated)

# User Profile
@api_router.get("/profile", response_model=Optional[UserProfile])
async def get_profile():
    profile = await db.user_profile.find_one({})
    if not profile:
        return None
    return UserProfile(**profile)

@api_router.post("/profile", response_model=UserProfile)
async def create_or_update_profile(profile: UserProfileCreate):
    existing = await db.user_profile.find_one({})
    if existing:
        await db.user_profile.update_one({}, {"$set": profile.dict()})
        updated = await db.user_profile.find_one({})
        return UserProfile(**updated)
    else:
        profile_obj = UserProfile(**profile.dict())
        await db.user_profile.insert_one(profile_obj.dict())
        return profile_obj

# AI Diagnosis
@api_router.post("/diagnosis", response_model=AIDiagnosisResponse)
async def get_diagnosis(request: AIDiagnosisRequest):
    return await get_ai_diagnosis(request)

# Statistics
@api_router.get("/stats")
async def get_stats():
    total_impacts = await db.impact_events.count_documents({})
    false_alarms = await db.impact_events.count_documents({"was_false_alarm": True})
    
    severity_counts = {
        "low": await db.impact_events.count_documents({"severity": "low", "was_false_alarm": False}),
        "medium": await db.impact_events.count_documents({"severity": "medium", "was_false_alarm": False}),
        "high": await db.impact_events.count_documents({"severity": "high", "was_false_alarm": False}),
        "critical": await db.impact_events.count_documents({"severity": "critical", "was_false_alarm": False})
    }
    
    return {
        "total_impacts": total_impacts,
        "false_alarms": false_alarms,
        "real_impacts": total_impacts - false_alarms,
        "severity_breakdown": severity_counts
    }

# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
