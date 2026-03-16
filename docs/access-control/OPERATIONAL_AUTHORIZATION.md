# OPERATIONAL AUTHORIZATION PROCEDURE

## Purpose

Ensure sensitive operational actions are executed with proper authorization.

---

## Authorization model

Sensitive operations require documented authorization.

Operations requiring authorization:

- restore verification
- encrypted backup operations
- rail disable actions
- incident recovery

---

## Authorization flow

Step 1

Operator identifies required action.

Step 2

Security Officer reviews request.

Step 3

Security Officer approves cryptographic or recovery actions.

Step 4

Operator executes approved procedure.

Step 5

Evidence verification confirms system integrity.

---

## Evidence validation

Operator must run:

python3 verification command for evidence chain.

Expected:

chain_verified = True

---

## Documentation

Every sensitive operation must record:

timestamp  
operator identity  
security officer identity  
operation executed  
result
