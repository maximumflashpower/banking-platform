# SEGREGATION OF DUTIES MATRIX

| Operation | Operator | Security Officer | Platform Admin |
|----------|----------|------------------|----------------|
Run smoke tests | ✔ | | |
Verify audit evidence | ✔ | ✔ | |
Create backup | ✔ | ✔ (key custody) | |
Restore backup | | ✔ | |
Disable ACH rail | ✔ | ✔ | |
Disable Cards rail | ✔ | ✔ | |
Rebuild API container | | | ✔ |
Inspect logs | ✔ | | ✔ |
Verify recovery evidence | ✔ | ✔ | |

Notes:

- restore operations require security officer approval
- rail disable operations require dual authorization
- infrastructure rebuilds restricted to platform admin
