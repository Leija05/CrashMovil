import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from google import genai
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ==================== APP + DB ====================

mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(mongo_url)
db = client[os.getenv("DB_NAME", "crash_database")]

app = FastAPI(
    title="C.R.A.S.H. API",
    description="Collision Response and Safety Hardware",
    version="3.0",
)
api_router = APIRouter(prefix="/api")

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
JWT_SECRET = os.getenv("JWT_SECRET", "change-this-secret")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))

# ==================== MODELS ====================


class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    password_hash: Optional[str] = None
    full_name: Optional[str] = None
    auth_provider: str = "password"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserPublic(BaseModel):
    id: str
    email: EmailStr
    full_name: Optional[str] = None
    auth_provider: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class OAuthLoginRequest(BaseModel):
    provider: str = Field(pattern="^(google|apple)$")
    email: EmailStr
    provider_token: str
    full_name: Optional[str] = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class EmergencyContact(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_id: str
    name: str
    phone: str
    relationship: str
    is_primary: bool = False
    verified: bool = False
    opt_in_status: str = "pending"  # pending | verified | revoked
    opt_in_token: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EmergencyContactCreate(BaseModel):
    name: str
    phone: str
    relationship: str
    is_primary: bool = False


class ContactVerificationRequest(BaseModel):
    token: str
    response_text: str


class ImpactEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    g_force: float
    acceleration_x: float
    acceleration_y: float
    acceleration_z: float
    gyro_x: float
    gyro_y: float
    gyro_z: float
    severity: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    was_false_alarm: bool = False
    ai_diagnosis: Optional[str] = None
    first_aid_guide: Optional[str] = None
    alerts_dispatched: int = 0


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
    owner_id: str
    device_name: str = "CASCO_V2.0"
    impact_threshold: float = 5.0
    countdown_seconds: int = 30
    auto_call_enabled: bool = True
    sms_enabled: bool = True
    message_type: str = "sms"  # sms | whatsapp
    language: str = "es"
    theme: str = "dark"
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DeviceSettingsUpdate(BaseModel):
    device_name: Optional[str] = None
    impact_threshold: Optional[float] = None
    countdown_seconds: Optional[int] = None
    auto_call_enabled: Optional[bool] = None
    sms_enabled: Optional[bool] = None
    message_type: Optional[str] = None
    language: Optional[str] = None
    theme: Optional[str] = None


class UserProfile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_id: str
    name: str
    blood_type: Optional[str] = None
    allergies: Optional[str] = None
    medical_conditions: Optional[str] = None
    emergency_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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


class AlertDispatchResult(BaseModel):
    contact_id: str
    channel: str
    status: str


# ==================== HELPERS ====================


def sanitize_doc(document: Dict[str, Any]) -> Dict[str, Any]:
    document.pop("_id", None)
    return document


def classify_severity(g_force: float) -> str:
    if g_force < 5:
        return "low"
    if g_force < 10:
        return "medium"
    if g_force < 15:
        return "high"
    return "critical"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload = {"sub": user_id, "exp": expire, "iat": datetime.now(timezone.utc)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user_doc = await db.users.find_one({"id": user_id})
    if not user_doc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return User(**sanitize_doc(user_doc))


async def get_or_create_settings(owner_id: str) -> DeviceSettings:
    settings_doc = await db.device_settings.find_one({"owner_id": owner_id})
    if settings_doc:
        return DeviceSettings(**sanitize_doc(settings_doc))

    settings = DeviceSettings(owner_id=owner_id)
    await db.device_settings.insert_one(settings.model_dump())
    return settings


def format_alert_message(impact: ImpactEvent, diagnosis: AIDiagnosisResponse) -> str:
    location = (
        f"https://maps.google.com/?q={impact.latitude},{impact.longitude}"
        if impact.latitude is not None and impact.longitude is not None
        else "Ubicación no disponible"
    )
    return (
        "🚨 ALERTA DE CHOQUE\n"
        f"Severidad: {impact.severity.upper()}\n"
        f"Diagnóstico IA: {diagnosis.severity_assessment}\n"
        f"Recomendación: {diagnosis.recommendation}\n"
        f"Ubicación: {location}"
    )


def integration_provider() -> str:
    if os.getenv("TWILIO_ACCOUNT_SID") and os.getenv("TWILIO_AUTH_TOKEN"):
        return "twilio"
    return "mock"


async def send_contact_alert(contact: EmergencyContact, message: str, channel: str) -> AlertDispatchResult:
    provider = integration_provider()
    logging.info(
        "Dispatching %s alert through %s to %s (%s)",
        channel,
        provider,
        contact.name,
        contact.phone,
    )
    logging.info("Alert content preview: %s", message)
    return AlertDispatchResult(contact_id=contact.id, channel=channel, status="sent")


async def place_automated_call(contact: EmergencyContact, message: str) -> AlertDispatchResult:
    provider = integration_provider()
    logging.info(
        "Calling %s through %s with TTS message (preview length=%d)",
        contact.phone,
        provider,
        len(message),
    )
    return AlertDispatchResult(contact_id=contact.id, channel="call", status="placed")


async def dispatch_emergency_alerts(
    owner_id: str,
    impact: ImpactEvent,
    diagnosis: AIDiagnosisResponse,
    settings: DeviceSettings,
) -> List[AlertDispatchResult]:
    verified_contacts = await db.emergency_contacts.find(
        {"owner_id": owner_id, "verified": True, "opt_in_status": "verified"}
    ).to_list(50)

    if not verified_contacts:
        return []

    message = format_alert_message(impact, diagnosis)
    results: List[AlertDispatchResult] = []

    for doc in verified_contacts:
        contact = EmergencyContact(**sanitize_doc(doc))
        if settings.sms_enabled:
            results.append(await send_contact_alert(contact, message, settings.message_type))
        if settings.auto_call_enabled:
            results.append(await place_automated_call(contact, message))

    return results


async def get_ai_diagnosis(data: AIDiagnosisRequest) -> AIDiagnosisResponse:
    try:
        api_key = os.getenv("EMERGENT_LLM_KEY")
        if not api_key:
            raise ValueError("EMERGENT_LLM_KEY no está configurada")

        client = genai.Client(api_key=api_key)

        severity = classify_severity(data.g_force)
        lang = "Spanish" if data.language == "es" else "English"

        prompt = f"""
You are an emergency medical AI assistant for the C.R.A.S.H. system.
Analyze motorcycle telemetry and return practical first-aid guidance in {lang}.

Return EXACT JSON:
{{
  "severity_assessment": "...",
  "probable_injuries": ["..."],
  "first_aid_steps": ["..."],
  "warnings": ["..."],
  "recommendation": "..."
}}

Impact data:
- g_force={data.g_force}
- acceleration=({data.acceleration_x}, {data.acceleration_y}, {data.acceleration_z})
- gyroscope=({data.gyro_x}, {data.gyro_y}, {data.gyro_z})
- blood_type={data.blood_type}
- allergies={data.allergies}
- medical_conditions={data.medical_conditions}
- severity={severity}
"""
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        response_text = response.text or ""
        json_match = re.search(r"\{[\s\S]*\}", response_text)
        if not json_match:
            raise ValueError("No se encontró JSON válido en la respuesta")
        diagnosis_data = json.loads(json_match.group())
        return AIDiagnosisResponse(**diagnosis_data)
    except Exception as exc:
        logging.error("AI diagnosis fallback: %s", exc)
        severity = classify_severity(data.g_force)
        report_snapshot = (
            f"G={data.g_force:.1f}, "
            f"A=({data.acceleration_x:.2f},{data.acceleration_y:.2f},{data.acceleration_z:.2f}), "
            f"Giro=({data.gyro_x:.2f},{data.gyro_y:.2f},{data.gyro_z:.2f})"
        )
        if data.language == "es":
            return AIDiagnosisResponse(
                severity_assessment=(
                    f"Impacto detectado del reporte: {report_snapshot}. "
                    f"Clasificación automática: {severity}."
                ),
                probable_injuries=["Posible trauma craneal", "Contusiones", "Posibles fracturas"],
                first_aid_steps=[
                    "No mover a la víctima",
                    "Llamar al 911",
                    "No retirar el casco",
                    "Verificar conciencia y respiración",
                ],
                warnings=["Riesgo de lesión cervical", "No administrar alimentos ni agua"],
                recommendation="Asegure el área y espere servicios de emergencia.",
            )
        return AIDiagnosisResponse(
            severity_assessment=(
                f"Impact detected from report: {report_snapshot}. "
                f"Automatic severity classification: {severity}."
            ),
            probable_injuries=["Possible head trauma", "Contusions", "Possible fractures"],
            first_aid_steps=[
                "Do not move the victim",
                "Call 911",
                "Do not remove the helmet",
                "Check consciousness and breathing",
            ],
            warnings=["Potential spinal injury", "Do not provide food or liquids"],
            recommendation="Secure scene and wait for emergency responders.",
        )


def to_public_user(user: User) -> UserPublic:
    return UserPublic(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        auth_provider=user.auth_provider,
    )


# ==================== LIFECYCLE ====================


@app.on_event("startup")
async def startup_db_client() -> None:
    await client.admin.command("ping")
    logging.info("MongoDB ready")


@app.on_event("shutdown")
async def shutdown_db_client() -> None:
    client.close()


# ==================== ROUTES ====================


@api_router.get("/")
async def root() -> Dict[str, str]:
    return {"message": "C.R.A.S.H. API", "version": "3.0"}


@api_router.get("/health")
async def health_check() -> Dict[str, str]:
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}


# Auth
@api_router.post("/auth/register", response_model=AuthResponse)
async def register(payload: RegisterRequest) -> AuthResponse:
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        auth_provider="password",
        password_hash=hash_password(payload.password),
    )
    await db.users.insert_one(user.model_dump())
    token = create_access_token(user.id)
    return AuthResponse(access_token=token, user=to_public_user(user))


