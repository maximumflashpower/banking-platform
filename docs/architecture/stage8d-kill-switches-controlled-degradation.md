# Stage 8D — Kill switches y degradación controlada

## Objetivo
Permitir apagar rails críticos sin tumbar el gateway ni afectar dominios no relacionados.

## Flags
- RAILS_ACH_ENABLED=true|false
- RAILS_CARDS_ENABLED=true|false

## Comportamiento
### ACH disabled
- Bloquea submit ACH con HTTP 503
- Respuesta explícita: code=rail_disabled
- No afecta auth, chat, social, web session

### Cards disabled
- Bloquea autorizaciones con decisión explícita de decline
- No devuelve 500 genérico
- No afecta ACH

## Audit
Se registra evento operativo:
- rail.kill_switch.blocked

## Riesgo
Medio

## Rollback
Setear flags nuevamente en true y reconstruir api.