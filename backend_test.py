"""Comprehensive backend test for C.R.A.S.H. monitor restructure.

Tests three critical areas:
A) POST /api/alerts/{id}/acknowledge - must persist ack_by_name (operator's full name)
B) GET /api/impacts - comprehensive filter test (q, severity, status, date_from/to, days)
C) GET /api/drivers/{id}/events - regression check
"""
import os
import sys
import time
import uuid
import json
import requests
from datetime import datetime, timedelta, timezone
from pymongo import MongoClient

# Read configuration
BASE_URL = "https://crash-locator.preview.emergentagent.com"
API_URL = f"{BASE_URL}/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "crash_database"

# Test credentials
MONITOR_CREDS = {"email": "monitor@crash.io", "password": "monitor123"}
ADMIN_CREDS = {"email": "admin@crash.io", "password": "admin123"}

# MongoDB client
mongo_client = MongoClient(MONGO_URL)
db = mongo_client[DB_NAME]


def print_section(title):
    """Print a formatted section header."""
    print("\n" + "=" * 80)
    print(f"  {title}")
    print("=" * 80)


def print_test(name):
    """Print a test name."""
    print(f"\n[TEST] {name}")


def print_pass(msg):
    """Print a pass message."""
    print(f"  ✅ {msg}")


def print_fail(msg):
    """Print a fail message."""
    print(f"  ❌ {msg}")


def print_info(msg):
    """Print an info message."""
    print(f"  ℹ️  {msg}")


def login(creds):
    """Login and return (token, user_data)."""
    response = requests.post(f"{API_URL}/auth/login", json=creds, timeout=15)
    if response.status_code != 200:
        print_fail(f"Login failed: {response.status_code} - {response.text}")
        return None, None
    data = response.json()
    return data.get("access_token"), data


def get_existing_user_id():
    """Get an existing user_id from db.users where role='user'."""
    user = db.users.find_one({"role": "user"})
    if not user:
        print_fail("No users with role='user' found in database")
        return None
    return str(user["_id"])


