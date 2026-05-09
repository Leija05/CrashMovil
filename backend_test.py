"""Focused backend test for C.R.A.S.H. monitor history endpoint - Diego Salas impact event validation."""
import os
import requests
import json

# Read backend URL from frontend .env
BASE_URL = "https://crash-locator.preview.emergentagent.com"
API_URL = f"{BASE_URL}/api"

# Test credentials from test_credentials.md
ADMIN_CREDS = {"email": "admin@crash.io", "password": "admin123"}

def test_diego_salas_impact_event():
    """
    Test GET /api/drivers/{diego_id}/events endpoint for Diego Salas.
    Validates the response contains impact event with full ai_diagnosis structure.
    """
    print("\n" + "="*80)
    print("FOCUSED BACKEND TEST: Diego Salas Impact Event Endpoint")
    print("="*80)
    
    # Step 1: Login as operator
    print("\n[STEP 1] Login as admin operator...")
    login_response = requests.post(
        f"{API_URL}/auth/login",
        json=ADMIN_CREDS,
        timeout=15
    )
    
    print(f"Login status: {login_response.status_code}")
    if login_response.status_code != 200:
        print(f"❌ LOGIN FAILED: {login_response.status_code} - {login_response.text}")
        return False
    
    login_data = login_response.json()
    access_token = login_data.get("access_token")
    print(f"✅ Login successful. Token obtained: {access_token[:20]}...")
    
    headers = {"Authorization": f"Bearer {access_token}"}
    
    # Step 2: List drivers to find Diego Salas
    print("\n[STEP 2] Fetching drivers list to find Diego Salas...")
    drivers_response = requests.get(
        f"{API_URL}/drivers",
        headers=headers,
        timeout=15
    )
    
    print(f"Drivers list status: {drivers_response.status_code}")
    if drivers_response.status_code != 200:
        print(f"❌ DRIVERS LIST FAILED: {drivers_response.status_code} - {drivers_response.text}")
        return False
    
    drivers_data = drivers_response.json()
    drivers = drivers_data.get("drivers", [])
    print(f"Total drivers found: {len(drivers)}")
    
    # Find Diego Salas
    diego = None
    for driver in drivers:
        if driver.get("name") == "Diego Salas":
            diego = driver
            break
    
    if not diego:
        print("❌ DIEGO SALAS NOT FOUND in drivers list")
        print("Available drivers:")
        for d in drivers:
            print(f"  - {d.get('name')} (ID: {d.get('id')}, Email: {d.get('email')})")
        return False
    
    diego_id = diego.get("id")
    print(f"✅ Diego Salas found: ID={diego_id}, Email={diego.get('email')}")
    
    # Step 3: Get Diego's events
    print(f"\n[STEP 3] Fetching events for Diego Salas (ID: {diego_id})...")
    events_response = requests.get(
        f"{API_URL}/drivers/{diego_id}/events?limit=100",
        headers=headers,
        timeout=15
    )
    
    print(f"Events endpoint status: {events_response.status_code}")
    if events_response.status_code != 200:
        print(f"❌ EVENTS ENDPOINT FAILED: {events_response.status_code} - {events_response.text}")
        return False
    
    events_data = events_response.json()
    events = events_data.get("events", [])
    print(f"Total events found: {len(events)}")
    
    if len(events) == 0:
        print("❌ NO EVENTS FOUND for Diego Salas")
        return False
    
    print(f"✅ Found {len(events)} event(s)")
    
    # Step 4: Validate event structure
    print("\n[STEP 4] Validating event structure...")
    validation_passed = True
    
    for idx, event in enumerate(events):
        print(f"\n--- Event {idx + 1} ---")
        print(json.dumps(event, indent=2))
        
        # Required fields validation
        required_fields = {
            "id": (str, "string uuid"),
            "type": (str, "impact"),
            "severity": (str, "severity value"),
            "severity_label": (str, "severity label"),
            "lat": ((int, float), "numeric latitude"),
            "lng": ((int, float), "numeric longitude"),
            "gforce": ((int, float), "numeric g-force"),
            "speed": ((int, float), "numeric speed"),
            "ts": (str, "ISO timestamp"),
            "alerts_sent": (bool, "boolean"),
            "ai_diagnosis": (dict, "AI diagnosis dict"),
        }
        
        print("\nField validation:")
        for field, (expected_type, description) in required_fields.items():
            if field not in event:
                print(f"  ❌ MISSING FIELD: {field} ({description})")
                validation_passed = False
            else:
                value = event[field]
                if isinstance(expected_type, tuple):
                    type_match = isinstance(value, expected_type)
                else:
                    type_match = isinstance(value, expected_type)
                
                if not type_match:
                    print(f"  ❌ WRONG TYPE: {field} = {value} (expected {description}, got {type(value).__name__})")
                    validation_passed = False
                else:
                    # Special validations
                    if field == "type" and value != "impact":
                        print(f"  ❌ WRONG VALUE: type = {value} (expected 'impact')")
                        validation_passed = False
                    elif field == "lat" and not (-90 <= value <= 90):
                        print(f"  ⚠️  WARNING: lat = {value} (outside valid range)")
                    elif field == "lng" and not (-180 <= value <= 180):
                        print(f"  ⚠️  WARNING: lng = {value} (outside valid range)")
                    else:
                        print(f"  ✅ {field}: {value}")
        
        # Validate ai_diagnosis structure
        if "ai_diagnosis" in event and isinstance(event["ai_diagnosis"], dict):
            print("\nAI Diagnosis structure validation:")
            ai_diag = event["ai_diagnosis"]
            required_ai_fields = {
                "severity_assessment": str,
                "possible_injuries": list,
                "first_aid_steps": list,
                "emergency_recommendations": list,
                "priority_level": str,
            }
            
            for ai_field, ai_type in required_ai_fields.items():
                if ai_field not in ai_diag:
                    print(f"  ❌ MISSING AI FIELD: {ai_field}")
                    validation_passed = False
                elif not isinstance(ai_diag[ai_field], ai_type):
                    print(f"  ❌ WRONG AI FIELD TYPE: {ai_field} (expected {ai_type.__name__}, got {type(ai_diag[ai_field]).__name__})")
                    validation_passed = False
                else:
                    print(f"  ✅ {ai_field}: {ai_type.__name__}")
        
        # Check expected location (around 19.449, -99.1276)
        if "lat" in event and "lng" in event:
            lat, lng = event["lat"], event["lng"]
            if abs(lat - 19.449) < 0.1 and abs(lng - (-99.1276)) < 0.1:
                print(f"  ✅ Location matches expected area (Mexico City)")
            else:
                print(f"  ⚠️  Location differs from expected (~19.449, -99.1276): ({lat}, {lng})")
        
        # Check expected gforce (~7.4)
        if "gforce" in event:
            gforce = event["gforce"]
            if abs(gforce - 7.4) < 1.0:
                print(f"  ✅ G-force matches expected value (~7.4)")
            else:
                print(f"  ⚠️  G-force differs from expected (~7.4): {gforce}")
    
    # Step 5: Test history endpoint
    print(f"\n[STEP 5] Testing history endpoint for Diego Salas...")
    history_response = requests.get(
        f"{API_URL}/drivers/{diego_id}/history?limit=300",
        headers=headers,
        timeout=15
    )
    
    print(f"History endpoint status: {history_response.status_code}")
    if history_response.status_code != 200:
        print(f"❌ HISTORY ENDPOINT FAILED: {history_response.status_code} - {history_response.text}")
        validation_passed = False
    else:
        history_data = history_response.json()
        points = history_data.get("points", [])
        print(f"✅ History endpoint working. Found {len(points)} telemetry points")
        
        if len(points) > 0:
            print(f"Sample point: {json.dumps(points[0], indent=2)}")
    
    # Final result
    print("\n" + "="*80)
    if validation_passed:
        print("✅ ALL VALIDATIONS PASSED")
    else:
        print("❌ SOME VALIDATIONS FAILED")
    print("="*80 + "\n")
    
    return validation_passed


if __name__ == "__main__":
    success = test_diego_salas_impact_event()
    exit(0 if success else 1)
