
const { MongoClient } = require('mongodb');
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function main() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db();

  console.log('✅ Conectado a MongoDB');

  const ahora = new Date();
  const en24h = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);

  // 1️⃣ Buscar llamadas próximas (no canceladas y sin notificar)
  const llamadas = await db.collection('Llamadas').find({
    fechaLlamada: { $gte: ahora, $lte: en24h },
    Estado: { $ne: 'cancelado' },
    recordatorioEnviado: { $ne: true }
  }).toArray();

  console.log(`📞 Llamadas próximas encontradas: ${llamadas.length}`);

  if (llamadas.length === 0) {
    await client.close();
    return;
  }

  // 2️⃣ Obtener todos los admins
  const admins = await db.collection('Usuarios').find({
    Rol: 'admin'
  }).toArray();

  if (admins.length === 0) {
    console.log('⚠️ No hay usuarios admin');
    await client.close();
    return;
  }

  // 3️⃣ Enviar correos
  for (const llamada of llamadas) {
    const fecha = new Date(llamada.fechaLlamada).toLocaleString('es-MX');

    for (const admin of admins) {
      const msg = {
        to: admin.Correo,
        from: 'croj23@gmail.com',
        subject: '📅 Recordatorio de llamada próxima',
        html: `
          <h3>📞 Recordatorio de llamada</h3>
          <p>Tienes una llamada programada para mañana:</p>
          <ul>
            <li><strong>Cliente:</strong> ${llamada.Nombre}</li>
            <li><strong>Empresa:</strong> ${llamada.Empresa}</li>
            <li><strong>Fecha:</strong> ${fecha}</li>
            <li><strong>Asunto:</strong> ${llamada.Asunto || '-'}</li>
          </ul>
        `
      };

      try {
        await sgMail.send(msg);
        console.log(`📧 Correo enviado a ${admin.Correo}`);
      } catch (error) {
        console.error('❌ Error enviando correo:', error.message);
      }
    }

    // 4️⃣ Marcar llamada como notificada
    await db.collection('Llamadas').updateOne(
      { _id: llamada._id },
      { $set: { recordatorioEnviado: true } }
    );
  }

  await client.close();
  console.log('🏁 Proceso finalizado');
}

main().catch(console.error);

