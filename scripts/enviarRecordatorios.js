require('dotenv').config();
const { MongoClient } = require('mongodb');
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Función para formatear fecha en zona horaria de Ciudad Juárez
function formatearFechaJuarez(fechaUTC) {
  const fecha = new Date(fechaUTC);
  
  // Opciones para Ciudad Juárez (Chihuahua, México)
  const opciones = {
    timeZone: 'America/Chihuahua',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  };
  
  // Formatear en español
  return fecha.toLocaleString('es-MX', opciones);
}

async function main() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db();

  console.log('✅ Conectado a MongoDB');

  const ahora = new Date();
  
  // Fin del día de mañana (23:59:59) en tiempo UTC
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
    // Usar la función formateada para Ciudad Juárez
    const fechaFormateada = formatearFechaJuarez(llamada.fechaLlamada);

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
            <li><strong>Fecha y hora (Ciudad Juárez):</strong> ${fechaFormateada}</li>
            <li><strong>Asunto:</strong> ${llamada.Asunto}</li>
            <li><strong>Notas:</strong> ${llamada.Notas}</li>
            <li><strong>Dirección:</strong> ${llamada.Direccion}</li>
            <li><strong>Teléfono:</strong> ${llamada.Telefono}</li>
          </ul>
          <hr>
          <p style="font-size:12px;color:#666">
            Este correo es un recordatorio automático del sistema Agenda.<br>
            Hora local: ${new Date().toLocaleString('es-MX', { timeZone: 'America/Chihuahua' })}
          </p>
        `
      };

      try {
        await sgMail.send(msg);
        console.log(`📧 Correo enviado a ${admin.Correo} - Fecha: ${fechaFormateada}`);
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
