require('dotenv').config();
const { MongoClient } = require('mongodb');
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function main() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db();

  console.log('✅ Conectado a MongoDB');

  const timeZone = 'America/Ciudad_Juarez';

  // 📅 Fecha de MAÑANA en zona horaria de Ciudad Juárez
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);

  // 1️⃣ Buscar llamadas del día siguiente (Ciudad Juárez)
  const llamadas = await db.collection('Llamadas').find({
    Estado: { $ne: 'cancelado' },
    recordatorioEnviado: { $ne: true },
    $expr: {
      $eq: [
        {
          $dateToString: {
            date: "$fechaLlamada",
            format: "%Y-%m-%d",
            timezone: timeZone
          }
        },
        {
          $dateToString: {
            date: manana,
            format: "%Y-%m-%d",
            timezone: timeZone
          }
        }
      ]
    }
  }).toArray();

  console.log(`📞 Llamadas para mañana encontradas: ${llamadas.length}`);

  if (llamadas.length === 0) {
    await client.close();
    console.log('ℹ️ No hay llamadas para notificar');
    return;
  }

  // 2️⃣ Obtener usuarios admin
  const admins = await db.collection('Usuarios').find({
    Rol: 'user'
  }).toArray();

  if (admins.length === 0) {
    console.log('⚠️ No hay usuarios admin');
    await client.close();
    return;
  }

  // 3️⃣ Enviar correos
  for (const llamada of llamadas) {
    const fechaFormateada = new Date(llamada.fechaLlamada).toLocaleString(
      'es-MX',
      {
        timeZone,
        dateStyle: 'full',
        timeStyle: 'short'
      }
    );

    for (const admin of admins) {
      const msg = {
        to: admin.Correo,
        from: {
          email: 'al24320591@utcj.edu.mx', // ⚠️ debe ser sender verificado en SendGrid
          name: 'Agenda CAM'
        },
        subject: '📅 Recordatorio: llamada programada para mañana',
        text: `Tienes una llamada programada con ${llamada.Nombre} mañana.`,
        html: `
          <h3>📞 Recordatorio de llamada</h3>
          <p>Tienes una llamada programada para mañana:</p>
          <ul>
            <li><strong>Cliente:</strong> ${llamada.Nombre}</li>
            <li><strong>Empresa:</strong> ${llamada.Empresa}</li>
            <li><strong>Fecha:</strong> ${fechaFormateada}</li>
            <li><strong>Asunto:</strong> ${llamada.Asunto || '-'}</li>
            <li><strong>Notas:</strong> ${llamada.Notas || '-'}</li>
            <li><strong>Dirección:</strong> ${llamada.Direccion || '-'}</li>
          </ul>
          <hr>
          <p style="font-size:12px;color:#666">
            Este correo es un recordatorio automático del sistema Agenda CRM.
          </p>
        `
      };

      try {
        await sgMail.send(msg);
        console.log(`📧 Correo enviado a ${admin.Correo}`);
      } } catch (error) {
  console.error(
    `❌ Error enviando correo a ${admin.Correo}:`
  );

  console.error(error.response?.body || error);
}
    }

    // 4️⃣ Marcar llamada como notificada
    await db.collection('Llamadas').updateOne(
      { _id: llamada._id },
      { $set: { recordatorioEnviado: true } }
    );
  }

  await client.close();
  console.log('🏁 Proceso finalizado correctamente');
}

main().catch(error => {
  console.error('❌ Error general:', error);
  process.exit(1);
});

