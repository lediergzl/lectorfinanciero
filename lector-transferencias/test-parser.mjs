import { processSmsBatch } from './src/parser/index.js';

const now = Date.now();

const sampleSms = [
  {
    address: 'Transfermovil',
    date: now,
    body: 'Transfermovil: Ha recibido una transferencia de 500.00 CUP de 52345678. Saldo disponible: 3200.00 CUP. 09/09/2026 14:35'
  },
  {
    address: 'EnZona',
    date: now,
    body: 'EnZona: Transferencia enviada por 120.50 MLC a 53587412 09-09-2026 10:05'
  },
  {
    address: 'BANDEC',
    date: now,
    body: 'BANDEC: Se ha realizado un pago de 1,500.50 CUP a favor de 52233445. Operacion 998877.'
  },
  {
    address: 'Publicidad',
    date: now,
    body: 'Aprovecha nuestras ofertas de fin de mes, visita nuestra tienda!'
  },
  // ── SMS reales aportados por el usuario ──
  {
    address: 'Bandec',
    date: now,
    body: 'Banco Bandec:  La recarga se realizo con exito. Saldo a acreditar: 360 CUP. Saldo acreditado: 360 CUP. Monto Pagado: 324.0 CUP. Telefono: 55415602. Id transaccion: KW601PHUR9999. Saldo Restante: CR 1008.35.   Gracias por utilizar nuestros servicios, ETECSA.'
  },
  {
    address: 'MiTransfer',
    date: now,
    body: 'El titular del telefono 5351476873 le ha realizado una transferencia al Monedero MiTransfer 59446530 de 1000.00 CUP. Nro. Transaccion TMW185142982. Fecha: 8/9/2026.'
  },
  {
    address: 'Bandec',
    date: now,
    body: 'Banco Bandec:  La Transferencia fue completada.   Fecha: 6/9/2026   Beneficiario: 9227XXXXXXXX3044   Ordenante: CUP   Monto: 2800.00 CUP   Nro. Transaccion: KW601OY5DJ999   Saldo restante: CR 5332.35 CUP'
  },
  {
    address: 'Bandec',
    date: now,
    body: 'Banco Bandec:  La Transferencia fue completada.   Fecha: 1/9/2026   Beneficiario: 9227XXXXXXXX3044   Ordenante: CUP   Monto: 2940.00 CUP   Nro. Transaccion: KW601NZCU6999   Saldo restante: CR 3060.85 CUP'
  },
  {
    address: 'Bandec',
    date: now,
    body: 'El titular del telefono 5354199878 le ha realizado una transferencia a la cuenta 9204069996188454 de 2700.00 CUP. Nro. Transaccion KW601NQJZV999. Fecha: 31/8/2026.'
  },
  {
    address: 'Metro',
    date: now,
    body: 'Se ha realizado una transferencia a la cuenta 9205959877401647 de 30000.00 CUP. Nro. Transaccion MM6050B8B0987. Fecha: 24/8/2026.  Metro'
  },
  {
    address: 'Bpa',
    date: now,
    body: 'Se ha realizado una transferencia a la cuenta: 9238XXXXXXXX5351 de 63000.00 CUP. Nro. Transaccion TMW183912329 Bpa'
  }
];

const results = processSmsBatch(sampleSms);

console.log(`SMS procesados: ${sampleSms.length}`);
console.log(`Transferencias reconocidas: ${results.length}\n`);

for (const r of results) {
  console.log(JSON.stringify(r, null, 2));
}
