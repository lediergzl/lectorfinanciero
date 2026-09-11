# Ejemplos de SMS y casos de prueba

Estos son ejemplos **inventados** (no reales) para poder probar el parser
mientras no tengamos capturas reales de Transfermóvil/EnZona. En cuanto
tengas SMS reales, reemplaza estos ejemplos y ajusta las regex en
`src/parser/patterns.js` y `src/parser/banks/*.js` según haga falta.

## Cómo probar

```bash
node test-parser.mjs
```

## Casos incluidos

1. Transferencia recibida (Transfermóvil) con monto y decimales.
2. Transferencia enviada (EnZona) en MLC.
3. SMS de un banco no identificado (debe caer en el parser genérico).
4. SMS que NO es una transferencia (debe ser ignorado, ej. SMS publicitario).
5. SMS con monto en formato "1,500.50" (separador de miles + decimal).

## SMS reales confirmados (ya integrados en el parser)

Estos formatos ya están cubiertos por parsers dedicados en
`src/parser/banks/` y verificados con `test-parser.mjs`:

**Bandec — recarga telefónica** (usa `Monto Pagado`, NO `Saldo a acreditar`,
que es un monto distinto):
```
Banco Bandec:  La recarga se realizo con exito. Saldo a acreditar: 360 CUP.
Saldo acreditado: 360 CUP. Monto Pagado: 324.0 CUP. Telefono: 55415602.
Id transaccion: KW601PHUR9999. Saldo Restante: CR 1008.35.
```

**Bandec — transferencia saliente completada** (notificación al que envía):
```
Banco Bandec:  La Transferencia fue completada.   Fecha: 6/9/2026
Beneficiario: 9227XXXXXXXX3044   Ordenante: CUP   Monto: 2800.00 CUP
Nro. Transaccion: KW601OY5DJ999   Saldo restante: CR 5332.35 CUP
```

**Transferencia entrante** (patrón "El titular del teléfono X le ha
realizado una transferencia...", cubre tanto Monedero MiTransfer como
cuentas — siempre es `type: 'in'` para quien recibe el SMS):
```
El titular del telefono 5351476873 le ha realizado una transferencia al
Monedero MiTransfer 59446530 de 1000.00 CUP. Nro. Transaccion
TMW185142982. Fecha: 8/9/2026.
```

**BPA / Banco Metropolitano — transferencia saliente a cuenta** (sin
mencionar teléfono remitente, el nombre del banco puede venir al final
del cuerpo o en el remitente del SMS):
```
Se ha realizado una transferencia a la cuenta 9205959877401647 de
30000.00 CUP. Nro. Transaccion MM6050B8B0987. Fecha: 24/8/2026.
```

## Pendiente por confirmar

Aún no tenemos ejemplos reales de: EnZona (el parser actual es
provisional, basado en suposiciones), BPA/Metropolitano en su formato
completo (solo vimos la variante "transferencia a cuenta"), y BANDEC
en operaciones que NO sean recarga o transferencia (ej. pagos con
tarjeta, depósitos). Si aparecen SMS con un formato distinto a los de
arriba, revisa primero si caen en el parser `generic.js` (fallback) y
si el monto/identificador se extrajo bien.