def insert_test_impact(user_id, severity="high", severity_label="Alto", g_force=5.5):
    """Insert a test impact_event into MongoDB and return its ID."""
    impact_id = str(uuid.uuid4())
    impact_doc = {
        "id": impact_id,
        "user_id": user_id,
        "g_force": g_force,
        "severity": severity,
        "severity_label": severity_label,
        "location": {"latitude": 19.43, "longitude": -99.13},
        "ai_diagnosis": {
            "severity_assessment": "test impact for ack_by_name validation",
            "possible_injuries": [],
            "first_aid_steps": [],
            "emergency_recommendations": [],
            "priority_level": severity_label,
        },
        "alerts_sent": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    db.impact_events.insert_one(impact_doc)
    print_info(f"Inserted test impact: {impact_id}")
    return impact_id


def poll_for_alert(token, impact_id, max_wait=10):
    """Poll GET /api/alerts until the impact appears with status=pending."""
    headers = {"Authorization": f"Bearer {token}"}
    start = time.time()
    while time.time() - start < max_wait:
        response = requests.get(f"{API_URL}/alerts", headers=headers, timeout=15)
        if response.status_code == 200:
            alerts = response.json().get("alerts", [])
            for alert in alerts:
                if alert.get("id") == impact_id and alert.get("status") == "pending":
                    print_pass(f"Alert {impact_id} appeared as pending")
                    return alert
        time.sleep(1)
    print_fail(f"Alert {impact_id} did not appear within {max_wait}s")
    return None


def test_area_a_acknowledge_persists_ack_by_name():
    """Test Area A: POST /api/alerts/{id}/acknowledge persists ack_by_name."""
    print_section("AREA A: POST /api/alerts/{id}/acknowledge - ack_by_name persistence")
    
    # Step 1: Login as monitor
    print_test("Login as monitor@crash.io")
    monitor_token, monitor_user = login(MONITOR_CREDS)
    if not monitor_token:
        return False
    monitor_name = monitor_user.get("name")
    monitor_email = monitor_user.get("email")
    print_pass(f"Logged in as {monitor_name} ({monitor_email})")
    print_info(f"Token: {monitor_token[:30]}...")
    
    # Step 2: Get an existing user_id
    print_test("Get existing user_id from db.users")
    user_id = get_existing_user_id()
    if not user_id:
        return False
    print_pass(f"Found user_id: {user_id}")
    
    # Step 3: Insert a fresh pending impact
    print_test("Insert fresh pending impact via MongoDB")
    impact_id_1 = insert_test_impact(user_id, severity="high", severity_label="Alto", g_force=5.5)
    
    # Step 4: Poll GET /api/alerts until it appears
    print_test(f"Poll GET /api/alerts for impact {impact_id_1}")
    alert = poll_for_alert(monitor_token, impact_id_1, max_wait=10)
    if not alert:
        return False
    
    # Step 5: POST /api/alerts/{id}/acknowledge
    print_test(f"POST /api/alerts/{impact_id_1}/acknowledge")
    headers = {"Authorization": f"Bearer {monitor_token}"}
    response = requests.post(
        f"{API_URL}/alerts/{impact_id_1}/acknowledge",
        headers=headers,
        timeout=15
    )
    if response.status_code != 200:
        print_fail(f"Acknowledge failed: {response.status_code} - {response.text}")
        return False
    
    ack_data = response.json()
    alert_response = ack_data.get("alert", {})
    
    # Validate response
    print_test("Validate acknowledge response")
    passed = True
    
    if alert_response.get("ack_by_name") != monitor_name:
        print_fail(f"ack_by_name mismatch: expected '{monitor_name}', got '{alert_response.get('ack_by_name')}'")
        passed = False
    else:
        print_pass(f"ack_by_name == '{monitor_name}'")
    
    if alert_response.get("ack_by") != monitor_email:
        print_fail(f"ack_by mismatch: expected '{monitor_email}', got '{alert_response.get('ack_by')}'")
        passed = False
    else:
        print_pass(f"ack_by == '{monitor_email}'")
    
    if alert_response.get("status") != "acknowledged":
        print_fail(f"status mismatch: expected 'acknowledged', got '{alert_response.get('status')}'")
        passed = False
    else:
        print_pass(f"status == 'acknowledged'")
    
    # Step 6: Repeat with admin for false-alarm
    print_test("Login as admin@crash.io")
    admin_token, admin_user = login(ADMIN_CREDS)
    if not admin_token:
        return False
    admin_name = admin_user.get("name")
    admin_email = admin_user.get("email")
    print_pass(f"Logged in as {admin_name} ({admin_email})")
    
    print_test("Insert another pending impact")
    impact_id_2 = insert_test_impact(user_id, severity="critical", severity_label="Crítico", g_force=8.2)
    
    print_test(f"Poll GET /api/alerts for impact {impact_id_2}")
    alert2 = poll_for_alert(admin_token, impact_id_2, max_wait=10)
    if not alert2:
        return False
    
    print_test(f"POST /api/alerts/{impact_id_2}/false-alarm")
    headers = {"Authorization": f"Bearer {admin_token}"}
    response = requests.post(
        f"{API_URL}/alerts/{impact_id_2}/false-alarm",
        headers=headers,
        timeout=15
    )
    if response.status_code != 200:
        print_fail(f"False-alarm failed: {response.status_code} - {response.text}")
        return False
    
    fa_data = response.json()
    alert_fa = fa_data.get("alert", {})
    
    print_test("Validate false-alarm response")
    if alert_fa.get("ack_by_name") != admin_name:
        print_fail(f"ack_by_name mismatch: expected '{admin_name}', got '{alert_fa.get('ack_by_name')}'")
        passed = False
    else:
        print_pass(f"ack_by_name == '{admin_name}'")
    
    if alert_fa.get("ack_by") != admin_email:
        print_fail(f"ack_by mismatch: expected '{admin_email}', got '{alert_fa.get('ack_by')}'")
        passed = False
    else:
        print_pass(f"ack_by == '{admin_email}'")
    
    if alert_fa.get("status") != "false_alarm":
        print_fail(f"status mismatch: expected 'false_alarm', got '{alert_fa.get('status')}'")
        passed = False
    else:
        print_pass(f"status == 'false_alarm'")
    
    return passed


def test_area_b_impacts_filters():
    """Test Area B: GET /api/impacts comprehensive filter test."""
    print_section("AREA B: GET /api/impacts - Comprehensive Filter Test")
    
    # Login as admin
    print_test("Login as admin@crash.io")
    admin_token, admin_user = login(ADMIN_CREDS)
    if not admin_token:
        return False
    print_pass(f"Logged in as {admin_user.get('name')}")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    passed = True
    
    # Test 1: GET /api/impacts (no params)
    print_test("GET /api/impacts (no params)")
    response = requests.get(f"{API_URL}/impacts", headers=headers, timeout=15)
    if response.status_code != 200:
        print_fail(f"Request failed: {response.status_code} - {response.text}")
        return False
    
    data = response.json()
    if "impacts" not in data:
        print_fail("Response missing 'impacts' key")
        return False
    if "demo" not in data:
        print_fail("Response missing 'demo' key")
        passed = False
    else:
        print_pass(f"Response has 'impacts' and 'demo' keys")
        print_info(f"demo={data['demo']}, impacts count={len(data['impacts'])}")
    
    impacts = data.get("impacts", [])
    if len(impacts) == 0:
        print_fail("No impacts returned")
        return False
    
    # Validate required fields in first impact
    print_test("Validate required fields in impact rows")
    required_fields = [
        "id", "driver_id", "driver_name", "driver_email", "type", "severity",
        "severity_label", "lat", "lng", "gforce", "speed", "status", "created_at",
        "ack_by", "ack_by_name", "ai_diagnosis", "alerts_sent"
    ]
    sample = impacts[0]
    missing = [f for f in required_fields if f not in sample]
    if missing:
        print_fail(f"Missing fields in impact row: {missing}")
        print_info(f"Sample row keys: {list(sample.keys())}")
        passed = False
    else:
        print_pass(f"All required fields present: {required_fields}")
    
    # Test 2: status=pending
    print_test("GET /api/impacts?status=pending")
    response = requests.get(f"{API_URL}/impacts?status=pending", headers=headers, timeout=15)
    if response.status_code != 200:
        print_fail(f"Request failed: {response.status_code}")
        passed = False
    else:
        pending = response.json().get("impacts", [])
        invalid = [i for i in pending if i.get("status") != "pending"]
        if invalid:
            print_fail(f"Found {len(invalid)} non-pending impacts in status=pending filter")
            passed = False
        else:
            print_pass(f"All {len(pending)} impacts have status='pending'")
    
    # Test 3: status=acknowledged
    print_test("GET /api/impacts?status=acknowledged")
    response = requests.get(f"{API_URL}/impacts?status=acknowledged", headers=headers, timeout=15)
    if response.status_code != 200:
        print_fail(f"Request failed: {response.status_code}")
        passed = False
    else:
        acked = response.json().get("impacts", [])
        invalid = [i for i in acked if i.get("status") != "acknowledged"]
        if invalid:
            print_fail(f"Found {len(invalid)} non-acknowledged impacts")
            passed = False
        else:
            print_pass(f"All {len(acked)} impacts have status='acknowledged'")
        
        # Check ack_by_name is non-null
        null_names = [i for i in acked if not i.get("ack_by_name")]
        if null_names:
            print_fail(f"Found {len(null_names)} acknowledged impacts with null ack_by_name")
            passed = False
        else:
            print_pass(f"All acknowledged impacts have non-null ack_by_name")
    
    # Test 4: status=false_alarm
    print_test("GET /api/impacts?status=false_alarm")
    response = requests.get(f"{API_URL}/impacts?status=false_alarm", headers=headers, timeout=15)
    if response.status_code != 200:
        print_fail(f"Request failed: {response.status_code}")
        passed = False
    else:
        false_alarms = response.json().get("impacts", [])
        invalid = [i for i in false_alarms if i.get("status") != "false_alarm"]
        if invalid:
            print_fail(f"Found {len(invalid)} non-false_alarm impacts")
            passed = False
        else:
            print_pass(f"All {len(false_alarms)} impacts have status='false_alarm'")
    
    # Test 5: severity=critical
    print_test("GET /api/impacts?severity=critical")
    response = requests.get(f"{API_URL}/impacts?severity=critical", headers=headers, timeout=15)
    if response.status_code != 200:
        print_fail(f"Request failed: {response.status_code}")
        passed = False
    else:
        critical = response.json().get("impacts", [])
        invalid = [i for i in critical if i.get("severity", "").lower() != "critical"]
        if invalid:
            print_fail(f"Found {len(invalid)} non-critical impacts in severity=critical filter")
            for inv in invalid[:3]:
                print_info(f"  Invalid: severity='{inv.get('severity')}'")
            passed = False
        else:
            print_pass(f"All {len(critical)} impacts have severity='critical' (case-insensitive)")
    
    # Test 6: severity=high
    print_test("GET /api/impacts?severity=high")
    response = requests.get(f"{API_URL}/impacts?severity=high", headers=headers, timeout=15)
    if response.status_code != 200:
        print_fail(f"Request failed: {response.status_code}")
        passed = False
    else:
        high = response.json().get("impacts", [])
        invalid = [i for i in high if i.get("severity", "").lower() != "high"]
        if invalid:
            print_fail(f"Found {len(invalid)} non-high impacts in severity=high filter")
            passed = False
        else:
            print_pass(f"All {len(high)} impacts have severity='high' (case-insensitive)")
    
    # Test 7: days=3
    print_test("GET /api/impacts?days=3")
    response = requests.get(f"{API_URL}/impacts?days=3", headers=headers, timeout=15)
    if response.status_code != 200:
        print_fail(f"Request failed: {response.status_code}")
        passed = False
    else:
        recent = response.json().get("impacts", [])
        cutoff = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
        old = [i for i in recent if (i.get("created_at") or "") < cutoff]
        if old:
            print_fail(f"Found {len(old)} impacts older than 3 days")
            passed = False
        else:
            print_pass(f"All {len(recent)} impacts are within last 3 days")
    
    # Test 8: date_from / date_to
    print_test("GET /api/impacts?date_from=<7-days-ago>&date_to=<now>")
    date_from = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    date_to = datetime.now(timezone.utc).isoformat()
    response = requests.get(
        f"{API_URL}/impacts?date_from={date_from}&date_to={date_to}",
        headers=headers,
        timeout=15
    )
    if response.status_code != 200:
        print_fail(f"Request failed: {response.status_code}")
        passed = False
    else:
        ranged = response.json().get("impacts", [])
        out_of_range = [
            i for i in ranged
            if (i.get("created_at") or "") < date_from or (i.get("created_at") or "") > date_to
        ]
        if out_of_range:
            print_fail(f"Found {len(out_of_range)} impacts outside date range")
            passed = False
        else:
            print_pass(f"All {len(ranged)} impacts are within date range")
    
    # Test 9: q=Diego (case-insensitive name search)
    print_test("GET /api/impacts?q=Diego")
    response = requests.get(f"{API_URL}/impacts?q=Diego", headers=headers, timeout=15)
    if response.status_code != 200:
        print_fail(f"Request failed: {response.status_code}")
        passed = False
    else:
        diego_results = response.json().get("impacts", [])
        if len(diego_results) == 0:
            print_fail("No results for q=Diego (expected at least 1)")
            passed = False
        else:
            # Check that all results contain "diego" in name or email
            invalid = [
                i for i in diego_results
                if "diego" not in i.get("driver_name", "").lower()
                and "diego" not in i.get("driver_email", "").lower()
            ]
            if invalid:
                print_fail(f"Found {len(invalid)} results that don't match 'Diego'")
                passed = False
            else:
                print_pass(f"All {len(diego_results)} results match 'Diego' (case-insensitive)")
    
    # Test 10: q=salas (lowercase, partial match)
    print_test("GET /api/impacts?q=salas")
    response = requests.get(f"{API_URL}/impacts?q=salas", headers=headers, timeout=15)
    if response.status_code != 200:
        print_fail(f"Request failed: {response.status_code}")
        passed = False
    else:
        salas_results = response.json().get("impacts", [])
        if len(salas_results) == 0:
            print_fail("No results for q=salas (expected at least 1)")
            passed = False
        else:
            invalid = [
                i for i in salas_results
                if "salas" not in i.get("driver_name", "").lower()
                and "salas" not in i.get("driver_email", "").lower()
            ]
            if invalid:
                print_fail(f"Found {len(invalid)} results that don't match 'salas'")
                passed = False
            else:
                print_pass(f"All {len(salas_results)} results match 'salas' (case-insensitive)")
    
    # Test 11: Combined filters
    print_test("GET /api/impacts?status=acknowledged&severity=critical&days=30")
    response = requests.get(
        f"{API_URL}/impacts?status=acknowledged&severity=critical&days=30",
        headers=headers,
        timeout=15
    )
    if response.status_code != 200:
        print_fail(f"Request failed: {response.status_code}")
        passed = False
    else:
        combined = response.json().get("impacts", [])
        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        invalid = [
            i for i in combined
            if i.get("status") != "acknowledged"
            or i.get("severity", "").lower() != "critical"
            or (i.get("created_at") or "") < cutoff
        ]
        if invalid:
            print_fail(f"Found {len(invalid)} impacts that don't satisfy all filters")
            passed = False
        else:
            print_pass(f"All {len(combined)} impacts satisfy status=acknowledged, severity=critical, days=30")
    
    return passed


def test_area_c_drivers_events_regression():
    """Test Area C: GET /api/drivers/{id}/events regression check."""
    print_section("AREA C: GET /api/drivers/{id}/events - Regression Check")
    
    # Login as admin
    print_test("Login as admin@crash.io")
    admin_token, admin_user = login(ADMIN_CREDS)
    if not admin_token:
        return False
    print_pass(f"Logged in as {admin_user.get('name')}")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Get drivers list
    print_test("GET /api/drivers to find Diego Salas")
    response = requests.get(f"{API_URL}/drivers", headers=headers, timeout=15)
    if response.status_code != 200:
        print_fail(f"Request failed: {response.status_code}")
        return False
    
    drivers = response.json().get("drivers", [])
    diego = None
    for d in drivers:
        if "diego" in d.get("name", "").lower():
            diego = d
            break
    
    if not diego:
        print_fail("Diego Salas not found in drivers list")
        return False
    
    diego_id = diego.get("id")
    print_pass(f"Found Diego: {diego.get('name')} (ID: {diego_id})")
    
    # Get Diego's events
    print_test(f"GET /api/drivers/{diego_id}/events")
    response = requests.get(f"{API_URL}/drivers/{diego_id}/events", headers=headers, timeout=15)
    if response.status_code != 200:
        print_fail(f"Request failed: {response.status_code}")
        return False
    
    events_data = response.json()
    events = events_data.get("events", [])
    print_pass(f"Retrieved {len(events)} events")
    
    if len(events) == 0:
        print_fail("No events found for Diego")
        return False
    
    # Validate event structure
    print_test("Validate event structure")
    sample = events[0]
    required_fields = [
        "id", "driver_id", "type", "severity", "severity_label",
        "lat", "lng", "gforce", "speed", "ts", "ai_diagnosis", "alerts_sent"
    ]
    missing = [f for f in required_fields if f not in sample]
    if missing:
        print_fail(f"Missing fields: {missing}")
        return False
    
    print_pass(f"All required fields present")
    
    # Validate ai_diagnosis structure
    if not isinstance(sample.get("ai_diagnosis"), dict):
        print_fail("ai_diagnosis is not a dict")
        return False
    
    ai_diag = sample["ai_diagnosis"]
    ai_fields = ["severity_assessment", "possible_injuries", "first_aid_steps", "emergency_recommendations", "priority_level"]
    missing_ai = [f for f in ai_fields if f not in ai_diag]
    if missing_ai:
        print_fail(f"Missing ai_diagnosis fields: {missing_ai}")
        return False
    
    print_pass(f"ai_diagnosis structure valid")
    print_info(f"Sample event: {json.dumps(sample, indent=2)[:500]}...")
    
    return True


def main():
    """Run all tests."""
    print("\n" + "=" * 80)
    print("  C.R.A.S.H. MONITOR BACKEND TEST SUITE")
    print("  Focused backend test for restructure validation")
    print("=" * 80)
    print(f"\nBackend URL: {API_URL}")
    print(f"MongoDB: {MONGO_URL}/{DB_NAME}")
    print(f"DEMO_MODE: false (LIVE mobile-bridge mode)")
    
    results = {}
    
    # Run tests
    try:
        results["Area A: Acknowledge ack_by_name"] = test_area_a_acknowledge_persists_ack_by_name()
    except Exception as e:
        print_fail(f"Area A crashed: {e}")
        results["Area A: Acknowledge ack_by_name"] = False
    
    try:
        results["Area B: Impacts filters"] = test_area_b_impacts_filters()
    except Exception as e:
        print_fail(f"Area B crashed: {e}")
        results["Area B: Impacts filters"] = False
    
    try:
        results["Area C: Drivers events regression"] = test_area_c_drivers_events_regression()
    except Exception as e:
        print_fail(f"Area C crashed: {e}")
        results["Area C: Drivers events regression"] = False
    
    # Summary
    print_section("TEST SUMMARY")
    all_passed = True
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}  {test_name}")
        if not passed:
            all_passed = False
    
    print("\n" + "=" * 80)
    if all_passed:
        print("  ✅ ALL TESTS PASSED")
    else:
        print("  ❌ SOME TESTS FAILED")
    print("=" * 80 + "\n")
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
