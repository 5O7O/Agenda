require('dotenv').config();
const { MongoClient } = require('mongodb');
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function main() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db();

  console.log('✅ Conectado a MongoDB');

  const ahora = new Date();
  // fin del día de mañana (23:59:59)
  const finManana = new Date();
  finManana.setDate(finManana.getDate() + 1);
  finManana.setHours(23, 59, 59, 999);

  // 1️⃣ Buscar llamadas próximas (no canceladas y sin notificar)
  const llamadas = await db.collection('Llamadas').find({
    fechaLlamada: {
      $gte: ahora,
      $lte: finManana
    },
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
    // Formatear fecha con zona horaria de Ciudad Juárez (UTC-6 o UTC-7 según horario de verano)
    const fechaLlamada = new Date(llamada.fechaLlamada);
    const fechaFormateada = fechaLlamada.toLocaleString('es-MX', {
      timeZone: 'America/Ciudad_Juarez',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });

    // Opción más simple (solo hora y fecha):
    const fechaSimple = fechaLlamada.toLocaleString('es-MX', {
      timeZone: 'America/Ciudad_Juarez',
      dateStyle: 'long',
      timeStyle: 'short'
    });

    for (const admin of admins) {
      const msg = {
        to: admin.Correo,
        from: {
          email: 'al24320591@utcj.edu.mx',
          name: 'Recordatorio Cam'
        },
        subject: 'Agenda: llamada programada para mañana',
        text: `Tienes una llamada programada con ${llamada.Nombre} mañana.`,
        html: `
          <p>Tienes una llamada programada:</p>
          <ul>
            <li><strong>Cliente:</strong> ${llamada.Nombre}</li>
            <li><strong>Empresa:</strong> ${llamada.Empresa}</li>
            <li><strong>Fecha (Ciudad Juárez):</strong> ${fechaFormateada}</li>
            <li><strong>Asunto:</strong> ${llamada.Asunto}</li>
            <li><strong>Notas:</strong> ${llamada.Notas || 'N/A'}</li>
            <li><strong>Dirección:</strong> ${llamada.Direccion || 'N/A'}</li>
          </ul>
          <hr>
          <p style="font-size:12px;color:#666">
            Este correo es un recordatorio automático del sistema Agenda.
          </p>
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