@api_router.post("/auth/login", response_model=AuthResponse)
async def login(payload: LoginRequest) -> AuthResponse:
    user_doc = await db.users.find_one({"email": payload.email.lower()})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user = User(**sanitize_doc(user_doc))
    if not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(user.id)
    return AuthResponse(access_token=token, user=to_public_user(user))


@api_router.post("/auth/oauth", response_model=AuthResponse)
async def oauth_login(payload: OAuthLoginRequest) -> AuthResponse:
    user_doc = await db.users.find_one({"email": payload.email.lower()})
    if user_doc:
        user = User(**sanitize_doc(user_doc))
    else:
        user = User(
            email=payload.email.lower(),
            full_name=payload.full_name,
            auth_provider=payload.provider,
            password_hash=None,
        )
        await db.users.insert_one(user.model_dump())

    token = create_access_token(user.id)
    return AuthResponse(access_token=token, user=to_public_user(user))


@api_router.get("/auth/me", response_model=UserPublic)
async def me(current_user: User = Depends(get_current_user)) -> UserPublic:
    return to_public_user(current_user)


# Contacts
@api_router.post("/contacts", response_model=EmergencyContact)
async def create_contact(
    contact: EmergencyContactCreate, current_user: User = Depends(get_current_user)
) -> EmergencyContact:
    token = str(uuid.uuid4())[:8].upper()
    contact_obj = EmergencyContact(
        owner_id=current_user.id,
        opt_in_token=token,
        **contact.model_dump(),
    )
    await db.emergency_contacts.insert_one(contact_obj.model_dump())
    logging.info("Opt-in invite generated for %s token=%s", contact_obj.phone, token)
    return contact_obj


@api_router.get("/contacts", response_model=List[EmergencyContact])
async def get_contacts(current_user: User = Depends(get_current_user)) -> List[EmergencyContact]:
    contacts = await db.emergency_contacts.find({"owner_id": current_user.id}).to_list(100)
    return [EmergencyContact(**sanitize_doc(c)) for c in contacts]


@api_router.put("/contacts/{contact_id}", response_model=EmergencyContact)
async def update_contact(
    contact_id: str,
    contact: EmergencyContactCreate,
    current_user: User = Depends(get_current_user),
) -> EmergencyContact:
    result = await db.emergency_contacts.update_one(
        {"id": contact_id, "owner_id": current_user.id},
        {"$set": contact.model_dump()},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    updated = await db.emergency_contacts.find_one({"id": contact_id, "owner_id": current_user.id})
    return EmergencyContact(**sanitize_doc(updated))


@api_router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str, current_user: User = Depends(get_current_user)) -> Dict[str, str]:
    result = await db.emergency_contacts.delete_one({"id": contact_id, "owner_id": current_user.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"message": "Contact deleted"}


@api_router.post("/contacts/opt-in/confirm")
async def confirm_contact_opt_in(payload: ContactVerificationRequest) -> Dict[str, str]:
    normalized = payload.response_text.strip().upper()
    if normalized != "ACEPTO":
        raise HTTPException(status_code=400, detail='Reply must be exactly "ACEPTO"')

    result = await db.emergency_contacts.update_one(
        {"opt_in_token": payload.token},
        {"$set": {"verified": True, "opt_in_status": "verified"}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Invalid token")

    return {"message": "Contact verified"}


@api_router.post("/webhooks/whatsapp")
async def whatsapp_webhook(payload: Dict[str, Any]) -> Dict[str, str]:
    body_text = str(payload.get("Body", "")).strip().upper()
    from_phone = str(payload.get("From", "")).replace("whatsapp:", "")
    if body_text == "ACEPTO" and from_phone:
        await db.emergency_contacts.update_one(
            {"phone": from_phone},
            {"$set": {"verified": True, "opt_in_status": "verified"}},
        )
    return {"status": "ok"}


# Settings
@api_router.get("/settings", response_model=DeviceSettings)
async def get_settings(current_user: User = Depends(get_current_user)) -> DeviceSettings:
    return await get_or_create_settings(current_user.id)


@api_router.put("/settings", response_model=DeviceSettings)
async def update_settings(
    settings: DeviceSettingsUpdate,
    current_user: User = Depends(get_current_user),
) -> DeviceSettings:
    update_data = {k: v for k, v in settings.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)

    await get_or_create_settings(current_user.id)
    await db.device_settings.update_one({"owner_id": current_user.id}, {"$set": update_data})
    updated = await db.device_settings.find_one({"owner_id": current_user.id})
    return DeviceSettings(**sanitize_doc(updated))


# Profile
@api_router.get("/profile", response_model=Optional[UserProfile])
async def get_profile(current_user: User = Depends(get_current_user)) -> Optional[UserProfile]:
    profile = await db.user_profile.find_one({"owner_id": current_user.id})
    if not profile:
        return None
    return UserProfile(**sanitize_doc(profile))


@api_router.post("/profile", response_model=UserProfile)
async def create_or_update_profile(
    profile: UserProfileCreate,
    current_user: User = Depends(get_current_user),
) -> UserProfile:
    existing = await db.user_profile.find_one({"owner_id": current_user.id})
    if existing:
        await db.user_profile.update_one(
            {"owner_id": current_user.id},
            {"$set": profile.model_dump()},
        )
        updated = await db.user_profile.find_one({"owner_id": current_user.id})
        return UserProfile(**sanitize_doc(updated))

    profile_obj = UserProfile(owner_id=current_user.id, **profile.model_dump())
    await db.user_profile.insert_one(profile_obj.model_dump())
    return profile_obj


# Diagnosis
@api_router.post("/diagnosis", response_model=AIDiagnosisResponse)
async def get_diagnosis(
    request: AIDiagnosisRequest,
    current_user: User = Depends(get_current_user),
) -> AIDiagnosisResponse:
    profile = await db.user_profile.find_one({"owner_id": current_user.id})
    if profile:
        request.blood_type = request.blood_type or profile.get("blood_type")
        request.allergies = request.allergies or profile.get("allergies")
        request.medical_conditions = request.medical_conditions or profile.get("medical_conditions")
    return await get_ai_diagnosis(request)


# Impacts + emergency pipeline
@api_router.post("/impacts", response_model=ImpactEvent)
async def create_impact(
    impact: ImpactEventCreate,
    current_user: User = Depends(get_current_user),
) -> ImpactEvent:
    settings = await get_or_create_settings(current_user.id)
    severity = classify_severity(impact.g_force)

    impact_obj = ImpactEvent(owner_id=current_user.id, severity=severity, **impact.model_dump())

    if impact.g_force >= settings.impact_threshold:
        diagnosis_request = AIDiagnosisRequest(**impact.model_dump(), language=settings.language)
        diagnosis = await get_ai_diagnosis(diagnosis_request)
        impact_obj.ai_diagnosis = diagnosis.severity_assessment
        impact_obj.first_aid_guide = " | ".join(diagnosis.first_aid_steps)

        dispatch_results = await dispatch_emergency_alerts(current_user.id, impact_obj, diagnosis, settings)
        impact_obj.alerts_dispatched = len(dispatch_results)

    await db.impact_events.insert_one(impact_obj.model_dump())
    return impact_obj


@api_router.get("/impacts", response_model=List[ImpactEvent])
async def get_impacts(
    limit: int = 50,
    current_user: User = Depends(get_current_user),
) -> List[ImpactEvent]:
    impacts = (
        await db.impact_events.find({"owner_id": current_user.id}).sort("timestamp", -1).to_list(limit)
    )
    return [ImpactEvent(**sanitize_doc(i)) for i in impacts]


@api_router.get("/impacts/{impact_id}", response_model=ImpactEvent)
async def get_impact(impact_id: str, current_user: User = Depends(get_current_user)) -> ImpactEvent:
    impact = await db.impact_events.find_one({"id": impact_id, "owner_id": current_user.id})
    if not impact:
        raise HTTPException(status_code=404, detail="Impact not found")
    return ImpactEvent(**sanitize_doc(impact))


@api_router.put("/impacts/{impact_id}/false-alarm")
async def mark_false_alarm(impact_id: str, current_user: User = Depends(get_current_user)) -> Dict[str, str]:
    result = await db.impact_events.update_one(
        {"id": impact_id, "owner_id": current_user.id},
        {"$set": {"was_false_alarm": True}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Impact not found")
    return {"message": "Marked as false alarm"}


# Stats
@api_router.get("/stats")
async def get_stats(current_user: User = Depends(get_current_user)) -> Dict[str, Any]:
    owner_filter = {"owner_id": current_user.id}
    total_impacts = await db.impact_events.count_documents(owner_filter)
    false_alarms = await db.impact_events.count_documents({**owner_filter, "was_false_alarm": True})

    severity_counts = {
        "low": await db.impact_events.count_documents(
            {**owner_filter, "severity": "low", "was_false_alarm": False}
        ),
        "medium": await db.impact_events.count_documents(
            {**owner_filter, "severity": "medium", "was_false_alarm": False}
        ),
        "high": await db.impact_events.count_documents(
            {**owner_filter, "severity": "high", "was_false_alarm": False}
        ),
        "critical": await db.impact_events.count_documents(
            {**owner_filter, "severity": "critical", "was_false_alarm": False}
        ),
    }

    verified_contacts = await db.emergency_contacts.count_documents(
        {"owner_id": current_user.id, "verified": True}
    )

    return {
        "total_impacts": total_impacts,
        "false_alarms": false_alarms,
        "real_impacts": total_impacts - false_alarms,
        "severity_breakdown": severity_counts,
        "verified_contacts": verified_contacts,
    }


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
